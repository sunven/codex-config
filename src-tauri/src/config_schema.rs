use crate::app_state::FieldKind;
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::OnceLock;

const PRODUCT_SCHEMA_JSON: &str = include_str!("../schema/product-schema.json");
#[cfg(test)]
const OFFICIAL_SCHEMA_JSON: &str = include_str!("../schema/official-config.schema.json");

static PRODUCT_SCHEMA: OnceLock<Result<ProductSchema, String>> = OnceLock::new();
#[cfg(test)]
static OFFICIAL_SCHEMA: OnceLock<Result<OfficialSchema, String>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSchema {
    pub schema_version: String,
    pub official_snapshot: String,
    pub fields: Vec<FieldDefinition>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDefinition {
    pub path: String,
    pub label: String,
    pub group: String,
    pub kind: FieldKind,
    #[serde(default)]
    pub editable: bool,
    pub risk: FieldRisk,
    pub note: Option<String>,
    pub options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FieldRisk {
    Normal,
    Caution,
    Dangerous,
    Secret,
    Experimental,
}

impl std::fmt::Display for FieldRisk {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            Self::Normal => "normal",
            Self::Caution => "caution",
            Self::Dangerous => "dangerous",
            Self::Secret => "secret",
            Self::Experimental => "experimental",
        };
        formatter.write_str(value)
    }
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialSchema {
    #[allow(dead_code)]
    source: String,
    #[allow(dead_code)]
    snapshot_date: String,
    #[allow(dead_code)]
    note: String,
    root_keys: Vec<String>,
}

impl ProductSchema {
    pub fn field(&self, path: &str) -> Option<&FieldDefinition> {
        self.fields.iter().find(|field| field.path == path)
    }

    pub fn editable_fields(&self) -> impl Iterator<Item = &FieldDefinition> {
        self.fields.iter().filter(|field| field.editable)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.fields.is_empty() {
            return Err("product schema has no fields".to_string());
        }

        let mut seen = HashSet::<&str>::new();
        for field in &self.fields {
            if field.path.trim().is_empty() {
                return Err("product schema contains an empty path".to_string());
            }
            if field.label.trim().is_empty() {
                return Err(format!("{} is missing a label", field.path));
            }
            if field.group.trim().is_empty() {
                return Err(format!("{} is missing a group", field.path));
            }
            if !seen.insert(field.path.as_str()) {
                return Err(format!("duplicate field path: {}", field.path));
            }
        }

        Ok(())
    }
}

pub fn schema() -> Result<&'static ProductSchema, String> {
    let parsed = PRODUCT_SCHEMA.get_or_init(|| {
        let schema: ProductSchema = serde_json::from_str(PRODUCT_SCHEMA_JSON)
            .map_err(|error| format!("failed to parse product schema: {error}"))?;
        schema.validate()?;
        Ok(schema)
    });
    parsed.as_ref().map_err(Clone::clone)
}

#[cfg(test)]
pub fn official_root_keys() -> Result<&'static [String], String> {
    let parsed = OFFICIAL_SCHEMA.get_or_init(|| {
        let schema: OfficialSchema = serde_json::from_str(OFFICIAL_SCHEMA_JSON)
            .map_err(|error| format!("failed to parse official schema summary: {error}"))?;
        if schema.root_keys.is_empty() {
            return Err("official schema summary has no root keys".to_string());
        }
        Ok(schema)
    });
    parsed
        .as_ref()
        .map(|schema| schema.root_keys.as_slice())
        .map_err(Clone::clone)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_product_schema_once_with_current_editable_fields() {
        let schema = schema().unwrap();

        assert_eq!(schema.schema_version, "codex-config.schema-foundation.v1");
        assert_eq!(schema.official_snapshot, "2026-05-17");
        assert_eq!(schema.editable_fields().count(), 13);
        assert!(schema.field("features.fast_mode").unwrap().editable);
        assert_eq!(
            schema.field("features.fast_mode").unwrap().kind,
            FieldKind::Boolean
        );
        assert_eq!(schema.field("model").unwrap().kind, FieldKind::Text);
        assert_eq!(
            schema.field("oss_provider").unwrap().kind,
            FieldKind::Select
        );
    }

    #[test]
    fn exposes_representative_complex_fields_as_read_only_fields() {
        let schema = schema().unwrap();

        for path in ["model_providers", "mcp_servers", "tools", "apps"] {
            let field = schema.field(path).unwrap();
            assert!(!field.editable);
            assert_eq!(field.kind, FieldKind::Object);
        }
    }

    #[test]
    fn validates_duplicate_paths() {
        let schema = ProductSchema {
            schema_version: "test".to_string(),
            official_snapshot: "test".to_string(),
            fields: vec![
                FieldDefinition {
                    path: "model".to_string(),
                    label: "Model".to_string(),
                    group: "Model".to_string(),
                    kind: FieldKind::Text,
                    editable: true,
                    risk: FieldRisk::Normal,
                    note: None,
                    options: None,
                },
                FieldDefinition {
                    path: "model".to_string(),
                    label: "Model duplicate".to_string(),
                    group: "Model".to_string(),
                    kind: FieldKind::Text,
                    editable: true,
                    risk: FieldRisk::Normal,
                    note: None,
                    options: None,
                },
            ],
        };

        assert_eq!(
            schema.validate().unwrap_err(),
            "duplicate field path: model"
        );
    }

    #[test]
    fn official_summary_contains_current_complex_roots() {
        let keys = official_root_keys().unwrap();

        for key in [
            "model_providers",
            "mcp_servers",
            "profiles",
            "tools",
            "apps",
        ] {
            assert!(keys.iter().any(|candidate| candidate == key));
        }
    }
}
