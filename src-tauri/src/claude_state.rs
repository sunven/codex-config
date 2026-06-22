use crate::claude_mcp_store::{self, ClaudeMcpState};
use crate::claude_session_store::ClaudeSessionState;
use crate::claude_skill_store::{self, SkillState};
use crate::config_locator;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeState {
    pub claude_home: String,
    pub projects_dir: String,
    pub config_path: String,
    pub exists: bool,
    pub mcp: ClaudeMcpState,
    pub skills: SkillState,
    pub sessions: Option<ClaudeSessionState>,
}

pub fn load_state() -> Result<ClaudeState, String> {
    let location = config_locator::locate_claude()?;

    Ok(ClaudeState {
        claude_home: location.claude_home.display().to_string(),
        projects_dir: location.projects_dir.display().to_string(),
        config_path: location.config_path.display().to_string(),
        exists: location.claude_home.exists(),
        mcp: claude_mcp_store::state(),
        skills: claude_skill_store::state(),
        sessions: None,
    })
}
