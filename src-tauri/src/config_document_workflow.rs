use crate::config_locator::{self, ConfigLocation};
use crate::toml_store::{self, FileToken, LoadedToml, SaveResult};
use toml_edit::DocumentMut;

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
            changed: false,
            state: crate::app_state::load_state()?,
        });
    }

    toml_store::atomic_write(&location.config_path, candidate.as_bytes())?;

    Ok(SaveResult {
        changed: true,
        state: crate::app_state::load_state()?,
    })
}
