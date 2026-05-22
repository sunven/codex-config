use crate::config_locator;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub codex_binary_path: Option<String>,
}

pub fn load() -> AppPreferences {
    let Ok(location) = config_locator::locate() else {
        return AppPreferences::default();
    };

    load_from_path(&location.app_preferences_path).unwrap_or_default()
}

pub fn save_codex_binary_path(path: Option<String>) -> Result<AppPreferences, String> {
    let location = config_locator::locate()?;
    let mut preferences = load_from_path(&location.app_preferences_path).unwrap_or_default();
    let trimmed = path.as_deref().map(str::trim).unwrap_or_default();

    if trimmed.is_empty() {
        preferences.codex_binary_path = None;
    } else {
        let binary_path = PathBuf::from(trimmed);
        if !binary_path.is_file() {
            return Err("Codex 命令路径不是一个文件。".to_string());
        }
        preferences.codex_binary_path = Some(binary_path.display().to_string());
    }

    write_preferences(&location.app_preferences_path, &preferences)?;
    Ok(preferences)
}

fn load_from_path(path: &Path) -> Result<AppPreferences, String> {
    if !path.exists() {
        return Ok(AppPreferences::default());
    }

    let raw = fs::read_to_string(path).map_err(|error| format!("读取应用偏好失败：{error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("解析应用偏好失败：{error}"))
}

fn write_preferences(path: &Path, preferences: &AppPreferences) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建应用偏好目录失败：{error}"))?;
    }

    let raw = serde_json::to_string_pretty(preferences)
        .map_err(|error| format!("序列化应用偏好失败：{error}"))?;
    fs::write(path, format!("{raw}\n")).map_err(|error| format!("写入应用偏好失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestCodexHome;

    #[test]
    fn saves_codex_binary_path_in_isolated_codex_home() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let binary_path = location.codex_home.join("codex");
        fs::write(&binary_path, "#!/bin/sh\n").unwrap();

        let preferences = save_codex_binary_path(Some(binary_path.display().to_string())).unwrap();
        let raw = fs::read_to_string(&location.app_preferences_path).unwrap();

        assert_eq!(
            preferences.codex_binary_path,
            Some(binary_path.display().to_string())
        );
        assert!(raw.contains("codexBinaryPath"));
    }

    #[test]
    fn rejects_missing_codex_binary_path() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();

        let error = save_codex_binary_path(Some(
            location.codex_home.join("missing").display().to_string(),
        ))
        .unwrap_err();

        assert!(error.contains("不是一个文件"));
    }

    #[test]
    fn clears_codex_binary_path() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        fs::create_dir_all(&location.codex_home).unwrap();
        fs::write(
            &location.app_preferences_path,
            "{\n  \"codexBinaryPath\": \"/tmp/codex\"\n}\n",
        )
        .unwrap();

        let preferences = save_codex_binary_path(Some("".to_string())).unwrap();

        assert_eq!(preferences.codex_binary_path, None);
    }
}
