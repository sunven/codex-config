use crate::config_locator;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

const TITLE_LIMIT: usize = 140;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionState {
    pub sessions_dir: String,
    pub sessions: Vec<CodexSessionSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionSummary {
    pub id: String,
    pub session_id: Option<String>,
    pub title: String,
    pub cwd: Option<String>,
    pub path: String,
    pub relative_path: String,
    pub created_at: Option<String>,
    pub last_timestamp: Option<String>,
    pub cli_version: Option<String>,
    pub model_provider: Option<String>,
    pub size: u64,
    pub modified_ms: Option<u128>,
    pub message_count: usize,
    pub user_message_count: usize,
    pub parse_error: Option<String>,
}

#[derive(Default)]
struct ParsedSession {
    session_id: Option<String>,
    title: Option<String>,
    cwd: Option<String>,
    created_at: Option<String>,
    last_timestamp: Option<String>,
    cli_version: Option<String>,
    model_provider: Option<String>,
    message_count: usize,
    user_message_count: usize,
    parse_error: Option<String>,
}

pub fn state(codex_home: &Path) -> CodexSessionState {
    let sessions_dir = codex_home.join("sessions");
    let mut paths = Vec::new();
    collect_session_paths(&sessions_dir, &mut paths);

    let mut sessions = paths
        .into_iter()
        .filter_map(|path| session_summary(&sessions_dir, &path))
        .collect::<Vec<_>>();

    sessions.sort_by(|left, right| {
        right
            .modified_ms
            .cmp(&left.modified_ms)
            .then_with(|| right.created_at.cmp(&left.created_at))
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });

    CodexSessionState {
        sessions_dir: sessions_dir.display().to_string(),
        sessions,
    }
}

pub fn delete(id: String) -> Result<(), String> {
    let location = config_locator::locate()?;
    let sessions_dir = location.codex_home.join("sessions");
    let path = validated_session_path(&sessions_dir, &id)?;

    fs::remove_file(&path)
        .map_err(|error| format!("删除 Codex session 文件失败：{} ({error})", path.display()))
}

fn collect_session_paths(dir: &Path, paths: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            collect_session_paths(&path, paths);
        } else if file_type.is_file() && path.extension().is_some_and(|ext| ext == "jsonl") {
            paths.push(path);
        }
    }
}

fn session_summary(sessions_dir: &Path, path: &Path) -> Option<CodexSessionSummary> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }

    let relative_path = path.strip_prefix(sessions_dir).ok()?;
    let id = path_id(relative_path);
    let parsed = parse_session(path);
    let title = parsed
        .title
        .clone()
        .unwrap_or_else(|| fallback_title(path, parsed.session_id.as_deref()));

    Some(CodexSessionSummary {
        id: id.clone(),
        session_id: parsed.session_id,
        title,
        cwd: parsed.cwd,
        path: path.display().to_string(),
        relative_path: id,
        created_at: parsed.created_at,
        last_timestamp: parsed.last_timestamp,
        cli_version: parsed.cli_version,
        model_provider: parsed.model_provider,
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
        message_count: parsed.message_count,
        user_message_count: parsed.user_message_count,
        parse_error: parsed.parse_error,
    })
}

fn parse_session(path: &Path) -> ParsedSession {
    let mut parsed = ParsedSession::default();
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) => {
            parsed.parse_error = Some(format!("无法读取文件：{error}"));
            return parsed;
        }
    };

    for (index, line) in BufReader::new(file).lines().enumerate() {
        let line_number = index + 1;
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                set_parse_error(&mut parsed, format!("第 {line_number} 行读取失败：{error}"));
                continue;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let envelope = match serde_json::from_str::<LineEnvelope>(trimmed) {
            Ok(envelope) => envelope,
            Err(error) => {
                set_parse_error(
                    &mut parsed,
                    format!("第 {line_number} 行 JSON 解析失败：{error}"),
                );
                continue;
            }
        };

        if let Some(timestamp) = envelope.timestamp {
            parsed.last_timestamp = Some(timestamp);
        }

        let Some(payload) = envelope.payload else {
            continue;
        };

        match envelope.kind.as_deref() {
            Some("session_meta") => {
                if let Ok(meta) = serde_json::from_str::<MetaPayload>(payload.get()) {
                    parse_meta(meta, &mut parsed);
                }
            }
            Some("response_item") => {
                if let Ok(message) = serde_json::from_str::<MessagePayload>(payload.get()) {
                    parse_response_item(message, &mut parsed);
                }
            }
            Some("event_msg") => {
                if let Ok(event) = serde_json::from_str::<EventPayload>(payload.get()) {
                    parse_event_msg(event, &mut parsed);
                }
            }
            _ => {}
        }
    }

    parsed
}

