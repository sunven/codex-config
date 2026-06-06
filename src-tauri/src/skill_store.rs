use crate::config_locator;
use crate::toml_store::{self, FileToken, PreviewResult, SaveResult};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use toml_edit::{value as toml_value, ArrayOfTables, DocumentMut, Item, Table};

const MAX_SCAN_DEPTH: usize = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillState {
    pub roots: Vec<SkillRoot>,
    pub skills: Vec<SkillSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRoot {
    pub path: String,
    pub label: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub directory: String,
    pub source: String,
    pub enabled: bool,
    pub configured: bool,
    pub size: u64,
    pub modified_ms: Option<u128>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillContent {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub raw_markdown: String,
}

#[derive(Debug, Clone)]
struct SkillRootCandidate {
    path: PathBuf,
    label: String,
}

#[derive(Debug, Clone)]
struct SkillMetadata {
    name: Option<String>,
    description: Option<String>,
}

pub fn state_from_document(document: Option<&DocumentMut>) -> SkillState {
    let location = match config_locator::locate() {
        Ok(location) => location,
        Err(_) => {
            return SkillState {
                roots: Vec::new(),
                skills: Vec::new(),
            }
        }
    };
    let roots = discovery_roots(&location);
    let config = document.map(skill_config_entries).unwrap_or_default();
    let mut seen_paths = BTreeSet::<String>::new();
    let mut skills = Vec::new();

    for root in &roots {
        for path in skill_paths(&root.path) {
            let Ok(summary) = skill_summary(&path, root, &config) else {
                continue;
            };

            let key = canonical_or_self(&path).display().to_string();
            if seen_paths.insert(key) {
                skills.push(summary);
            }
        }
    }

    skills.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.cmp(&right.path))
    });

    SkillState {
        roots: roots
            .into_iter()
            .map(|root| SkillRoot {
                exists: root.path.exists(),
                path: root.path.display().to_string(),
                label: root.label,
            })
            .collect(),
        skills,
    }
}

pub fn read_skill_content(path: String) -> Result<SkillContent, String> {
    let skill_path = verified_skill_path(&path)?;
    let raw_markdown =
        fs::read_to_string(&skill_path).map_err(|error| format!("failed to read skill: {error}"))?;
    let metadata = parse_metadata(&raw_markdown);

    Ok(SkillContent {
        name: metadata
            .name
            .unwrap_or_else(|| fallback_skill_name(&skill_path)),
        description: metadata.description,
        path: skill_path.display().to_string(),
        raw_markdown,
    })
}

pub fn preview_skill_enabled(path: String, enabled: bool) -> Result<PreviewResult, String> {
    let location = config_locator::locate()?;
    let skill_path = verified_skill_path(&path)?;
    let loaded = toml_store::load(&location.config_path)?;
    let original = loaded.raw.clone();
    let mut document = editable_document(loaded)?;
    set_skill_enabled_in_document(&mut document, &skill_path, enabled)?;
    let candidate = validated_candidate(&document)?;

    Ok(PreviewResult {
        changed: original != candidate,
        field_diffs: Vec::new(),
        text_diff: toml_store::simple_diff(&original, &candidate),
        candidate_raw_toml: candidate,
    })
}

pub fn save_skill_enabled(
    path: String,
    enabled: bool,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    let location = config_locator::locate()?;
    let skill_path = verified_skill_path(&path)?;
    let loaded = toml_store::load(&location.config_path)?;
    toml_store::ensure_current_token(&loaded, file_token.as_ref())?;
    let original = loaded.raw.clone();
    let mut document = editable_document(loaded)?;
    set_skill_enabled_in_document(&mut document, &skill_path, enabled)?;
    let candidate = validated_candidate(&document)?;

    if original == candidate {
        return Ok(SaveResult {
            backup_path: None,
            changed: false,
            state: crate::app_state::load_state()?,
        });
    }

    let backup_path =
        toml_store::backup_existing_file(&location.config_path, &location.backup_dir)?;
    toml_store::atomic_write(&location.config_path, candidate.as_bytes())?;

    Ok(SaveResult {
        backup_path: backup_path.map(|path| path.display().to_string()),
        changed: true,
        state: crate::app_state::load_state()?,
    })
}

