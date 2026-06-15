use std::collections::BTreeMap;
use toml_edit::{value as toml_value, Array, DocumentMut, Item, Table};

pub fn entries<T>(
    document: &DocumentMut,
    parent_key: &str,
    mut read_entry: impl FnMut(&str, &Item) -> Option<T>,
) -> Vec<T> {
    document
        .get(parent_key)
        .and_then(Item::as_table)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(id, item)| read_entry(id, item))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

pub fn upsert_table_entry(
    document: &mut DocumentMut,
    parent_key: &str,
    id: &str,
    original_id: Option<&str>,
    build_entry: impl FnOnce(Option<&Item>) -> Table,
) -> Result<(), String> {
    ensure_parent_table(document, parent_key)?;

    if let Some(original_id) = original_id {
        if original_id != id {
            parent_table_mut(document, parent_key)?.remove(original_id);
        }
    }

    let entries = parent_table_mut(document, parent_key)?;
    entries[id] = Item::Table(build_entry(entries.get(id)));
    Ok(())
}

pub fn remove_table_entry(
    document: &mut DocumentMut,
    parent_key: &str,
    id: &str,
) -> Result<(), String> {
    let Some(entries) = document.get_mut(parent_key).and_then(Item::as_table_mut) else {
        return Ok(());
    };

    entries.remove(id);
    Ok(())
}

pub fn normalize_entry_id(raw_id: &str, label: &str) -> Result<String, String> {
    let id = raw_id.trim();
    if id.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if !id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err(format!(
            "{label} can only contain letters, numbers, '_' and '-'"
        ));
    }

    Ok(id.to_string())
}

pub fn clear_fields(table: &mut Table, keys: &[&str]) {
    for key in keys {
        table.remove(key);
    }
}

pub fn has_advanced_fields(table: &Table, editable_keys: &[&str]) -> bool {
    table.iter().any(|(key, _)| !editable_keys.contains(&key))
}

pub fn set_string(table: &mut Table, key: &str, value: Option<&str>) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };

    table[key] = toml_value(value);
}

pub fn set_string_array(table: &mut Table, key: &str, values: &[String]) {
    let mut array = Array::new();

    for value in values {
        let value = value.trim();
        if !value.is_empty() {
            array.push(value);
        }
    }

    if !array.is_empty() {
        table[key] = toml_value(array);
    }
}

pub fn set_integer(table: &mut Table, key: &str, value: Option<i64>) {
    if let Some(value) = value {
        table[key] = toml_value(value);
    }
}

pub fn set_bool(table: &mut Table, key: &str, value: Option<bool>) {
    if let Some(value) = value {
        table[key] = toml_value(value);
    }
}

pub fn set_string_map(table: &mut Table, key: &str, values: &BTreeMap<String, String>) {
    let mut nested = Table::new();

    for (name, value) in values {
        let name = name.trim();
        let value = value.trim();
        if name.is_empty() || value.is_empty() {
            continue;
        }
        nested[name] = toml_value(value);
    }

    if !nested.is_empty() {
        table[key] = Item::Table(nested);
    }
}

pub fn table_string(table: &Table, key: &str) -> Option<String> {
    table
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
}

pub fn table_string_array(table: &Table, key: &str) -> Vec<String> {
    table
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|value| value.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

pub fn table_integer(table: &Table, key: &str) -> Option<i64> {
    table
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_integer())
}

pub fn table_bool(table: &Table, key: &str) -> Option<bool> {
    table
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_bool())
}

pub fn table_string_map(table: &Table, key: &str) -> BTreeMap<String, String> {
    table
        .get(key)
        .and_then(Item::as_table)
        .map(|nested| {
            nested
                .iter()
                .filter_map(|(name, item)| {
                    item.as_value()
                        .and_then(|value| value.as_str())
                        .map(|value| (name.to_string(), value.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn ensure_parent_table(document: &mut DocumentMut, parent_key: &str) -> Result<(), String> {
    if !document
        .get(parent_key)
        .map(Item::is_table)
        .unwrap_or(false)
    {
        document[parent_key] = Item::Table(Table::new());
    }

    parent_table_mut(document, parent_key).map(|_| ())
}

fn parent_table_mut<'a>(
    document: &'a mut DocumentMut,
    parent_key: &str,
) -> Result<&'a mut Table, String> {
    document[parent_key]
        .as_table_mut()
        .ok_or_else(|| format!("{parent_key} must be a table"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_ids_with_contextual_errors() {
        assert_eq!(
            normalize_entry_id(" local-provider ", "provider id").unwrap(),
            "local-provider"
        );
        assert_eq!(
            normalize_entry_id(" ", "provider id").unwrap_err(),
            "provider id cannot be empty"
        );
        assert_eq!(
            normalize_entry_id("bad id", "MCP server id").unwrap_err(),
            "MCP server id can only contain letters, numbers, '_' and '-'"
        );
    }

    #[test]
    fn upserts_renamed_entry_while_preserving_advanced_fields() {
        let mut document = r#"
[entries.old]
name = "Old"

[entries.new]
advanced = "keep"
"#
        .parse::<DocumentMut>()
        .unwrap();

        upsert_table_entry(&mut document, "entries", "new", Some("old"), |existing| {
            let mut table = existing
                .and_then(Item::as_table)
                .cloned()
                .unwrap_or_else(Table::new);
            clear_fields(&mut table, &["name"]);
            set_string(&mut table, "name", Some("New"));
            table
        })
        .unwrap();

        let raw = document.to_string();
        assert!(raw.contains("[entries.new]"));
        assert!(raw.contains("name = \"New\""));
        assert!(raw.contains("advanced = \"keep\""));
        assert!(!raw.contains("[entries.old]"));
    }

    #[test]
    fn table_field_helpers_trim_empty_values_and_read_supported_shapes() {
        let mut table = Table::new();
        set_string(&mut table, "name", Some(" Local "));
        set_string_array(
            &mut table,
            "args",
            &[" -y ".to_string(), " ".to_string(), "server".to_string()],
        );
        set_integer(&mut table, "timeout", Some(5000));
        set_bool(&mut table, "enabled", Some(true));
        set_string_map(
            &mut table,
            "env",
            &BTreeMap::from([
                (" NODE_ENV ".to_string(), " production ".to_string()),
                ("empty".to_string(), " ".to_string()),
            ]),
        );

        assert_eq!(table_string(&table, "name"), Some("Local".to_string()));
        assert_eq!(
            table_string_array(&table, "args"),
            vec!["-y".to_string(), "server".to_string()]
        );
        assert_eq!(table_integer(&table, "timeout"), Some(5000));
        assert_eq!(table_bool(&table, "enabled"), Some(true));
        assert_eq!(
            table_string_map(&table, "env").get("NODE_ENV"),
            Some(&"production".to_string())
        );
    }
}
