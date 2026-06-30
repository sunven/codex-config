use crate::codex_probe::CodexProbe;
use crate::config_document_workflow;
use crate::toml_store::{FileToken, SaveResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use toml_edit::{value as toml_value, DocumentMut, Item, Table};

const PLUGIN_LIST_TIMEOUT: Duration = Duration::from_secs(15);
const MARKETPLACE_MUTATION_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginState {
    pub installed: Vec<PluginSummary>,
    pub available: Vec<PluginSummary>,
    pub marketplaces: Vec<MarketplaceSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub load_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketplace_load_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub available_load_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSummary {
    pub plugin_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketplace_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub installed: bool,
    pub enabled: bool,
    pub source: PluginSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_policy: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSource {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSummary {
    pub name: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_path: Option<String>,
    #[serde(rename = "refName")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ref_name: Option<String>,
    pub sparse: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceAddRequest {
    pub source: String,
    #[serde(rename = "refName")]
    pub ref_name: Option<String>,
    #[serde(default)]
    pub sparse: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginListOutput {
    #[serde(default)]
    installed: Vec<CliPluginSummary>,
    #[serde(default)]
    available: Vec<CliPluginSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliPluginSummary {
    plugin_id: String,
    name: String,
    marketplace_name: Option<String>,
    version: Option<String>,
    #[serde(default)]
    installed: bool,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    source: PluginSourceInput,
    install_policy: Option<String>,
    auth_policy: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginSourceInput {
    source: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarketplaceListOutput {
    #[serde(default)]
    marketplaces: Vec<CliMarketplaceSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliMarketplaceSummary {
    name: String,
    #[serde(default)]
    source: String,
    root_path: Option<String>,
    #[serde(rename = "ref")]
    ref_name: Option<String>,
    #[serde(default)]
    sparse: Vec<String>,
    kind: Option<String>,
}

pub fn state(codex: &CodexProbe) -> PluginState {
    let Some(binary_path) = codex.binary_path.as_ref() else {
        return PluginState {
            installed: Vec::new(),
            available: Vec::new(),
            marketplaces: Vec::new(),
            load_error: Some("Codex command is not available".to_string()),
            marketplace_load_error: Some("Codex command is not available".to_string()),
            available_load_error: Some("Codex command is not available".to_string()),
        };
    };

    let installed_state = match run_with_timeout(
        PathBuf::from(binary_path),
        &["plugin", "list", "--json"],
        PLUGIN_LIST_TIMEOUT,
    ) {
        Ok(output) if output.status.success() => state_from_plugin_list_json(
            &String::from_utf8_lossy(&output.stdout),
        )
        .unwrap_or_else(|error| PluginState {
            installed: Vec::new(),
            available: Vec::new(),
            marketplaces: Vec::new(),
            load_error: Some(error),
            marketplace_load_error: None,
            available_load_error: None,
        }),
        Ok(output) => PluginState {
            installed: Vec::new(),
            available: Vec::new(),
            marketplaces: Vec::new(),
            load_error: Some(format!(
                "failed to run codex plugin list: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )),
            marketplace_load_error: None,
            available_load_error: None,
        },
        Err(error) => PluginState {
            installed: Vec::new(),
            available: Vec::new(),
            marketplaces: Vec::new(),
            load_error: Some(format!("failed to run codex plugin list: {error}")),
            marketplace_load_error: None,
            available_load_error: None,
        },
    };

    let marketplace_result = match run_with_timeout(
        PathBuf::from(binary_path),
        &["plugin", "marketplace", "list", "--json"],
        PLUGIN_LIST_TIMEOUT,
    ) {
        Ok(output) if output.status.success() => marketplaces_from_json(
            &String::from_utf8_lossy(&output.stdout),
        )
        .map(|marketplaces| (marketplaces, None))
        .unwrap_or_else(|error| (Vec::new(), Some(error))),
        Ok(output) => (
            Vec::new(),
            Some(format!(
                "failed to run codex plugin marketplace list: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )),
        ),
        Err(error) => (
            Vec::new(),
            Some(format!(
                "failed to run codex plugin marketplace list: {error}"
            )),
        ),
    };

    let available_state = match run_with_timeout(
        PathBuf::from(binary_path),
        &["plugin", "list", "--available", "--json"],
        PLUGIN_LIST_TIMEOUT,
    ) {
        Ok(output) if output.status.success() => state_from_plugin_list_json(
            &String::from_utf8_lossy(&output.stdout),
        )
        .map(|state| (state.available, state.load_error))
        .unwrap_or_else(|error| (Vec::new(), Some(error))),
        Ok(output) => (
            Vec::new(),
            Some(format!(
                "failed to run codex plugin list --available: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )),
        ),
        Err(error) => (
            Vec::new(),
            Some(format!(
                "failed to run codex plugin list --available: {error}"
            )),
        ),
    };

    PluginState {
        installed: installed_state.installed,
        available: available_state.0,
        marketplaces: marketplace_result.0,
        load_error: installed_state.load_error,
        marketplace_load_error: marketplace_result.1,
        available_load_error: available_state.1,
    }
}

pub fn save_plugin_enabled(
    plugin_id: String,
    enabled: bool,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    let plugin_id = plugin_id.trim().to_string();
    if plugin_id.is_empty() {
        return Err("plugin id must not be empty".to_string());
    }

    config_document_workflow::commit_edit(file_token, |document| {
        set_plugin_enabled_in_document(document, &plugin_id, enabled)
    })
}

pub fn remove_plugin(plugin_id: String) -> Result<SaveResult, String> {
    let plugin_id = plugin_id.trim().to_string();
    if plugin_id.is_empty() {
        return Err("plugin id must not be empty".to_string());
    }

    let codex = crate::codex_probe::probe_with_preferences(&crate::app_preferences::load());
    let Some(binary_path) = codex.binary_path.as_ref() else {
        return Err("Codex command is not available".to_string());
    };

    let output = run_with_timeout(
        PathBuf::from(binary_path),
        &["plugin", "remove", "--json", &plugin_id],
        PLUGIN_LIST_TIMEOUT,
    )
    .map_err(|error| format!("failed to run codex plugin remove: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "failed to run codex plugin remove: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    Ok(SaveResult {
        changed: true,
        state: crate::app_state::load_state()?,
    })
}

pub fn add_marketplace(request: MarketplaceAddRequest) -> Result<SaveResult, String> {
    let source = request.source.trim().to_string();
    if source.is_empty() {
        return Err("marketplace source must not be empty".to_string());
    }

    let mut args = vec![
        "plugin".to_string(),
        "marketplace".to_string(),
        "add".to_string(),
        "--json".to_string(),
        source,
    ];
    if let Some(ref_name) = request
        .ref_name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        args.push("--ref".to_string());
        args.push(ref_name.to_string());
    }
    for sparse in request
        .sparse
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        args.push("--sparse".to_string());
        args.push(sparse.to_string());
    }

    run_marketplace_mutation("add", args, MARKETPLACE_MUTATION_TIMEOUT)
}

pub fn remove_marketplace(name: String) -> Result<SaveResult, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("marketplace name must not be empty".to_string());
    }

    run_marketplace_mutation(
        "remove",
        vec![
            "plugin".to_string(),
            "marketplace".to_string(),
            "remove".to_string(),
            "--json".to_string(),
            name,
        ],
        PLUGIN_LIST_TIMEOUT,
    )
}

pub fn upgrade_marketplace(name: Option<String>) -> Result<SaveResult, String> {
    let mut args = vec![
        "plugin".to_string(),
        "marketplace".to_string(),
        "upgrade".to_string(),
        "--json".to_string(),
    ];
    if let Some(name) = name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        args.push(name.to_string());
    }

    run_marketplace_mutation("upgrade", args, MARKETPLACE_MUTATION_TIMEOUT)
}

fn state_from_plugin_list_json(raw: &str) -> Result<PluginState, String> {
    match serde_json::from_str::<PluginListOutput>(raw) {
        Ok(output) => Ok(PluginState {
            installed: output
                .installed
                .into_iter()
                .map(PluginSummary::from)
                .collect(),
            available: output
                .available
                .into_iter()
                .map(PluginSummary::from)
                .collect(),
            marketplaces: Vec::new(),
            load_error: None,
            marketplace_load_error: None,
            available_load_error: None,
        }),
        Err(error) => Ok(PluginState {
            installed: Vec::new(),
            available: Vec::new(),
            marketplaces: Vec::new(),
            load_error: Some(format!("failed to parse plugin list JSON: {error}")),
            marketplace_load_error: None,
            available_load_error: None,
        }),
    }
}

fn marketplaces_from_json(raw: &str) -> Result<Vec<MarketplaceSummary>, String> {
    serde_json::from_str::<MarketplaceListOutput>(raw)
        .map(|output| output.marketplaces.into_iter().map(Into::into).collect())
        .map_err(|error| format!("failed to parse marketplace list JSON: {error}"))
}

fn run_marketplace_mutation(
    command_name: &str,
    args: Vec<String>,
    timeout: Duration,
) -> Result<SaveResult, String> {
    let codex = crate::codex_probe::probe_with_preferences(&crate::app_preferences::load());
    let Some(binary_path) = codex.binary_path.as_ref() else {
        return Err("Codex command is not available".to_string());
    };
    let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let output = run_with_timeout(PathBuf::from(binary_path), &arg_refs, timeout)
        .map_err(|error| format!("failed to run codex plugin marketplace {command_name}: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "failed to run codex plugin marketplace {command_name}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    Ok(SaveResult {
        changed: true,
        state: crate::app_state::load_state()?,
    })
}

fn set_plugin_enabled_in_document(
    document: &mut DocumentMut,
    plugin_id: &str,
    enabled: bool,
) -> Result<(), String> {
    {
        let table = plugin_table_mut(document, plugin_id)?;
        if enabled {
            table.remove("enabled");
        } else {
            table["enabled"] = toml_value(false);
        }
    }

    remove_empty_plugin_table(document, plugin_id)
}

fn plugin_table_mut<'a>(
    document: &'a mut DocumentMut,
    plugin_id: &str,
) -> Result<&'a mut Table, String> {
    let plugins = plugins_table_mut(document)?;

    if !plugins.contains_key(plugin_id) {
        plugins[plugin_id] = Item::Table(Table::new());
    }

    plugins[plugin_id]
        .as_table_mut()
        .ok_or_else(|| format!("plugins.\"{plugin_id}\" must be a table"))
}

fn plugins_table_mut(document: &mut DocumentMut) -> Result<&mut Table, String> {
    if !document.contains_key("plugins") {
        document["plugins"] = Item::Table(Table::new());
    }

    document["plugins"]
        .as_table_mut()
        .ok_or_else(|| "plugins must be a table".to_string())
}

fn remove_empty_plugin_table(document: &mut DocumentMut, plugin_id: &str) -> Result<(), String> {
    let Some(plugins) = document.get_mut("plugins").and_then(Item::as_table_mut) else {
        return Ok(());
    };

    let remove_plugin = plugins
        .get(plugin_id)
        .and_then(Item::as_table)
        .map(Table::is_empty)
        .unwrap_or(false);

    if remove_plugin {
        plugins.remove(plugin_id);
    }

    if plugins.is_empty() {
        document.remove("plugins");
    }

    Ok(())
}

fn run_with_timeout(
    binary: PathBuf,
    args: &[&str],
    timeout: Duration,
) -> Result<Output, std::io::Error> {
    let mut child = Command::new(binary)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let started_at = Instant::now();

    loop {
        if child.try_wait()?.is_some() {
            return child.wait_with_output();
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "Codex plugin command timed out",
            ));
        }

        thread::sleep(Duration::from_millis(25));
    }
}

impl From<CliPluginSummary> for PluginSummary {
    fn from(summary: CliPluginSummary) -> Self {
        Self {
            plugin_id: summary.plugin_id,
            name: summary.name,
            marketplace_name: summary.marketplace_name,
            version: summary.version,
            installed: summary.installed,
            enabled: summary.enabled,
            source: PluginSource {
                source: summary.source.source,
                path: summary.source.path,
            },
            install_policy: summary.install_policy,
            auth_policy: summary.auth_policy,
        }
    }
}

impl From<CliMarketplaceSummary> for MarketplaceSummary {
    fn from(summary: CliMarketplaceSummary) -> Self {
        Self {
            name: summary.name,
            source: summary.source,
            root_path: summary.root_path,
            ref_name: summary.ref_name,
            sparse: summary.sparse,
            kind: summary.kind,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_preferences;
    use crate::config_locator;
    use crate::test_support::TestCodexHome;
    use crate::toml_store;
    use std::fs;
    use std::path::Path;

    #[test]
    fn parses_installed_plugins_from_cli_json() {
        let state = state_from_plugin_list_json(
            r#"
{
  "installed": [
    {
      "pluginId": "github@openai-api-curated",
      "name": "github",
      "marketplaceName": "openai-api-curated",
      "version": "0.1.6",
      "installed": true,
      "enabled": true,
      "source": {
        "source": "local",
        "path": "/Users/test/.codex/plugins/github"
      },
      "installPolicy": "AVAILABLE",
      "authPolicy": "ON_INSTALL",
      "ignoredFutureField": "kept out of the UI contract"
    }
  ],
  "available": []
}
"#,
        )
        .unwrap();

        assert_eq!(state.installed.len(), 1);
        assert_eq!(state.installed[0].plugin_id, "github@openai-api-curated");
        assert_eq!(state.installed[0].name, "github");
        assert_eq!(
            state.installed[0].marketplace_name.as_deref(),
            Some("openai-api-curated")
        );
        assert_eq!(state.installed[0].version.as_deref(), Some("0.1.6"));
        assert!(state.installed[0].enabled);
        assert_eq!(
            state.installed[0].source.path.as_deref(),
            Some("/Users/test/.codex/plugins/github")
        );
        assert!(state.available.is_empty());
        assert_eq!(state.load_error, None);
    }

    #[test]
    fn parses_available_plugins_from_cli_json() {
        let state = state_from_plugin_list_json(
            r#"
{
  "installed": [],
  "available": [
    {
      "pluginId": "reviewer@team-tools",
      "name": "reviewer",
      "marketplaceName": "team-tools",
      "version": "0.4.0",
      "source": {
        "source": "github:openai/team-tools",
        "path": "/Users/test/.codex/plugin-marketplaces/team-tools/reviewer"
      },
      "installPolicy": "MANUAL",
      "authPolicy": "NEVER"
    }
  ]
}
"#,
        )
        .unwrap();

        assert!(state.installed.is_empty());
        assert_eq!(state.available.len(), 1);
        assert_eq!(state.available[0].plugin_id, "reviewer@team-tools");
        assert_eq!(state.available[0].name, "reviewer");
        assert_eq!(state.available[0].marketplace_name.as_deref(), Some("team-tools"));
        assert_eq!(state.available[0].version.as_deref(), Some("0.4.0"));
        assert!(!state.available[0].installed);
        assert!(!state.available[0].enabled);
        assert_eq!(
            state.available[0].source.source.as_deref(),
            Some("github:openai/team-tools")
        );
        assert_eq!(
            state.available[0].source.path.as_deref(),
            Some("/Users/test/.codex/plugin-marketplaces/team-tools/reviewer")
        );
        assert_eq!(state.available[0].install_policy.as_deref(), Some("MANUAL"));
        assert_eq!(state.available[0].auth_policy.as_deref(), Some("NEVER"));
    }

    #[test]
    fn malformed_plugin_list_json_becomes_load_error() {
        let state = state_from_plugin_list_json("{ not json").unwrap();

        assert!(state.installed.is_empty());
        assert!(state
            .load_error
            .unwrap()
            .contains("failed to parse plugin list JSON"));
    }

    #[test]
    fn parses_marketplaces_from_cli_json() {
        let state = marketplaces_from_json(
            r#"
{
  "marketplaces": [
    {
      "name": "team-tools",
      "source": "github:openai/team-tools",
      "rootPath": "/Users/test/.codex/plugin-marketplaces/team-tools",
      "ref": "main",
      "sparse": [".agents/plugins"],
      "kind": "git"
    },
    {
      "name": "local-default",
      "source": "local",
      "rootPath": "/Users/test/.agents/plugins"
    }
  ]
}
"#,
        )
        .unwrap();

        assert_eq!(state.len(), 2);
        assert_eq!(state[0].name, "team-tools");
        assert_eq!(state[0].source, "github:openai/team-tools");
        assert_eq!(state[0].ref_name.as_deref(), Some("main"));
        assert_eq!(state[0].sparse, vec![".agents/plugins"]);
        assert_eq!(state[0].kind.as_deref(), Some("git"));
        assert_eq!(state[1].root_path.as_deref(), Some("/Users/test/.agents/plugins"));
    }

    #[test]
    fn parses_marketplace_without_source_from_cli_json() {
        let state = marketplaces_from_json(
            r#"
{
  "marketplaces": [
    {
      "name": "local-default",
      "rootPath": "/Users/test/.agents/plugins",
      "kind": "local"
    }
  ]
}
"#,
        )
        .unwrap();

        assert_eq!(state.len(), 1);
        assert_eq!(state[0].name, "local-default");
        assert_eq!(state[0].source, "");
        assert_eq!(state[0].root_path.as_deref(), Some("/Users/test/.agents/plugins"));
    }

    #[test]
    fn marketplace_mutations_use_longer_timeout_than_plugin_list() {
        assert!(MARKETPLACE_MUTATION_TIMEOUT > PLUGIN_LIST_TIMEOUT);
    }

    #[test]
    fn disabling_plugin_writes_disabled_override() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();

        let result = save_plugin_enabled("github@openai-curated".to_string(), false, None).unwrap();
        let saved = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(saved.contains("[plugins.\"github@openai-curated\"]"));
        assert!(saved.contains("enabled = false"));
    }

    #[test]
    fn enabling_plugin_removes_disabled_override_and_empty_table() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::write(
            &location.config_path,
            r#"
[plugins."github@openai-curated"]
enabled = false
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_plugin_enabled("github@openai-curated".to_string(), true, token).unwrap();
        let saved = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(!saved.contains("github@openai-curated"));
        assert!(!saved.contains("enabled = false"));
    }

    #[test]
    fn enabling_plugin_preserves_unrelated_plugin_subsettings() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::write(
            &location.config_path,
            r#"
[plugins."github@openai-curated"]
enabled = false
mcp_server_policy = "ask"
"#,
        )
        .unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;

        let result = save_plugin_enabled("github@openai-curated".to_string(), true, token).unwrap();
        let saved = fs::read_to_string(&location.config_path).unwrap();

        assert!(result.changed);
        assert!(saved.contains("[plugins.\"github@openai-curated\"]"));
        assert!(saved.contains("mcp_server_policy = \"ask\""));
        assert!(!saved.contains("enabled = false"));
    }

    #[test]
    fn plugin_enablement_rejects_stale_file_token() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::write(&location.config_path, "model = \"gpt-5\"\n").unwrap();
        let token = toml_store::load(&location.config_path).unwrap().token;
        fs::write(&location.config_path, "model = \"changed\"\n").unwrap();

        let error =
            save_plugin_enabled("github@openai-curated".to_string(), false, token).unwrap_err();

        assert_eq!(error, "config.toml 已被其他程序修改。请先刷新，再保存。");
    }

    #[test]
    fn state_invokes_available_plugin_list_command_and_records_plugins() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        let args_log = location.codex_home.join("codex-args.log");
        write_fake_codex_plugin_binary(&codex, &args_log, true);

        let state = state(&CodexProbe {
            binary_path: Some(codex.display().to_string()),
            version: Some("codex-test 0.0.0".to_string()),
            found: true,
            message: None,
        });
        let args = fs::read_to_string(args_log).unwrap();

        assert!(args
            .lines()
            .any(|line| line == "plugin list --available --json"));
        assert_eq!(state.available.len(), 1);
        assert_eq!(state.available[0].plugin_id, "reviewer@team-tools");
        assert_eq!(state.available_load_error, None);
    }

    #[test]
    fn available_plugin_list_failure_is_local_to_available_state() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        write_fake_codex_available_failure_binary(&codex);

        let state = state(&CodexProbe {
            binary_path: Some(codex.display().to_string()),
            version: Some("codex-test 0.0.0".to_string()),
            found: true,
            message: None,
        });

        assert!(state.installed.is_empty());
        assert_eq!(state.marketplaces.len(), 1);
        assert!(state.available.is_empty());
        assert_eq!(state.load_error, None);
        assert_eq!(state.marketplace_load_error, None);
        assert!(state
            .available_load_error
            .unwrap()
            .contains("failed to run codex plugin list --available"));
    }

    #[test]
    fn remove_plugin_invokes_codex_remove_json_and_refreshes_state() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        let args_log = location.codex_home.join("codex-args.log");
        write_fake_codex_plugin_binary(&codex, &args_log, true);
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let result = remove_plugin("github@openai-curated".to_string()).unwrap();
        let args = fs::read_to_string(args_log).unwrap();

        assert!(result.changed);
        assert!(args.lines().any(|line| {
            line == "plugin remove --json github@openai-curated"
        }));
        assert!(result.state.plugins.installed.is_empty());
    }

    #[test]
    fn remove_plugin_reports_codex_stderr() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        let args_log = location.codex_home.join("codex-args.log");
        write_fake_codex_plugin_binary(&codex, &args_log, false);
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let error = remove_plugin("github@openai-curated".to_string()).unwrap_err();

        assert!(error.contains("failed to run codex plugin remove"));
        assert!(error.contains("remove failed"));
    }

    #[test]
    fn add_marketplace_invokes_codex_with_ref_and_sparse_paths() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        let args_log = location.codex_home.join("codex-args.log");
        write_fake_codex_plugin_binary(&codex, &args_log, true);
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let result = add_marketplace(MarketplaceAddRequest {
            source: "openai/team-tools".to_string(),
            ref_name: Some("main".to_string()),
            sparse: vec![".agents/plugins".to_string(), "more/plugins".to_string()],
        })
        .unwrap();
        let args = fs::read_to_string(args_log).unwrap();

        assert!(result.changed);
        assert!(args.lines().any(|line| {
            line
                == "plugin marketplace add --json openai/team-tools --ref main --sparse .agents/plugins --sparse more/plugins"
        }));
        assert_eq!(result.state.plugins.marketplaces.len(), 1);
    }

    #[test]
    fn remove_marketplace_invokes_codex_remove_json() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        let args_log = location.codex_home.join("codex-args.log");
        write_fake_codex_plugin_binary(&codex, &args_log, true);
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let result = remove_marketplace("team-tools".to_string()).unwrap();
        let args = fs::read_to_string(args_log).unwrap();

        assert!(result.changed);
        assert!(args
            .lines()
            .any(|line| line == "plugin marketplace remove --json team-tools"));
    }

    #[test]
    fn upgrade_marketplace_invokes_named_or_all_upgrade() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        let args_log = location.codex_home.join("codex-args.log");
        write_fake_codex_plugin_binary(&codex, &args_log, true);
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        upgrade_marketplace(Some("team-tools".to_string())).unwrap();
        upgrade_marketplace(None).unwrap();
        let args = fs::read_to_string(args_log).unwrap();

        assert!(args
            .lines()
            .any(|line| line == "plugin marketplace upgrade --json team-tools"));
        assert!(args
            .lines()
            .any(|line| line == "plugin marketplace upgrade --json"));
    }

    #[test]
    fn marketplace_command_failures_are_mapped() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let codex = location.codex_home.join("codex");
        let args_log = location.codex_home.join("codex-args.log");
        write_fake_codex_plugin_binary(&codex, &args_log, false);
        app_preferences::save_codex_binary_path(Some(codex.display().to_string())).unwrap();

        let error = add_marketplace(MarketplaceAddRequest {
            source: "openai/team-tools".to_string(),
            ref_name: None,
            sparse: Vec::new(),
        })
        .unwrap_err();

        assert!(error.contains("failed to run codex plugin marketplace add"));
        assert!(error.contains("marketplace failed"));
    }

    fn write_fake_codex_plugin_binary(path: &Path, args_log: &Path, remove_succeeds: bool) {
        let remove_exit = if remove_succeeds { 0 } else { 42 };
        fs::write(
            path,
            format!(
                r#"#!/bin/sh
printf '%s\n' "$*" >> "{args_log}"
if [ "$1" = "--version" ]; then
  echo "codex-test 0.0.0"
  exit 0
fi
if [ "$1" = "plugin" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  echo '{{"installed":[]}}'
  exit 0
fi
if [ "$1" = "plugin" ] && [ "$2" = "list" ] && [ "$3" = "--available" ] && [ "$4" = "--json" ]; then
  echo '{{"available":[{{"pluginId":"reviewer@team-tools","name":"reviewer","marketplaceName":"team-tools","version":"0.4.0","source":{{"source":"github:openai/team-tools","path":"/tmp/team-tools/reviewer"}},"installPolicy":"MANUAL","authPolicy":"NEVER"}}]}}'
  exit 0
fi
if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ] && [ "$4" = "--json" ]; then
  echo '{{"marketplaces":[{{"name":"team-tools","source":"openai/team-tools","rootPath":"/tmp/team-tools","ref":"main","sparse":[".agents/plugins"],"kind":"git"}}]}}'
  exit 0
fi
if [ "$1" = "plugin" ] && [ "$2" = "remove" ] && [ "$3" = "--json" ]; then
  if [ {remove_exit} -eq 0 ]; then
    echo '{{"changed":true}}'
  else
    echo "remove failed" >&2
  fi
  exit {remove_exit}
fi
if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ]; then
  if [ {remove_exit} -eq 0 ]; then
    echo '{{"changed":true}}'
  else
    echo "marketplace failed" >&2
  fi
  exit {remove_exit}
fi
echo "unexpected args: $*" >&2
exit 64
"#,
                args_log = args_log.display(),
                remove_exit = remove_exit,
            ),
        )
        .unwrap();
        make_executable(path);
    }

    fn write_fake_codex_available_failure_binary(path: &Path) {
        fs::write(
            path,
            r#"#!/bin/sh
if [ "$1" = "plugin" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  echo '{"installed":[]}'
  exit 0
fi
if [ "$1" = "plugin" ] && [ "$2" = "list" ] && [ "$3" = "--available" ] && [ "$4" = "--json" ]; then
  echo "available failed" >&2
  exit 42
fi
if [ "$1" = "plugin" ] && [ "$2" = "marketplace" ] && [ "$3" = "list" ] && [ "$4" = "--json" ]; then
  echo '{"marketplaces":[{"name":"team-tools","source":"openai/team-tools","rootPath":"/tmp/team-tools"}]}'
  exit 0
fi
echo "unexpected args: $*" >&2
exit 64
"#,
        )
        .unwrap();
        make_executable(path);
    }

    #[cfg(unix)]
    fn make_executable(path: &Path) {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }

    #[cfg(not(unix))]
    fn make_executable(_path: &Path) {}
}
