use crate::config_locator;
use crate::mcp_server_store::{McpServerDraft, McpServerEntry};
use crate::toml_store::{atomic_write, FileToken};
use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMcpState {
    pub servers: Vec<McpServerEntry>,
    pub config_path: String,
    pub config_exists: bool,
    pub file_token: Option<FileToken>,
    pub parse_issue: Option<String>,
}

const EDITABLE_KEYS: &[&str] = &["command", "args", "env"];

struct LoadedJson {
    root: Map<String, Value>,
    token: Option<FileToken>,
    exists: bool,
    parse_error: Option<String>,
}

pub fn state() -> ClaudeMcpState {
    let location = match config_locator::locate_claude() {
        Ok(location) => location,
        Err(error) => {
            return ClaudeMcpState {
                servers: Vec::new(),
                config_path: String::new(),
                config_exists: false,
                file_token: None,
                parse_issue: Some(error),
            }
        }
    };
    let loaded = load(&location.config_path);

    ClaudeMcpState {
        servers: servers_from_root(&loaded.root),
        config_path: location.config_path.display().to_string(),
        config_exists: loaded.exists,
        file_token: loaded.token,
        parse_issue: loaded.parse_error,
    }
}

pub fn save_server(draft: McpServerDraft, file_token: Option<FileToken>) -> Result<(), String> {
    let id = server_id(&draft.id)?;
    let original_id = draft.original_id.as_deref().map(server_id).transpose()?;

    commit(file_token, |root| {
        let servers = mcp_servers_mut(root);

        let existing = original_id
            .as_deref()
            .and_then(|original| servers.get(original).cloned());
        if let Some(original) = original_id.as_deref() {
            if original != id {
                servers.remove(original);
            }
        }

        let table = server_object(existing, &draft);
        servers.insert(id.clone(), Value::Object(table));
        Ok(())
    })
}

pub fn delete_server(raw_id: String, file_token: Option<FileToken>) -> Result<(), String> {
    let id = server_id(&raw_id)?;

    commit(file_token, |root| {
        mcp_servers_mut(root).remove(&id);
        Ok(())
    })
}

fn commit<Edit>(file_token: Option<FileToken>, edit: Edit) -> Result<(), String>
where
    Edit: FnOnce(&mut Map<String, Value>) -> Result<(), String>,
{
    let location = config_locator::locate_claude()?;
    let mut loaded = load(&location.config_path);

    if let Some(error) = loaded.parse_error {
        return Err(format!("无法编辑损坏的 ~/.claude.json：{error}"));
    }
    ensure_current_token(&loaded.token, file_token.as_ref())?;

    edit(&mut loaded.root)?;

    let mut serialized = serde_json::to_string_pretty(&Value::Object(loaded.root))
        .map_err(|error| format!("序列化 ~/.claude.json 失败：{error}"))?;
    serialized.push('\n');

    atomic_write(&location.config_path, serialized.as_bytes())
}

fn load(path: &Path) -> LoadedJson {
    if !path.exists() {
        return LoadedJson {
            root: Map::new(),
            token: None,
            exists: false,
            parse_error: None,
        };
    }

    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return LoadedJson {
                root: Map::new(),
                token: None,
                exists: true,
                parse_error: Some(format!("读取 ~/.claude.json 失败：{error}")),
            }
        }
    };
    let token = file_token(path, &bytes);

    match serde_json::from_slice::<Value>(&bytes) {
        Ok(Value::Object(root)) => LoadedJson {
            root,
            token,
            exists: true,
            parse_error: None,
        },
        Ok(_) => LoadedJson {
            root: Map::new(),
            token,
            exists: true,
            parse_error: Some("~/.claude.json 顶层不是对象。".to_string()),
        },
        Err(error) => LoadedJson {
            root: Map::new(),
            token,
            exists: true,
            parse_error: Some(format!("~/.claude.json JSON 解析失败：{error}")),
        },
    }
}

