use crate::config_locator;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const TITLE_LIMIT: usize = 140;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionState {
    pub projects_dir: String,
    pub sessions: Vec<ClaudeSessionSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionSummary {
    pub id: String,
    pub session_id: Option<String>,
    pub title: String,
    pub cwd: Option<String>,
    pub project: String,
    pub path: String,
    pub relative_path: String,
    pub created_at: Option<String>,
    pub last_timestamp: Option<String>,
    pub cli_version: Option<String>,
    pub git_branch: Option<String>,
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
    ai_title: Option<String>,
    cwd: Option<String>,
    created_at: Option<String>,
    last_timestamp: Option<String>,
    cli_version: Option<String>,
    git_branch: Option<String>,
    message_count: usize,
    user_message_count: usize,
    parse_error: Option<String>,
}

pub fn state(projects_dir: &Path) -> ClaudeSessionState {
    let mut paths = Vec::new();
    collect_session_paths(projects_dir, &mut paths);

    let mut sessions = paths
        .into_iter()
        .filter_map(|path| session_summary(projects_dir, &path))
        .collect::<Vec<_>>();

    sessions.sort_by(|left, right| {
        right
            .modified_ms
            .cmp(&left.modified_ms)
            .then_with(|| right.created_at.cmp(&left.created_at))
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });

    ClaudeSessionState {
        projects_dir: projects_dir.display().to_string(),
        sessions,
    }
}

pub fn delete(id: String) -> Result<(), String> {
    let location = config_locator::locate_claude()?;
    let path = validated_session_path(&location.projects_dir, &id)?;

    fs::remove_file(&path).map_err(|error| {
        format!("删除 Claude session 文件失败：{} ({error})", path.display())
    })
}

pub fn delete_older_than_days(days: u64) -> Result<usize, String> {
    delete_older_than(days, SystemTime::now())
}

fn delete_older_than(days: u64, now: SystemTime) -> Result<usize, String> {
    if days == 0 {
        return Err("删除天数必须大于 0。".to_string());
    }

    let location = config_locator::locate_claude()?;
    let cutoff = now
        .checked_sub(Duration::from_secs(days.saturating_mul(24 * 60 * 60)))
        .ok_or_else(|| "删除时间范围无效。".to_string())?;
    let mut paths = Vec::new();
    collect_session_paths(&location.projects_dir, &mut paths);
    let mut deleted = 0;

    for path in paths {
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        if modified >= cutoff {
            continue;
        }

        fs::remove_file(&path).map_err(|error| {
            format!("删除 Claude session 文件失败：{} ({error})", path.display())
        })?;
        deleted += 1;
    }

    Ok(deleted)
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

fn session_summary(projects_dir: &Path, path: &Path) -> Option<ClaudeSessionSummary> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }

    let relative_path = path.strip_prefix(projects_dir).ok()?;
    let id = path_id(relative_path);
    let parsed = parse_session(path);
    let project = parsed
        .cwd
        .clone()
        .unwrap_or_else(|| project_from_relative(relative_path));
    let title = parsed
        .ai_title
        .clone()
        .or_else(|| parsed.title.clone())
        .unwrap_or_else(|| fallback_title(path, parsed.session_id.as_deref()));

    Some(ClaudeSessionSummary {
        id: id.clone(),
        session_id: parsed.session_id,
        title,
        cwd: parsed.cwd,
        project,
        path: path.display().to_string(),
        relative_path: id,
        created_at: parsed.created_at,
        last_timestamp: parsed.last_timestamp,
        cli_version: parsed.cli_version,
        git_branch: parsed.git_branch,
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

        let record = match serde_json::from_str::<LineRecord>(trimmed) {
            Ok(record) => record,
            Err(error) => {
                set_parse_error(
                    &mut parsed,
                    format!("第 {line_number} 行 JSON 解析失败：{error}"),
                );
                continue;
            }
        };

        if let Some(session_id) = record.session_id {
            parsed.session_id.get_or_insert(session_id);
        }
        if let Some(cwd) = record.cwd {
            parsed.cwd.get_or_insert(cwd);
        }
        if let Some(version) = record.version {
            parsed.cli_version.get_or_insert(version);
        }
        if let Some(git_branch) = record.git_branch.filter(|value| !value.is_empty()) {
            parsed.git_branch.get_or_insert(git_branch);
        }
        if let Some(timestamp) = record.timestamp {
            parsed.created_at.get_or_insert(timestamp.clone());
            parsed.last_timestamp = Some(timestamp);
        }

        match record.kind.as_deref() {
            Some("ai-title") => {
                if let Some(title) = record.ai_title.filter(|value| !value.trim().is_empty()) {
                    parsed.ai_title = Some(truncate_chars(&compact_text(&title), TITLE_LIMIT));
                }
            }
            Some("user") => {
                parsed.message_count += 1;
                if record.is_sidechain == Some(true) {
                    continue;
                }
                if let Some(text) = record.message.and_then(message_text) {
                    if is_human_prompt(&text) {
                        parsed.user_message_count += 1;
                        maybe_set_title(&mut parsed, text);
                    }
                }
            }
            Some("assistant") => {
                parsed.message_count += 1;
            }
            _ => {}
        }
    }

    parsed
}

#[derive(Deserialize)]
struct LineRecord<'a> {
    #[serde(rename = "type")]
    kind: Option<String>,
    timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    cwd: Option<String>,
    version: Option<String>,
    #[serde(rename = "gitBranch")]
    git_branch: Option<String>,
    #[serde(rename = "isSidechain")]
    is_sidechain: Option<bool>,
    #[serde(rename = "aiTitle")]
    ai_title: Option<String>,
    #[serde(borrow, default)]
    message: Option<&'a RawValue>,
}

