import type { McpServerEntry } from "../../state/appState";
import type { FileToken } from "../config/configEditWorkflow";
import type { McpServerDraft } from "../config/configTableEntries";
import type { SkillState } from "../skills/globalSkills";

export type ClaudeProduct = "codex" | "claude";

export type ClaudeMcpState = {
  servers: McpServerEntry[];
  configPath: string;
  configExists: boolean;
  fileToken?: FileToken;
  parseIssue?: string;
};

export type ClaudeSessionSummary = {
  id: string;
  sessionId?: string;
  title: string;
  cwd?: string;
  project: string;
  path: string;
  relativePath: string;
  createdAt?: string;
  lastTimestamp?: string;
  cliVersion?: string;
  gitBranch?: string;
  size: number;
  modifiedMs?: number;
  messageCount: number;
  userMessageCount: number;
  parseError?: string;
};

export type ClaudeSessionState = {
  projectsDir: string;
  sessions: ClaudeSessionSummary[];
};

export type ClaudeState = {
  claudeHome: string;
  projectsDir: string;
  configPath: string;
  exists: boolean;
  mcp: ClaudeMcpState;
  skills: SkillState;
  sessions?: ClaudeSessionState;
};

export type ClaudeProjectGroup = {
  key: string;
  label: string;
  sessions: ClaudeSessionSummary[];
  totalSize: number;
};

export function groupClaudeSessionsByProject(
  sessions: ClaudeSessionSummary[],
): ClaudeProjectGroup[] {
  const groups = new Map<string, ClaudeProjectGroup>();

  for (const session of sessions) {
    const key = session.project || "unknown";
    const group =
      groups.get(key) ?? { key, label: key, sessions: [], totalSize: 0 };
    group.sessions.push(session);
    group.totalSize += session.size;
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function claudeSessionsOlderThanCount(
  sessions: ClaudeSessionSummary[],
  days: number,
  nowMs: number = Date.now(),
): number {
  const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;

  return sessions.filter(
    (session) =>
      typeof session.modifiedMs === "number" && session.modifiedMs < cutoffMs,
  ).length;
}

export type { McpServerDraft };