#[derive(Deserialize)]
struct LineEnvelope<'a> {
    timestamp: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    #[serde(borrow, default)]
    payload: Option<&'a RawValue>,
}

#[derive(Deserialize)]
struct MetaPayload {
    id: Option<String>,
    timestamp: Option<String>,
    cwd: Option<String>,
    cli_version: Option<String>,
    model_provider: Option<String>,
}

#[derive(Deserialize)]
struct MessagePayload<'a> {
    #[serde(rename = "type")]
    kind: Option<String>,
    role: Option<String>,
    #[serde(borrow, default)]
    content: Option<&'a RawValue>,
}

#[derive(Deserialize)]
struct EventPayload {
    #[serde(rename = "type")]
    kind: Option<String>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct ContentItem {
    text: Option<String>,
}

fn parse_meta(meta: MetaPayload, parsed: &mut ParsedSession) {
    parsed.session_id = parsed.session_id.take().or(meta.id);
    parsed.created_at = parsed.created_at.take().or(meta.timestamp);
    parsed.cwd = parsed.cwd.take().or(meta.cwd);
    parsed.cli_version = parsed.cli_version.take().or(meta.cli_version);
    parsed.model_provider = parsed.model_provider.take().or(meta.model_provider);
}

fn parse_response_item(message: MessagePayload, parsed: &mut ParsedSession) {
    if message.kind.as_deref() != Some("message") {
        return;
    }

    parsed.message_count += 1;

    if message.role.as_deref() != Some("user") {
        return;
    }

    parsed.user_message_count += 1;

    // Only the first user message becomes the title, so skip parsing the
    // (potentially large) content payload once a title is already set.
    if parsed.title.is_some() {
        return;
    }

    if let Some(content) = message.content {
        maybe_set_title(parsed, content_text(content));
    }
}

fn parse_event_msg(event: EventPayload, parsed: &mut ParsedSession) {
    if event.kind.as_deref() != Some("user_message") {
        return;
    }

    parsed.user_message_count += 1;
    maybe_set_title(parsed, event.message);
}

fn maybe_set_title(parsed: &mut ParsedSession, text: Option<String>) {
    if parsed.title.is_some() {
        return;
    }

    let Some(text) = text else {
        return;
    };
    let compact = compact_text(&text);

    if compact.is_empty()
        || compact.starts_with("<environment_context")
        || compact.starts_with("<skill>")
    {
        return;
    }

    parsed.title = Some(truncate_chars(&compact, TITLE_LIMIT));
}

fn content_text(content: &RawValue) -> Option<String> {
    let items = serde_json::from_str::<Vec<ContentItem>>(content.get()).ok()?;

    let parts = items
        .into_iter()
        .filter_map(|item| item.text)
        .collect::<Vec<_>>();

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

fn validated_session_path(sessions_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Codex session ID 不能为空。".to_string());
    }

    let relative = Path::new(trimmed);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Codex session ID 必须是 sessions 目录内的相对路径。".to_string());
    }

    if !relative.extension().is_some_and(|ext| ext == "jsonl") {
        return Err("只能删除 Codex session 的 .jsonl 文件。".to_string());
    }

    let canonical_dir = sessions_dir
        .canonicalize()
        .map_err(|error| format!("Codex sessions 目录不存在：{error}"))?;
    let path = sessions_dir.join(relative);
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("找不到 Codex session 文件：{error}"))?;

    if !canonical_path.starts_with(&canonical_dir) {
        return Err("Codex session 文件不在 sessions 目录内。".to_string());
    }

    if !canonical_path.is_file() {
        return Err("Codex session 路径不是文件。".to_string());
    }

    Ok(canonical_path)
}

