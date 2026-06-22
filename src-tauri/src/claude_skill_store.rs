use crate::config_locator;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const ENABLED_NAME: &str = "SKILL.md";
const DISABLED_NAME: &str = "SKILL.md.disabled";

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

struct SkillMetadata {
    name: Option<String>,
    description: Option<String>,
}

pub fn state() -> SkillState {
    let Ok(location) = config_locator::locate_claude() else {
        return SkillState {
            roots: Vec::new(),
            skills: Vec::new(),
        };
    };
    let root = &location.skills_dir;
    let mut skills = Vec::new();

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let directory = entry.path();
            if !directory.is_dir() {
                continue;
            }
            if let Some(summary) = skill_summary(&directory) {
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
        roots: vec![SkillRoot {
            exists: root.exists(),
            path: root.display().to_string(),
            label: "Claude global skills".to_string(),
        }],
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

pub fn set_skill_enabled(path: String, enabled: bool) -> Result<SkillState, String> {
    let skill_path = verified_skill_path(&path)?;
    let directory = skill_path
        .parent()
        .ok_or_else(|| "skill path must have a parent directory".to_string())?;
    let target = if enabled {
        directory.join(ENABLED_NAME)
    } else {
        directory.join(DISABLED_NAME)
    };

    if skill_path != target {
        if target.exists() {
            return Err("skill already has the requested state".to_string());
        }
        fs::rename(&skill_path, &target)
            .map_err(|error| format!("failed to toggle skill: {error}"))?;
    }

    Ok(state())
}

pub fn delete_skill(path: String) -> Result<SkillState, String> {
    let skill_path = verified_skill_path(&path)?;
    let directory = skill_path
        .parent()
        .ok_or_else(|| "skill path must have a parent directory".to_string())?
        .to_path_buf();
    let symlink = fs::symlink_metadata(&directory)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false);

    remove_skill_directory(&directory, symlink)?;

    Ok(state())
}

fn skill_summary(directory: &Path) -> Option<SkillSummary> {
    let enabled_path = directory.join(ENABLED_NAME);
    let disabled_path = directory.join(DISABLED_NAME);
    let (path, enabled) = if enabled_path.is_file() {
        (enabled_path, true)
    } else if disabled_path.is_file() {
        (disabled_path, false)
    } else {
        return None;
    };

    let raw = fs::read_to_string(&path).ok()?;
    let metadata = parse_metadata(&raw);
    let metadata_fs = fs::metadata(&path).ok()?;
    let symlink = fs::symlink_metadata(directory)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false);
    let target_directory = symlink.then(|| canonical_or_self(directory).display().to_string());

    Some(SkillSummary {
        name: metadata.name.unwrap_or_else(|| fallback_skill_name(&path)),
        description: metadata.description,
        path: path.display().to_string(),
        directory: directory.display().to_string(),
        symlink,
        target_directory,
        source: "Claude global skills".to_string(),
        enabled,
        configured: !enabled,
        size: metadata_fs.len(),
        modified_ms: metadata_fs.modified().ok().and_then(|time| {
            time.duration_since(UNIX_EPOCH)
                .ok()
                .map(|duration| duration.as_millis())
        }),
    })
}

fn remove_skill_directory(directory: &Path, symlink: bool) -> Result<(), String> {
    if !symlink {
        return fs::remove_dir_all(directory)
            .map_err(|error| format!("failed to remove skill directory: {error}"));
    }

    #[cfg(unix)]
    {
        fs::remove_file(directory)
            .map_err(|error| format!("failed to remove skill symlink: {error}"))
    }

    #[cfg(windows)]
    {
        fs::remove_dir(directory)
            .map_err(|error| format!("failed to remove skill symlink: {error}"))
    }
}

