use crate::config_document_workflow;
use crate::config_table_entry::{
    clear_fields, entries, has_advanced_fields, normalize_entry_id, remove_table_entry, set_bool,
    set_integer, set_string, set_string_array, set_string_map, table_bool, table_integer,
    table_string, table_string_array, table_string_map, upsert_table_entry,
};
use crate::toml_store::{FileToken, PreviewResult, SaveResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use toml_edit::{DocumentMut, Item, Table};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerState {
    pub servers: Vec<McpServerEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerEntry {
    pub id: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub env: BTreeMap<String, String>,
    pub startup_timeout_ms: Option<i64>,
    pub enabled: Option<bool>,
    pub has_advanced_fields: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerDraft {
    pub id: String,
    pub original_id: Option<String>,
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    pub startup_timeout_ms: Option<i64>,
    pub enabled: Option<bool>,
}

pub type McpServerSaveResult = SaveResult;

pub fn state_from_document(document: &DocumentMut) -> McpServerState {
    let servers = entries(document, "mcp_servers", server_from_item);

    McpServerState { servers }
}

pub fn preview_save_server(draft: McpServerDraft) -> Result<PreviewResult, String> {
    config_document_workflow::preview_edit(
        |document| apply_server_draft(document, &draft),
        |_, _| Ok(Vec::new()),
    )
}

pub fn save_server(
    draft: McpServerDraft,
    file_token: Option<FileToken>,
) -> Result<McpServerSaveResult, String> {
    config_document_workflow::commit_edit(file_token, |document| {
        apply_server_draft(document, &draft)
    })
}

pub fn preview_delete_server(id: String) -> Result<PreviewResult, String> {
    config_document_workflow::preview_edit(
        |document| remove_server(document, &id),
        |_, _| Ok(Vec::new()),
    )
}

pub fn delete_server(
    id: String,
    file_token: Option<FileToken>,
) -> Result<McpServerSaveResult, String> {
    config_document_workflow::commit_edit(file_token, |document| remove_server(document, &id))
}

fn apply_server_draft(document: &mut DocumentMut, draft: &McpServerDraft) -> Result<(), String> {
    let id = server_id(&draft.id)?;
    let original_id = draft.original_id.as_deref().map(server_id).transpose()?;

    upsert_table_entry(
        document,
        "mcp_servers",
        &id,
        original_id.as_deref(),
        |existing| server_table(existing, draft),
    )
}

fn remove_server(document: &mut DocumentMut, raw_id: &str) -> Result<(), String> {
    let id = server_id(raw_id)?;

    remove_table_entry(document, "mcp_servers", &id)
}

fn server_table(existing: Option<&Item>, draft: &McpServerDraft) -> Table {
    let mut table = existing
        .and_then(Item::as_table)
        .cloned()
        .unwrap_or_else(Table::new);

    clear_editable_server_fields(&mut table);

    set_string(&mut table, "command", draft.command.as_deref());
    set_string_array(&mut table, "args", &draft.args);
    set_string_map(&mut table, "env", &draft.env);
    set_integer(&mut table, "startup_timeout_ms", draft.startup_timeout_ms);
    set_bool(&mut table, "enabled", draft.enabled);

    table
}

fn clear_editable_server_fields(table: &mut Table) {
    clear_fields(table, editable_server_keys());
}

fn server_from_item(id: &str, item: &Item) -> Option<McpServerEntry> {
    let table = item.as_table()?;

    Some(McpServerEntry {
        id: id.to_string(),
        command: table_string(table, "command"),
        args: table_string_array(table, "args"),
        env: table_string_map(table, "env"),
        startup_timeout_ms: table_integer(table, "startup_timeout_ms"),
        enabled: table_bool(table, "enabled"),
        has_advanced_fields: has_advanced_fields(table, editable_server_keys()),
    })
}

fn server_id(raw_id: &str) -> Result<String, String> {
    normalize_entry_id(raw_id, "MCP server id")
}

fn editable_server_keys() -> &'static [&'static str] {
    &["command", "args", "env", "startup_timeout_ms", "enabled"]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config_locator;
    use crate::test_support::TestCodexHome;
    use crate::toml_store;
    use std::fs;

    #[test]
    fn reads_mcp_servers_from_document() {
        let document = r#"
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
startup_timeout_ms = 5000
enabled = true

[mcp_servers.filesystem.env]
NODE_ENV = "production"
"#
        .parse::<DocumentMut>()
        .unwrap();

        let state = state_from_document(&document);
        let server = state
            .servers
            .iter()
            .find(|server| server.id == "filesystem")
            .unwrap();

        assert_eq!(server.command, Some("npx".to_string()));
        assert_eq!(
            server.args,
            vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                "/tmp".to_string()
            ]
        );
        assert_eq!(server.env.get("NODE_ENV"), Some(&"production".to_string()));
        assert_eq!(server.startup_timeout_ms, Some(5000));
        assert_eq!(server.enabled, Some(true));
    }

    #[test]
    fn preview_save_server_writes_array_and_env_table() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \"gpt-5.5\"\n").unwrap();

        let preview = preview_save_server(McpServerDraft {
            id: "filesystem".to_string(),
            original_id: None,
            command: Some("npx".to_string()),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                "/tmp".to_string(),
            ],
            env: BTreeMap::from([("NODE_ENV".to_string(), "production".to_string())]),
            startup_timeout_ms: Some(5000),
            enabled: Some(true),
        })
        .unwrap();

        assert!(preview.changed);
        assert!(preview
            .candidate_raw_toml
            .contains("[mcp_servers.filesystem]"));
        assert!(preview.candidate_raw_toml.contains("command = \"npx\""));
        assert!(preview
            .candidate_raw_toml
            .contains("@modelcontextprotocol/server-filesystem"));
        assert!(preview
            .candidate_raw_toml
            .contains("[mcp_servers.filesystem.env]"));
        assert!(preview
            .candidate_raw_toml
            .contains("NODE_ENV = \"production\""));
    }

    #[test]
    fn save_server_renames_without_leaving_old_table() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
