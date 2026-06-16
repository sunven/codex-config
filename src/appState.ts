import type { FileToken } from "./configEditWorkflow";
import type { FieldState } from "./configFieldDrafts";
import type {
  McpServerTableEntry,
  ModelProviderTableEntry,
} from "./configTableEntries";
import type { CodexSessionSummary } from "./codexSessions";
import type { SkillState } from "./globalSkills";

export type HealthStatus = "ready" | "readOnly" | "needsAttention";

export type AppState = {
  homeDir?: string;
  configPath: string;
  resolvedPath: string;
  backupDir: string;
  writable: boolean;
  readonlyReason?: string;
  fileToken?: FileToken;
  health: {
    status: HealthStatus;
    configExists: boolean;
    schemaVersion: string;
    codex: {
      binaryPath?: string;
      version?: string;
      found: boolean;
      message?: string;
    };
  };
  fields: FieldState[];
  profileFields: FieldState[];
  catalogFields: FieldState[];
  modelProviders: ModelProviderState;
  mcpServers: McpServerState;
  codexSessions: CodexSessionState;
  skills: SkillState;
  rawToml: string;
  parseIssue?: { message: string };
  profileStatus?: {
    activeProfile?: string;
    exists: boolean;
    missing: boolean;
  };
  profileWarnings: ProfileWarning[];
  backups: BackupSummary[];
  preferences: AppPreferences;
};

export type AppPreferences = {
  codexBinaryPath?: string;
};

export type CodexSessionState = {
  sessionsDir: string;
  sessions: CodexSessionSummary[];
};

export type ProfileWarning = {
  path: string;
  profile: string;
  rootValue?: string;
  profileValue: string;
  message: string;
};

export type BackupSummary = {
  id: string;
  path: string;
  size: number;
  modifiedMs?: number;
};

export type ModelProviderState = {
  providers: ModelProviderEntry[];
  reservedIds: string[];
};

export type McpServerState = {
  servers: McpServerEntry[];
};

export type ModelProviderEntry = ModelProviderTableEntry & {
  hasAdvancedFields: boolean;
};

export type McpServerEntry = McpServerTableEntry & {
  hasAdvancedFields: boolean;
};

export type SaveResult = {
  backupPath?: string;
  changed: boolean;
  state: AppState;
};