fn discovery_roots(location: &config_locator::ConfigLocation) -> Vec<SkillRootCandidate> {
    let mut roots = Vec::new();
    push_root(
        &mut roots,
        location.codex_home.join("skills"),
        "Codex global skills",
    );

    if std::env::var_os("CODEX_HOME").is_none() {
        if let Some(home) = home_dir() {
            push_root(
                &mut roots,
                home.join(".agents").join("skills"),
                "Agent global skills",
            );
            push_root(
                &mut roots,
                home.join("gstack").join(".agents").join("skills"),
                "GStack global skills",
            );
        }
    }

    roots
}

fn push_root(roots: &mut Vec<SkillRootCandidate>, path: PathBuf, label: &str) {
    let key = canonical_or_self(&path).display().to_string();
    if roots
        .iter()
        .any(|root| canonical_or_self(&root.path).display().to_string() == key)
    {
        return;
    }

    roots.push(SkillRootCandidate {
        path,
        label: label.to_string(),
    });
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn skill_paths(root: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    collect_skill_paths(root, MAX_SCAN_DEPTH, &mut paths);
    paths
}

fn collect_skill_paths(directory: &Path, depth: usize, paths: &mut Vec<PathBuf>) {
    if depth == 0 || !directory.is_dir() {
        return;
    }

    let skill_path = directory.join("SKILL.md");
    if skill_path.is_file() {
        paths.push(skill_path);
    }

    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut child_dirs = entries
        .filter_map(Result::ok)
        .filter_map(|entry| match entry.file_type() {
            Ok(file_type) if file_type.is_dir() => Some(entry.path()),
            _ => None,
        })
        .collect::<Vec<_>>();
    child_dirs.sort();

    for child in child_dirs {
        collect_skill_paths(&child, depth - 1, paths);
    }
}

fn skill_summary(
    path: &Path,
    root: &SkillRootCandidate,
    config: &BTreeMap<String, SkillConfigEntry>,
) -> Result<SkillSummary, String> {
    let raw = fs::read_to_string(path).map_err(|error| format!("failed to read skill: {error}"))?;
    let metadata = parse_metadata(&raw);
    let config_entry = config_entry_for_path(path, config);
    let metadata_fs =
        fs::metadata(path).map_err(|error| format!("failed to stat skill: {error}"))?;

    Ok(SkillSummary {
        name: metadata.name.unwrap_or_else(|| fallback_skill_name(path)),
        description: metadata.description,
        path: path.display().to_string(),
        directory: path
            .parent()
            .unwrap_or(path)
            .display()
            .to_string(),
        source: root.label.clone(),
        enabled: config_entry
            .and_then(|entry| entry.enabled)
            .unwrap_or(true),
        configured: config_entry.is_some(),
        size: metadata_fs.len(),
        modified_ms: metadata_fs.modified().ok().and_then(|time| {
            time.duration_since(UNIX_EPOCH)
                .ok()
                .map(|duration| duration.as_millis())
        }),
    })
}

#[derive(Debug, Clone)]
struct SkillConfigEntry {
    raw_path: String,
    canonical_path: Option<String>,
    enabled: Option<bool>,
}

fn skill_config_entries(document: &DocumentMut) -> BTreeMap<String, SkillConfigEntry> {
    let mut entries = BTreeMap::new();
    let Some(configs) = document
        .get("skills")
        .and_then(Item::as_table)
        .and_then(|skills| skills.get("config"))
        .and_then(Item::as_array_of_tables)
    else {
        return entries;
    };

    for table in configs.iter() {
        let Some(raw_path) = table_string(table, "path") else {
            continue;
        };
        let canonical_path = fs::canonicalize(&raw_path)
            .ok()
            .map(|path| path.display().to_string());
        let key = canonical_path
            .clone()
            .unwrap_or_else(|| raw_path.clone());

        entries.insert(
            key,
            SkillConfigEntry {
                raw_path,
                canonical_path,
                enabled: table_bool(table, "enabled"),
            },
        );
    }

    entries
}

fn config_entry_for_path<'a>(
    path: &Path,
    config: &'a BTreeMap<String, SkillConfigEntry>,
) -> Option<&'a SkillConfigEntry> {
    let canonical = canonical_or_self(path).display().to_string();

    config
        .get(&canonical)
        .or_else(|| config.values().find(|entry| entry.raw_path == path.display().to_string()))
        .or_else(|| {
            config
                .values()
                .find(|entry| entry.canonical_path.as_deref() == Some(canonical.as_str()))
        })
}