fn fallback_title(path: &Path, session_id: Option<&str>) -> String {
    session_id
        .map(str::to_string)
        .or_else(|| {
            path.file_stem()
                .map(|name| name.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "Untitled session".to_string())
}

fn path_id(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn set_parse_error(parsed: &mut ParsedSession, error: String) {
    if parsed.parse_error.is_none() {
        parsed.parse_error = Some(error);
    }
}

fn compact_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(text: &str, limit: usize) -> String {
    let mut chars = text.chars();
    let mut truncated = chars.by_ref().take(limit).collect::<String>();

    if chars.next().is_some() {
        truncated.push_str("...");
    }

    truncated
}

fn modified_ms(metadata: &fs::Metadata) -> Option<u128> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestCodexHome;

    #[test]
    fn lists_codex_session_with_user_title() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let session_path = location
            .codex_home
            .join("sessions")
            .join("2026")
            .join("06")
            .join("07")
            .join("rollout-2026-06-07T10-00-00-session-id.jsonl");
        fs::create_dir_all(session_path.parent().unwrap()).unwrap();
        fs::write(
            &session_path,
            r#"{"timestamp":"2026-06-07T02:00:00.000Z","type":"session_meta","payload":{"id":"session-id","timestamp":"2026-06-07T02:00:00.000Z","cwd":"/repo","cli_version":"0.1.0","model_provider":"custom"}}
{"timestamp":"2026-06-07T02:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"做一个 session 的管理"}]}}
"#,
        )
        .unwrap();

        let state = state(&location.codex_home);

        assert_eq!(state.sessions.len(), 1);
        assert_eq!(
            state.sessions[0].id,
            "2026/06/07/rollout-2026-06-07T10-00-00-session-id.jsonl"
        );
        assert_eq!(state.sessions[0].session_id, Some("session-id".to_string()));
        assert_eq!(state.sessions[0].title, "做一个 session 的管理");
        assert_eq!(state.sessions[0].cwd, Some("/repo".to_string()));
        assert_eq!(state.sessions[0].user_message_count, 1);
    }

    #[test]
    fn title_uses_first_user_message_while_counts_stay_exact() {
        // Guards the parser optimization: large assistant content after the
        // title is skipped for title extraction, but every message line is
        // still counted and the last timestamp reflects the final line.
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let session_path = location
            .codex_home
            .join("sessions")
            .join("2026")
            .join("06")
            .join("07")
            .join("rollout-counts.jsonl");
        fs::create_dir_all(session_path.parent().unwrap()).unwrap();
        let huge_reply = "x".repeat(20_000);
        let contents = format!(
            concat!(
                "{{\"timestamp\":\"2026-06-07T02:00:00.000Z\",\"type\":\"session_meta\",\"payload\":{{\"id\":\"sid\"}}}}\n",
                "{{\"timestamp\":\"2026-06-07T02:00:01.000Z\",\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"user\",\"content\":[{{\"type\":\"input_text\",\"text\":\"first question\"}}]}}}}\n",
                "{{\"timestamp\":\"2026-06-07T02:00:02.000Z\",\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{{\"type\":\"output_text\",\"text\":\"{reply}\"}}]}}}}\n",
                "{{\"timestamp\":\"2026-06-07T02:00:03.000Z\",\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"user\",\"content\":[{{\"type\":\"input_text\",\"text\":\"second question\"}}]}}}}\n"
            ),
            reply = huge_reply
        );
        fs::write(&session_path, contents).unwrap();

        let state = state(&location.codex_home);

        assert_eq!(state.sessions.len(), 1);
        let session = &state.sessions[0];
        assert_eq!(session.title, "first question");
        assert_eq!(session.message_count, 3);
        assert_eq!(session.user_message_count, 2);
        assert_eq!(
            session.last_timestamp,
            Some("2026-06-07T02:00:03.000Z".to_string())
        );
    }

    #[test]
    fn deletes_session_file_by_relative_id() {
        let _guard = TestCodexHome::new();
        let location = config_locator::locate().unwrap();
        let session_path = location
            .codex_home
            .join("sessions")
            .join("2026")
            .join("06")
            .join("07")
            .join("rollout.jsonl");
        fs::create_dir_all(session_path.parent().unwrap()).unwrap();
        fs::write(&session_path, "").unwrap();

        delete("2026/06/07/rollout.jsonl".to_string()).unwrap();

        assert!(!session_path.exists());
    }

    #[test]
    fn rejects_delete_outside_sessions_dir() {
        let _guard = TestCodexHome::new();
        let error = delete("../config.toml".to_string()).unwrap_err();

        assert!(error.contains("相对路径"));
    }
}
