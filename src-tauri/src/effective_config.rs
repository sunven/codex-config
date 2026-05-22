use crate::toml_store;
use serde::Serialize;
use toml_edit::{DocumentMut, Item};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStatus {
    pub active_profile: Option<String>,
    pub exists: bool,
    pub missing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileWarning {
    pub path: String,
    pub profile: String,
    pub root_value: Option<String>,
    pub profile_value: String,
    pub message: String,
}

pub fn profile_status(document: &DocumentMut) -> ProfileStatus {
    let active_profile = toml_store::root_string(document, "profile");
    let exists = active_profile
        .as_deref()
        .map(|name| profile_table(document, name).is_some())
        .unwrap_or(false);

    ProfileStatus {
        missing: active_profile.is_some() && !exists,
        active_profile,
        exists,
    }
}

pub fn profile_warnings(document: &DocumentMut) -> Vec<ProfileWarning> {
    let status = profile_status(document);
    let Some(profile_name) = status.active_profile.as_deref() else {
        return Vec::new();
    };
    let Some(profile) = profile_table(document, profile_name) else {
        return Vec::new();
    };

    let mut warnings = Vec::new();

    if let Some(item) = profile.get("features").and_then(Item::as_table) {
        if let Some(value) = item
            .get("fast_mode")
            .and_then(Item::as_value)
            .and_then(|value| value.as_bool())
        {
            warnings.push(ProfileWarning {
                path: "features.fast_mode".to_string(),
                profile: profile_name.to_string(),
                root_value: toml_store::root_bool(document, "features", "fast_mode")
                    .map(|value| value.to_string()),
                profile_value: value.to_string(),
                message: format!("Active profile \"{profile_name}\" overrides root Fast mode."),
            });
        }
    }

    for key in [
        "model",
        "model_provider",
        "oss_provider",
        "model_reasoning_effort",
        "model_reasoning_summary",
        "model_verbosity",
        "service_tier",
        "sandbox_mode",
        "approval_policy",
        "web_search",
    ] {
        if let Some(value) = profile
            .get(key)
            .and_then(Item::as_value)
            .and_then(|value| value.as_str())
        {
            warnings.push(ProfileWarning {
                path: key.to_string(),
                profile: profile_name.to_string(),
                root_value: toml_store::root_string(document, key),
                profile_value: value.to_string(),
                message: format!("Active profile \"{profile_name}\" overrides root {key}."),
            });
        }
    }

    for key in ["hide_agent_reasoning", "show_raw_agent_reasoning"] {
        if let Some(value) = profile
            .get(key)
            .and_then(Item::as_value)
            .and_then(|value| value.as_bool())
        {
            warnings.push(ProfileWarning {
                path: key.to_string(),
                profile: profile_name.to_string(),
                root_value: toml_store::root_bool_key(document, key).map(|value| value.to_string()),
                profile_value: value.to_string(),
                message: format!("Active profile \"{profile_name}\" overrides root {key}."),
            });
        }
    }

    warnings
}

fn profile_table<'a>(
    document: &'a DocumentMut,
    profile_name: &str,
) -> Option<&'a toml_edit::Table> {
    document
        .get("profiles")
        .and_then(Item::as_table)
        .and_then(|profiles| profiles.get(profile_name))
        .and_then(Item::as_table)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warns_when_active_profile_overrides_root_fast_mode() {
        let document = r#"
profile = "work"

[features]
fast_mode = false

[profiles.work.features]
fast_mode = true
"#
        .parse::<DocumentMut>()
        .unwrap();

        let warnings = profile_warnings(&document);
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].path, "features.fast_mode");
        assert_eq!(warnings[0].profile_value, "true");
        assert_eq!(warnings[0].root_value, Some("false".to_string()));
    }

    #[test]
    fn warns_when_active_profile_overrides_additional_root_fields() {
        let document = r#"
profile = "work"
model_provider = "openai"
web_search = "disabled"

[profiles.work]
model_provider = "custom"
web_search = "live"
"#
        .parse::<DocumentMut>()
        .unwrap();

        let warnings = profile_warnings(&document);

        assert_eq!(warnings.len(), 2);
        assert_eq!(warnings[0].path, "model_provider");
        assert_eq!(warnings[0].root_value, Some("openai".to_string()));
        assert_eq!(warnings[0].profile_value, "custom");
        assert_eq!(warnings[1].path, "web_search");
        assert_eq!(warnings[1].root_value, Some("disabled".to_string()));
        assert_eq!(warnings[1].profile_value, "live");
    }

    #[test]
    fn reports_missing_active_profile() {
        let document = r#"profile = "missing""#.parse::<DocumentMut>().unwrap();
        let status = profile_status(&document);

        assert_eq!(status.active_profile, Some("missing".to_string()));
        assert!(status.missing);
        assert!(!status.exists);
    }
}