fn editable_document(loaded: toml_store::LoadedToml) -> Result<DocumentMut, String> {
    if let Some(issue) = loaded.parse_issue {
        return Err(format!("cannot edit malformed TOML: {}", issue.message));
    }

    Ok(loaded.document.unwrap_or_else(DocumentMut::new))
}

fn set_skill_enabled_in_document(
    document: &mut DocumentMut,
    path: &Path,
    enabled: bool,
) -> Result<(), String> {
    ensure_skills_table(document)?;
    let canonical_path = canonical_or_self(path).display().to_string();
    let configs = skills_config_array_mut(document)?;

    configs.retain(|table| {
        table_string(table, "path")
            .map(|entry_path| !paths_match(&entry_path, &canonical_path))
            .unwrap_or(true)
    });

    if !enabled {
        let mut table = Table::new();
        table["path"] = toml_value(canonical_path);
        table["enabled"] = toml_value(false);
        configs.push(table);
    }

    Ok(())
}

fn ensure_skills_table(document: &mut DocumentMut) -> Result<(), String> {
    if !document
        .get("skills")
        .map(Item::is_table)
        .unwrap_or(false)
    {
        document["skills"] = Item::Table(Table::new());
    }

    document["skills"]
        .as_table()
        .ok_or_else(|| "skills must be a table".to_string())?;
    Ok(())
}

fn skills_config_array_mut(document: &mut DocumentMut) -> Result<&mut ArrayOfTables, String> {
    let skills = document["skills"]
        .as_table_mut()
        .ok_or_else(|| "skills must be a table".to_string())?;

    if !skills.contains_key("config") {
        skills["config"] = Item::ArrayOfTables(ArrayOfTables::new());
    }

    skills["config"]
        .as_array_of_tables_mut()
        .ok_or_else(|| "skills.config must be an array of tables".to_string())
}

fn paths_match(entry_path: &str, canonical_path: &str) -> bool {
    if entry_path == canonical_path {
        return true;
    }

    fs::canonicalize(entry_path)
        .ok()
        .map(|path| path.display().to_string() == canonical_path)
        .unwrap_or(false)
}

fn verified_skill_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if path.file_name().and_then(|name| name.to_str()) != Some("SKILL.md") {
        return Err("skill path must point to SKILL.md".to_string());
    }
    if !path.is_file() {
        return Err("skill file does not exist".to_string());
    }

    let requested = canonical_or_self(&path);
    let location = config_locator::locate()?;
    let roots = discovery_roots(&location);
    let allowed = roots.iter().any(|root| {
        root.path.exists()
            && requested.starts_with(canonical_or_self(&root.path))
            && skill_paths(&root.path)
                .into_iter()
                .any(|skill_path| canonical_or_self(&skill_path) == requested)
    });

    if !allowed {
        return Err("skill path is outside discovered global skill roots".to_string());
    }

    Ok(requested)
}

fn canonical_or_self(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn validated_candidate(document: &DocumentMut) -> Result<String, String> {
    let serialized = document.to_string();
    serialized
        .parse::<DocumentMut>()
        .map_err(|error| format!("candidate TOML failed to reparse: {error}"))?;

    Ok(serialized)
}

fn table_string(table: &Table, key: &str) -> Option<String> {
    table
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
}

fn table_bool(table: &Table, key: &str) -> Option<bool> {
    table
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_bool())
}

