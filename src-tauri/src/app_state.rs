use crate::app_preferences::{self, AppPreferences};
use crate::codex_probe::{self, CodexProbe};
use crate::codex_session_store::{self, CodexSessionState};
use crate::config_locator;
use crate::config_schema::{self, FieldDefinition};
use crate::mcp_server_store::{self, McpServerState};
use crate::model_provider_store::{self, ModelProviderState};
use crate::skill_store::{self, SkillState};
use crate::toml_store::{self, FileToken, ParseIssue};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub home_dir: Option<String>,
    pub config_path: String,
    pub resolved_path: String,
    pub writable: bool,
    pub readonly_reason: Option<String>,
    pub file_token: Option<FileToken>,
    pub health: HealthState,
    pub fields: Vec<FieldState>,
    pub model_providers: ModelProviderState,
    pub mcp_servers: McpServerState,
    pub codex_sessions: Option<CodexSessionState>,
    pub skills: SkillState,
    pub raw_toml: String,
    pub parse_issue: Option<ParseIssue>,
    pub preferences: AppPreferences,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthState {
    pub status: HealthStatus,
    pub codex: CodexProbe,
    pub config_exists: bool,
    pub schema_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthStatus {
    Ready,
    ReadOnly,
    NeedsAttention,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldState {
    pub path: String,
    pub label: String,
    pub group: String,
    pub kind: FieldKind,
    pub value: Option<String>,
    pub editable: bool,
    pub risk: String,
    pub note: Option<String>,
    pub options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    Boolean,
    Text,
    Select,
    Status,
    Number,
    Object,
}

pub fn load_state() -> Result<AppState, String> {
    load_state_inner(false)
}

pub fn load_state_with_sessions() -> Result<AppState, String> {
    load_state_inner(true)
}

fn load_state_inner(include_sessions: bool) -> Result<AppState, String> {
    let location = config_locator::locate()?;
    let loaded = toml_store::load(&location.config_path)?;
    let preferences = app_preferences::load();
    let codex = codex_probe::probe_with_preferences(&preferences);
    let codex_sessions = if include_sessions {
        Some(codex_session_store::state(&location.codex_home))
    } else {
        None
    };

    let mut readonly_reason = None;
    let mut status = HealthStatus::Ready;

    if loaded.parse_issue.is_some() {
        readonly_reason = Some("config.toml 语法有误。修复 TOML 后才能保存。".to_string());
        status = HealthStatus::NeedsAttention;
    } else if !codex.found {
        readonly_reason = Some("未找到 Codex 命令。请选择 codex 文件后再保存配置。".to_string());
        status = HealthStatus::ReadOnly;
    }

    let writable = readonly_reason.is_none();
    let schema = config_schema::schema()?;
    let (fields, model_providers, mcp_servers, skills) =
        match loaded.document.as_ref() {
            Some(document) => (
                fields_from_document(document, writable, schema),
                model_provider_store::state_from_document(document),
                mcp_server_store::state_from_document(document),
                skill_store::state_from_document(Some(document)),
            ),
            None => (
                Vec::new(),
                ModelProviderState {
                    providers: Vec::new(),
                    reserved_ids: Vec::new(),
                },
                McpServerState {
                    servers: Vec::new(),
                },
                skill_store::state_from_document(None),
            ),
        };

    Ok(AppState {
        home_dir: config_locator::user_home_dir().map(|path| path.display().to_string()),
        config_path: location.config_path.display().to_string(),
        resolved_path: location.resolved_path.display().to_string(),
        writable,
        readonly_reason,
        file_token: loaded.token,
        health: HealthState {
            status,
            codex,
            config_exists: loaded.exists,
            schema_version: format!("{} ({})", schema.schema_version, schema.official_snapshot),
        },
        fields,
        model_providers,
        mcp_servers,
        codex_sessions,
        skills,
        raw_toml: loaded.raw,
        parse_issue: loaded.parse_issue,
        preferences,
    })
}

fn fields_from_document(
    document: &toml_edit::DocumentMut,
    editable: bool,
    schema: &config_schema::ProductSchema,
) -> Vec<FieldState> {
    schema
        .editable_fields()
        .map(|definition| FieldState {
            path: definition.path.clone(),
            label: definition.label.clone(),
            group: definition.group.clone(),
            kind: definition.kind,
            value: field_value(document, definition),
            editable: editable && definition.editable,
            risk: definition.risk.to_string(),
            note: definition.note.clone(),
            options: definition.options.clone(),
        })
        .collect()
}

fn field_value(document: &toml_edit::DocumentMut, definition: &FieldDefinition) -> Option<String> {
    match definition.path.as_str() {
        "features.fast_mode" => {
            toml_store::root_bool(document, "features", "fast_mode").map(|value| value.to_string())
        }
        "hide_agent_reasoning" | "show_raw_agent_reasoning" => {
            toml_store::root_bool_key(document, &definition.path).map(|value| value.to_string())
        }
        path if definition.kind == FieldKind::Object => {
            toml_store::root_item_exists(document, path).map(|exists| exists.to_string())
        }
        path => toml_store::root_string(document, path),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config_locator;
    use crate::test_support::TestCodexHome;
    use std::fs;

    #[test]
    fn empty_config_is_editable_when_codex_binary_is_configured() {
        let guard = TestCodexHome::new();
        let codex = guard.write_fake_codex_binary();
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let state = load_state().unwrap();

        assert!(state.writable);
        assert!(!state.health.config_exists);
        assert_eq!(state.fields.len(), 13);
        assert!(state.raw_toml.is_empty());
    }

    #[test]
    fn exposes_root_fields() {
        let guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
model_provider = "openai"
oss_provider = "ollama"
model_reasoning_summary = "detailed"
model_verbosity = "high"
service_tier = "priority"
sandbox_mode = "workspace-write"
approval_policy = "on-request"
web_search = "live"
hide_agent_reasoning = false
"#,
        )
        .unwrap();
        let codex = guard.write_fake_codex_binary();
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let state = load_state().unwrap();
        let model_provider = state
            .fields
            .iter()
            .find(|field| field.path == "model_provider")
            .unwrap();
        let oss_provider = state
            .fields
            .iter()
            .find(|field| field.path == "oss_provider")
            .unwrap();
        let sandbox = state
            .fields
            .iter()
            .find(|field| field.path == "sandbox_mode")
            .unwrap();
        let approval = state
            .fields
            .iter()
            .find(|field| field.path == "approval_policy")
            .unwrap();
        let web_search = state
            .fields
            .iter()
            .find(|field| field.path == "web_search")
            .unwrap();

        assert_eq!(model_provider.group, "模型");
        assert_eq!(model_provider.value, Some("openai".to_string()));
        assert_eq!(oss_provider.value, Some("ollama".to_string()));
        assert_eq!(
            oss_provider.options,
            Some(vec!["lmstudio".to_string(), "ollama".to_string()])
        );
        assert_eq!(sandbox.value, Some("workspace-write".to_string()));
        assert_eq!(
            sandbox.options,
            Some(vec![
                "read-only".to_string(),
                "workspace-write".to_string(),
                "danger-full-access".to_string()
            ])
        );
        assert_eq!(approval.value, Some("on-request".to_string()));
        assert_eq!(web_search.group, "交互显示");
        assert_eq!(web_search.value, Some("live".to_string()));
    }

    #[test]
    fn malformed_toml_is_needs_attention_and_not_editable() {
        let guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \n").unwrap();
        let codex = guard.write_fake_codex_binary();
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let state = load_state().unwrap();

        assert!(!state.writable);
        assert!(matches!(state.health.status, HealthStatus::NeedsAttention));
        assert!(state.parse_issue.is_some());
        assert_eq!(
            state.readonly_reason,
            Some("config.toml 语法有误。修复 TOML 后才能保存。".to_string())
        );
    }

    #[test]
    fn missing_codex_binary_makes_state_read_only() {
        let guard = TestCodexHome::new();
        guard.disable_codex_discovery();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \"gpt-5.5\"\n").unwrap();

        let state = load_state().unwrap();

        assert!(!state.writable);
        assert!(matches!(state.health.status, HealthStatus::ReadOnly));
        assert_eq!(
            state.readonly_reason,
            Some("未找到 Codex 命令。请选择 codex 文件后再保存配置。".to_string())
        );
    }
}
