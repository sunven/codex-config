use serde::Serialize;
use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigLocation {
    pub codex_home: PathBuf,
    pub config_path: PathBuf,
    pub resolved_path: PathBuf,
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
    let app_preferences_path = codex_home.join("codex-config.json");

    Ok(ConfigLocation {
        codex_home,
        config_path,
        resolved_path,
        app_preferences_path,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLocation {
    pub claude_home: PathBuf,
    pub projects_dir: PathBuf,
    pub skills_dir: PathBuf,
    pub config_path: PathBuf,
}

pub fn locate_claude() -> Result<ClaudeLocation, String> {
    let claude_home = env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".claude"));
    let config_path = home_dir().join(".claude.json");

    Ok(ClaudeLocation {
        projects_dir: claude_home.join("projects"),
        skills_dir: claude_home.join("skills"),
        config_path,
        claude_home,
    })
}

pub fn user_home_dir() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}

fn home_dir() -> PathBuf {
    user_home_dir().unwrap_or_else(|| PathBuf::from("."))
}
