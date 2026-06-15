use crate::config_document_workflow;
#[cfg(test)]
use crate::config_locator;
use crate::schema_write;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use toml_edit::DocumentMut;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileToken {
    pub hash: String,
    pub modified_ms: Option<u128>,
    pub size: u64,
}

impl FileToken {
    fn matches(&self, other: &FileToken) -> bool {
        self.hash == other.hash && self.size == other.size && self.modified_ms == other.modified_ms
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseIssue {
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftChange {
    pub path: String,
    pub scope: Option<DraftScope>,
    pub action: DraftAction,
    pub value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DraftScope {
    Root,
    Profile,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DraftAction {
    Set,
    Unset,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub changed: bool,
    pub field_diffs: Vec<FieldDiff>,
    pub text_diff: String,
    pub candidate_raw_toml: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDiff {
    pub scope: DraftScope,
    pub path: String,
    pub label: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub backup_path: Option<String>,
    pub changed: bool,
    pub state: crate::app_state::AppState,
}

#[derive(Debug, Clone)]
pub struct LoadedToml {
    pub raw: String,
    pub document: Option<DocumentMut>,
    pub token: Option<FileToken>,
    pub parse_issue: Option<ParseIssue>,
    pub exists: bool,
}

pub fn preview_changes(changes: Vec<DraftChange>) -> Result<PreviewResult, String> {
    config_document_workflow::preview_edit(
        |document| apply_changes(document, &changes),
        |original, candidate| match original {
            Some(document) => field_diffs(document, candidate, &changes),
            None => Ok(Vec::new()),
        },
    )
}

pub fn preview_raw_toml(raw_toml: String) -> Result<PreviewResult, String> {
    config_document_workflow::preview_raw_toml(raw_toml)
}

pub fn save_changes(
    changes: Vec<DraftChange>,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    config_document_workflow::commit_edit(file_token, |document| apply_changes(document, &changes))
}

pub fn save_raw_toml(
    raw_toml: String,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    config_document_workflow::commit_raw_toml(raw_toml, file_token)
}

pub fn restore_backup(
    backup_id: String,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    config_document_workflow::restore_backup(backup_id, file_token)
}

pub fn load(path: &Path) -> Result<LoadedToml, String> {
    if !path.exists() {
        return Ok(LoadedToml {
            raw: String::new(),
            document: Some(DocumentMut::new()),
            token: None,
            parse_issue: None,
            exists: false,
        });
    }

    let bytes = fs::read(path).map_err(|error| format!("failed to read config: {error}"))?;
    let raw = String::from_utf8_lossy(&bytes).into_owned();
    let token = Some(file_token(path, &bytes)?);

    match raw.parse::<DocumentMut>() {
        Ok(document) => Ok(LoadedToml {
            raw,
            document: Some(document),
            token,
            parse_issue: None,
            exists: true,
        }),
        Err(error) => Ok(LoadedToml {
            raw,
            document: None,
            token,
            parse_issue: Some(ParseIssue {
                message: error.to_string(),
            }),
            exists: true,
        }),
    }
}

pub fn root_string(document: &DocumentMut, key: &str) -> Option<String> {
    schema_write::root_string(document, key)
}

pub fn root_bool(document: &DocumentMut, table: &str, key: &str) -> Option<bool> {
    schema_write::root_bool(document, table, key)
}

pub fn root_bool_key(document: &DocumentMut, key: &str) -> Option<bool> {
    schema_write::root_bool_key(document, key)
}

pub fn profile_string(document: &DocumentMut, profile_name: &str, key: &str) -> Option<String> {
    schema_write::profile_string(document, profile_name, key)
}

pub fn profile_bool(
    document: &DocumentMut,
    profile_name: &str,
    table: &str,
    key: &str,
) -> Option<bool> {
    schema_write::profile_bool(document, profile_name, table, key)
}

pub fn profile_bool_key(document: &DocumentMut, profile_name: &str, key: &str) -> Option<bool> {
    schema_write::profile_bool_key(document, profile_name, key)
}

pub fn root_item_exists(document: &DocumentMut, key: &str) -> Option<bool> {
    document.get(key).map(|_| true)
}

#[cfg(test)]
fn candidate_document(loaded: LoadedToml, changes: &[DraftChange]) -> Result<DocumentMut, String> {
    if let Some(issue) = loaded.parse_issue {
        return Err(format!("cannot edit malformed TOML: {}", issue.message));
    }

    let mut document = loaded.document.unwrap_or_else(DocumentMut::new);
    apply_changes(&mut document, changes)?;
    config_document_workflow::serialize_validated_document(&document)?;

    Ok(document)
}

fn apply_changes(document: &mut DocumentMut, changes: &[DraftChange]) -> Result<(), String> {
    for change in changes {
        schema_write::apply_change(document, change)?;
    }
    Ok(())
}

fn field_diffs(
    original: &DocumentMut,
    candidate: &DocumentMut,
    changes: &[DraftChange],
) -> Result<Vec<FieldDiff>, String> {
    let mut diffs = Vec::new();
    let mut seen_paths = Vec::<String>::new();

    for change in changes {
        let scope = change.scope.unwrap_or(DraftScope::Root);
        let seen_key = format!("{scope:?}:{}", change.path);

        if seen_paths.contains(&seen_key) {
            continue;
        }
        seen_paths.push(seen_key);

        let before = display_field_value(original, scope, &change.path)?;
        let after = display_field_value(candidate, scope, &change.path)?;

        if before != after {
            diffs.push(FieldDiff {
                scope,
                path: change.path.clone(),
                label: field_label(scope, &change.path)?,
                before,
                after,
            });
        }
    }

    Ok(diffs)
}

fn display_field_value(
    document: &DocumentMut,
    scope: DraftScope,
    path: &str,
) -> Result<String, String> {
    schema_write::display_field_value(document, scope, path)
}

fn field_label(scope: DraftScope, path: &str) -> Result<String, String> {
    schema_write::field_label(scope, path)
}

fn backup_name() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("config-{timestamp}-{}.toml", std::process::id())
}

pub(crate) fn ensure_current_token(
    loaded: &LoadedToml,
    expected: Option<&FileToken>,
) -> Result<(), String> {
    match (&loaded.token, expected) {
        (Some(current), Some(expected)) if current.matches(expected) => Ok(()),
        (None, None) => Ok(()),
        (Some(_), Some(_)) => Err("config.toml 已被其他程序修改。请先刷新，再保存。".to_string()),
        (Some(_), None) => {
            Err("config.toml 已在磁盘上创建。请先刷新，避免覆盖外部修改。".to_string())
        }
        (None, Some(_)) => Err("config.toml 已被删除。请先刷新，再保存。".to_string()),
    }
}

pub(crate) fn backup_existing_file(
    config_path: &Path,
    backup_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    fs::create_dir_all(backup_dir)
        .map_err(|error| format!("failed to create backup directory: {error}"))?;

    if !config_path.exists() {
        return Ok(None);
    }

    let backup_path = backup_dir.join(backup_name());
    fs::copy(config_path, &backup_path)
        .map_err(|error| format!("failed to create backup: {error}"))?;
    Ok(Some(backup_path))
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create config directory: {error}"))?;
    }

    let temp_path = unique_temp_path(path);
    {
        let mut file = File::create(&temp_path)
            .map_err(|error| format!("failed to create temp file: {error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("failed to write temp file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("failed to sync temp file: {error}"))?;
    }

    fs::rename(&temp_path, path)
        .map_err(|error| format!("failed to replace config file: {error}"))?;

    if let Some(parent) = path.parent() {
        if let Ok(directory) = File::open(parent) {
            let _ = directory.sync_all();
        }
    }

    Ok(())
}

fn unique_temp_path(path: &Path) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    path.with_extension(format!("toml.{timestamp}.tmp"))
}

pub(crate) fn simple_diff(original: &str, candidate: &str) -> String {
    if original == candidate {
        return "No changes".to_string();
    }

    let original_lines = original.lines().collect::<Vec<_>>();
    let candidate_lines = candidate.lines().collect::<Vec<_>>();
    let mut output = String::new();
    let max_len = original_lines.len().max(candidate_lines.len());

    for index in 0..max_len {
        match (original_lines.get(index), candidate_lines.get(index)) {
            (Some(left), Some(right)) if left == right => {}
            (Some(left), Some(right)) => {
                output.push_str(&format!("- {left}\n+ {right}\n"));
            }
            (Some(left), None) => {
                output.push_str(&format!("- {left}\n"));
            }
            (None, Some(right)) => {
                output.push_str(&format!("+ {right}\n"));
            }
            (None, None) => {}
        }
    }

    output
}

fn file_token(path: &Path, bytes: &[u8]) -> Result<FileToken, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("failed to stat config: {error}"))?;
    let modified_ms = metadata.modified().ok().and_then(|time| {
        time.duration_since(UNIX_EPOCH)
            .ok()
            .map(|duration| duration.as_millis())
    });
    let hash = format!("{:x}", Sha256::digest(bytes));

    Ok(FileToken {
        hash,
        modified_ms,
        size: metadata.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestCodexHome;

    #[test]
    fn reads_root_and_nested_values() {
        let document = r#"
model = "gpt-5.5"
model_provider = "openai"
model_verbosity = "medium"
model_reasoning_effort = "high"
web_search = "cached"

[features]
fast_mode = true
"#
        .parse::<DocumentMut>()
        .unwrap();

        assert_eq!(root_string(&document, "model"), Some("gpt-5.5".to_string()));
        assert_eq!(root_bool(&document, "features", "fast_mode"), Some(true));
        assert_eq!(
            root_string(&document, "model_provider"),
            Some("openai".to_string())
        );
        assert_eq!(
            root_string(&document, "model_verbosity"),
            Some("medium".to_string())
        );
        assert_eq!(
            root_string(&document, "model_reasoning_effort"),
            Some("high".to_string())
        );
        assert_eq!(
            root_string(&document, "web_search"),
            Some("cached".to_string())
        );
    }

    #[test]
    fn applies_fast_mode_without_touching_profiles() {
        let loaded = LoadedToml {
            raw: r#"
[profiles.work.features]
fast_mode = false
"#
            .to_string(),
            document: Some(
                r#"
[profiles.work.features]
fast_mode = false
"#
                .parse::<DocumentMut>()
                .unwrap(),
            ),
            token: None,
            parse_issue: None,
            exists: true,
        };
        let candidate = candidate_document(
            loaded,
            &[DraftChange {
                path: "features.fast_mode".to_string(),
                scope: None,
                action: DraftAction::Set,
                value: Some(serde_json::Value::Bool(true)),
            }],
        )
        .unwrap()
        .to_string();
        let reparsed = candidate.parse::<DocumentMut>().unwrap();

        assert_eq!(root_bool(&reparsed, "features", "fast_mode"), Some(true));
        assert!(candidate.contains("[profiles.work.features]"));
        assert!(candidate.contains("fast_mode = false"));
    }

    #[test]
    fn token_mismatch_blocks_save() {
        let loaded = LoadedToml {
            raw: "model = \"gpt-5.5\"\n".to_string(),
            document: Some("model = \"gpt-5.5\"\n".parse::<DocumentMut>().unwrap()),
            token: Some(FileToken {
                hash: "current".to_string(),
                modified_ms: Some(2),
                size: 10,
            }),
            parse_issue: None,
            exists: true,
        };
        let expected = FileToken {
            hash: "old".to_string(),
            modified_ms: Some(1),
            size: 10,
        };

        assert_eq!(
            ensure_current_token(&loaded, Some(&expected)).unwrap_err(),
            "config.toml 已被其他程序修改。请先刷新，再保存。"
        );
    }

    #[test]
    fn preview_reports_field_level_diffs() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
model = "gpt-5.4"

[features]
fast_mode = false
"#,
        )
        .unwrap();

        let preview = preview_changes(vec![
            DraftChange {
                path: "features.fast_mode".to_string(),
                scope: None,
                action: DraftAction::Set,
                value: Some(serde_json::Value::Bool(true)),
            },
            DraftChange {
                path: "model".to_string(),
                scope: None,
                action: DraftAction::Set,
                value: Some(serde_json::Value::String("gpt-5.5".to_string())),
            },
        ])
        .unwrap();

        assert!(preview.changed);
        assert_eq!(preview.field_diffs.len(), 2);
        assert_eq!(preview.field_diffs[0].path, "features.fast_mode");
        assert_eq!(preview.field_diffs[0].before, "false");
        assert_eq!(preview.field_diffs[0].after, "true");
        assert_eq!(preview.field_diffs[1].path, "model");
        assert_eq!(preview.field_diffs[1].before, "gpt-5.4");
        assert_eq!(preview.field_diffs[1].after, "gpt-5.5");
    }

    #[test]
    fn preview_raw_toml_reports_text_diff_without_field_diffs() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \"gpt-5.4\"\n").unwrap();

        let preview = preview_raw_toml(
            r#"
model = "gpt-5.5"

[model_providers.local]
base_url = "http://localhost:1234/v1"
env_key = "LOCAL_API_KEY"
"#
            .trim_start()
            .to_string(),
        )
        .unwrap();

        assert!(preview.changed);
        assert!(preview.field_diffs.is_empty());
        assert!(preview.text_diff.contains("- model = \"gpt-5.4\""));
        assert!(preview.text_diff.contains("+ model = \"gpt-5.5\""));
        assert!(preview
            .candidate_raw_toml
            .contains("[model_providers.local]"));
    }

