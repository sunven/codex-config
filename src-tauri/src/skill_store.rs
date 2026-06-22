use crate::config_document_workflow;
use crate::config_locator;
use crate::toml_store::{FileToken, PreviewResult, SaveResult};
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
    pub symlink: bool,
    pub target_directory: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillImportBatchResult {
    pub changed: bool,
    pub state: Option<crate::app_state::AppState>,
    pub refresh_error: Option<String>,
    pub imported: Vec<SkillImportItem>,
    pub existing: Vec<SkillImportItem>,
    pub skipped: Vec<SkillImportProblem>,
    pub conflicts: Vec<SkillImportProblem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillImportItem {
    pub name: String,
    pub source_directory: String,
    pub link_directory: String,
    pub skill_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillImportProblem {
    pub source_directory: String,
    pub code: String,
    pub reason: String,
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

#[derive(Debug, Clone)]
struct SkillImportCandidate {
    source_dir: PathBuf,
    skill_path: PathBuf,
    name: String,
}

#[derive(Debug, Clone, Copy)]
enum SkillDirectoryLinkOutcome {
    Imported,
    Existing,
    Conflict,
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
    let raw_markdown = fs::read_to_string(&skill_path)
        .map_err(|error| format!("failed to read skill: {error}"))?;
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
    let skill_path = verified_skill_path(&path)?;
    config_document_workflow::preview_edit(
        |document| set_skill_enabled_in_document(document, &skill_path, enabled),
        |_, _| Ok(Vec::new()),
    )
}

pub fn save_skill_enabled(
    path: String,
    enabled: bool,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    let skill_path = verified_skill_path(&path)?;
    config_document_workflow::commit_edit(file_token, |document| {
        set_skill_enabled_in_document(document, &skill_path, enabled)
    })
}

pub fn delete_skill(path: String, file_token: Option<FileToken>) -> Result<SaveResult, String> {
    let skill_path = verified_discovered_skill_path(&path)?;
    let canonical_skill_path = canonical_or_self(&skill_path).display().to_string();
    let skill_dir = skill_path
        .parent()
        .ok_or_else(|| "skill path must have a parent directory".to_string())?
        .to_path_buf();
    let symlink = fs::symlink_metadata(&skill_dir)
        .map_err(|error| format!("failed to stat skill directory: {error}"))?
        .file_type()
        .is_symlink();

    ensure_config_editable(file_token.as_ref())?;

    remove_skill_directory_entry(&skill_dir, symlink)?;

    let result = config_document_workflow::commit_edit(file_token, |document| {
        remove_skill_config_entry(document, &canonical_skill_path)
    })?;

    Ok(SaveResult {
        changed: true,
        state: result.state,
    })
}

pub fn import_skill_directory(directory: String) -> Result<SaveResult, String> {
    let source_dir = PathBuf::from(directory);
    if !source_dir.is_dir() {
        return Err("skill directory must be a directory".to_string());
    }

    let skill_path = source_dir.join("SKILL.md");
    if !skill_path.is_file() {
        return Err("skill directory must contain SKILL.md".to_string());
    }
    fs::read_to_string(&skill_path).map_err(|error| format!("failed to read skill: {error}"))?;

    let location = config_locator::locate()?;
    let root = agent_global_skills_root(&location)?;
    let link_name = source_dir
        .file_name()
        .ok_or_else(|| "skill directory must have a name".to_string())?;
    let link_path = root.join(link_name);

    fs::create_dir_all(&root)
        .map_err(|error| format!("failed to create Agent global skills root: {error}"))?;
    let changed = create_skill_directory_symlink(&source_dir, &link_path)?;

    let state = crate::app_state::load_state()?;

    Ok(SaveResult { changed, state })
}

pub fn import_skill_directories(
    directories: Vec<String>,
) -> Result<SkillImportBatchResult, String> {
    let location = config_locator::locate()?;
    let root = agent_global_skills_root(&location)?;

    let mut result = SkillImportBatchResult {
        changed: false,
        state: None,
        refresh_error: None,
        imported: Vec::new(),
        existing: Vec::new(),
        skipped: Vec::new(),
        conflicts: Vec::new(),
    };
    let candidates = import_candidates(directories, &mut result.skipped);
    if candidates.is_empty() {
        match crate::app_state::load_state() {
            Ok(state) => result.state = Some(state),
            Err(error) => result.refresh_error = Some(error),
        }

        return Ok(result);
    }

    fs::create_dir_all(&root)
        .map_err(|error| format!("failed to create Agent global skills root: {error}"))?;
    let mut destination_sources = BTreeMap::<String, PathBuf>::new();

    for candidate in candidates {
        let Some(link_name) = candidate.source_dir.file_name() else {
            result.skipped.push(import_problem(
                &candidate.source_dir,
                "invalid_directory_name",
                "skill directory must have a name",
            ));
            continue;
        };
        let link_path = root.join(link_name);
        let destination_key = destination_key(&link_path);
        let candidate_source = canonical_or_self(&candidate.source_dir);

        if let Some(existing_source) = destination_sources.get(&destination_key) {
            if existing_source != &candidate_source {
                result.conflicts.push(import_problem(
                    &candidate.source_dir,
                    "duplicate_destination",
                    "another selected skill uses the same destination directory name",
                ));
            }
            continue;
        }

        destination_sources.insert(destination_key, candidate_source);

        match link_skill_directory(&candidate.source_dir, &link_path) {
            Ok(SkillDirectoryLinkOutcome::Imported) => {
                result.changed = true;
                result.imported.push(import_item(&candidate, &link_path));
            }
            Ok(SkillDirectoryLinkOutcome::Existing) => {
                result.existing.push(import_item(&candidate, &link_path));
            }
            Ok(SkillDirectoryLinkOutcome::Conflict) => {
                result.conflicts.push(import_problem(
                    &candidate.source_dir,
                    "destination_conflict",
                    "a skill entry with this directory name already exists",
                ));
            }
            Err(error) => {
                result.skipped.push(import_problem(
                    &candidate.source_dir,
                    "symlink_failed",
                    error,
                ));
            }
        }
    }

    match crate::app_state::load_state() {
        Ok(state) => result.state = Some(state),
        Err(error) => result.refresh_error = Some(error),
    }

    Ok(result)
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
        }
    }

    roots
}

fn agent_global_skills_root(location: &config_locator::ConfigLocation) -> Result<PathBuf, String> {
    discovery_roots(location)
        .into_iter()
        .find(|root| root.label == "Agent global skills")
        .map(|root| root.path)
        .ok_or_else(|| "Agent global skills root is not discoverable".to_string())
}

fn create_skill_directory_symlink(source: &Path, link: &Path) -> Result<bool, String> {
    match link_skill_directory(source, link)? {
        SkillDirectoryLinkOutcome::Imported => Ok(true),
        SkillDirectoryLinkOutcome::Existing => Ok(false),
        SkillDirectoryLinkOutcome::Conflict => {
            Err("a skill entry with this directory name already exists".to_string())
        }
    }
}

fn link_skill_directory(source: &Path, link: &Path) -> Result<SkillDirectoryLinkOutcome, String> {
    if fs::symlink_metadata(link).is_ok() {
        if canonical_or_self(link) == canonical_or_self(source) {
            return Ok(SkillDirectoryLinkOutcome::Existing);
        }

        return Ok(SkillDirectoryLinkOutcome::Conflict);
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, link)
            .map_err(|error| format!("failed to create skill symlink: {error}"))?;
        Ok(SkillDirectoryLinkOutcome::Imported)
    }

    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(source, link)
            .map_err(|error| format!("failed to create skill symlink: {error}"))?;
        Ok(SkillDirectoryLinkOutcome::Imported)
    }
}