#[derive(Deserialize)]
struct MessagePayload {
    content: Option<MessageContent>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum MessageContent {
    Text(String),
    Items(Vec<ContentItem>),
}

#[derive(Deserialize)]
struct ContentItem {
    #[serde(rename = "type")]
    kind: Option<String>,
    text: Option<String>,
}

fn message_text(message: &RawValue) -> Option<String> {
    let payload = serde_json::from_str::<MessagePayload>(message.get()).ok()?;

    match payload.content? {
        MessageContent::Text(text) => Some(text),
        MessageContent::Items(items) => {
            let parts = items
                .into_iter()
                .filter(|item| item.kind.as_deref() == Some("text"))
                .filter_map(|item| item.text)
                .collect::<Vec<_>>();

            if parts.is_empty() {
                None
            } else {
                Some(parts.join("\n"))
            }
        }
    }
}

fn is_human_prompt(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    !(trimmed.starts_with("<command-name>")
        || trimmed.starts_with("<command-message>")
        || trimmed.starts_with("<local-command")
        || trimmed.starts_with("<bash-")
        || trimmed.starts_with("<system-reminder")
        || trimmed.starts_with("Caveat:")
        || trimmed.starts_with("[Request interrupted"))
}

fn maybe_set_title(parsed: &mut ParsedSession, text: String) {
    if parsed.title.is_some() {
        return;
    }

    let compact = compact_text(&text);
    if compact.is_empty() {
        return;
    }

    parsed.title = Some(truncate_chars(&compact, TITLE_LIMIT));
}

fn validated_session_path(projects_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Claude session ID 不能为空。".to_string());
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
        return Err("Claude session ID 必须是 projects 目录内的相对路径。".to_string());
    }

    if !relative.extension().is_some_and(|ext| ext == "jsonl") {
        return Err("只能删除 Claude session 的 .jsonl 文件。".to_string());
    }

