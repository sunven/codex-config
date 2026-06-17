use crate::config_document_workflow;
use crate::config_table_entry::{
    clear_fields, entries, has_advanced_fields, normalize_entry_id, remove_table_entry, set_bool,
    set_integer, set_string, set_string_map, table_bool, table_integer, table_string,
    table_string_map, upsert_table_entry,
};
use crate::toml_store::{FileToken, SaveResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use toml_edit::{DocumentMut, Item, Table};

const RESERVED_PROVIDER_IDS: &[&str] = &["openai", "azure", "ollama", "lmstudio"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderState {
    pub providers: Vec<ModelProviderEntry>,
    pub reserved_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderEntry {
    pub id: String,
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub env_key: Option<String>,
    pub env_key_instructions: Option<String>,
    pub wire_api: Option<String>,
    pub request_max_retries: Option<i64>,
    pub stream_max_retries: Option<i64>,
    pub stream_idle_timeout_ms: Option<i64>,
    pub requires_openai_auth: Option<bool>,
    pub supports_websockets: Option<bool>,
    pub query_params: BTreeMap<String, String>,
    pub http_headers: BTreeMap<String, String>,
    pub env_http_headers: BTreeMap<String, String>,
    pub has_advanced_fields: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderDraft {
    pub id: String,
    pub original_id: Option<String>,
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub env_key: Option<String>,
    pub env_key_instructions: Option<String>,
    pub wire_api: Option<String>,
    pub request_max_retries: Option<i64>,
    pub stream_max_retries: Option<i64>,
    pub stream_idle_timeout_ms: Option<i64>,
    pub requires_openai_auth: Option<bool>,
    pub supports_websockets: Option<bool>,
    #[serde(default)]
    pub query_params: BTreeMap<String, String>,
    #[serde(default)]
    pub http_headers: BTreeMap<String, String>,
    #[serde(default)]
    pub env_http_headers: BTreeMap<String, String>,
}

pub type ModelProviderSaveResult = SaveResult;

pub fn state_from_document(document: &DocumentMut) -> ModelProviderState {
    let providers = entries(document, "model_providers", provider_from_item);

    ModelProviderState {
        providers,
        reserved_ids: RESERVED_PROVIDER_IDS
            .iter()
            .map(|id| (*id).to_string())
            .collect(),
    }
}

pub fn save_provider(
    draft: ModelProviderDraft,
    file_token: Option<FileToken>,
) -> Result<ModelProviderSaveResult, String> {
    config_document_workflow::commit_edit(file_token, |document| {
        apply_provider_draft(document, &draft)
    })
}

pub fn delete_provider(
    id: String,
    file_token: Option<FileToken>,
) -> Result<ModelProviderSaveResult, String> {
    config_document_workflow::commit_edit(file_token, |document| remove_provider(document, &id))
}

fn apply_provider_draft(
    document: &mut DocumentMut,
    draft: &ModelProviderDraft,
) -> Result<(), String> {
    let id = provider_id(&draft.id)?;
    let original_id = draft.original_id.as_deref().map(provider_id).transpose()?;

    ensure_custom_id(&id)?;
    if let Some(original_id) = original_id.as_deref() {
        ensure_custom_id(original_id)?;
    }

    upsert_table_entry(
        document,
        "model_providers",
        &id,
        original_id.as_deref(),
        |existing| provider_table(existing, draft),
    )
}

fn remove_provider(document: &mut DocumentMut, raw_id: &str) -> Result<(), String> {
    let id = provider_id(raw_id)?;
    ensure_custom_id(&id)?;

    remove_table_entry(document, "model_providers", &id)
}

fn provider_table(existing: Option<&Item>, draft: &ModelProviderDraft) -> Table {
    let mut table = existing
        .and_then(Item::as_table)
        .cloned()
        .unwrap_or_else(Table::new);

    clear_editable_provider_fields(&mut table);

    set_string(&mut table, "name", draft.name.as_deref());
    set_string(&mut table, "base_url", draft.base_url.as_deref());
    set_string(&mut table, "env_key", draft.env_key.as_deref());
    set_string(
        &mut table,
        "env_key_instructions",
        draft.env_key_instructions.as_deref(),
    );
    set_string(&mut table, "wire_api", draft.wire_api.as_deref());
    set_integer(&mut table, "request_max_retries", draft.request_max_retries);
    set_integer(&mut table, "stream_max_retries", draft.stream_max_retries);
    set_integer(
        &mut table,
        "stream_idle_timeout_ms",
        draft.stream_idle_timeout_ms,
    );
    set_bool(
        &mut table,
        "requires_openai_auth",
        draft.requires_openai_auth,
    );
    set_bool(&mut table, "supports_websockets", draft.supports_websockets);
    set_string_map(&mut table, "query_params", &draft.query_params);
    set_string_map(&mut table, "http_headers", &draft.http_headers);
    set_string_map(&mut table, "env_http_headers", &draft.env_http_headers);

    table
}

fn clear_editable_provider_fields(table: &mut Table) {
    clear_fields(table, editable_provider_keys());
}

fn provider_from_item(id: &str, item: &Item) -> Option<ModelProviderEntry> {
    let table = item.as_table()?;

    Some(ModelProviderEntry {
        id: id.to_string(),
        name: table_string(table, "name"),
        base_url: table_string(table, "base_url"),
        env_key: table_string(table, "env_key"),
        env_key_instructions: table_string(table, "env_key_instructions"),
        wire_api: table_string(table, "wire_api"),
        request_max_retries: table_integer(table, "request_max_retries"),
        stream_max_retries: table_integer(table, "stream_max_retries"),
        stream_idle_timeout_ms: table_integer(table, "stream_idle_timeout_ms"),
        requires_openai_auth: table_bool(table, "requires_openai_auth"),
        supports_websockets: table_bool(table, "supports_websockets"),
        query_params: table_string_map(table, "query_params"),
        http_headers: table_string_map(table, "http_headers"),
        env_http_headers: table_string_map(table, "env_http_headers"),
        has_advanced_fields: has_advanced_fields(table, editable_provider_keys()),
    })
}

fn provider_id(raw_id: &str) -> Result<String, String> {
    normalize_entry_id(raw_id, "provider id")
}

fn ensure_custom_id(id: &str) -> Result<(), String> {
    if RESERVED_PROVIDER_IDS.contains(&id) {
        return Err(format!(
            "{id} is a built-in provider id and cannot be overwritten"
        ));
    }

    Ok(())
}

fn editable_provider_keys() -> &'static [&'static str] {
    &[
        "name",
        "base_url",
        "env_key",
        "env_key_instructions",
        "wire_api",
        "request_max_retries",
        "stream_max_retries",
        "stream_idle_timeout_ms",
        "requires_openai_auth",
        "supports_websockets",
        "query_params",
        "http_headers",
        "env_http_headers",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config_locator;
    use crate::test_support::TestCodexHome;
    use crate::toml_store;
    use std::fs;

    #[test]
    fn reads_custom_model_providers_from_document() {
        let document = r#"
[model_providers.local]
name = "Local"
base_url = "http://localhost:1234/v1"
env_key = "LOCAL_API_KEY"
wire_api = "responses"
request_max_retries = 2
requires_openai_auth = false

[model_providers.local.query_params]
api-version = "2026-01-01"
"#
        .parse::<DocumentMut>()
        .unwrap();

        let state = state_from_document(&document);
        let provider = state
            .providers
            .iter()
            .find(|provider| provider.id == "local")
            .unwrap();

        assert_eq!(provider.name, Some("Local".to_string()));
        assert_eq!(
            provider.base_url,
            Some("http://localhost:1234/v1".to_string())
        );
        assert_eq!(provider.env_key, Some("LOCAL_API_KEY".to_string()));
        assert_eq!(provider.request_max_retries, Some(2));
        assert_eq!(provider.requires_openai_auth, Some(false));
        assert_eq!(
            provider.query_params.get("api-version"),
            Some(&"2026-01-01".to_string())
        );
        assert!(state.reserved_ids.contains(&"openai".to_string()));
    }

    #[test]
    fn save_provider_writes_nested_tables() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(&location.config_path, "model = \"gpt-5.5\"\n").unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_provider(
            ModelProviderDraft {
                id: "local".to_string(),
                original_id: None,
                name: Some("Local".to_string()),
                base_url: Some("http://localhost:1234/v1".to_string()),
                env_key: Some("LOCAL_API_KEY".to_string()),
                env_key_instructions: None,
                wire_api: Some("responses".to_string()),
                request_max_retries: Some(2),
                stream_max_retries: None,
                stream_idle_timeout_ms: None,
                requires_openai_auth: Some(false),
                supports_websockets: None,
                query_params: BTreeMap::from([(
                    "api-version".to_string(),
                    "2026-01-01".to_string(),
                )]),
                http_headers: BTreeMap::new(),
                env_http_headers: BTreeMap::from([(
                    "Authorization".to_string(),
                    "LOCAL_AUTH_HEADER".to_string(),
                )]),
            },
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(saved_raw.contains("[model_providers.local]"));
        assert!(saved_raw.contains("[model_providers.local.query_params]"));
        assert!(saved_raw.contains("api-version = \"2026-01-01\""));
        assert!(saved_raw.contains("[model_providers.local.env_http_headers]"));
    }

    #[test]
    fn save_provider_renames_without_leaving_old_table() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
[model_providers.old]
base_url = "http://localhost:1234/v1"
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_provider(
            ModelProviderDraft {
                id: "new".to_string(),
                original_id: Some("old".to_string()),
                name: None,
                base_url: Some("http://localhost:5678/v1".to_string()),
                env_key: None,
                env_key_instructions: None,
                wire_api: None,
                request_max_retries: None,
                stream_max_retries: None,
                stream_idle_timeout_ms: None,
                requires_openai_auth: None,
                supports_websockets: None,
                query_params: BTreeMap::new(),
                http_headers: BTreeMap::new(),
                env_http_headers: BTreeMap::new(),
            },
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(saved_raw.contains("[model_providers.new]"));
        assert!(!saved_raw.contains("[model_providers.old]"));
    }

    #[test]
    fn save_provider_preserves_advanced_fields_on_existing_provider() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
[model_providers.local]
base_url = "http://localhost:1234/v1"
wire_api = "responses"
advanced_option = "keep me"

[model_providers.local.extra_nested]
mode = "also keep me"
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_provider(
            ModelProviderDraft {
                id: "local".to_string(),
                original_id: Some("local".to_string()),
                name: Some("Local".to_string()),
                base_url: Some("http://localhost:5678/v1".to_string()),
                env_key: None,
                env_key_instructions: None,
                wire_api: Some("responses".to_string()),
                request_max_retries: None,
                stream_max_retries: None,
                stream_idle_timeout_ms: None,
                requires_openai_auth: None,
                supports_websockets: None,
                query_params: BTreeMap::new(),
                http_headers: BTreeMap::new(),
                env_http_headers: BTreeMap::new(),
            },
            token,
        )
        .unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(saved_raw.contains("base_url = \"http://localhost:5678/v1\""));
        assert!(saved_raw.contains("advanced_option = \"keep me\""));
        assert!(saved_raw.contains("[model_providers.local.extra_nested]"));
        assert!(saved_raw.contains("mode = \"also keep me\""));
    }

    #[test]
    fn rejects_reserved_and_invalid_provider_ids() {
        let mut document = DocumentMut::new();
        let reserved_error = apply_provider_draft(
            &mut document,
            &ModelProviderDraft {
                id: "openai".to_string(),
                original_id: None,
                name: None,
                base_url: None,
                env_key: None,
                env_key_instructions: None,
                wire_api: None,
                request_max_retries: None,
                stream_max_retries: None,
                stream_idle_timeout_ms: None,
                requires_openai_auth: None,
                supports_websockets: None,
                query_params: BTreeMap::new(),
                http_headers: BTreeMap::new(),
                env_http_headers: BTreeMap::new(),
            },
        )
        .unwrap_err();

        assert_eq!(
            reserved_error,
            "openai is a built-in provider id and cannot be overwritten"
        );
        assert_eq!(
            provider_id("bad id").unwrap_err(),
            "provider id can only contain letters, numbers, '_' and '-'"
        );
    }

    #[test]
    fn delete_provider_removes_custom_table_but_rejects_reserved_id() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.config_path,
            r#"
[model_providers.local]
base_url = "http://localhost:1234/v1"
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = delete_provider("local".to_string(), token).unwrap();
        let saved_raw = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(!saved_raw.contains("[model_providers.local]"));
        assert_eq!(
            delete_provider(
                "openai".to_string(),
                toml_store::load(&location.config_path).unwrap().token,
            )
            .unwrap_err(),
            "openai is a built-in provider id and cannot be overwritten"
        );
    }
}
