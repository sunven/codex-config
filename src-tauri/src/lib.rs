mod app_preferences;
mod app_state;
mod claude_mcp_store;
mod claude_session_store;
mod claude_skill_store;
mod claude_state;
mod codex_probe;
mod codex_session_store;
mod config_document_workflow;
mod config_locator;
mod config_schema;
mod config_table_entry;
mod mcp_server_store;
mod model_provider_store;
mod plugin_store;
mod schema_write;
mod skill_store;
#[cfg(test)]
mod test_support;
mod toml_store;

use app_state::AppState;
use claude_session_store::ClaudeSessionState;
use claude_skill_store::SkillState as ClaudeSkillState;
use claude_state::ClaudeState;
use mcp_server_store::{McpServerDraft, McpServerSaveResult};
use model_provider_store::{ModelProviderDraft, ModelProviderSaveResult};
use plugin_store::MarketplaceAddRequest;
use skill_store::{SkillContent, SkillImportBatchResult};
use toml_store::{DraftChange, FileToken, SaveResult};

#[tauri::command]
fn load_state() -> Result<AppState, String> {
    app_state::load_state().map_err(|error| error.to_string())
}

#[tauri::command]
async fn load_sessions() -> Result<codex_session_store::CodexSessionState, String> {
    let location = config_locator::locate().map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || codex_session_store::state(&location.codex_home))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_changes(
    changes: Vec<DraftChange>,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    toml_store::save_changes(changes, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_raw_toml(raw_toml: String, file_token: Option<FileToken>) -> Result<SaveResult, String> {
    toml_store::save_raw_toml(raw_toml, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_model_provider(
    draft: ModelProviderDraft,
    file_token: Option<FileToken>,
) -> Result<ModelProviderSaveResult, String> {
    model_provider_store::save_provider(draft, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_model_provider(
    id: String,
    file_token: Option<FileToken>,
) -> Result<ModelProviderSaveResult, String> {
    model_provider_store::delete_provider(id, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_mcp_server(
    draft: McpServerDraft,
    file_token: Option<FileToken>,
) -> Result<McpServerSaveResult, String> {
    mcp_server_store::save_server(draft, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_mcp_server(
    id: String,
    file_token: Option<FileToken>,
) -> Result<McpServerSaveResult, String> {
    mcp_server_store::delete_server(id, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_codex_binary_path(path: Option<String>) -> Result<AppState, String> {
    app_preferences::save_codex_binary_path(path).map_err(|error| error.to_string())?;
    app_state::load_state().map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_session(id: String) -> Result<AppState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        codex_session_store::delete(id)?;
        app_state::load_state_with_sessions()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn delete_sessions_older_than(days: u64) -> Result<AppState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        codex_session_store::delete_older_than_days(days)?;
        app_state::load_state_with_sessions()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn read_skill_content(path: String) -> Result<SkillContent, String> {
    skill_store::read_skill_content(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_skill_enabled(
    path: String,
    enabled: bool,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    skill_store::save_skill_enabled(path, enabled, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_plugin_enabled(
    plugin_id: String,
    enabled: bool,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    plugin_store::save_plugin_enabled(plugin_id, enabled, file_token)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_plugin(plugin_id: String) -> Result<SaveResult, String> {
    plugin_store::remove_plugin(plugin_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn add_plugin_marketplace(request: MarketplaceAddRequest) -> Result<SaveResult, String> {
    plugin_store::add_marketplace(request).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_plugin_marketplace(name: String) -> Result<SaveResult, String> {
    plugin_store::remove_marketplace(name).map_err(|error| error.to_string())
}

#[tauri::command]
fn upgrade_plugin_marketplace(name: Option<String>) -> Result<SaveResult, String> {
    plugin_store::upgrade_marketplace(name).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_skill(path: String, file_token: Option<FileToken>) -> Result<SaveResult, String> {
    skill_store::delete_skill(path, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_skill_directories(directories: Vec<String>) -> Result<SkillImportBatchResult, String> {
    skill_store::import_skill_directories(directories).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_claude_state() -> Result<ClaudeState, String> {
    claude_state::load_state().map_err(|error| error.to_string())
}

#[tauri::command]
async fn load_claude_sessions() -> Result<ClaudeSessionState, String> {
    let location = config_locator::locate_claude().map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        claude_session_store::state(&location.projects_dir)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_claude_session(id: String) -> Result<ClaudeSessionState, String> {
    let location = config_locator::locate_claude().map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        claude_session_store::delete(id)?;
        Ok::<_, String>(claude_session_store::state(&location.projects_dir))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn delete_claude_sessions_older_than(days: u64) -> Result<ClaudeSessionState, String> {
    let location = config_locator::locate_claude().map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        claude_session_store::delete_older_than_days(days)?;
        Ok::<_, String>(claude_session_store::state(&location.projects_dir))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn read_claude_skill_content(path: String) -> Result<claude_skill_store::SkillContent, String> {
    claude_skill_store::read_skill_content(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_claude_skill_enabled(path: String, enabled: bool) -> Result<ClaudeSkillState, String> {
    claude_skill_store::set_skill_enabled(path, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_claude_skill(path: String) -> Result<ClaudeSkillState, String> {
    claude_skill_store::delete_skill(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_claude_mcp_server(
    draft: McpServerDraft,
    file_token: Option<FileToken>,
) -> Result<ClaudeState, String> {
    claude_mcp_store::save_server(draft, file_token).map_err(|error| error.to_string())?;
    claude_state::load_state().map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_claude_mcp_server(
    id: String,
    file_token: Option<FileToken>,
) -> Result<ClaudeState, String> {
    claude_mcp_store::delete_server(id, file_token).map_err(|error| error.to_string())?;
    claude_state::load_state().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_state,
            load_sessions,
            save_changes,
            save_raw_toml,
            save_model_provider,
            delete_model_provider,
            save_mcp_server,
            delete_mcp_server,
            save_codex_binary_path,
            delete_session,
            delete_sessions_older_than,
            read_skill_content,
            save_skill_enabled,
            save_plugin_enabled,
            remove_plugin,
            add_plugin_marketplace,
            remove_plugin_marketplace,
            upgrade_plugin_marketplace,
            delete_skill,
            import_skill_directories,
            load_claude_state,
            load_claude_sessions,
            delete_claude_session,
            delete_claude_sessions_older_than,
            read_claude_skill_content,
            set_claude_skill_enabled,
            delete_claude_skill,
            save_claude_mcp_server,
            delete_claude_mcp_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
