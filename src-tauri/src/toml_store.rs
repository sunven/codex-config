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
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct DraftChange {
    pub path: String,
    pub action: DraftAction,
    pub value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DraftAction {
    Set,
    Unset,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
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
        assert_eq!(
            root_string(&saved_document, "model"),
            Some("gpt-5.5".to_string())
        );
    }

    #[test]
    fn raw_toml_save_preserves_complex_tables() {
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

        assert!(result.changed);
        assert!(saved_raw.contains("[mcp_servers.filesystem]"));
        assert!(saved_raw
            .contains("args = [\"-y\", \"@modelcontextprotocol/server-filesystem\", \"/tmp\"]"));
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
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("workspace-write".to_string())),
                },
                DraftChange {
                    path: "approval_policy".to_string(),
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
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("openai".to_string())),
                },
                DraftChange {
                    path: "oss_provider".to_string(),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("ollama".to_string())),
                },
                DraftChange {
                    path: "model_reasoning_summary".to_string(),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("auto".to_string())),
                },
                DraftChange {
                    path: "model_verbosity".to_string(),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("high".to_string())),
                },
                DraftChange {
                    path: "service_tier".to_string(),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("priority".to_string())),
                },
                DraftChange {
                    path: "web_search".to_string(),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::String("live".to_string())),
                },
                DraftChange {
                    path: "hide_agent_reasoning".to_string(),
                    action: DraftAction::Set,
                    value: Some(serde_json::Value::Bool(false)),
                },
                DraftChange {
                    path: "show_raw_agent_reasoning".to_string(),
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
    fn rejects_legacy_scoped_structured_edits() {
        let error = serde_json::from_value::<DraftChange>(serde_json::json!({
            "path": "model",
            "scope": "profile",
            "action": "set",
            "value": "gpt-5.5"
        }))
        .unwrap_err()
        .to_string();

        assert!(error.contains("unknown field `scope`"));
    }

    #[test]
    fn save_changes_uses_isolated_codex_home() {
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
                action: DraftAction::Set,
                value: Some(serde_json::Value::Bool(true)),
            }],
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();
        let saved_document = saved_raw.parse::<DocumentMut>().unwrap();

        assert!(result.changed);
        assert_eq!(
            root_bool(&saved_document, "features", "fast_mode"),
            Some(true)
        );
        assert!(saved_raw.contains("[profiles.work.features]"));
        assert!(saved_raw.contains("fast_mode = false"));
    }
}