fn import_candidates(
    directories: Vec<String>,
    skipped: &mut Vec<SkillImportProblem>,
) -> Vec<SkillImportCandidate> {
    let mut candidates = Vec::new();
    let mut seen = BTreeSet::<PathBuf>::new();

    for directory in directories {
        let selected = PathBuf::from(directory);
        if seen.contains(&canonical_or_self(&selected)) {
            continue;
        }
        let before_candidates = candidates.len();
        let before_skipped = skipped.len();

        collect_import_candidates(
            &selected,
            MAX_SCAN_DEPTH,
            &mut seen,
            &mut candidates,
            skipped,
        );

        if before_candidates == candidates.len() && before_skipped == skipped.len() {
            skipped.push(import_problem(
                &selected,
                "no_skill_found",
                "no SKILL.md found in selected directory",
            ));
        }
    }

    candidates.sort_by(|left, right| {
        left.source_dir
            .display()
            .to_string()
            .cmp(&right.source_dir.display().to_string())
    });
    candidates
}

fn collect_import_candidates(
    directory: &Path,
    depth: usize,
    seen: &mut BTreeSet<PathBuf>,
    candidates: &mut Vec<SkillImportCandidate>,
    skipped: &mut Vec<SkillImportProblem>,
) {
    if depth == 0 {
        return;
    }

    if !directory.is_dir() {
        skipped.push(import_problem(
            directory,
            "not_directory",
            "skill directory must be a directory",
        ));
        return;
    }

    let canonical_directory = canonical_or_self(directory);
    if !seen.insert(canonical_directory) {
        return;
    }

    let skill_path = directory.join("SKILL.md");
    if skill_path.is_file() {
        match fs::read_to_string(&skill_path) {
            Ok(raw) => {
                let metadata = parse_metadata(&raw);
                candidates.push(SkillImportCandidate {
                    source_dir: directory.to_path_buf(),
                    name: metadata
                        .name
                        .unwrap_or_else(|| fallback_skill_name(&skill_path)),
                    skill_path,
                });
            }
            Err(error) => skipped.push(import_problem(
                directory,
                "unreadable_skill",
                format!("failed to read skill: {error}"),
            )),
        }
        return;
    }

    let Ok(entries) = fs::read_dir(directory) else {
        skipped.push(import_problem(
            directory,
            "unreadable_directory",
            "failed to read directory",
        ));
        return;
    };
    let mut child_dirs = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            match fs::metadata(&path) {
                Ok(metadata) if metadata.is_dir() => Some(path),
                _ => None,
            }
        })
        .collect::<Vec<_>>();
    child_dirs.sort();

    for child in child_dirs {
        collect_import_candidates(&child, depth - 1, seen, candidates, skipped);
    }
}