fn servers_from_root(root: &Map<String, Value>) -> Vec<McpServerEntry> {
    let Some(servers) = root.get("mcpServers").and_then(Value::as_object) else {
        return Vec::new();
    };

    let mut entries = servers
        .iter()
        .filter_map(|(id, value)| value.as_object().map(|table| server_from_object(id, table)))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.id.cmp(&right.id));
    entries
}

fn server_from_object(id: &str, table: &Map<String, Value>) -> McpServerEntry {
    let command = table.get("command").and_then(Value::as_str).map(str::to_string);
    let args = table
        .get("args")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let env = table
        .get("env")
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| {
                    value.as_str().map(|value| (key.clone(), value.to_string()))
                })
                .collect()
        })
        .unwrap_or_else(BTreeMap::new);
    let has_advanced_fields = table.keys().any(|key| !EDITABLE_KEYS.contains(&key.as_str()));

    McpServerEntry {
        id: id.to_string(),
        command,
        args,
        env,
        startup_timeout_ms: None,
        enabled: None,
        has_advanced_fields,
    }
}

fn server_object(existing: Option<Value>, draft: &McpServerDraft) -> Map<String, Value> {
    let mut table = existing
        .and_then(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_else(Map::new);

    for key in EDITABLE_KEYS {
        table.remove(*key);
    }

    if let Some(command) = draft.command.as_deref().filter(|value| !value.is_empty()) {
        table.insert("command".to_string(), Value::String(command.to_string()));
    }
    if !draft.args.is_empty() {
        table.insert(
            "args".to_string(),
            Value::Array(draft.args.iter().cloned().map(Value::String).collect()),
        );
    }
    if !draft.env.is_empty() {
        let env = draft
            .env
            .iter()
            .map(|(key, value)| (key.clone(), Value::String(value.clone())))
            .collect::<Map<String, Value>>();
        table.insert("env".to_string(), Value::Object(env));
    }

    table
}

fn mcp_servers_mut(root: &mut Map<String, Value>) -> &mut Map<String, Value> {
    let entry = root
        .entry("mcpServers".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    entry.as_object_mut().expect("mcpServers is an object")
}

fn server_id(raw_id: &str) -> Result<String, String> {
    let trimmed = raw_id.trim();
    if trimmed.is_empty() {
        return Err("MCP server id 不能为空".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err("MCP server id can only contain letters, numbers, '_' and '-'".to_string());
    }

    Ok(trimmed.to_string())
}

fn ensure_current_token(
    current: &Option<FileToken>,
    expected: Option<&FileToken>,
) -> Result<(), String> {
    match (current, expected) {
        (Some(current), Some(expected)) if tokens_match(current, expected) => Ok(()),
        (None, None) => Ok(()),
        (Some(_), Some(_)) => Err("~/.claude.json 已被其他程序修改。请先刷新，再保存。".to_string()),
        (Some(_), None) => {
            Err("~/.claude.json 已在磁盘上创建。请先刷新，避免覆盖外部修改。".to_string())
        }
        (None, Some(_)) => Err("~/.claude.json 已被删除。请先刷新，再保存。".to_string()),
    }
}

fn tokens_match(left: &FileToken, right: &FileToken) -> bool {
    left.hash == right.hash && left.size == right.size && left.modified_ms == right.modified_ms
}

fn file_token(path: &Path, bytes: &[u8]) -> Option<FileToken> {
    let metadata = fs::metadata(path).ok()?;
    let modified_ms = metadata.modified().ok().and_then(|time| {
        time.duration_since(UNIX_EPOCH)
            .ok()
            .map(|duration| duration.as_millis())
    });
    let hash = format!("{:x}", Sha256::digest(bytes));

    Some(FileToken {
        hash,
        modified_ms,
        size: metadata.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestClaudeHome;

    fn load_token() -> Option<FileToken> {
        let location = config_locator::locate_claude().unwrap();
        load(&location.config_path).token
    }

    fn write_config(contents: &str) {
        let location = config_locator::locate_claude().unwrap();
        fs::write(&location.config_path, contents).unwrap();
    }

    fn read_config() -> Value {
        let location = config_locator::locate_claude().unwrap();
        serde_json::from_str(&fs::read_to_string(&location.config_path).unwrap()).unwrap()
    }

    fn draft(id: &str, command: &str) -> McpServerDraft {
        McpServerDraft {
            id: id.to_string(),
            original_id: None,
            command: Some(command.to_string()),
            args: vec!["-y".to_string(), "server".to_string()],
            env: BTreeMap::from([("KEY".to_string(), "value".to_string())]),
            startup_timeout_ms: None,
            enabled: None,
        }
    }

    #[test]
    fn reads_mcp_servers_from_config() {
        let _guard = TestClaudeHome::new();
        write_config(
            r#"{"mcpServers":{"gitnexus":{"command":"node","args":["run.js"],"type":"stdio"}}}"#,
        );

        let state = state();

        assert_eq!(state.servers.len(), 1);
        let server = &state.servers[0];
        assert_eq!(server.id, "gitnexus");
        assert_eq!(server.command, Some("node".to_string()));
        assert_eq!(server.args, vec!["run.js".to_string()]);
        assert!(server.has_advanced_fields); // "type" is preserved/advanced
    }

    #[test]
    fn save_server_creates_and_preserves_other_keys() {
        let _guard = TestClaudeHome::new();
        write_config(r#"{"numStartups":3,"mcpServers":{}}"#);
        let token = load_token();

        save_server(draft("filesystem", "npx"), token).unwrap();
        let config = read_config();

        assert_eq!(config["numStartups"], serde_json::json!(3));
        let server = &config["mcpServers"]["filesystem"];
        assert_eq!(server["command"], serde_json::json!("npx"));
        assert_eq!(server["args"], serde_json::json!(["-y", "server"]));
        assert_eq!(server["env"]["KEY"], serde_json::json!("value"));
    }

    #[test]
    fn save_server_preserves_advanced_fields_and_renames() {
        let _guard = TestClaudeHome::new();
        write_config(
            r#"{"mcpServers":{"old":{"command":"node","type":"stdio","headers":{"A":"b"}}}}"#,
        );
        let token = load_token();

        let mut renamed = draft("new", "npx");
        renamed.original_id = Some("old".to_string());
        renamed.args = Vec::new();
        renamed.env = BTreeMap::new();
        save_server(renamed, token).unwrap();
        let config = read_config();

        assert!(config["mcpServers"].get("old").is_none());
        let server = &config["mcpServers"]["new"];
        assert_eq!(server["command"], serde_json::json!("npx"));
        assert_eq!(server["type"], serde_json::json!("stdio"));
        assert_eq!(server["headers"]["A"], serde_json::json!("b"));
    }

    #[test]
    fn delete_server_removes_entry() {
        let _guard = TestClaudeHome::new();
        write_config(r#"{"mcpServers":{"filesystem":{"command":"npx"}}}"#);
        let token = load_token();

        delete_server("filesystem".to_string(), token).unwrap();
        let config = read_config();

        assert!(config["mcpServers"].get("filesystem").is_none());
    }

    #[test]
    fn stale_token_blocks_save() {
        let _guard = TestClaudeHome::new();
        write_config(r#"{"mcpServers":{}}"#);
        let stale = Some(FileToken {
            hash: "stale".to_string(),
            modified_ms: Some(1),
            size: 1,
        });

        let error = save_server(draft("filesystem", "npx"), stale).unwrap_err();

        assert!(error.contains("已被其他程序修改"));
    }

    #[test]
    fn rejects_invalid_id() {
        let _guard = TestClaudeHome::new();
        write_config(r#"{"mcpServers":{}}"#);
        let token = load_token();

        let error = save_server(draft("bad id", "npx"), token).unwrap_err();

        assert_eq!(
            error,
            "MCP server id can only contain letters, numbers, '_' and '-'"
        );
    }
}
