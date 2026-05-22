use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub id: String,
    pub path: String,
    pub size: u64,
    pub modified_ms: Option<u128>,
}

pub fn list(backup_dir: &Path) -> Vec<BackupSummary> {
    let Ok(entries) = fs::read_dir(backup_dir) else {
        return Vec::new();
    };

    let mut backups = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = entry.metadata().ok()?;

            if !metadata.is_file() {
                return None;
            }

            let modified_ms = metadata.modified().ok().and_then(|time| {
                time.duration_since(UNIX_EPOCH)
                    .ok()
                    .map(|duration| duration.as_millis())
            });
            let id = path.file_name()?.to_string_lossy().to_string();

            Some(BackupSummary {
                id,
                path: path.display().to_string(),
                size: metadata.len(),
                modified_ms,
            })
        })
        .collect::<Vec<_>>();

    backups.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    backups
}
