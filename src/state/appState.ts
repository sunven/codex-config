import type { FileToken } from "../features/config/configEditWorkflow";
import type { FieldState } from "../features/config/configFieldDrafts";
import type {
  McpServerTableEntry,
  ModelProviderTableEntry,
} from "../features/config/configTableEntries";
import type { CodexSessionSummary } from "../features/codex/codexSessions";
import type { SkillState } from "../features/skills/globalSkills";
import type { PluginState } from "../features/plugins/codexPlugins";

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
  modelProviders: ModelProviderState;
  mcpServers: McpServerState;
  codexSessions?: CodexSessionState;
  skills: SkillState;
  plugins: PluginState;
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

export type SkillImportBatchResult = {
  changed: boolean;
  state?: AppState;
  refreshError?: string;
  imported: SkillImportItem[];
  existing: SkillImportItem[];
  skipped: SkillImportProblem[];
  conflicts: SkillImportProblem[];
};

export type SkillImportItem = {
  name: string;
  sourceDirectory: string;
  linkDirectory: string;
  skillPath: string;
};

export type SkillImportProblem = {
  sourceDirectory: string;
  code: string;
  reason: string;
};