    #[test]
    fn raw_toml_save_rejects_malformed_candidate() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \"gpt-5.4\"\n").unwrap();
        let token = load(&location.config_path).unwrap().token;

        let error = save_raw_toml("model = \n".to_string(), token).unwrap_err();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(error.starts_with("candidate TOML is malformed:"));
        assert_eq!(saved_raw, "model = \"gpt-5.4\"\n");
    }

    #[test]
    fn raw_toml_save_can_repair_current_malformed_config() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \n").unwrap();
        let token = load(&location.config_path).unwrap().token;

        let result = save_raw_toml("model = \"gpt-5.5\"\n".to_string(), token).unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();
        let saved_document = saved_raw.parse::<DocumentMut>().unwrap();

        assert!(result.changed);
        assert!(result.backup_path.is_some());
        assert_eq!(
            root_string(&saved_document, "model"),
            Some("gpt-5.5".to_string())
        );
    }

    #[test]
    fn raw_toml_save_creates_backup_and_preserves_complex_tables() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \"gpt-5.4\"\n").unwrap();
        let token = load(&location.config_path).unwrap().token;

        let result = save_raw_toml(
            r#"
model = "gpt-5.5"

[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
"#
            .trim_start()
            .to_string(),
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();
        let backups = fs::read_dir(&location.backup_dir)
            .unwrap()
            .collect::<Vec<_>>();

        assert!(result.changed);
        assert!(result.backup_path.is_some());
        assert!(saved_raw.contains("[mcp_servers.filesystem]"));
        assert!(saved_raw
            .contains("args = [\"-y\", \"@modelcontextprotocol/server-filesystem\", \"/tmp\"]"));
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn applies_sandbox_and_approval_policy_as_root_strings() {
        let loaded = LoadedToml {
            raw: String::new(),
            document: Some(DocumentMut::new()),
            token: None,
            parse_issue: None,
            exists: false,
        };

        let candidate = candidate_document(
            loaded,
            &[
                DraftChange {
                    path: "sandbox_mode".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("workspace-write".to_string())),
                },
                DraftChange {
                    path: "approval_policy".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("on-request".to_string())),
                },
            ],
        )
        .unwrap();

        assert_eq!(
            root_string(&candidate, "sandbox_mode"),
            Some("workspace-write".to_string())
        );
        assert_eq!(
            root_string(&candidate, "approval_policy"),
            Some("on-request".to_string())
        );
    }

    #[test]
    fn applies_additional_root_fields_with_correct_types() {
        let loaded = LoadedToml {
            raw: String::new(),
            document: Some(DocumentMut::new()),
            token: None,
            parse_issue: None,
            exists: false,
        };

        let candidate = candidate_document(
            loaded,
            &[
                DraftChange {
                    path: "model_provider".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("openai".to_string())),
                },
                DraftChange {
                    path: "oss_provider".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("ollama".to_string())),
                },
                DraftChange {
                    path: "model_reasoning_summary".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("auto".to_string())),
                },
                DraftChange {
                    path: "model_verbosity".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("high".to_string())),
                },
                DraftChange {
                    path: "service_tier".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("priority".to_string())),
                },
                DraftChange {
                    path: "web_search".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("live".to_string())),
                },
                DraftChange {
                    path: "hide_agent_reasoning".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::Bool(false)),
                },
                DraftChange {
                    path: "show_raw_agent_reasoning".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::Bool(true)),
                },
            ],
        )
        .unwrap();

        assert_eq!(
            root_string(&candidate, "model_provider"),
            Some("openai".to_string())
        );
        assert_eq!(
            root_string(&candidate, "oss_provider"),
            Some("ollama".to_string())
        );
        assert_eq!(
            root_string(&candidate, "model_reasoning_summary"),
            Some("auto".to_string())
        );
        assert_eq!(
            root_string(&candidate, "model_verbosity"),
            Some("high".to_string())
        );
        assert_eq!(
            root_string(&candidate, "service_tier"),
            Some("priority".to_string())
        );
        assert_eq!(
            root_string(&candidate, "web_search"),
            Some("live".to_string())
        );
        assert_eq!(
            root_bool_key(&candidate, "hide_agent_reasoning"),
            Some(false)
        );
        assert_eq!(
            root_bool_key(&candidate, "show_raw_agent_reasoning"),
            Some(true)
        );
    }

    #[test]
    fn applies_active_profile_fields_without_touching_root_or_other_profiles() {
        let loaded = LoadedToml {
            raw: r#"
profile = "work"
model = "gpt-5.4"

[features]
fast_mode = false

[profiles.personal]
model = "gpt-5.3"

[profiles.work]
model = "gpt-5.5"
hide_agent_reasoning = false

[profiles.work.features]
fast_mode = false
"#
            .to_string(),
            document: Some(
                r#"
profile = "work"
model = "gpt-5.4"

[features]
fast_mode = false

[profiles.personal]
model = "gpt-5.3"

[profiles.work]
model = "gpt-5.5"
hide_agent_reasoning = false

[profiles.work.features]
fast_mode = false
"#
                .parse::<DocumentMut>()
                .unwrap(),
            ),
            token: None,
            parse_issue: None,
            exists: true,
        };

        let candidate = candidate_document(
            loaded,
            &[
                DraftChange {
                    path: "features.fast_mode".to_string(),
                    scope: Some(DraftScope::Profile),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::Bool(true)),
                },
                DraftChange {
                    path: "model".to_string(),
                    scope: Some(DraftScope::Profile),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("gpt-5.6".to_string())),
                },
                DraftChange {
                    path: "hide_agent_reasoning".to_string(),
                    scope: Some(DraftScope::Profile),
                    action: DraftAction::Unset,
                    value: None,
                },
            ],
        )
        .unwrap();

        assert_eq!(
            root_string(&candidate, "model"),
            Some("gpt-5.4".to_string())
        );
        assert_eq!(root_bool(&candidate, "features", "fast_mode"), Some(false));
        assert_eq!(
            profile_string(&candidate, "work", "model"),
            Some("gpt-5.6".to_string())
        );
        assert_eq!(
            profile_bool(&candidate, "work", "features", "fast_mode"),
            Some(true)
        );
        assert_eq!(
            profile_bool_key(&candidate, "work", "hide_agent_reasoning"),
            None
        );
        assert_eq!(
            profile_string(&candidate, "personal", "model"),
            Some("gpt-5.3".to_string())
        );
    }

    #[test]
    fn creates_missing_active_profile_table_when_editing_profile_scope() {
        let loaded = LoadedToml {
            raw: r#"profile = "new-work""#.to_string(),
            document: Some(r#"profile = "new-work""#.parse::<DocumentMut>().unwrap()),
            token: None,
            parse_issue: None,
            exists: true,
        };

        let candidate = candidate_document(
            loaded,
            &[DraftChange {
                path: "model".to_string(),
                scope: Some(DraftScope::Profile),
                action: DraftAction::Set,
                value: Some(serde_json::Value::String("gpt-5.5".to_string())),
            }],
        )
        .unwrap();

        assert_eq!(
            profile_string(&candidate, "new-work", "model"),
            Some("gpt-5.5".to_string())
        );
    }

    #[test]
    fn profile_scope_requires_active_profile() {
        let loaded = LoadedToml {
            raw: String::new(),
            document: Some(DocumentMut::new()),
            token: None,
            parse_issue: None,
            exists: false,
        };

        let error = candidate_document(
            loaded,
            &[DraftChange {
                path: "model".to_string(),
                scope: Some(DraftScope::Profile),
                action: DraftAction::Set,
                value: Some(serde_json::Value::String("gpt-5.5".to_string())),
            }],
        )
        .unwrap_err();

        assert_eq!(error, "没有 active profile，无法编辑 profile 配置。");
    }

    #[test]
    fn save_changes_uses_isolated_codex_home_and_creates_backup() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
model = "gpt-5.4"

[profiles.work.features]
fast_mode = false
"#,
        )
        .unwrap();
        let token = load(&location.config_path).unwrap().token;

        let result = save_changes(
            vec![DraftChange {
                path: "features.fast_mode".to_string(),
                scope: None,
                action: DraftAction::Set,
                value: Some(serde_json::Value::Bool(true)),
            }],
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();
        let saved_document = saved_raw.parse::<DocumentMut>().unwrap();
        let backups = fs::read_dir(&location.backup_dir)
            .unwrap()
            .collect::<Vec<_>>();

        assert!(result.changed);
        assert!(result.backup_path.is_some());
        assert_eq!(
            root_bool(&saved_document, "features", "fast_mode"),
            Some(true)
        );
        assert!(saved_raw.contains("[profiles.work.features]"));
        assert!(saved_raw.contains("fast_mode = false"));
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn restore_backup_uses_isolated_codex_home_and_backs_up_current_file() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.backup_dir).unwrap();
        fs::write(&location.config_path, "model = \"gpt-5.4\"\n").unwrap();
        fs::write(
            location.backup_dir.join("config-before.toml"),
            "model = \"gpt-5.5\"\n",
        )
        .unwrap();
        let token = load(&location.config_path).unwrap().token;

        let result = restore_backup("config-before.toml".to_string(), token).unwrap();
        let restored_raw = fs::read_to_string(&location.config_path).unwrap();
        let backups = fs::read_dir(&location.backup_dir)
            .unwrap()
            .collect::<Vec<_>>();

        assert!(result.changed);
        assert!(result.backup_path.is_some());
        assert_eq!(restored_raw, "model = \"gpt-5.5\"\n");
        assert_eq!(backups.len(), 2);
    }
}
