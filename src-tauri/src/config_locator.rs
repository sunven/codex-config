use serde::Serialize;
use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigLocation {
    pub codex_home: PathBuf,
    pub config_path: PathBuf,
    pub resolved_path: PathBuf,
    pub backup_dir: PathBuf,
    pub app_preferences_path: PathBuf,
}

pub fn locate() -> Result<ConfigLocation, String> {
    let codex_home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".codex"));
    let config_path = codex_home.join("config.toml");
    let resolved_path = config_path
        .canonicalize()
        .unwrap_or_else(|_| config_path.clone());
    let backup_dir = codex_home.join("backups").join("config.toml");
    let app_preferences_path = codex_home.join("codex-config.json");

    Ok(ConfigLocation {
        codex_home,
        config_path,
        resolved_path,
        backup_dir,
        app_preferences_path,
    })
}

fn home_dir() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}