fn verified_skill_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    let file_name = path.file_name().and_then(|name| name.to_str());
    if file_name != Some(ENABLED_NAME) && file_name != Some(DISABLED_NAME) {
        return Err("skill path must point to SKILL.md".to_string());
    }
    if !path.is_file() {
        return Err("skill file does not exist".to_string());
    }

    let location = config_locator::locate_claude()?;
    let root = canonical_or_self(&location.skills_dir);
    let directory = path
        .parent()
        .ok_or_else(|| "skill path must have a parent directory".to_string())?;

    // Only skills directly under ~/.claude/skills may be toggled or deleted.
    let parent_of_directory = directory.parent().map(canonical_or_self);
    if parent_of_directory.as_deref() != Some(root.as_path()) {
        return Err("skill path is outside the Claude global skills root".to_string());
    }

    Ok(path)
}

fn canonical_or_self(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
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
                    if !next.starts_with(' ') && !next.starts_with('\t') && !next.trim().is_empty() {
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
    use crate::test_support::TestClaudeHome;

    fn write_skill(name: &str, file: &str, body: &str) -> PathBuf {
        let location = config_locator::locate_claude().unwrap();
        let dir = location.skills_dir.join(name);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(file);
        fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn discovers_skills_and_reads_metadata() {
        let _guard = TestClaudeHome::new();
        write_skill(
            "demo",
            ENABLED_NAME,
            "---\nname: demo\ndescription: |\n  Demo skill.\n---\n# Demo\n",
        );

        let state = state();

        assert_eq!(state.skills.len(), 1);
        assert_eq!(state.skills[0].name, "demo");
        assert_eq!(state.skills[0].description, Some("Demo skill.".to_string()));
        assert!(state.skills[0].enabled);
        assert_eq!(state.skills[0].source, "Claude global skills");
    }

    #[test]
    fn disabled_skill_is_listed_as_disabled() {
        let _guard = TestClaudeHome::new();
        write_skill("demo", DISABLED_NAME, "---\nname: demo\n---\n");

        let state = state();

        assert_eq!(state.skills.len(), 1);
        assert!(!state.skills[0].enabled);
        assert!(state.skills[0].configured);
    }

    #[test]
    fn toggle_renames_between_enabled_and_disabled() {
        let _guard = TestClaudeHome::new();
        let path = write_skill("demo", ENABLED_NAME, "---\nname: demo\n---\n");

        let disabled = set_skill_enabled(path.display().to_string(), false).unwrap();
        assert!(!disabled.skills[0].enabled);
        let location = config_locator::locate_claude().unwrap();
        assert!(location.skills_dir.join("demo").join(DISABLED_NAME).is_file());
        assert!(!location.skills_dir.join("demo").join(ENABLED_NAME).exists());

        let disabled_path = disabled.skills[0].path.clone();
        let enabled = set_skill_enabled(disabled_path, true).unwrap();
        assert!(enabled.skills[0].enabled);
        assert!(location.skills_dir.join("demo").join(ENABLED_NAME).is_file());
    }

    #[test]
    fn delete_removes_skill_directory() {
        let _guard = TestClaudeHome::new();
        let path = write_skill("demo", ENABLED_NAME, "---\nname: demo\n---\n");

        let result = delete_skill(path.display().to_string()).unwrap();

        assert!(result.skills.is_empty());
        let location = config_locator::locate_claude().unwrap();
        assert!(!location.skills_dir.join("demo").exists());
    }

    #[test]
    fn rejects_paths_outside_root() {
        let _guard = TestClaudeHome::new();
        let location = config_locator::locate_claude().unwrap();
        let outside = location.claude_home.join("outside");
        fs::create_dir_all(&outside).unwrap();
        let path = outside.join(ENABLED_NAME);
        fs::write(&path, "---\nname: demo\n---\n").unwrap();

        let error = set_skill_enabled(path.display().to_string(), false).unwrap_err();

        assert_eq!(error, "skill path is outside the Claude global skills root");
    }

    #[test]
    fn read_skill_content_returns_markdown() {
        let _guard = TestClaudeHome::new();
        let path = write_skill("demo", ENABLED_NAME, "---\nname: demo\n---\n# Body\n");

        let content = read_skill_content(path.display().to_string()).unwrap();

        assert_eq!(content.name, "demo");
        assert!(content.raw_markdown.contains("# Body"));
    }
}
