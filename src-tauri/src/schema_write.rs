use crate::config_schema::{self, FieldDefinition};
use crate::toml_store::{DraftAction, DraftChange, DraftScope};
use serde_json::Value as JsonValue;
use toml_edit::{value as toml_value, DocumentMut, Item, Table, Value};

pub fn apply_change(document: &mut DocumentMut, change: &DraftChange) -> Result<(), String> {
    let schema = config_schema::schema()?;
    let field = schema
        .field(&change.path)
        .ok_or_else(|| format!("unsupported field path: {}", change.path))?;

    if !field.editable {
        return Err(format!("{} is read-only in this release", field.path));
    }

    if change.scope.is_some_and(|scope| scope != DraftScope::Root) {
        return Err("profile-scoped structured edits are no longer supported".to_string());
    }

    apply_at_root(document, field, change)
}

pub fn root_string(document: &DocumentMut, key: &str) -> Option<String> {
    item_at_root(document, key)
        .and_then(Item::as_value)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

pub fn root_bool(document: &DocumentMut, table: &str, key: &str) -> Option<bool> {
    document
        .get(table)
        .and_then(Item::as_table)
        .and_then(|table| table.get(key))
        .and_then(Item::as_value)
        .and_then(Value::as_bool)
}

pub fn root_bool_key(document: &DocumentMut, key: &str) -> Option<bool> {
    item_at_root(document, key)
        .and_then(Item::as_value)
        .and_then(Value::as_bool)
}

fn apply_at_root(
    document: &mut DocumentMut,
    field: &FieldDefinition,
    change: &DraftChange,
) -> Result<(), String> {
    match change.action {
        DraftAction::Set => {
            let next_value = typed_value(field, change.value.as_ref())?;
            set_path(document.as_table_mut(), &field.path, next_value)
        }
        DraftAction::Unset => {
            remove_path(document.as_table_mut(), &field.path);
            Ok(())
        }
    }
}

fn typed_value(field: &FieldDefinition, raw_value: Option<&JsonValue>) -> Result<Item, String> {
    match field.kind {
        crate::app_state::FieldKind::Boolean => {
            let next_value = raw_value
                .and_then(JsonValue::as_bool)
                .ok_or_else(|| format!("{} requires a boolean", field.path))?;
            Ok(toml_value(next_value))
        }
        crate::app_state::FieldKind::Text | crate::app_state::FieldKind::Select => {
            let next_value = raw_value
                .and_then(JsonValue::as_str)
                .ok_or_else(|| format!("{} requires a string", field.path))?;
            if next_value.trim().is_empty() {
                return Err(format!("{} cannot be empty", field.path));
            }
            Ok(toml_value(next_value))
        }
        crate::app_state::FieldKind::Number => {
            let next_value = raw_value
                .and_then(JsonValue::as_i64)
                .ok_or_else(|| format!("{} requires an integer", field.path))?;
            Ok(toml_value(next_value))
        }
        crate::app_state::FieldKind::Status | crate::app_state::FieldKind::Object => {
            Err(format!("{} is not directly editable", field.path))
        }
    }
}

fn set_path(table: &mut Table, path: &str, item: Item) -> Result<(), String> {
    let segments = path.split('.').collect::<Vec<_>>();
    let (last, parents) = segments
        .split_last()
        .ok_or_else(|| "empty field path".to_string())?;
    let mut current = table;

    for segment in parents {
        if !current
            .get(segment)
            .map(|item| item.is_table())
            .unwrap_or(false)
        {
            current[*segment] = Item::Table(Table::new());
        }
        current = current[*segment]
            .as_table_mut()
            .ok_or_else(|| format!("{segment} must be a table"))?;
    }

    current[*last] = item;
    Ok(())
}

fn remove_path(table: &mut Table, path: &str) {
    let segments = path.split('.').collect::<Vec<_>>();
    let Some((last, parents)) = segments.split_last() else {
        return;
    };
    let mut current = table;

    for segment in parents {
        let Some(next) = current.get_mut(segment).and_then(Item::as_table_mut) else {
            return;
        };
        current = next;
    }

    current.remove(*last);
}

fn item_at_root<'a>(document: &'a DocumentMut, path: &str) -> Option<&'a Item> {
    item_at_table(document.as_table(), path)
}