fn import_item(candidate: &SkillImportCandidate, link_path: &Path) -> SkillImportItem {
    SkillImportItem {
        name: candidate.name.clone(),
        source_directory: candidate.source_dir.display().to_string(),
        link_directory: link_path.display().to_string(),
        skill_path: candidate.skill_path.display().to_string(),
    }
}

fn import_problem(path: &Path, code: &str, reason: impl Into<String>) -> SkillImportProblem {
    SkillImportProblem {
        source_directory: path.display().to_string(),
        code: code.to_string(),
        reason: reason.into(),
    }
}

fn destination_key(path: &Path) -> String {
    path.display().to_string().to_lowercase()
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
    let mut visited = BTreeSet::<PathBuf>::new();
    collect_skill_paths(root, MAX_SCAN_DEPTH, &mut visited, &mut paths);
    paths
}

fn collect_skill_paths(
    directory: &Path,
    depth: usize,
    visited: &mut BTreeSet<PathBuf>,
    paths: &mut Vec<PathBuf>,
) {
    if depth == 0 || !directory.is_dir() {
        return;
    }

    let canonical_directory = canonical_or_self(directory);
    if !visited.insert(canonical_directory) {
        return;
    }

    let skill_path = directory.join("SKILL.md");
    if skill_path.is_file() {
        paths.push(skill_path);
        return;
    }

    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut child_dirs = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            match fs::metadata(&path) {
                Ok(metadata) if metadata.is_dir() => Some(path),
                _ => None,
            }
        })
        .collect::<Vec<_>>();
    child_dirs.sort();

    for child in child_dirs {
        collect_skill_paths(&child, depth - 1, visited, paths);
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
    let directory = path.parent().unwrap_or(path);
    let symlink = fs::symlink_metadata(directory)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false);
    let target_directory = symlink.then(|| canonical_or_self(directory).display().to_string());

    Ok(SkillSummary {
        name: metadata.name.unwrap_or_else(|| fallback_skill_name(path)),
        description: metadata.description,
        path: path.display().to_string(),
        directory: directory.display().to_string(),
        symlink,
        target_directory,
        source: root.label.clone(),
        enabled: config_entry.and_then(|entry| entry.enabled).unwrap_or(true),
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
        let key = canonical_path.clone().unwrap_or_else(|| raw_path.clone());

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
        .or_else(|| {
            config
                .values()
                .find(|entry| entry.raw_path == path.display().to_string())
        })
        .or_else(|| {
            config
                .values()
                .find(|entry| entry.canonical_path.as_deref() == Some(canonical.as_str()))
        })
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

fn remove_skill_config_entry(
    document: &mut DocumentMut,
    canonical_path: &str,
) -> Result<(), String> {
    let Some(configs) = document
        .get_mut("skills")
        .and_then(Item::as_table_mut)
        .and_then(|skills| skills.get_mut("config"))
        .and_then(Item::as_array_of_tables_mut)
    else {
        return Ok(());
    };

    configs.retain(|table| {
        table_string(table, "path")
            .map(|entry_path| !paths_match(&entry_path, canonical_path))
            .unwrap_or(true)
    });

    Ok(())
}

fn ensure_config_editable(file_token: Option<&FileToken>) -> Result<(), String> {
    let location = config_locator::locate()?;
    let loaded = crate::toml_store::load(&location.config_path)?;
    crate::toml_store::ensure_current_token(&loaded, file_token)?;

    if let Some(issue) = loaded.parse_issue {
        return Err(format!("cannot edit malformed TOML: {}", issue.message));
    }

    Ok(())
}

fn remove_skill_directory_entry(skill_dir: &Path, symlink: bool) -> Result<(), String> {
    if !symlink {
        return fs::remove_dir_all(skill_dir)
            .map_err(|error| format!("failed to remove skill directory: {error}"));
    }

    #[cfg(unix)]
    {
        fs::remove_file(skill_dir)
            .map_err(|error| format!("failed to remove skill symlink: {error}"))
    }

    #[cfg(windows)]
    {
        fs::remove_dir(skill_dir)
            .map_err(|error| format!("failed to remove skill symlink: {error}"))
    }
}

fn ensure_skills_table(document: &mut DocumentMut) -> Result<(), String> {
    if !document.get("skills").map(Item::is_table).unwrap_or(false) {
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
            && skill_paths(&root.path)
                .into_iter()
                .any(|skill_path| canonical_or_self(&skill_path) == requested)
    });

    if !allowed {
        return Err("skill path is outside discovered global skill roots".to_string());
    }

    Ok(requested)
}

fn verified_discovered_skill_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if path.file_name().and_then(|name| name.to_str()) != Some("SKILL.md") {
        return Err("skill path must point to SKILL.md".to_string());
    }
    if !path.is_file() {
        return Err("skill file does not exist".to_string());
    }

    let location = config_locator::locate()?;
    let roots = discovery_roots(&location);
    let allowed = roots.iter().any(|root| {
        root.path.exists()
            && skill_paths(&root.path)
                .into_iter()
                .any(|skill_path| skill_path == path)
    });

    if !allowed {
        return Err("skill path is outside discovered global skill roots".to_string());
    }

    Ok(path)
}

