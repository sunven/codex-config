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
  catalogFields: FieldState[];
  modelProviders: ModelProviderState;
  mcpServers: McpServerState;
  codexSessions: CodexSessionState;
  skills: SkillState;
  rawToml: string;
  parseIssue?: { message: string };
  preferences: AppPreferences;
};

export type AppPreferences = {
  codexBinaryPath?: string;
};

export type CodexSessionState = {
  sessionsDir: string;
  sessions: CodexSessionSummary[];
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
  changed: boolean;
  state: AppState;
};
