use crate::app_preferences::AppPreferences;
use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexProbe {
    pub binary_path: Option<String>,
    pub version: Option<String>,
    pub found: bool,
    pub message: Option<String>,
}

pub fn probe_with_preferences(preferences: &AppPreferences) -> CodexProbe {
    let Some(binary) = find_binary(preferences) else {
        return CodexProbe {
            binary_path: None,
            version: None,
            found: false,
            message: Some("未自动找到 Codex 命令。请手动选择 codex 文件。".to_string()),
        };
    };

    let version = run_with_timeout(&binary, &["--version"], PROBE_TIMEOUT);

    match version {
        Ok(output) if output.status.success() => CodexProbe {
            binary_path: Some(binary.display().to_string()),
            version: Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
            found: true,
            message: None,
        },
        Ok(output) => CodexProbe {
            binary_path: Some(binary.display().to_string()),
            version: None,
            found: false,
            message: Some(format!(
                "Codex 命令执行失败：{}",
                String::from_utf8_lossy(&output.stderr).trim()
            )),
        },
        Err(error) => CodexProbe {
            binary_path: Some(binary.display().to_string()),
            version: None,
            found: false,
            message: Some(format!("Codex 命令执行失败：{error}")),
        },
    }
}

fn find_binary(preferences: &AppPreferences) -> Option<PathBuf> {
    if let Some(path) = preferences.codex_binary_path.as_ref() {
        let path = PathBuf::from(path);
        if is_executable_file(&path) {
            return Some(path);
        }
    }

    if let Ok(path) = env::var("CODEX_CONFIG_CODEX_BINARY") {
        let path = PathBuf::from(path);
        if is_executable_file(&path) {
            return Some(path);
        }
    }

    if let Some(path) = find_in_path() {
        return Some(path);
    }

    if env::var_os("CODEX_CONFIG_DISABLE_COMMON_BINARY_DISCOVERY").is_some() {
        return None;
    }

    let home = env::var_os("HOME").map(PathBuf::from);
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/usr/bin/codex"),
    ];

    if let Some(home) = home {
        candidates.push(home.join(".local").join("bin").join("codex"));
        candidates.push(home.join(".cargo").join("bin").join("codex"));
    }

    candidates.into_iter().find(|path| is_executable_file(path))
}

fn find_in_path() -> Option<PathBuf> {
    let paths = env::var_os("PATH")?;
    env::split_paths(&paths)
        .map(|path| path.join("codex"))
        .find(|path| is_executable_file(path))
}

fn is_executable_file(path: &PathBuf) -> bool {
    path.is_file()
}

#[allow(dead_code)]
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

fn run_with_timeout(
    binary: &PathBuf,
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
                "Codex probe timed out",
            ));
        }

        thread::sleep(Duration::from_millis(25));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn manual_binary_preference_is_checked_before_path() {
        let tempdir = tempdir().unwrap();
        let binary = tempdir.path().join("codex");
        std::fs::write(&binary, "#!/bin/sh\n").unwrap();
        let preferences = AppPreferences {
            codex_binary_path: Some(binary.display().to_string()),
        };

        assert_eq!(find_binary(&preferences), Some(binary));
    }

    #[test]
    fn missing_manual_binary_falls_back_to_other_discovery() {
        let preferences = AppPreferences {
            codex_binary_path: Some("/definitely/missing/codex".to_string()),
        };

        let _ = find_binary(&preferences);
    }
}