fn item_at_table<'a>(table: &'a Table, path: &str) -> Option<&'a Item> {
    let mut segments = path.split('.');
    let first = segments.next()?;
    let mut item = table.get(first)?;

    for segment in segments {
        item = item.as_table()?.get(segment)?;
    }

    Some(item)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_loaded_document() -> DocumentMut {
        DocumentMut::new()
    }

    #[test]
    fn sets_and_unsets_root_scalar_fields_from_schema() {
        let mut document = empty_loaded_document();

        apply_change(
            &mut document,
            &DraftChange {
                path: "model".to_string(),
                scope: None,
                action: DraftAction::Set,
                value: Some(JsonValue::String("gpt-5.5".to_string())),
            },
        )
        .unwrap();
        apply_change(
            &mut document,
            &DraftChange {
                path: "features.fast_mode".to_string(),
                scope: None,
                action: DraftAction::Set,
                value: Some(JsonValue::Bool(true)),
            },
        )
        .unwrap();

        assert_eq!(root_string(&document, "model"), Some("gpt-5.5".to_string()));
        assert_eq!(root_bool(&document, "features", "fast_mode"), Some(true));

        apply_change(
            &mut document,
            &DraftChange {
                path: "model".to_string(),
                scope: None,
                action: DraftAction::Unset,
                value: None,
            },
        )
        .unwrap();

        assert_eq!(root_string(&document, "model"), None);
    }

    #[test]
    fn rejects_profile_scoped_structured_edits() {
        let mut document = r#"
profile = "work"
model = "gpt-5.4"

[profiles.personal]
model = "gpt-5.3"
"#
        .parse::<DocumentMut>()
        .unwrap();

        assert_eq!(
            apply_change(
                &mut document,
                &DraftChange {
                    path: "model".to_string(),
                    scope: Some(DraftScope::Profile),
                    action: DraftAction::Set,
                    value: Some(JsonValue::String("gpt-5.5".to_string())),
                },
            )
            .unwrap_err(),
            "profile-scoped structured edits are no longer supported"
        );

        assert_eq!(
            apply_change(
                &mut document,
                &DraftChange {
                    path: "features.fast_mode".to_string(),
                    scope: Some(DraftScope::Profile),
                    action: DraftAction::Set,
                    value: Some(JsonValue::Bool(true)),
                },
            )
            .unwrap_err(),
            "profile-scoped structured edits are no longer supported"
        );

        assert_eq!(root_string(&document, "model"), Some("gpt-5.4".to_string()));
        assert!(document
            .get("profiles")
            .and_then(Item::as_table)
            .and_then(|profiles| profiles.get("personal"))
            .and_then(Item::as_table)
            .and_then(|personal| personal.get("model"))
            .and_then(Item::as_value)
            .and_then(Value::as_str)
            .is_some_and(|value| value == "gpt-5.3"));
    }

    #[test]
    fn rejects_unknown_readonly_and_wrong_type_changes() {
        let mut document = empty_loaded_document();

        assert_eq!(
            apply_change(
                &mut document,
                &DraftChange {
                    path: "does_not_exist".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(JsonValue::String("x".to_string())),
                },
            )
            .unwrap_err(),
            "unsupported field path: does_not_exist"
        );
        assert_eq!(
            apply_change(
                &mut document,
                &DraftChange {
                    path: "model_providers".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(JsonValue::String("x".to_string())),
                },
            )
            .unwrap_err(),
            "model_providers is read-only in this release"
        );
        assert_eq!(
            apply_change(
                &mut document,
                &DraftChange {
                    path: "features.fast_mode".to_string(),
                    scope: None,
                    action: DraftAction::Set,
                    value: Some(JsonValue::String("true".to_string())),
                },
            )
            .unwrap_err(),
            "features.fast_mode requires a boolean"
        );
    }
}