    let canonical_dir = projects_dir
        .canonicalize()
        .map_err(|error| format!("Claude projects 目录不存在：{error}"))?;
    let path = projects_dir.join(relative);
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("找不到 Claude session 文件：{error}"))?;

    if !canonical_path.starts_with(&canonical_dir) {
        return Err("Claude session 文件不在 projects 目录内。".to_string());
    }

    if !canonical_path.is_file() {
        return Err("Claude session 路径不是文件。".to_string());
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

fn project_from_relative(relative_path: &Path) -> String {
    relative_path
        .components()
        .next()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string())
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
    use crate::test_support::TestClaudeHome;

    fn project_dir() -> PathBuf {
        let location = config_locator::locate_claude().unwrap();
        location
            .projects_dir
            .join("-Users-sunven-work-qingxing-server")
    }

    #[test]
    fn lists_claude_session_with_ai_title() {
        let _guard = TestClaudeHome::new();
        let dir = project_dir();
        let session_path = dir.join("3ac1202e.jsonl");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            &session_path,
            r#"{"type":"mode","sessionId":"3ac1202e"}
{"type":"user","sessionId":"3ac1202e","timestamp":"2026-06-03T14:39:59.872Z","cwd":"/Users/sunven/work/qingxing/server","version":"2.1.153","gitBranch":"develop","message":{"role":"user","content":"启动报错"}}
{"type":"assistant","timestamp":"2026-06-03T14:40:10.000Z","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}
{"type":"ai-title","aiTitle":"Debug Maven startup error","sessionId":"3ac1202e"}
"#,
        )
        .unwrap();

        let location = config_locator::locate_claude().unwrap();
        let state = state(&location.projects_dir);

        assert_eq!(state.sessions.len(), 1);
        let session = &state.sessions[0];
        assert_eq!(session.id, "-Users-sunven-work-qingxing-server/3ac1202e.jsonl");
        assert_eq!(session.session_id, Some("3ac1202e".to_string()));
        assert_eq!(session.title, "Debug Maven startup error");
        assert_eq!(session.cwd, Some("/Users/sunven/work/qingxing/server".to_string()));
        assert_eq!(session.project, "/Users/sunven/work/qingxing/server");
        assert_eq!(session.cli_version, Some("2.1.153".to_string()));
        assert_eq!(session.git_branch, Some("develop".to_string()));
        assert_eq!(session.message_count, 2);
        assert_eq!(session.user_message_count, 1);
    }

    #[test]
    fn falls_back_to_first_user_message_and_skips_command_wrappers() {
        let _guard = TestClaudeHome::new();
        let dir = project_dir();
        let session_path = dir.join("session.jsonl");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            &session_path,
            r#"{"type":"user","timestamp":"2026-06-03T14:39:59.872Z","cwd":"/repo","message":{"role":"user","content":"<command-name>/plugin</command-name>"}}
{"type":"user","timestamp":"2026-06-03T14:40:00.000Z","cwd":"/repo","message":{"role":"user","content":[{"type":"text","text":"做一个 session 的管理"}]}}
{"type":"user","isSidechain":true,"message":{"role":"user","content":"subagent prompt"}}
"#,
        )
        .unwrap();

        let location = config_locator::locate_claude().unwrap();
        let state = state(&location.projects_dir);

        assert_eq!(state.sessions.len(), 1);
        let session = &state.sessions[0];
        assert_eq!(session.title, "做一个 session 的管理");
        assert_eq!(session.user_message_count, 1);
    }

    #[test]
    fn deletes_session_file_by_relative_id() {
        let _guard = TestClaudeHome::new();
        let dir = project_dir();
        let session_path = dir.join("gone.jsonl");
        fs::create_dir_all(&dir).unwrap();
        fs::write(&session_path, "").unwrap();

        delete("-Users-sunven-work-qingxing-server/gone.jsonl".to_string()).unwrap();

        assert!(!session_path.exists());
    }

    #[test]
    fn deletes_only_sessions_older_than_days() {
        let _guard = TestClaudeHome::new();
        let dir = project_dir();
        let old_session = dir.join("old.jsonl");
        let fresh_session = dir.join("fresh.jsonl");
        fs::create_dir_all(&dir).unwrap();
        fs::write(&old_session, "").unwrap();
        fs::write(&fresh_session, "").unwrap();

        let now = UNIX_EPOCH + Duration::from_secs(2_000_000);
        File::open(&old_session)
            .unwrap()
            .set_modified(now - Duration::from_secs(8 * 24 * 60 * 60))
            .unwrap();
        File::open(&fresh_session)
            .unwrap()
            .set_modified(now - Duration::from_secs(6 * 24 * 60 * 60))
            .unwrap();

        let deleted = delete_older_than(7, now).unwrap();

        assert_eq!(deleted, 1);
        assert!(!old_session.exists());
        assert!(fresh_session.exists());
    }

    #[test]
    fn rejects_delete_outside_projects_dir() {
        let _guard = TestClaudeHome::new();
        let error = delete("../.claude.json".to_string()).unwrap_err();

        assert!(error.contains("相对路径"));
    }
}
