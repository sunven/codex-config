mod app_preferences;
mod app_state;
mod backup_store;
mod codex_probe;
mod codex_session_store;
mod config_document_workflow;
mod config_locator;
mod config_schema;
mod config_table_entry;
mod effective_config;
mod mcp_server_store;
mod model_provider_store;
mod schema_write;
mod skill_store;
#[cfg(test)]
mod test_support;
mod toml_store;

use app_state::AppState;
use mcp_server_store::{McpServerDraft, McpServerSaveResult};
use model_provider_store::{ModelProviderDraft, ModelProviderSaveResult};
use skill_store::SkillContent;
use toml_store::{DraftChange, FileToken, PreviewResult, SaveResult};

#[tauri::command]
fn load_state() -> Result<AppState, String> {
    app_state::load_state().map_err(|error| error.to_string())
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
fn restore_backup(backup_id: String, file_token: Option<FileToken>) -> Result<SaveResult, String> {
    toml_store::restore_backup(backup_id, file_token).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_codex_binary_path(path: Option<String>) -> Result<AppState, String> {
    app_preferences::save_codex_binary_path(path).map_err(|error| error.to_string())?;
    app_state::load_state().map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_session(id: String) -> Result<AppState, String> {
    codex_session_store::delete(id).map_err(|error| error.to_string())?;
    app_state::load_state().map_err(|error| error.to_string())
}

#[tauri::command]
fn read_skill_content(path: String) -> Result<SkillContent, String> {
    skill_store::read_skill_content(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn preview_skill_enabled(path: String, enabled: bool) -> Result<PreviewResult, String> {
    skill_store::preview_skill_enabled(path, enabled).map_err(|error| error.to_string())
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
fn import_skill_directory(directory: String) -> Result<SaveResult, String> {
    skill_store::import_skill_directory(directory).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_changes,
            save_raw_toml,
            save_model_provider,
            delete_model_provider,
            save_mcp_server,
            delete_mcp_server,
            restore_backup,
            save_codex_binary_path,
            delete_session,
            read_skill_content,
            preview_skill_enabled,
            save_skill_enabled,
            import_skill_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
