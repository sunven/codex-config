use crate::config_locator::{self, ConfigLocation};
use crate::toml_store::{self, FieldDiff, FileToken, LoadedToml, PreviewResult, SaveResult};
use std::fs;
use std::path::{Path, PathBuf};
use toml_edit::DocumentMut;

pub fn preview_edit<Edit, Diffs>(edit: Edit, diffs: Diffs) -> Result<PreviewResult, String>
where
    Edit: FnOnce(&mut DocumentMut) -> Result<(), String>,
    Diffs: FnOnce(Option<&DocumentMut>, &DocumentMut) -> Result<Vec<FieldDiff>, String>,
{
    let location = config_locator::locate()?;
    let loaded = toml_store::load(&location.config_path)?;
    let original_document = loaded.document.clone();
    let original = loaded.raw.clone();
    let mut document = editable_document(loaded)?;

    edit(&mut document)?;

    let candidate = serialize_validated_document(&document)?;
    let field_diffs = diffs(original_document.as_ref(), &document)?;

    Ok(PreviewResult {
        changed: original != candidate,
        field_diffs,
        text_diff: toml_store::simple_diff(&original, &candidate),
        candidate_raw_toml: candidate,
    })
}

pub fn preview_raw_toml(raw_toml: String) -> Result<PreviewResult, String> {
    let location = config_locator::locate()?;
    let loaded = toml_store::load(&location.config_path)?;
    let candidate = validated_raw_toml(raw_toml)?;

    Ok(PreviewResult {
        changed: loaded.raw != candidate,
        field_diffs: Vec::new(),
        text_diff: toml_store::simple_diff(&loaded.raw, &candidate),
        candidate_raw_toml: candidate,
    })
}

pub fn commit_edit<Edit>(file_token: Option<FileToken>, edit: Edit) -> Result<SaveResult, String>
where
    Edit: FnOnce(&mut DocumentMut) -> Result<(), String>,
{
    let location = config_locator::locate()?;
    let loaded = toml_store::load(&location.config_path)?;
    toml_store::ensure_current_token(&loaded, file_token.as_ref())?;
    let original = loaded.raw.clone();
    let mut document = editable_document(loaded)?;

    edit(&mut document)?;

    let candidate = serialize_validated_document(&document)?;
    commit_candidate(&location, original, candidate)
}

pub fn commit_raw_toml(
    raw_toml: String,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    let location = config_locator::locate()?;
    let loaded = toml_store::load(&location.config_path)?;
    toml_store::ensure_current_token(&loaded, file_token.as_ref())?;
    let original = loaded.raw.clone();
    let candidate = validated_raw_toml(raw_toml)?;

    commit_candidate(&location, original, candidate)
}

pub fn restore_backup(
    backup_id: String,
    file_token: Option<FileToken>,
) -> Result<SaveResult, String> {
    let location = config_locator::locate()?;
    let loaded = toml_store::load(&location.config_path)?;
    toml_store::ensure_current_token(&loaded, file_token.as_ref())?;

    let backup_path = safe_backup_path(&location.backup_dir, &backup_id)?;
    let backup_bytes =
        fs::read(&backup_path).map_err(|error| format!("failed to read backup: {error}"))?;
    let backup_raw = String::from_utf8_lossy(&backup_bytes);
    backup_raw
        .parse::<DocumentMut>()
        .map_err(|error| format!("backup TOML is malformed: {error}"))?;

    let pre_restore_backup =
        toml_store::backup_existing_file(&location.config_path, &location.backup_dir)?;
    toml_store::atomic_write(&location.config_path, &backup_bytes)?;

    Ok(SaveResult {
        backup_path: pre_restore_backup.map(|path| path.display().to_string()),
        changed: true,
        state: crate::app_state::load_state()?,
    })
}

pub(crate) fn serialize_validated_document(document: &DocumentMut) -> Result<String, String> {
    let serialized = document.to_string();
    serialized
        .parse::<DocumentMut>()
        .map_err(|error| format!("candidate TOML failed to reparse: {error}"))?;

    Ok(serialized)
}

fn editable_document(loaded: LoadedToml) -> Result<DocumentMut, String> {
    if let Some(issue) = loaded.parse_issue {
        return Err(format!("cannot edit malformed TOML: {}", issue.message));
    }

    Ok(loaded.document.unwrap_or_else(DocumentMut::new))
}

fn validated_raw_toml(raw_toml: String) -> Result<String, String> {
    let document = raw_toml
        .parse::<DocumentMut>()
        .map_err(|error| format!("candidate TOML is malformed: {error}"))?;

    serialize_validated_document(&document)
}

fn commit_candidate(
    location: &ConfigLocation,
    original: String,
    candidate: String,
) -> Result<SaveResult, String> {
    if original == candidate {
        return Ok(SaveResult {
            backup_path: None,
            changed: false,
            state: crate::app_state::load_state()?,
        });
    }

    let backup_path =
        toml_store::backup_existing_file(&location.config_path, &location.backup_dir)?;
    toml_store::atomic_write(&location.config_path, candidate.as_bytes())?;

    Ok(SaveResult {
        backup_path: backup_path.map(|path| path.display().to_string()),
        changed: true,
        state: crate::app_state::load_state()?,
    })
}

fn safe_backup_path(backup_dir: &Path, backup_id: &str) -> Result<PathBuf, String> {
    if backup_id.contains('/') || backup_id.contains('\\') || backup_id == "." || backup_id == ".."
    {
        return Err("invalid backup id".to_string());
    }

    let path = backup_dir.join(backup_id);
    let backup_dir = backup_dir
        .canonicalize()
        .map_err(|error| format!("failed to resolve backup directory: {error}"))?;
    let resolved = path
        .canonicalize()
        .map_err(|error| format!("failed to resolve backup file: {error}"))?;

    if !resolved.starts_with(&backup_dir) {
        return Err("backup path escaped backup directory".to_string());
    }

    Ok(resolved)
}
