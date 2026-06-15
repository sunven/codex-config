use std::sync::Mutex;
use tempfile::{tempdir, TempDir};

static ENV_LOCK: Mutex<()> = Mutex::new(());

pub struct TestCodexHome {
    _lock: std::sync::MutexGuard<'static, ()>,
    previous: Option<std::ffi::OsString>,
    previous_home: Option<std::ffi::OsString>,
    previous_binary: Option<std::ffi::OsString>,
    previous_disable_common_binary_discovery: Option<std::ffi::OsString>,
    previous_path: Option<std::ffi::OsString>,
    _tempdir: TempDir,
}

impl TestCodexHome {
    pub fn new() -> Self {
        let lock = ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let previous = std::env::var_os("CODEX_HOME");
        let previous_home = std::env::var_os("HOME");
        let previous_binary = std::env::var_os("CODEX_CONFIG_CODEX_BINARY");
        let previous_disable_common_binary_discovery =
            std::env::var_os("CODEX_CONFIG_DISABLE_COMMON_BINARY_DISCOVERY");
        let previous_path = std::env::var_os("PATH");
        let tempdir = tempdir().unwrap();
        std::env::set_var("CODEX_HOME", tempdir.path());

        Self {
            _lock: lock,
            previous,
            previous_home,
            previous_binary,
            previous_disable_common_binary_discovery,
            previous_path,
            _tempdir: tempdir,
        }
    }

    pub fn without_codex_home() -> Self {
        let lock = ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let previous = std::env::var_os("CODEX_HOME");
        let previous_home = std::env::var_os("HOME");
        let previous_binary = std::env::var_os("CODEX_CONFIG_CODEX_BINARY");
        let previous_disable_common_binary_discovery =
            std::env::var_os("CODEX_CONFIG_DISABLE_COMMON_BINARY_DISCOVERY");
        let previous_path = std::env::var_os("PATH");
        let tempdir = tempdir().unwrap();
        std::env::remove_var("CODEX_HOME");
        std::env::set_var("HOME", tempdir.path());

        Self {
            _lock: lock,
            previous,
            previous_home,
            previous_binary,
            previous_disable_common_binary_discovery,
            previous_path,
            _tempdir: tempdir,
        }
    }

    pub fn disable_codex_discovery(&self) {
        std::env::remove_var("CODEX_CONFIG_CODEX_BINARY");
        std::env::set_var("CODEX_CONFIG_DISABLE_COMMON_BINARY_DISCOVERY", "1");
        std::env::set_var("PATH", self._tempdir.path());
    }

    pub fn write_fake_codex_binary(&self) -> std::path::PathBuf {
        let path = self._tempdir.path().join("codex");
        std::fs::write(&path, "#!/bin/sh\necho codex-test 0.0.0\n").unwrap();
        make_executable(&path);
        path
    }
}

impl Drop for TestCodexHome {
    fn drop(&mut self) {
        if let Some(previous) = &self.previous {
            std::env::set_var("CODEX_HOME", previous);
        } else {
            std::env::remove_var("CODEX_HOME");
        }

        if let Some(previous_home) = &self.previous_home {
            std::env::set_var("HOME", previous_home);
        } else {
            std::env::remove_var("HOME");
        }

        if let Some(previous_binary) = &self.previous_binary {
            std::env::set_var("CODEX_CONFIG_CODEX_BINARY", previous_binary);
        } else {
            std::env::remove_var("CODEX_CONFIG_CODEX_BINARY");
        }

        if let Some(previous_disable_common_binary_discovery) =
            &self.previous_disable_common_binary_discovery
        {
            std::env::set_var(
                "CODEX_CONFIG_DISABLE_COMMON_BINARY_DISCOVERY",
                previous_disable_common_binary_discovery,
            );
        } else {
            std::env::remove_var("CODEX_CONFIG_DISABLE_COMMON_BINARY_DISCOVERY");
        }

        if let Some(previous_path) = &self.previous_path {
            std::env::set_var("PATH", previous_path);
        } else {
            std::env::remove_var("PATH");
        }
    }
}

#[cfg(unix)]
fn make_executable(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = std::fs::metadata(path).unwrap().permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions).unwrap();
}

#[cfg(not(unix))]
fn make_executable(_path: &std::path::Path) {}