fn canonical_or_self(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
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
                description =
                    Some(collected.join(" ").trim().to_string()).filter(|value| !value.is_empty());
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
    use crate::toml_store;

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
        assert!(!state.skills[0].symlink);
        assert_eq!(state.skills[0].target_directory, None);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn discovers_skill_directory_symlinks() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let source_dir = location.codex_home.join("source-demo");
        let link_dir = location.codex_home.join("skills").join("linked-demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(link_dir.parent().unwrap()).unwrap();
        fs::write(
            source_dir.join("SKILL.md"),
            r#"---
name: linked-demo
description: Skill through a directory symlink.
---
"#,
        )
        .unwrap();
        create_dir_symlink(&source_dir, &link_dir);

        let state = state_from_document(Some(&DocumentMut::new()));

        assert_eq!(state.skills.len(), 1);
        assert_eq!(state.skills[0].name, "linked-demo");
        assert_eq!(
            state.skills[0].description,
            Some("Skill through a directory symlink.".to_string())
        );
        assert!(state.skills[0].symlink);
        assert_eq!(
            state.skills[0].target_directory,
            Some(canonical_or_self(&source_dir).display().to_string())
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn symlinked_skills_can_be_read_and_configured() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let source_dir = location.codex_home.join("source-demo");
        let link_dir = location.codex_home.join("skills").join("linked-demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(link_dir.parent().unwrap()).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: linked-demo\n---\n").unwrap();
        create_dir_symlink(&source_dir, &link_dir);

        let state = state_from_document(Some(&DocumentMut::new()));
        let skill_path = state.skills[0].path.clone();

        let content = read_skill_content(skill_path.clone()).unwrap();
        let preview = preview_skill_enabled(skill_path, false).unwrap();

        assert_eq!(content.name, "linked-demo");
        assert!(preview.changed);
        assert!(preview.candidate_raw_toml.contains("enabled = false"));
    }

    #[test]
    fn delete_skill_removes_directory_and_disabled_config_entry() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("skills").join("demo");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let disabled = save_skill_enabled(
            skill_dir.join("SKILL.md").display().to_string(),
            false,
            None,
        )
        .unwrap();
        let token = disabled.state.file_token;

        let result = delete_skill(skill_dir.join("SKILL.md").display().to_string(), token).unwrap();

        assert!(result.changed);
        assert!(!skill_dir.exists());
        assert!(result.state.skills.skills.is_empty());
        assert!(!result.state.raw_toml.contains("[[skills.config]]"));
    }

    #[test]
    fn delete_skill_does_not_remove_directory_when_file_token_is_stale() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("skills").join("demo");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let disabled = save_skill_enabled(
            skill_dir.join("SKILL.md").display().to_string(),
            false,
            None,
        )
        .unwrap();
        fs::write(&location.config_path, "model = \"changed\"\n").unwrap();

        let error = delete_skill(
            skill_dir.join("SKILL.md").display().to_string(),
            disabled.state.file_token,
        )
        .unwrap_err();

        assert_eq!(error, "config.toml 已被其他程序修改。请先刷新，再保存。");
        assert!(skill_dir.join("SKILL.md").is_file());
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn delete_skill_removes_symlink_but_keeps_original_directory() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let source_dir = home.join("source-demo");
        let link_dir = home.join(".agents").join("skills").join("linked-demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(link_dir.parent().unwrap()).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: linked-demo\n---\n").unwrap();
        create_dir_symlink(&source_dir, &link_dir);

        let result = delete_skill(link_dir.join("SKILL.md").display().to_string(), None).unwrap();

        assert!(result.changed);
        assert!(!link_dir.exists());
        assert!(source_dir.join("SKILL.md").is_file());
        assert!(result.state.skills.skills.is_empty());
    }

    #[test]
    fn delete_skill_rejects_paths_outside_global_skill_roots() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("outside-demo");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let error =
            delete_skill(skill_dir.join("SKILL.md").display().to_string(), None).unwrap_err();

        assert_eq!(error, "skill path is outside discovered global skill roots");
        assert!(skill_dir.join("SKILL.md").is_file());
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn duplicate_skill_directory_symlinks_are_deduplicated() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let source_dir = location.codex_home.join("source-demo");
        let first_link_dir = location.codex_home.join("skills").join("linked-demo");
        let second_link_dir = location.codex_home.join("skills").join("linked-demo-copy");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(first_link_dir.parent().unwrap()).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: linked-demo\n---\n").unwrap();
        create_dir_symlink(&source_dir, &first_link_dir);
        create_dir_symlink(&source_dir, &second_link_dir);

        let state = state_from_document(Some(&DocumentMut::new()));

        assert_eq!(state.skills.len(), 1);
        assert_eq!(state.skills[0].name, "linked-demo");
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn symlink_cycles_do_not_duplicate_or_block_skill_discovery() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skill_dir = location.codex_home.join("skills").join("demo");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();
        create_dir_symlink(&location.codex_home.join("skills"), &skill_dir.join("loop"));

        let state = state_from_document(Some(&DocumentMut::new()));

        assert_eq!(state.skills.len(), 1);
        assert_eq!(state.skills[0].name, "demo");
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn invalid_skill_directory_symlinks_are_ignored() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let skills_dir = location.codex_home.join("skills");
        let valid_dir = skills_dir.join("demo");
        let no_skill_dir = location.codex_home.join("not-a-skill");
        fs::create_dir_all(&valid_dir).unwrap();
        fs::create_dir_all(&no_skill_dir).unwrap();
        fs::write(valid_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();
        create_dir_symlink(&no_skill_dir, &skills_dir.join("not-a-skill-link"));
        create_dir_symlink(
            &location.codex_home.join("missing-target"),
            &skills_dir.join("broken-link"),
        );

        let state = state_from_document(Some(&DocumentMut::new()));

        assert_eq!(state.skills.len(), 1);
        assert_eq!(state.skills[0].name, "demo");
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_a_skill_directory_creates_a_discoverable_symlink() {
        let _guard = TestCodexHome::without_codex_home();
        let home = std::env::var_os("HOME").unwrap();
        let home = PathBuf::from(home);
        let source_dir = home.join("source-demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let result = import_skill_directory(source_dir.display().to_string()).unwrap();

        assert!(result.changed);
        assert_eq!(result.state.skills.skills.len(), 1);
        assert_eq!(result.state.skills.skills[0].name, "demo");
        assert!(result
            .state
            .skills
            .roots
            .iter()
            .any(|root| root.label == "Agent global skills"));
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_multiple_skill_directories_returns_batch_summary() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let first = home.join("first");
        let second = home.join("second");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("SKILL.md"), "---\nname: first\n---\n").unwrap();
        fs::write(second.join("SKILL.md"), "---\nname: second\n---\n").unwrap();

        let result = import_skill_directories(vec![
            second.display().to_string(),
            first.display().to_string(),
        ])
        .unwrap();

        assert!(result.changed);
        assert_eq!(result.imported.len(), 2);
        assert!(result.existing.is_empty());
        assert!(result.skipped.is_empty());
        assert!(result.conflicts.is_empty());
        assert_eq!(
            result
                .imported
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "second"]
        );
        assert_eq!(result.state.unwrap().skills.skills.len(), 2);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_a_parent_directory_discovers_child_skills() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let parent = home.join("bundle");
        let first = parent.join("first");
        let second = parent.join("nested").join("second");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("SKILL.md"), "---\nname: first\n---\n").unwrap();
        fs::write(second.join("SKILL.md"), "---\nname: second\n---\n").unwrap();

        let result = import_skill_directories(vec![parent.display().to_string()]).unwrap();

        assert!(result.changed);
        assert_eq!(result.imported.len(), 2);
        assert!(result.skipped.is_empty());
        assert_eq!(result.state.unwrap().skills.skills.len(), 2);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_a_skill_directory_does_not_import_nested_child_skills() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let parent = home.join("parent-skill");
        let child = parent.join("child-skill");
        fs::create_dir_all(&child).unwrap();
        fs::write(parent.join("SKILL.md"), "---\nname: parent\n---\n").unwrap();
        fs::write(child.join("SKILL.md"), "---\nname: child\n---\n").unwrap();

        let result = import_skill_directories(vec![parent.display().to_string()]).unwrap();

        assert!(result.changed);
        assert_eq!(result.imported.len(), 1);
        assert_eq!(result.imported[0].name, "parent");
        assert_eq!(result.state.unwrap().skills.skills.len(), 1);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_dedupes_the_same_canonical_source() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let source = home.join("demo");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let result = import_skill_directories(vec![
            source.display().to_string(),
            source.display().to_string(),
        ])
        .unwrap();

        assert!(result.changed);
        assert_eq!(result.imported.len(), 1);
        assert!(result.skipped.is_empty());
        assert!(result.conflicts.is_empty());
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_classifies_existing_symlink_to_same_source() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let source = home.join("demo");
        let link = home.join(".agents").join("skills").join("demo");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(link.parent().unwrap()).unwrap();
        fs::write(source.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();
        create_dir_symlink(&source, &link);

        let result = import_skill_directories(vec![source.display().to_string()]).unwrap();

        assert!(!result.changed);
        assert!(result.imported.is_empty());
        assert_eq!(result.existing.len(), 1);
        assert!(result.conflicts.is_empty());
        assert_eq!(result.state.unwrap().skills.skills.len(), 1);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_classifies_destination_name_conflicts() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let source = home.join("demo");
        let existing = home.join(".agents").join("skills").join("demo");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&existing).unwrap();
        fs::write(source.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();
        fs::write(existing.join("SKILL.md"), "---\nname: existing\n---\n").unwrap();

        let result = import_skill_directories(vec![source.display().to_string()]).unwrap();

        assert!(!result.changed);
        assert!(result.imported.is_empty());
        assert_eq!(result.conflicts.len(), 1);
        assert_eq!(result.conflicts[0].code, "destination_conflict");
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_classifies_duplicate_destination_names_in_the_same_batch() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let first = home.join("one").join("demo");
        let second = home.join("two").join("demo");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("SKILL.md"), "---\nname: first\n---\n").unwrap();
        fs::write(second.join("SKILL.md"), "---\nname: second\n---\n").unwrap();

        let result = import_skill_directories(vec![
            first.display().to_string(),
            second.display().to_string(),
        ])
        .unwrap();

        assert!(result.changed);
        assert_eq!(result.imported.len(), 1);
        assert_eq!(result.conflicts.len(), 1);
        assert_eq!(result.conflicts[0].code, "duplicate_destination");
        assert_eq!(result.state.unwrap().skills.skills.len(), 1);
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_skips_invalid_selected_directories_without_aborting_batch() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let invalid = home.join("not-a-skill");
        let valid = home.join("valid");
        let file = home.join("SKILL.md");
        fs::create_dir_all(&invalid).unwrap();
        fs::create_dir_all(&valid).unwrap();
        fs::write(&file, "---\nname: nope\n---\n").unwrap();
        fs::write(valid.join("SKILL.md"), "---\nname: valid\n---\n").unwrap();

        let result = import_skill_directories(vec![
            invalid.display().to_string(),
            file.display().to_string(),
            valid.display().to_string(),
        ])
        .unwrap();

        assert!(result.changed);
        assert_eq!(result.imported.len(), 1);
        assert_eq!(result.skipped.len(), 2);
        assert!(result
            .skipped
            .iter()
            .any(|problem| problem.code == "no_skill_found"));
        assert!(result
            .skipped
            .iter()
            .any(|problem| problem.code == "not_directory"));
        assert_eq!(result.state.unwrap().skills.skills.len(), 1);
    }

    #[test]
    fn batch_import_with_no_candidates_does_not_create_agent_root() {
        let _guard = TestCodexHome::without_codex_home();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let invalid = home.join("not-a-skill");
        let agent_root = home.join(".agents").join("skills");
        fs::create_dir_all(&invalid).unwrap();

        let result = import_skill_directories(vec![invalid.display().to_string()]).unwrap();

        assert!(!result.changed);
        assert_eq!(result.skipped.len(), 1);
        assert!(!agent_root.exists());
    }

    #[test]
    fn batch_import_fails_when_agent_global_root_is_not_discoverable() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let source_dir = location.codex_home.join("source-demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let error = import_skill_directories(vec![source_dir.display().to_string()]).unwrap_err();

        assert_eq!(error, "Agent global skills root is not discoverable");
    }

    #[test]
    fn importing_rejects_paths_that_are_not_directories() {
        let _guard = TestCodexHome::without_codex_home();
        let home = std::env::var_os("HOME").unwrap();
        let path = PathBuf::from(home).join("SKILL.md");
        fs::write(&path, "---\nname: nope\n---\n").unwrap();

        let error = import_skill_directory(path.display().to_string()).unwrap_err();

        assert_eq!(error, "skill directory must be a directory");
    }

    #[test]
    fn importing_rejects_directories_without_skill_markdown() {
        let _guard = TestCodexHome::without_codex_home();
        let home = std::env::var_os("HOME").unwrap();
        let source_dir = PathBuf::from(home).join("source-demo");
        fs::create_dir_all(&source_dir).unwrap();

        let error = import_skill_directory(source_dir.display().to_string()).unwrap_err();

        assert_eq!(error, "skill directory must contain SKILL.md");
    }

    #[test]
    fn importing_fails_when_agent_global_root_is_not_discoverable() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let source_dir = location.codex_home.join("source-demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let error = import_skill_directory(source_dir.display().to_string()).unwrap_err();

        assert_eq!(error, "Agent global skills root is not discoverable");
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_does_not_overwrite_existing_skill_entries() {
        let _guard = TestCodexHome::without_codex_home();
        let home = std::env::var_os("HOME").unwrap();
        let home = PathBuf::from(home);
        let source_dir = home.join("demo");
        let existing_dir = home.join(".agents").join("skills").join("demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&existing_dir).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();
        fs::write(
            existing_dir.join("SKILL.md"),
            "---\nname: existing-demo\n---\n",
        )
        .unwrap();

        let error = import_skill_directory(source_dir.display().to_string()).unwrap_err();

        assert_eq!(
            error,
            "a skill entry with this directory name already exists"
        );
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_reuses_an_existing_symlink_to_the_same_skill_directory() {
        let _guard = TestCodexHome::without_codex_home();
        let home = std::env::var_os("HOME").unwrap();
        let home = PathBuf::from(home);
        let source_dir = home.join("demo");
        let link_dir = home.join(".agents").join("skills").join("demo");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(link_dir.parent().unwrap()).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();
        create_dir_symlink(&source_dir, &link_dir);

        let result = import_skill_directory(source_dir.display().to_string()).unwrap();

        assert!(!result.changed);
        assert_eq!(result.state.skills.skills.len(), 1);
        assert_eq!(result.state.skills.skills[0].name, "demo");
    }

    #[cfg(any(unix, windows))]
    #[test]
    fn importing_does_not_modify_codex_config_toml() {
        let _guard = TestCodexHome::without_codex_home();
        let home = std::env::var_os("HOME").unwrap();
        let home = PathBuf::from(home);
        let source_dir = home.join("demo");
        let config_path = home.join(".codex").join("config.toml");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(source_dir.join("SKILL.md"), "---\nname: demo\n---\n").unwrap();

        let result = import_skill_directory(source_dir.display().to_string()).unwrap();

        assert!(result.changed);
        assert!(!config_path.exists());
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

    #[cfg(unix)]
    fn create_dir_symlink(source: &Path, link: &Path) {
        std::os::unix::fs::symlink(source, link).unwrap();
    }

    #[cfg(windows)]
    fn create_dir_symlink(source: &Path, link: &Path) {
        std::os::windows::fs::symlink_dir(source, link).unwrap();
    }
}