fn parse_metadata(raw: &str) -> SkillMetadata {
    let mut lines = raw.lines();
    if lines.next().map(str::trim) != Some("---") {
        return SkillMetadata {
            name: None,
            description: None,
        };
    }

    let mut frontmatter = Vec::new();
    for line in lines {
        if line.trim() == "---" {
            break;
        }
        frontmatter.push(line);
    }

    metadata_from_frontmatter(&frontmatter)
}

fn metadata_from_frontmatter(lines: &[&str]) -> SkillMetadata {
    let mut name = None;
    let mut description = None;
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index].trim_start();
        if let Some(value) = line.strip_prefix("name:") {
            name = scalar_value(value);
        } else if let Some(value) = line.strip_prefix("description:") {
            let value = value.trim();
            if value == "|" || value == ">" {
                let mut collected = Vec::new();
                index += 1;
                while index < lines.len() {
                    let next = lines[index];
                    if !next.starts_with(' ') && !next.starts_with('\t') && !next.trim().is_empty()
                    {
                        index -= 1;
                        break;
                    }
                    collected.push(next.trim());
                    index += 1;
                }
                description = Some(collected.join(" ").trim().to_string())
                    .filter(|value| !value.is_empty());
            } else {
                description = scalar_value(value);
            }
        }
        index += 1;
    }

    SkillMetadata { name, description }
}

fn scalar_value(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }

    Some(
        value
            .trim_matches('"')
            .trim_matches('\'')
            .trim()
            .to_string(),
    )
    .filter(|value| !value.is_empty())
}

fn fallback_skill_name(path: &Path) -> String {
    path.parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestCodexHome;

    #[test]
    fn discovers_global_skills_and_reads_metadata() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("skills").join("demo");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            r#"---
name: demo
description: |
  Demo skill for tests.
---

# Demo
"#,
        )
        .unwrap();

        let state = state_from_document(Some(&DocumentMut::new()));

        assert_eq!(state.skills.len(), 1);
        assert_eq!(state.skills[0].name, "demo");
        assert_eq!(
            state.skills[0].description,
            Some("Demo skill for tests.".to_string())
        );
        assert!(state.skills[0].enabled);
    }

    #[test]
    fn config_entries_disable_discovered_skill() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("skills").join("demo");
        let skill_path = skill_dir.join("SKILL.md");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(&skill_path, "---\nname: demo\n---\n").unwrap();
        let document = format!(
            r#"
[[skills.config]]
path = "{}"
enabled = false
"#,
            skill_path.display()
        )
        .parse::<DocumentMut>()
        .unwrap();

        let state = state_from_document(Some(&document));

        assert_eq!(state.skills.len(), 1);
        assert!(!state.skills[0].enabled);
        assert!(state.skills[0].configured);
    }

    #[test]
    fn preview_disable_writes_official_skills_config_entry() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("skills").join("demo");
        let skill_path = skill_dir.join("SKILL.md");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(&skill_path, "---\nname: demo\n---\n").unwrap();

        let preview = preview_skill_enabled(skill_path.display().to_string(), false).unwrap();

        assert!(preview.changed);
        assert!(preview.candidate_raw_toml.contains("[[skills.config]]"));
        assert!(preview.candidate_raw_toml.contains("enabled = false"));
    }

    #[test]
    fn enabling_removes_existing_disabled_entry() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("skills").join("demo");
        let skill_path = skill_dir.join("SKILL.md");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(&skill_path, "---\nname: demo\n---\n").unwrap();
        fs::write(
            &location.config_path,
            format!(
                r#"
[[skills.config]]
path = "{}"
enabled = false
"#,
                skill_path.display()
            ),
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_skill_enabled(skill_path.display().to_string(), true, token).unwrap();
        let saved = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(!saved.contains("enabled = false"));
    }
}