[mcp_servers.old]
command = "node"
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_server(
            McpServerDraft {
                id: "new".to_string(),
                original_id: Some("old".to_string()),
                command: Some("npx".to_string()),
                args: Vec::new(),
                env: BTreeMap::new(),
                startup_timeout_ms: None,
                enabled: None,
            },
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(result.backup_path.is_some());
        assert!(saved_raw.contains("[mcp_servers.new]"));
        assert!(!saved_raw.contains("[mcp_servers.old]"));
    }

    #[test]
    fn save_server_preserves_advanced_fields_on_existing_server() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
[mcp_servers.filesystem]
command = "node"
transport = "stdio"

[mcp_servers.filesystem.extra]
mode = "keep"
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_server(
            McpServerDraft {
                id: "filesystem".to_string(),
                original_id: Some("filesystem".to_string()),
                command: Some("npx".to_string()),
                args: Vec::new(),
                env: BTreeMap::new(),
                startup_timeout_ms: None,
                enabled: None,
            },
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(saved_raw.contains("command = \"npx\""));
        assert!(saved_raw.contains("transport = \"stdio\""));
        assert!(saved_raw.contains("[mcp_servers.filesystem.extra]"));
        assert!(saved_raw.contains("mode = \"keep\""));
    }

    #[test]
    fn rejects_invalid_server_ids() {
        let mut document = DocumentMut::new();
        let error = apply_server_draft(
            &mut document,
            &McpServerDraft {
                id: "bad id".to_string(),
                original_id: None,
                command: None,
                args: Vec::new(),
                env: BTreeMap::new(),
                startup_timeout_ms: None,
                enabled: None,
            },
        )
        .unwrap_err();

        assert_eq!(
            error,
            "MCP server id can only contain letters, numbers, '_' and '-'"
        );
    }

    #[test]
    fn delete_server_removes_table() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
[mcp_servers.filesystem]
command = "npx"
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = delete_server("filesystem".to_string(), token).unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(!saved_raw.contains("[mcp_servers.filesystem]"));
    }
}
