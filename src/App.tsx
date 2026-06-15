import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DatabaseBackup,
  Edit3,
  FileCode2,
  Gauge,
  Plus,
  RefreshCw,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Switch } from "./components/ui/switch";
import "./App.css";

type HealthStatus = "ready" | "readOnly" | "needsAttention";

type AppState = {
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

type AppPreferences = {
  codexBinaryPath?: string;
};

type CodexSessionState = {
  sessionsDir: string;
  sessions: CodexSessionSummary[];
};

type CodexSessionSummary = {
  id: string;
  sessionId?: string;
  title: string;
  cwd?: string;
  path: string;
  relativePath: string;
  createdAt?: string;
  lastTimestamp?: string;
  cliVersion?: string;
  modelProvider?: string;
  size: number;
  modifiedMs?: number;
  messageCount: number;
  userMessageCount: number;
  parseError?: string;
};

type CodexSessionMonthGroup = {
  key: string;
  label: string;
  sessions: CodexSessionSummary[];
  totalSize: number;
};

type CodexSessionYearGroup = {
  key: string;
  label: string;
  months: CodexSessionMonthGroup[];
  sessionCount: number;
  totalSize: number;
};

type FileToken = {
  hash: string;
  modifiedMs?: number;
  size: number;
};

type FieldState = {
  path: string;
  label: string;
  group: string;
  kind: "boolean" | "text" | "select" | "status" | "number" | "object";
  value?: string;
  editable: boolean;
  risk: "normal" | "caution" | "dangerous" | "secret" | "experimental";
  note?: string;
  options?: string[];
};

type ProfileWarning = {
  path: string;
  profile: string;
  rootValue?: string;
  profileValue: string;
  message: string;
};

type BackupSummary = {
  id: string;
  path: string;
  size: number;
  modifiedMs?: number;
};

type ModelProviderState = {
  providers: ModelProviderEntry[];
  reservedIds: string[];
};

type McpServerState = {
  servers: McpServerEntry[];
};

type SkillState = {
  roots: SkillRoot[];
  skills: SkillSummary[];
};

type SkillRoot = {
  path: string;
  label: string;
  exists: boolean;
};

type SkillSummary = {
  name: string;
  description?: string;
  path: string;
  directory: string;
  symlink?: boolean;
  targetDirectory?: string;
  source: string;
  enabled: boolean;
  configured: boolean;
  size: number;
  modifiedMs?: number;
};

type SkillContent = {
  name: string;
  description?: string;
  path: string;
  rawMarkdown: string;
};

type ModelProviderEntry = {
  id: string;
  name?: string;
  baseUrl?: string;
  envKey?: string;
  envKeyInstructions?: string;
  wireApi?: string;
  requestMaxRetries?: number;
  streamMaxRetries?: number;
  streamIdleTimeoutMs?: number;
  requiresOpenaiAuth?: boolean;
  supportsWebsockets?: boolean;
  queryParams: Record<string, string>;
  httpHeaders: Record<string, string>;
  envHttpHeaders: Record<string, string>;
  hasAdvancedFields: boolean;
};

type McpServerEntry = {
  id: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  startupTimeoutMs?: number;
  enabled?: boolean;
  hasAdvancedFields: boolean;
};

type ModelProviderDraft = {
  id: string;
  originalId?: string;
  name?: string;
  baseUrl?: string;
  envKey?: string;
  envKeyInstructions?: string;
  wireApi?: string;
  requestMaxRetries?: number;
  streamMaxRetries?: number;
  streamIdleTimeoutMs?: number;
  requiresOpenaiAuth?: boolean;
  supportsWebsockets?: boolean;
  queryParams: Record<string, string>;
  httpHeaders: Record<string, string>;
  envHttpHeaders: Record<string, string>;
};

type McpServerDraft = {
  id: string;
  originalId?: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  startupTimeoutMs?: number;
  enabled?: boolean;
};

type PreviewResult = {
  changed: boolean;
  fieldDiffs: FieldDiff[];
  textDiff: string;
  candidateRawToml: string;
};

type FieldDiff = {
  scope: "root" | "profile";
  path: string;
  label: string;
  before: string;
  after: string;
};

type SaveResult = {
  backupPath?: string;
  changed: boolean;
  state: AppState;
};

type DraftChange = {
  path: string;
  scope?: "root" | "profile";
  action: "set" | "unset";
  value?: boolean | string;
};

type PreviewKind =
  | "fast"
  | "rootSettings"
  | "profileSettings"
  | "rawToml"
  | "modelProviderSave"
  | "modelProviderDelete"
  | "mcpServerSave"
  | "mcpServerDelete";

type MainTab = "config" | "sessions" | "mcp" | "skills";

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewKind, setPreviewKind] = useState<PreviewKind | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>("config");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [profileDraftValues, setProfileDraftValues] = useState<Record<string, string>>({});
  const [modelProviderDraft, setModelProviderDraft] =
    useState<ModelProviderDraft>(emptyModelProviderDraft());
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(emptyMcpServerDraft());
  const [rawTomlDraft, setRawTomlDraft] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<SkillContent | null>(null);
  const [importingSkill, setImportingSkill] = useState(false);
  const [pendingDeleteProviderId, setPendingDeleteProviderId] = useState<string | null>(null);
  const [pendingDeleteServerId, setPendingDeleteServerId] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const importingSkillRef = useRef(false);

  async function loadState() {
    setLoading(true);
    setError(null);
    setPreview(null);
    setPreviewKind(null);

    try {
      const nextState = await invoke<AppState>("load_state");
      setState(nextState);
      setDraftValues(draftValuesFromFields(nextState.fields));
      setProfileDraftValues(draftValuesFromFields(nextState.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setPendingDeleteSessionId(null);
      setSelectedSkillPath(nextState.skills.skills[0]?.path ?? null);
      setSkillContent(null);
      setRawTomlDraft(nextState.rawToml);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function switchTab(tab: MainTab) {
    setActiveTab(tab);
    setPreview(null);
    setPreviewKind(null);
    setPendingDeleteProviderId(null);
    setPendingDeleteServerId(null);
    setPendingDeleteSessionId(null);
    setStatusMessage(null);
  }

  async function previewFastMode() {
    setError(null);
    setStatusMessage(null);

    try {
      setPreview(
        await invoke<PreviewResult>("preview_changes", {
          changes: fastModeChanges(),
        }),
      );
      setPreviewKind("fast");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveFastMode() {
    setError(null);

    try {
      const result = await invoke<SaveResult>("save_changes", {
        changes: fastModeChanges(),
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存。备份：${backupPathLabel(result.backupPath, result.state.homeDir)}`
          : "没有需要保存的变更。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function previewSettings() {
    if (!state) {
      return;
    }

    const changes = settingsChanges(state.fields, draftValues, "root");
    setError(null);
    setStatusMessage(null);

    if (changes.length === 0) {
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage("没有可预览的配置变更。");
      return;
    }

    try {
      setPreview(
        await invoke<PreviewResult>("preview_changes", {
          changes,
        }),
      );
      setPreviewKind("rootSettings");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveSettings() {
    if (!state) {
      return;
    }

    const changes = settingsChanges(state.fields, draftValues, "root");
    setError(null);

    try {
      const result = await invoke<SaveResult>("save_changes", {
        changes,
        fileToken: state.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存。备份：${backupPathLabel(result.backupPath, result.state.homeDir)}`
          : "没有需要保存的变更。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  function updateDraftValue(path: string, value: string) {
    setDraftValues((current) => ({
      ...current,
      [path]: value,
    }));
    setPreview(null);
    setPreviewKind(null);
    setStatusMessage(null);
  }

  async function previewProfileSettings() {
    if (!state) {
      return;
    }

    const changes = settingsChanges(state.profileFields, profileDraftValues, "profile");
    setError(null);
    setStatusMessage(null);

    if (changes.length === 0) {
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage("没有可预览的 profile 配置变更。");
      return;
    }

    try {
      setPreview(
        await invoke<PreviewResult>("preview_changes", {
          changes,
        }),
      );
      setPreviewKind("profileSettings");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveProfileSettings() {
    if (!state) {
      return;
    }

    const changes = settingsChanges(state.profileFields, profileDraftValues, "profile");
    setError(null);

    try {
      const result = await invoke<SaveResult>("save_changes", {
        changes,
        fileToken: state.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存 profile 配置。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的变更。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  function updateProfileDraftValue(path: string, value: string) {
    setProfileDraftValues((current) => ({
      ...current,
      [path]: value,
    }));
    setPreview(null);
    setPreviewKind(null);
    setStatusMessage(null);
  }

  async function previewRawToml() {
    setError(null);
    setStatusMessage(null);

    try {
      const nextPreview = await invoke<PreviewResult>("preview_raw_toml", {
        rawToml: rawTomlDraft,
      });
      setPreview(nextPreview);
      setPreviewKind("rawToml");

      if (!nextPreview.changed) {
        setStatusMessage("原始 TOML 没有可预览的变更。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveRawToml() {
    setError(null);

    try {
      const result = await invoke<SaveResult>("save_raw_toml", {
        rawToml: rawTomlDraft,
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存原始 TOML。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的原始 TOML 变更。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  function updateRawTomlDraft(value: string) {
    setRawTomlDraft(value);
    setPreview(null);
    setPreviewKind(null);
    setStatusMessage(null);
  }

  function updateModelProviderDraft(draft: ModelProviderDraft) {
    setModelProviderDraft(draft);
    setPendingDeleteProviderId(null);
    setPreview(null);
    setPreviewKind(null);
    setStatusMessage(null);
  }

  function updateMcpServerDraft(draft: McpServerDraft) {
    setMcpServerDraft(draft);
    setPendingDeleteServerId(null);
    setPreview(null);
    setPreviewKind(null);
    setStatusMessage(null);
  }

  async function previewModelProvider() {
    setError(null);
    setStatusMessage(null);

    try {
      const nextPreview = await invoke<PreviewResult>("preview_save_model_provider", {
        draft: compactModelProviderDraft(modelProviderDraft),
      });
      setPreview(nextPreview);
      setPreviewKind("modelProviderSave");
      setPendingDeleteProviderId(null);

      if (!nextPreview.changed) {
        setStatusMessage("Model provider 没有可预览的变更。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveModelProvider() {
    setError(null);

    try {
      const result = await invoke<SaveResult>("save_model_provider", {
        draft: compactModelProviderDraft(modelProviderDraft),
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存 model provider。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的 model provider 变更。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function previewDeleteModelProvider(id: string) {
    setError(null);
    setStatusMessage(null);

    try {
      const nextPreview = await invoke<PreviewResult>("preview_delete_model_provider", {
        id,
      });
      setPreview(nextPreview);
      setPreviewKind("modelProviderDelete");
      setPendingDeleteProviderId(nextPreview.changed ? id : null);

      if (!nextPreview.changed) {
        setStatusMessage("Model provider 没有可删除的变更。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteModelProvider(id: string) {
    setError(null);

    try {
      const result = await invoke<SaveResult>("delete_model_provider", {
        id,
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已删除 model provider。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要删除的 model provider。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function previewMcpServer() {
    setError(null);
    setStatusMessage(null);

    try {
      const nextPreview = await invoke<PreviewResult>("preview_save_mcp_server", {
        draft: compactMcpServerDraft(mcpServerDraft),
      });
      setPreview(nextPreview);
      setPreviewKind("mcpServerSave");
      setPendingDeleteServerId(null);

      if (!nextPreview.changed) {
        setStatusMessage("MCP server 没有可预览的变更。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveMcpServer() {
    setError(null);

    try {
      const result = await invoke<SaveResult>("save_mcp_server", {
        draft: compactMcpServerDraft(mcpServerDraft),
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存 MCP server。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的 MCP server 变更。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function previewDeleteMcpServer(id: string) {
    setError(null);
    setStatusMessage(null);

    try {
      const nextPreview = await invoke<PreviewResult>("preview_delete_mcp_server", {
        id,
      });
      setPreview(nextPreview);
      setPreviewKind("mcpServerDelete");
      setPendingDeleteServerId(nextPreview.changed ? id : null);

      if (!nextPreview.changed) {
        setStatusMessage("MCP server 没有可删除的变更。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteMcpServer(id: string) {
    setError(null);

    try {
      const result = await invoke<SaveResult>("delete_mcp_server", {
        id,
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已删除 MCP server。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要删除的 MCP server。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function restoreBackup(backupId: string) {
    setError(null);
    setStatusMessage(null);

    try {
      const result = await invoke<SaveResult>("restore_backup", {
        backupId,
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        `已恢复备份。恢复前备份：${
          backupPathLabel(result.backupPath, result.state.homeDir)
        }`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function readSkill(path: string) {
    setError(null);
    setStatusMessage(null);
    setSelectedSkillPath(path);

    try {
      setSkillContent(
        await invoke<SkillContent>("read_skill_content", {
          path,
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveSkillEnabled(path: string, enabled: boolean) {
    setError(null);
    setStatusMessage(null);

    try {
      const result = await invoke<SaveResult>("save_skill_enabled", {
        path,
        enabled,
        fileToken: state?.fileToken ?? null,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已${enabled ? "启用" : "停用"} skill。重启 Codex 后生效。`
          : "Skill 启停状态没有变化。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function importSkillDirectory() {
    if (importingSkillRef.current) {
      return;
    }

    importingSkillRef.current = true;
    setImportingSkill(true);
    setError(null);
    setStatusMessage(null);

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 skill 目录",
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      const result = await invoke<SaveResult>("import_skill_directory", {
        directory: selected,
      });
      setState(result.state);
      setDraftValues(draftValuesFromFields(result.state.fields));
      setProfileDraftValues(draftValuesFromFields(result.state.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setSkillContent(null);
      const importedDirectoryName = pathBasename(selected);
      const imported =
        result.state.skills.skills.find(
          (skill) =>
            skill.source === "Agent global skills" &&
            pathBasename(skill.directory) === importedDirectoryName,
        ) ??
        result.state.skills.skills.find(
          (skill) =>
            skill.directory === selected || pathBasename(skill.directory) === importedDirectoryName,
        );
      setSelectedSkillPath(imported?.path ?? result.state.skills.skills[0]?.path ?? null);
      setStatusMessage(
        result.changed
          ? "已导入 skill。重启 Codex 或开启新会话后生效。"
          : "Skill 已经导入。重启 Codex 或开启新会话后生效。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      importingSkillRef.current = false;
      setImportingSkill(false);
    }
  }

  async function deleteSession(id: string) {
    if (pendingDeleteSessionId !== id) {
      setPendingDeleteSessionId(id);
      setStatusMessage("再次点击删除会删除这个 Codex 会话 .jsonl 文件。");
      return;
    }

    setError(null);
    setStatusMessage(null);

    try {
      const nextState = await invoke<AppState>("delete_session", { id });
      setState(nextState);
      setDraftValues(draftValuesFromFields(nextState.fields));
      setProfileDraftValues(draftValuesFromFields(nextState.profileFields));
      setModelProviderDraft(emptyModelProviderDraft());
      setMcpServerDraft(emptyMcpServerDraft());
      setPendingDeleteProviderId(null);
      setPendingDeleteServerId(null);
      setPendingDeleteSessionId(null);
      setRawTomlDraft(nextState.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage("已删除 Codex session 文件。");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  const settingChanges = state ? settingsChanges(state.fields, draftValues, "root") : [];
  const profileSettingChanges = state
    ? settingsChanges(state.profileFields, profileDraftValues, "profile")
    : [];
  const settingsDirty = settingChanges.length > 0;
  const profileSettingsDirty = profileSettingChanges.length > 0;
  const rawTomlDirty = state ? rawTomlDraft !== state.rawToml : false;
  const rawTomlWritable = Boolean(state?.health.codex.found);

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    const title = appTitle(state);
    document.title = title;

    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    void getCurrentWindow().setTitle(title).catch(() => undefined);
  }, [state]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="top-title">
          <h1>Codex 配置</h1>
          <p className="top-description">
            管理本机 Codex 配置、sessions、MCP servers 和全局 skills。所有写入操作都会先预览变更。
          </p>
        </div>
        <button className="icon-button" onClick={loadState} disabled={loading}>
          <RefreshCw size={18} />
          <span>{loading ? "刷新中" : "刷新"}</span>
        </button>
      </header>

      {error && (
        <section className="notice danger" role="alert">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </section>
      )}

      {state && (
        <>
          {statusMessage && <section className="notice ok">{statusMessage}</section>}
          <TabBar activeTab={activeTab} onChange={switchTab} />
          <section
            className={`workspace ${
              activeTab === "skills" || activeTab === "sessions" ? "skills-workspace" : ""
            }`}
          >
            {activeTab === "config" ? (
              <>
                <div className="left-pane">
                  <FastModeTask
                    state={state}
                    onPreview={previewFastMode}
                    onSave={saveFastMode}
                    preview={preview}
                    previewKind={previewKind}
                  />
                  <SettingsForm
                    fields={state.fields}
                    draftValues={draftValues}
                    dirty={settingsDirty}
                    writable={state.writable}
                    title="全局配置"
                    emptyMessage="config.toml 当前无法解析。请先在右侧原始 TOML 中查看错误，修复后刷新。"
                    previewReady={previewKind === "rootSettings" && Boolean(preview?.changed)}
                    onChange={updateDraftValue}
                    onPreview={previewSettings}
                    onSave={saveSettings}
                  />
                  <ModelProvidersPanel
                    state={state}
                    draft={modelProviderDraft}
                    savePreviewReady={previewKind === "modelProviderSave" && Boolean(preview?.changed)}
                    pendingDeleteId={
                      previewKind === "modelProviderDelete" && preview?.changed
                        ? pendingDeleteProviderId
                        : null
                    }
                    onDraftChange={updateModelProviderDraft}
                    onPreview={previewModelProvider}
                    onSave={saveModelProvider}
                    onPreviewDelete={previewDeleteModelProvider}
                    onDelete={deleteModelProvider}
                  />
                  <ProfileSettingsForm
                    state={state}
                    draftValues={profileDraftValues}
                    dirty={profileSettingsDirty}
                    previewReady={previewKind === "profileSettings" && Boolean(preview?.changed)}
                    onChange={updateProfileDraftValue}
                    onPreview={previewProfileSettings}
                    onSave={saveProfileSettings}
                  />
                  <FieldCatalog
                    fields={state.catalogFields}
                    query={catalogQuery}
                    onQueryChange={setCatalogQuery}
                  />
                  <ProfileWarnings warnings={state.profileWarnings} />
                </div>
                <div className="right-pane">
                  <DiffPanel preview={preview} />
                  <RawToml
                    state={state}
                    draft={rawTomlDraft}
                    dirty={rawTomlDirty}
                    writable={rawTomlWritable}
                    previewReady={previewKind === "rawToml" && Boolean(preview?.changed)}
                    onChange={updateRawTomlDraft}
                    onPreview={previewRawToml}
                    onSave={saveRawToml}
                  />
                  <Backups
                    backups={state.backups}
                    backupDir={state.backupDir}
                    homeDir={state.homeDir}
                    writable={state.writable}
                    onRestore={restoreBackup}
                  />
                </div>
              </>
            ) : activeTab === "sessions" ? (
              <div className="single-pane">
                <SessionsPanel
                  state={state}
                  pendingDeleteId={pendingDeleteSessionId}
                  onDelete={deleteSession}
                />
              </div>
            ) : activeTab === "mcp" ? (
              <>
                <div className="left-pane">
                  <McpServersPanel
                    state={state}
                    draft={mcpServerDraft}
                    savePreviewReady={previewKind === "mcpServerSave" && Boolean(preview?.changed)}
                    pendingDeleteId={
                      previewKind === "mcpServerDelete" && preview?.changed
                        ? pendingDeleteServerId
                        : null
                    }
                    onDraftChange={updateMcpServerDraft}
                    onPreview={previewMcpServer}
                    onSave={saveMcpServer}
                    onPreviewDelete={previewDeleteMcpServer}
                    onDelete={deleteMcpServer}
                  />
                </div>
                <div className="right-pane">
                  <DiffPanel preview={preview} />
                  <RawToml
                    state={state}
                    draft={rawTomlDraft}
                    dirty={rawTomlDirty}
                    writable={rawTomlWritable}
                    previewReady={previewKind === "rawToml" && Boolean(preview?.changed)}
                    onChange={updateRawTomlDraft}
                    onPreview={previewRawToml}
                    onSave={saveRawToml}
                  />
                  <Backups
                    backups={state.backups}
                    backupDir={state.backupDir}
                    homeDir={state.homeDir}
                    writable={state.writable}
                    onRestore={restoreBackup}
                  />
                </div>
              </>
            ) : (
              <div className="single-pane">
                <SkillsPanel
                  state={state}
                  query={skillQuery}
                  selectedPath={selectedSkillPath}
                  content={skillContent}
                  onQueryChange={setSkillQuery}
                  onSelect={readSkill}
                  onSaveToggle={saveSkillEnabled}
                  onImport={importSkillDirectory}
                  importing={importingSkill}
                />
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function fastModeChanges(): DraftChange[] {
  return [
    {
      path: "features.fast_mode",
      scope: "root",
      action: "set",
      value: true,
    },
  ];
}

function emptyModelProviderDraft(): ModelProviderDraft {
  return {
    id: "",
    name: "",
    baseUrl: "",
    envKey: "",
    envKeyInstructions: "",
    wireApi: "responses",
    requestMaxRetries: undefined,
    streamMaxRetries: undefined,
    streamIdleTimeoutMs: undefined,
    requiresOpenaiAuth: undefined,
    supportsWebsockets: undefined,
    queryParams: {},
    httpHeaders: {},
    envHttpHeaders: {},
  };
}

function draftFromModelProvider(provider: ModelProviderEntry): ModelProviderDraft {
  return {
    id: provider.id,
    originalId: provider.id,
    name: provider.name ?? "",
    baseUrl: provider.baseUrl ?? "",
    envKey: provider.envKey ?? "",
    envKeyInstructions: provider.envKeyInstructions ?? "",
    wireApi: provider.wireApi ?? "responses",
    requestMaxRetries: provider.requestMaxRetries,
    streamMaxRetries: provider.streamMaxRetries,
    streamIdleTimeoutMs: provider.streamIdleTimeoutMs,
    requiresOpenaiAuth: provider.requiresOpenaiAuth,
    supportsWebsockets: provider.supportsWebsockets,
    queryParams: { ...provider.queryParams },
    httpHeaders: { ...provider.httpHeaders },
    envHttpHeaders: { ...provider.envHttpHeaders },
  };
}

function compactModelProviderDraft(draft: ModelProviderDraft): ModelProviderDraft {
  return {
    ...draft,
    id: draft.id.trim(),
    originalId: draft.originalId?.trim() || undefined,
    name: optionalText(draft.name),
    baseUrl: optionalText(draft.baseUrl),
    envKey: optionalText(draft.envKey),
    envKeyInstructions: optionalText(draft.envKeyInstructions),
    wireApi: optionalText(draft.wireApi),
    queryParams: cleanStringMap(draft.queryParams),
    httpHeaders: cleanStringMap(draft.httpHeaders),
    envHttpHeaders: cleanStringMap(draft.envHttpHeaders),
  };
}

function emptyMcpServerDraft(): McpServerDraft {
  return {
    id: "",
    command: "",
    args: [],
    env: {},
    startupTimeoutMs: undefined,
    enabled: undefined,
  };
}

function draftFromMcpServer(server: McpServerEntry): McpServerDraft {
  return {
    id: server.id,
    originalId: server.id,
    command: server.command ?? "",
    args: [...server.args],
    env: { ...server.env },
    startupTimeoutMs: server.startupTimeoutMs,
    enabled: server.enabled,
  };
}

function compactMcpServerDraft(draft: McpServerDraft): McpServerDraft {
  return {
    ...draft,
    id: draft.id.trim(),
    originalId: draft.originalId?.trim() || undefined,
    command: optionalText(draft.command),
    args: draft.args.map((arg) => arg.trim()).filter(Boolean),
    env: cleanStringMap(draft.env),
  };
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringMap(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key && value),
  );
}

function modelProviderDirty(draft: ModelProviderDraft, providers: ModelProviderEntry[]) {
  const compact = compactModelProviderDraft(draft);
  const original = compact.originalId
    ? providers.find((provider) => provider.id === compact.originalId)
    : undefined;

  if (original) {
    return (
      JSON.stringify(compact) !==
      JSON.stringify(compactModelProviderDraft(draftFromModelProvider(original)))
    );
  }

  return Boolean(
    compact.id ||
      compact.originalId ||
      compact.name ||
      compact.baseUrl ||
      compact.envKey ||
      compact.envKeyInstructions ||
      compact.wireApi !== "responses" ||
      compact.requestMaxRetries !== undefined ||
      compact.streamMaxRetries !== undefined ||
      compact.streamIdleTimeoutMs !== undefined ||
      compact.requiresOpenaiAuth !== undefined ||
      compact.supportsWebsockets !== undefined ||
      Object.keys(compact.queryParams).length ||
      Object.keys(compact.httpHeaders).length ||
      Object.keys(compact.envHttpHeaders).length,
  );
}

function mcpServerDirty(draft: McpServerDraft, servers: McpServerEntry[]) {
  const compact = compactMcpServerDraft(draft);
  const original = compact.originalId
    ? servers.find((server) => server.id === compact.originalId)
    : undefined;

  if (original) {
    return (
      JSON.stringify(compact) !==
      JSON.stringify(compactMcpServerDraft(draftFromMcpServer(original)))
    );
  }

  return Boolean(
    compact.id ||
      compact.originalId ||
      compact.command ||
      compact.args.length ||
      Object.keys(compact.env).length ||
      compact.startupTimeoutMs !== undefined ||
      compact.enabled !== undefined,
  );
}

function draftValuesFromFields(fields: FieldState[]) {
  return fields.reduce<Record<string, string>>((draft, field) => {
    draft[field.path] =
      field.kind === "boolean" ? (field.value ?? "inherited") : (field.value ?? "");
    return draft;
  }, {});
}

function settingsChanges(
  fields: FieldState[],
  draftValues: Record<string, string>,
  scope: "root" | "profile",
) {
  return fields.flatMap<DraftChange>((field) => {
    if (!field.editable || field.kind === "status") {
      return [];
    }

    const current =
      field.kind === "boolean" ? (field.value ?? "inherited") : (field.value ?? "");
    const next = draftValues[field.path] ?? current;

    if (next === current) {
      return [];
    }

    if (field.kind === "boolean") {
      return [
        next === "inherited"
          ? { path: field.path, scope, action: "unset" }
          : { path: field.path, scope, action: "set", value: next === "true" },
      ];
    }

    const trimmed = next.trim();
    return [
      trimmed
        ? { path: field.path, action: "set", value: trimmed, scope }
        : { path: field.path, action: "unset", scope },
    ];
  });
}

function backupPathLabel(path: string | undefined, homeDir: string | undefined) {
  return path ? displayPath(path, homeDir) : "新配置无需备份";
}

function appTitle(state: AppState | null) {
  const codexSummary = state ? codexTitleSummary(state) : undefined;

  return codexSummary ? `codex-config ${codexSummary}` : "codex-config";
}

function codexTitleSummary(state: AppState) {
  const codex = state.health.codex;
  const path = codex.binaryPath ? displayPath(codex.binaryPath, state.homeDir) : undefined;
  const version = codex.version ?? codex.message;

  return [path, version].filter(Boolean).join(" ");
}

function displayPath(path: string, homeDir: string | undefined) {
  const home = normalizedHomeDir(homeDir);

  if (!home) {
    return path;
  }

  if (path.replace(/[\\/]+$/, "") === home) {
    return "~";
  }

  for (const separator of ["/", "\\"]) {
    const prefix = `${home}${separator}`;
    if (path.startsWith(prefix)) {
      return `~${separator}${path.slice(prefix.length)}`;
    }
  }

  return path;
}

function pathBasename(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]+/);

  return parts[parts.length - 1] ?? normalized;
}

function normalizedHomeDir(homeDir: string | undefined) {
  const trimmed = homeDir?.trim();

  if (!trimmed || trimmed === "." || trimmed === "/" || trimmed === "\\") {
    return undefined;
  }

  const normalized = trimmed.replace(/[\\/]+$/, "");

  return normalized && !/^[A-Za-z]:$/.test(normalized) ? normalized : undefined;
}

function formatIsoDateTime(value: string | undefined) {
  if (!value) {
    return "未知";
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

function groupCodexSessionsByYear(sessions: CodexSessionSummary[]) {
  const yearsByKey = new Map<string, CodexSessionYearGroup>();

  for (const session of sessions) {
    const groupInfo = sessionYearMonthGroupInfo(session);
    const year =
      yearsByKey.get(groupInfo.yearKey) ??
      {
        key: groupInfo.yearKey,
        label: groupInfo.yearLabel,
        months: [],
        sessionCount: 0,
        totalSize: 0,
      };
    let month = year.months.find((candidate) => candidate.key === groupInfo.monthKey);

    if (!month) {
      month = {
        key: groupInfo.monthKey,
        label: groupInfo.monthLabel,
        sessions: [],
        totalSize: 0,
      };
      year.months.push(month);
    }

    month.sessions.push(session);
    month.totalSize += session.size;
    year.sessionCount += 1;
    year.totalSize += session.size;
    yearsByKey.set(year.key, year);
  }

  return Array.from(yearsByKey.values())
    .map((year) => ({
      ...year,
      months: year.months.sort((left, right) => compareSessionGroupKeys(left.key, right.key)),
    }))
    .sort((left, right) => compareSessionGroupKeys(left.key, right.key));
}

function compareSessionGroupKeys(left: string, right: string) {
  if (left === "unfiled") {
    return 1;
  }
  if (right === "unfiled") {
    return -1;
  }

  return right.localeCompare(left);
}

function sessionYearMonthGroupInfo(session: CodexSessionSummary) {
  const [year, month] = session.relativePath.split(/[\\/]/);

  if (/^\d{4}$/.test(year ?? "") && /^(0[1-9]|1[0-2])$/.test(month ?? "")) {
    return {
      yearKey: year,
      yearLabel: `${year}`,
      monthKey: `${year}/${month}`,
      monthLabel: `${month} 月`,
    };
  }

  return {
    yearKey: "unfiled",
    yearLabel: "未分组",
    monthKey: "unfiled",
    monthLabel: "未分组",
  };
}

function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  return (
    <nav className="tabbar" aria-label="配置区域" role="tablist">
      <button
        aria-selected={activeTab === "config"}
        className={activeTab === "config" ? "tab-button active" : "tab-button"}
        onClick={() => onChange("config")}
        role="tab"
        type="button"
      >
        Codex 配置
      </button>
      <button
        aria-selected={activeTab === "sessions"}
        className={activeTab === "sessions" ? "tab-button active" : "tab-button"}
        onClick={() => onChange("sessions")}
        role="tab"
        type="button"
      >
        Sessions
      </button>
      <button
        aria-selected={activeTab === "mcp"}
        className={activeTab === "mcp" ? "tab-button active" : "tab-button"}
        onClick={() => onChange("mcp")}
        role="tab"
        type="button"
      >
        MCP Servers
      </button>
      <button
        aria-selected={activeTab === "skills"}
        className={activeTab === "skills" ? "tab-button active" : "tab-button"}
        onClick={() => onChange("skills")}
        role="tab"
        type="button"
      >
        Skills
      </button>
    </nav>
  );
}

function FastModeTask({
  state,
  onPreview,
  onSave,
  preview,
  previewKind,
}: {
  state: AppState;
  onPreview: () => void;
  onSave: () => void;
  preview: PreviewResult | null;
  previewKind: PreviewKind | null;
}) {
  const fastMode = state.fields.find((field) => field.path === "features.fast_mode");
  const value = fastMode?.value ?? "inherited";
  const canSave = state.writable && value !== "true";

  return (
    <section className="task-panel">
      <div className="task-icon">
        <Gauge size={22} />
      </div>
      <div>
        <p className="eyebrow">推荐操作</p>
        <h2>开启 Fast 模式</h2>
        <p>
          当前全局值是 <strong>{value}</strong>。先预览 TOML 变更，再保存；
          保存前会自动备份。
        </p>
      </div>
      <div className="task-actions">
        <button
          className="icon-button"
          aria-label="预览 Fast 模式"
          disabled={!canSave}
          onClick={onPreview}
        >
          预览
        </button>
        <button
          className="primary-button"
          aria-label="保存 Fast 模式"
          disabled={!canSave || previewKind !== "fast" || !preview?.changed}
          onClick={onSave}
        >
          保存到 config.toml
        </button>
      </div>
    </section>
  );
}

function SettingsForm({
  fields,
  draftValues,
  dirty,
  writable,
  title,
  emptyMessage,
  previewReady,
  onChange,
  onPreview,
  onSave,
}: {
  fields: FieldState[];
  draftValues: Record<string, string>;
  dirty: boolean;
  writable: boolean;
  title: string;
  emptyMessage: string;
  previewReady: boolean;
  onChange: (path: string, value: string) => void;
  onPreview: () => void;
  onSave: () => void;
}) {
  const groupedFields = groupFields(fields);
  const previewLabel = `预览${title}`;
  const saveLabel =
    title === "全局配置" ? "保存全局配置" : `保存${title}`;

  return (
    <section className="panel settings-panel" aria-labelledby={sectionTitleId(title)}>
      <div className="panel-heading">
        <FileCode2 size={18} />
        <div>
          <h2 id={sectionTitleId(title)}>{title}</h2>
          <p className="muted">先预览 TOML diff，再写入 config.toml。</p>
        </div>
        <div className="panel-actions">
          <button
            className="small-button"
            aria-label={previewLabel}
            disabled={!writable || !dirty}
            onClick={onPreview}
          >
            预览
          </button>
          <button
            className="primary-button compact"
            aria-label={saveLabel}
            disabled={!writable || !dirty || !previewReady}
            onClick={onSave}
          >
            保存到 config.toml
          </button>
        </div>
      </div>
      <div className="field-list">
        {fields.length === 0 ? (
          <div className="empty-state">
            {emptyMessage}
          </div>
        ) : (
          groupedFields.map((group) => (
            <section className="field-group" key={group.name}>
              <h3>{group.name}</h3>
              {group.fields.map((field) => (
                <div className="field-row" key={field.path}>
                  <div className="field-main">
                    <div className="field-title-row">
                      <label htmlFor={fieldControlId(title, field.path)}>{field.label}</label>
                      <span className={`risk-badge ${field.risk}`}>{field.risk}</span>
                      <span className={field.editable ? "edit-badge editable" : "edit-badge"}>
                        {field.editable ? "editable" : "read-only"}
                      </span>
                    </div>
                    <div className="field-path-row">
                      <code>{field.path}</code>
                      <span className="field-current">
                        <span>当前值</span>
                        <strong>{fieldDisplayValue(field)}</strong>
                      </span>
                    </div>
                    {field.note && <p>{field.note}</p>}
                  </div>
                  <FieldValue
                    field={field}
                    id={fieldControlId(title, field.path)}
                    value={draftValues[field.path]}
                    onChange={(value) => onChange(field.path, value)}
                  />
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function ModelProvidersPanel({
  state,
  draft,
  savePreviewReady,
  pendingDeleteId,
  onDraftChange,
  onPreview,
  onSave,
  onPreviewDelete,
  onDelete,
}: {
  state: AppState;
  draft: ModelProviderDraft;
  savePreviewReady: boolean;
  pendingDeleteId: string | null;
  onDraftChange: (draft: ModelProviderDraft) => void;
  onPreview: () => void;
  onSave: () => void;
  onPreviewDelete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const providers = state.modelProviders.providers;
  const dirty = modelProviderDirty(draft, providers);
  const draftProviderId = draft.id || draft.originalId || "new";
  const previewLabel = `预览保存 provider ${draftProviderId}`;
  const saveLabel = `保存 provider ${draftProviderId}`;

  function patch(patch: Partial<ModelProviderDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  return (
    <section className="panel provider-panel" aria-labelledby="model-providers-title">
      <div className="panel-heading">
        <FileCode2 size={18} />
        <div>
          <h2 id="model-providers-title">Model providers</h2>
          <p className="muted">管理写入 <code>model_providers</code> 的自定义 provider。</p>
        </div>
        <span className="catalog-count">{providers.length} providers</span>
        <div className="panel-actions">
          <button
            aria-label={previewLabel}
            className="small-button"
            disabled={!state.writable || !dirty}
            onClick={onPreview}
            type="button"
          >
            预览
          </button>
          <button
            aria-label={saveLabel}
            className="primary-button compact"
            disabled={!state.writable || !dirty || !savePreviewReady}
            onClick={onSave}
            type="button"
          >
            保存 provider
          </button>
        </div>
      </div>

      <div className="provider-layout">
        <div className="provider-list">
          <button
            aria-label="新建 model provider"
            className="provider-row new-provider"
            onClick={() => onDraftChange(emptyModelProviderDraft())}
            type="button"
          >
            <Plus size={16} />
            新建 provider
          </button>
          {providers.length === 0 ? (
            <div className="empty-state">还没有自定义 model provider。</div>
          ) : (
            providers.map((provider) => {
              const providerName = provider.name || provider.id;
              const reserved = state.modelProviders.reservedIds.includes(provider.id);

              return (
                <div
                  className={`provider-row ${draft.originalId === provider.id ? "active" : ""}`}
                  key={provider.id}
                >
                  <button
                    aria-label={`选择 provider ${providerName}`}
                    onClick={() => onDraftChange(draftFromModelProvider(provider))}
                    type="button"
                  >
                    <div className="provider-title-row">
                      <strong>{providerName}</strong>
                      <span className={reserved ? "edit-badge" : "edit-badge editable"}>
                        {reserved ? "built-in" : "custom"}
                      </span>
                      {provider.hasAdvancedFields && (
                        <span className="kind-badge">advanced fields</span>
                      )}
                    </div>
                    <code>{provider.id}</code>
                    <div className="provider-meta">
                      {provider.baseUrl && <span>{provider.baseUrl}</span>}
                      {provider.envKey && <span>{provider.envKey}</span>}
                      {provider.wireApi && <span>{provider.wireApi}</span>}
                    </div>
                  </button>
                  <div className="provider-row-actions">
                    <button
                      aria-label={`预览删除 provider ${provider.id}`}
                      className="small-button"
                      disabled={!state.writable || reserved}
                      onClick={() => onPreviewDelete(provider.id)}
                      title={reserved ? "内置 provider 不能删除" : `预览删除 provider ${provider.id}`}
                      type="button"
                    >
                      预览删除
                    </button>
                    <button
                      aria-label={`确认删除 provider ${provider.id}`}
                      className="small-button"
                      disabled={!state.writable || reserved || pendingDeleteId !== provider.id}
                      onClick={() => onDelete(provider.id)}
                      title={reserved ? "内置 provider 不能删除" : `确认删除 provider ${provider.id}`}
                      type="button"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="provider-form">
          <div className="form-grid two-col">
            <LabeledInput
              label="Provider ID"
              value={draft.id}
              placeholder="local-openai"
              onChange={(value) => patch({ id: value })}
            />
            <LabeledInput
              label="Display name"
              value={draft.name ?? ""}
              placeholder="Local OpenAI"
              onChange={(value) => patch({ name: value })}
            />
            <LabeledInput
              label="Base URL"
              value={draft.baseUrl ?? ""}
              placeholder="http://localhost:1234/v1"
              onChange={(value) => patch({ baseUrl: value })}
            />
            <LabeledInput
              label="Env key"
              value={draft.envKey ?? ""}
              placeholder="LOCAL_API_KEY"
              onChange={(value) => patch({ envKey: value })}
            />
            <label className="input-block">
              <span>Wire API</span>
              <select
                className="field-control"
                value={draft.wireApi ?? "responses"}
                onChange={(event) => patch({ wireApi: event.currentTarget.value })}
              >
                <option value="">unset</option>
                <option value="responses">responses</option>
              </select>
            </label>
            <LabeledInput
              label="Env key instructions"
              value={draft.envKeyInstructions ?? ""}
              placeholder="Set LOCAL_API_KEY before launching Codex"
              onChange={(value) => patch({ envKeyInstructions: value })}
            />
          </div>

          <div className="form-grid three-col">
            <LabeledNumber
              label="Request retries"
              value={draft.requestMaxRetries}
              onChange={(value) => patch({ requestMaxRetries: value })}
            />
            <LabeledNumber
              label="Stream retries"
              value={draft.streamMaxRetries}
              onChange={(value) => patch({ streamMaxRetries: value })}
            />
            <LabeledNumber
              label="Idle timeout ms"
              value={draft.streamIdleTimeoutMs}
              onChange={(value) => patch({ streamIdleTimeoutMs: value })}
            />
          </div>

          <div className="toggle-row">
            <label>
              <input
                checked={draft.requiresOpenaiAuth ?? false}
                type="checkbox"
                onChange={(event) => patch({ requiresOpenaiAuth: event.currentTarget.checked })}
              />
              requires_openai_auth
            </label>
            <label>
              <input
                checked={draft.supportsWebsockets ?? false}
                type="checkbox"
                onChange={(event) => patch({ supportsWebsockets: event.currentTarget.checked })}
              />
              supports_websockets
            </label>
          </div>

          <StringMapEditor
            label="Query params"
            values={draft.queryParams}
            onChange={(queryParams) => patch({ queryParams })}
          />
          <StringMapEditor
            label="HTTP headers"
            values={draft.httpHeaders}
            onChange={(httpHeaders) => patch({ httpHeaders })}
          />
          <StringMapEditor
            label="Env HTTP headers"
            values={draft.envHttpHeaders}
            onChange={(envHttpHeaders) => patch({ envHttpHeaders })}
          />

          <p className="muted">
            内置 provider ID 保留不可覆盖：{state.modelProviders.reservedIds.join(", ")}。
          </p>
        </div>
      </div>
    </section>
  );
}

function SessionsPanel({
  state,
  pendingDeleteId,
  onDelete,
}: {
  state: AppState;
  pendingDeleteId: string | null;
  onDelete: (id: string) => void;
}) {
  const sessions = state.codexSessions.sessions;
  const totalSessionSize = sessions.reduce((total, session) => total + session.size, 0);
  const sessionYears = groupCodexSessionsByYear(sessions);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const selectedYearKey =
    activeYear && sessionYears.some((year) => year.key === activeYear)
      ? activeYear
      : sessionYears[0]?.key ?? null;
  const selectedYear = sessionYears.find((year) => year.key === selectedYearKey);

  function toggleMonth(monthKey: string) {
    setCollapsedMonths((current) => ({
      ...current,
      [monthKey]: !current[monthKey],
    }));
  }

  return (
    <section className="panel sessions-panel" aria-labelledby="codex-sessions-title">
      <div className="panel-heading sessions-heading">
        <BookOpen size={18} />
        <div>
          <h2 id="codex-sessions-title">Codex sessions</h2>
          <p className="muted">
            {displayPath(state.codexSessions.sessionsDir, state.homeDir)}
          </p>
        </div>
        {sessionYears.length > 0 && (
          <div className="session-year-tabs" role="tablist" aria-label="Session years">
            {sessionYears.map((year) => (
              <button
                aria-selected={year.key === selectedYearKey}
                className={`session-year-tab${year.key === selectedYearKey ? " active" : ""}`}
                key={year.key}
                onClick={() => setActiveYear(year.key)}
                role="tab"
                type="button"
              >
                <strong>{year.label}</strong>
                <span className="session-year-meta">
                  <span>{year.sessionCount} sessions</span>
                  <span>{formatBytes(year.totalSize)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="session-current">
          <div>
            <span>会话数量</span>
            <strong>{sessions.length}</strong>
          </div>
          <div>
            <span>总大小</span>
            <strong>{formatBytes(totalSessionSize)}</strong>
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <p className="muted session-footnote">
          删除会移除对应的 <code>.jsonl</code> 会话文件，不会修改 <code>config.toml</code>。
        </p>
      )}

      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-state">当前 Codex Home 下没有 session 记录。</div>
        ) : selectedYear ? (
          selectedYear.months.map((group) => {
            const isCollapsed = collapsedMonths[group.key] ?? false;

            return (
              <section className="session-month-group" key={group.key}>
                <button
                  aria-expanded={!isCollapsed}
                  className="session-month-heading"
                  onClick={() => toggleMonth(group.key)}
                  type="button"
                >
                  <span className="session-month-icon" aria-hidden="true">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                  <div className="session-month-title">
                    <h3>{group.label}</h3>
                    <span>{group.sessions.length} sessions</span>
                  </div>
                  <strong>{formatBytes(group.totalSize)}</strong>
                </button>
                {!isCollapsed && (
                  <div className="session-month-list">
                    {group.sessions.map((session) => {
                      const deleting = pendingDeleteId === session.id;
                      const deleteLabel = `${deleting ? "确认删除" : "预览删除"} ${session.title}`;

                      return (
                        <div className="session-row" key={session.id}>
                          <div className="session-main">
                            <div className="session-title-row">
                              <strong>{session.title}</strong>
                              <span className="session-size-badge">{formatBytes(session.size)}</span>
                            </div>
                            <code>{displayPath(session.path, state.homeDir)}</code>
                            <div className="session-meta">
                              <span>{formatIsoDateTime(session.lastTimestamp ?? session.createdAt)}</span>
                              <span>{session.userMessageCount} user / {session.messageCount} messages</span>
                              {session.cwd && <span>{displayPath(session.cwd, state.homeDir)}</span>}
                              {session.cliVersion && <span>codex {session.cliVersion}</span>}
                              {session.modelProvider && <span>{session.modelProvider}</span>}
                            </div>
                            {session.parseError && (
                              <p className="session-parse-error">{session.parseError}</p>
                            )}
                          </div>
                          <div className="session-actions">
                            <button
                              aria-label={deleteLabel}
                              className="small-button"
                              onClick={() => onDelete(session.id)}
                              title={deleteLabel}
                              type="button"
                            >
                              <Trash2 size={14} />
                              {deleting ? "确认删除" : "删除"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div className="empty-state">当前 Codex Home 下没有 session 记录。</div>
        )}
      </div>
    </section>
  );
}

function McpServersPanel({
  state,
  draft,
  savePreviewReady,
  pendingDeleteId,
  onDraftChange,
  onPreview,
  onSave,
  onPreviewDelete,
  onDelete,
}: {
  state: AppState;
  draft: McpServerDraft;
  savePreviewReady: boolean;
  pendingDeleteId: string | null;
  onDraftChange: (draft: McpServerDraft) => void;
  onPreview: () => void;
  onSave: () => void;
  onPreviewDelete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const servers = state.mcpServers.servers;
  const dirty = mcpServerDirty(draft, servers);
  const draftServerId = draft.id || draft.originalId || "new";
  const previewLabel = `预览保存 MCP server ${draftServerId}`;
  const saveLabel = `保存 MCP server ${draftServerId}`;

  function patch(patch: Partial<McpServerDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  return (
    <section className="panel provider-panel" aria-labelledby="mcp-servers-title">
      <div className="panel-heading">
        <FileCode2 size={18} />
        <div>
          <h2 id="mcp-servers-title">MCP servers</h2>
          <p className="muted">管理写入 <code>mcp_servers</code> 的 server 启动配置。</p>
        </div>
        <span className="catalog-count">{servers.length} servers</span>
        <div className="panel-actions">
          <button
            aria-label={previewLabel}
            className="small-button"
            disabled={!state.writable || !dirty}
            onClick={onPreview}
            type="button"
          >
            预览
          </button>
          <button
            aria-label={saveLabel}
            className="primary-button compact"
            disabled={!state.writable || !dirty || !savePreviewReady}
            onClick={onSave}
            type="button"
          >
            保存 server
          </button>
        </div>
      </div>

      <div className="provider-layout">
        <div className="provider-list">
          <button
            aria-label="新建 MCP server"
            className="provider-row new-provider"
            onClick={() => onDraftChange(emptyMcpServerDraft())}
            type="button"
          >
            <Plus size={16} />
            新建 MCP server
          </button>
          {servers.length === 0 ? (
            <div className="empty-state">还没有配置 MCP server。</div>
          ) : (
            servers.map((server) => {
              const enabled = server.enabled !== false;

              return (
                <div
                  className={`provider-row ${draft.originalId === server.id ? "active" : ""}`}
                  key={server.id}
                >
                  <button
                    aria-label={`选择 MCP server ${server.id}`}
                    onClick={() => onDraftChange(draftFromMcpServer(server))}
                    type="button"
                  >
                    <div className="provider-title-row">
                      <strong>{server.id}</strong>
                      <span className={enabled ? "skill-status enabled" : "skill-status"}>
                        {enabled ? "enabled" : "disabled"}
                      </span>
                      {server.hasAdvancedFields && (
                        <span className="kind-badge">advanced fields</span>
                      )}
                    </div>
                    <code>{server.command || "command unset"}</code>
                    <div className="provider-meta">
                      <span>{server.args.length ? server.args.join(" ") : "args unset"}</span>
                      {Object.entries(server.env).map(([key, value]) => (
                        <span key={key}>{key}={value}</span>
                      ))}
                    </div>
                  </button>
                  <div className="provider-row-actions">
                    <button
                      aria-label={`预览删除 MCP server ${server.id}`}
                      className="small-button"
                      disabled={!state.writable}
                      onClick={() => onPreviewDelete(server.id)}
                      title={`预览删除 MCP server ${server.id}`}
                      type="button"
                    >
                      预览删除
                    </button>
                    <button
                      aria-label={`确认删除 MCP server ${server.id}`}
                      className="small-button"
                      disabled={!state.writable || pendingDeleteId !== server.id}
                      onClick={() => onDelete(server.id)}
                      title={`确认删除 MCP server ${server.id}`}
                      type="button"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="provider-form">
          <div className="form-grid two-col">
            <LabeledInput
              label="Server ID"
              value={draft.id}
              placeholder="filesystem"
              onChange={(value) => patch({ id: value })}
            />
            <LabeledInput
              label="Command"
              value={draft.command ?? ""}
              placeholder="npx"
              onChange={(value) => patch({ command: value })}
            />
            <LabeledNumber
              label="Startup timeout ms"
              value={draft.startupTimeoutMs}
              onChange={(value) => patch({ startupTimeoutMs: value })}
            />
            <label className="input-block">
              <span>Enabled</span>
              <select
                className="field-control"
                value={draft.enabled === undefined ? "unset" : String(draft.enabled)}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  patch({
                    enabled:
                      value === "unset"
                        ? undefined
                        : value === "true",
                  });
                }}
              >
                <option value="unset">unset</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          </div>

          <StringListEditor
            label="Args"
            values={draft.args}
            placeholder="@modelcontextprotocol/server-filesystem"
            onChange={(args) => patch({ args })}
          />
          <StringMapEditor
            label="Env"
            values={draft.env}
            onChange={(env) => patch({ env })}
          />
          <p className="muted">
            编辑器会保留当前 server 下未识别的高级字段；删除 server 会移除整个
            <code>mcp_servers.&lt;id&gt;</code> 表。
          </p>
        </div>
      </div>
    </section>
  );
}

function SkillsPanel({
  state,
  query,
  selectedPath,
  content,
  onQueryChange,
  onSelect,
  onSaveToggle,
  onImport,
  importing,
}: {
  state: AppState;
  query: string;
  selectedPath: string | null;
  content: SkillContent | null;
  onQueryChange: (value: string) => void;
  onSelect: (path: string) => void;
  onSaveToggle: (path: string, enabled: boolean) => void;
  onImport: () => void;
  importing: boolean;
}) {
  const normalized = query.trim().toLowerCase();
  const skills = normalized
    ? state.skills.skills.filter((skill) =>
        [skill.name, skill.description, skill.path, skill.source]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
    : state.skills.skills;
  const selectedSkill =
    state.skills.skills.find((skill) => skill.path === selectedPath) ?? skills[0];
  const selectedContent =
    content && content.path === selectedSkill?.path ? content.rawMarkdown : "";
  const resultLabel = normalized
    ? `${skills.length} / ${state.skills.skills.length} skills`
    : `${state.skills.skills.length} skills`;

  return (
    <section className="panel skills-panel" aria-labelledby="global-skills-title">
      <div className="panel-heading skills-heading">
        <BookOpen size={18} />
        <div>
          <h2 id="global-skills-title">全局 Skills</h2>
        </div>
        <span className="catalog-count">{resultLabel}</span>
        <button
          aria-label="新增 skill"
          className="small-button"
          disabled={!state.writable || importing}
          onClick={onImport}
          type="button"
        >
          <Plus size={14} />
          <span>{importing ? "导入中" : "新增 skill"}</span>
        </button>
        <div className="skill-roots">
          {state.skills.roots.map((root) => (
            <span className={root.exists ? "skill-root ok" : "skill-root"} key={root.path}>
              {root.label}: {root.exists ? displayPath(root.path, state.homeDir) : "未找到"}
            </span>
          ))}
        </div>
      </div>

      <div className="skills-layout">
        <div className="skills-list">
          <label className="catalog-search-block">
            <span>搜索全局 skills</span>
            <input
              className="field-control skill-search"
              type="search"
              value={query}
              placeholder="搜索 skill 名称、描述或路径"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </label>
          {skills.length === 0 ? (
            <div className="empty-state">没有发现匹配的全局 skill。</div>
          ) : (
            skills.map((skill) => {
              return (
                <div
                  className={`skill-row ${skill.path === selectedSkill?.path ? "active" : ""}`}
                  key={skill.path}
                >
                  <button
                    aria-label={`选择 skill ${skill.name}`}
                    className="skill-select-button"
                    onClick={() => onSelect(skill.path)}
                    type="button"
                  />
                  <div className="skill-title-line">
                    <Switch
                      aria-label={`${skill.enabled ? "停用" : "启用"} skill ${skill.name}`}
                      checked={skill.enabled}
                      className="small skill-switch-control"
                      disabled={!state.writable}
                      onCheckedChange={(checked) => onSaveToggle(skill.path, checked)}
                    />
                    <span className="skill-name-line">
                      <strong>{skill.name}</strong>
                      {skill.symlink && <span className="skill-link-badge">软链</span>}
                    </span>
                  </div>
                  <code>{displayPath(skill.path, state.homeDir)}</code>
                  {skill.symlink && skill.targetDirectory && (
                    <small className="skill-origin-line">
                      原始位置：{displayPath(skill.targetDirectory, state.homeDir)}
                    </small>
                  )}
                  <small>
                    {skill.source} · {formatBytes(skill.size)}
                    {skill.configured ? " · configured" : ""}
                  </small>
                </div>
              );
            })
          )}
        </div>

        <div className="skill-preview">
          {selectedSkill ? (
            <>
              <div className="skill-preview-heading">
                <div>
                  <h3>{selectedSkill.name}</h3>
                  <p>{displayPath(selectedSkill.directory, state.homeDir)}</p>
                  {selectedSkill.symlink && selectedSkill.targetDirectory && (
                    <p className="skill-origin">
                      原始位置：{displayPath(selectedSkill.targetDirectory, state.homeDir)}
                    </p>
                  )}
                </div>
                <span className={selectedSkill.enabled ? "skill-status enabled" : "skill-status"}>
                  {selectedSkill.enabled ? "enabled" : "disabled"}
                </span>
              </div>
              <pre>{selectedContent || "选择左侧 skill 后会显示 SKILL.md 内容。"}</pre>
              <p className="muted">
                保存启停配置后需要重启 Codex，新状态才会进入下一次 skills 列表。
              </p>
            </>
          ) : (
            <div className="empty-state">没有可预览的 skill。</div>
          )}
        </div>
      </div>
    </section>
  );
}

function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="input-block">
      <span>{label}</span>
      <input
        className="field-control"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="input-block">
      <span>{label}</span>
      <input
        className="field-control"
        min={0}
        type="number"
        value={value ?? ""}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onChange(next === "" ? undefined : Number(next));
        }}
      />
    </label>
  );
}

function StringListEditor({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder?: string;
  onChange: (values: string[]) => void;
}) {
  function updateValue(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function remove(index: number) {
    const next = [...values];
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <div className="map-editor">
      <div className="map-editor-heading">
        <strong>{label}</strong>
        <button className="small-button" onClick={() => onChange([...values, ""])}>
          <Plus size={14} />
          添加
        </button>
      </div>
      {values.length === 0 ? (
        <p className="muted">未设置。</p>
      ) : (
        values.map((value, index) => (
          <div className="list-row" key={`${label}-${index}`}>
            <input
              className="field-control"
              value={value}
              placeholder={placeholder ?? "value"}
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <button className="small-button" onClick={() => remove(index)}>
              删除
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function StringMapEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const rows = Object.entries(values);

  function updateKey(index: number, key: string) {
    const next = [...rows];
    next[index] = [key, next[index]?.[1] ?? ""];
    onChange(Object.fromEntries(next));
  }

  function updateValue(index: number, value: string) {
    const next = [...rows];
    next[index] = [next[index]?.[0] ?? "", value];
    onChange(Object.fromEntries(next));
  }

  function remove(index: number) {
    const next = [...rows];
    next.splice(index, 1);
    onChange(Object.fromEntries(next));
  }

  return (
    <div className="map-editor">
      <div className="map-editor-heading">
        <strong>{label}</strong>
        <button
          className="small-button"
          onClick={() => onChange({ ...values, "": "" })}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">未设置。</p>
      ) : (
        rows.map(([key, value], index) => (
          <div className="map-row" key={`${label}-${index}`}>
            <input
              className="field-control"
              value={key}
              placeholder="key"
              onChange={(event) => updateKey(index, event.currentTarget.value)}
            />
            <input
              className="field-control"
              value={value}
              placeholder="value"
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <button className="small-button" onClick={() => remove(index)}>
              删除
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function FieldCatalog({
  fields,
  query,
  onQueryChange,
}: {
  fields: FieldState[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const normalized = query.trim().toLowerCase();
  const visibleFields = normalized
    ? fields.filter((field) =>
        [field.label, field.path, field.group, field.risk, field.kind]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
    : fields;
  const resultLabel = normalized
    ? `${visibleFields.length} / ${fields.length} 个字段`
    : `${fields.length} 个字段`;

  return (
    <section className="panel catalog-panel" aria-labelledby="field-catalog-title">
      <div className="panel-heading catalog-heading">
        <FileCode2 size={18} />
        <div>
          <h2 id="field-catalog-title">字段目录</h2>
          <p className="muted">所有 bundled schema 字段都可搜索；复杂字段第一期只读。</p>
        </div>
        <span className="catalog-count">{resultLabel}</span>
      </div>
      <label className="catalog-search-block">
        <span>搜索字段目录</span>
        <input
          className="field-control catalog-search"
          type="search"
          value={query}
          placeholder="搜索 label / TOML path / group / risk"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <div className="catalog-list">
        {visibleFields.length === 0 ? (
          <div className="empty-state">没有匹配的 schema 字段。</div>
        ) : (
          visibleFields.map((field) => (
            <div className="catalog-row" key={field.path}>
              <div className="catalog-main">
                <div className="catalog-title-row">
                  <strong>{field.label}</strong>
                  <span className="kind-badge">{field.kind}</span>
                </div>
                <code>{field.path}</code>
                {field.note && <p>{field.note}</p>}
              </div>
              <div className="catalog-badges" aria-label={`${field.label} metadata`}>
                <span className={`risk-badge ${field.risk}`}>{field.risk}</span>
                <span className={field.editable ? "edit-badge editable" : "edit-badge"}>
                  {field.editable ? "editable" : "read-only"}
                </span>
                <span className="kind-badge group-badge">{field.group || "其他"}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ProfileSettingsForm({
  state,
  draftValues,
  dirty,
  previewReady,
  onChange,
  onPreview,
  onSave,
}: {
  state: AppState;
  draftValues: Record<string, string>;
  dirty: boolean;
  previewReady: boolean;
  onChange: (path: string, value: string) => void;
  onPreview: () => void;
  onSave: () => void;
}) {
  const status = state.profileStatus;

  if (!status?.activeProfile) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <FileCode2 size={18} />
          <h2>当前 profile 配置</h2>
        </div>
        <div className="empty-state">
          当前没有 active profile。设置 root 的 <code>profile</code> 后，这里会显示该 profile
          的覆盖配置。
        </div>
      </section>
    );
  }

  return (
    <section className="profile-editor">
      <ProfileStatusNotice status={status} />
      <SettingsForm
        fields={state.profileFields}
        draftValues={draftValues}
        dirty={dirty}
        writable={state.writable}
        title={`当前 profile：${status.activeProfile}`}
        emptyMessage="当前 profile 没有可编辑字段。"
        previewReady={previewReady}
        onChange={onChange}
        onPreview={onPreview}
        onSave={onSave}
      />
    </section>
  );
}

function ProfileStatusNotice({
  status,
}: {
  status: NonNullable<AppState["profileStatus"]>;
}) {
  if (status.exists) {
    return (
      <section className="notice profile-ok">
        <CheckCircle2 size={18} />
        <span>正在编辑 active profile：{status.activeProfile}</span>
      </section>
    );
  }

  return (
    <section className="notice warn">
      <AlertTriangle size={18} />
      <span>
        active profile "{status.activeProfile}" 还没有配置表。保存 profile 配置时会创建它。
      </span>
    </section>
  );
}

function groupFields(fields: FieldState[]) {
  return fields.reduce<{ name: string; fields: FieldState[] }[]>((groups, field) => {
    const name = field.group || "其他";
    const existing = groups.find((group) => group.name === name);

    if (existing) {
      existing.fields.push(field);
    } else {
      groups.push({ name, fields: [field] });
    }

    return groups;
  }, []);
}

function FieldValue({
  field,
  id,
  value,
  onChange,
}: {
  field: FieldState;
  id: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  if (!field.editable) {
    return <span className="value-text">{field.value || "unset"}</span>;
  }

  if (field.kind === "boolean") {
    return (
      <select
        className="field-control compact-control"
        id={id}
        value={value ?? "inherited"}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="inherited">inherited</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (field.kind === "select") {
    return (
      <select
        className="field-control"
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">unset</option>
        {(field.options ?? []).map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "number") {
    return (
      <input
        className="field-control"
        id={id}
        value={value ?? ""}
        placeholder="unset"
        type="number"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }

  return (
    <input
      className="field-control"
      id={id}
      value={value ?? ""}
      placeholder="unset"
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function fieldDisplayValue(field: FieldState) {
  if (field.value === undefined || field.value === "") {
    return "继承 / 未设置";
  }

  return field.value;
}

function sectionTitleId(title: string) {
  return `${slugify(title)}-settings-title`;
}

function fieldControlId(title: string, path: string) {
  return `${slugify(title)}-${slugify(path)}-field`;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || encodeURIComponent(value).replace(/%/g, "").toLowerCase();
}

function ProfileWarnings({ warnings }: { warnings: ProfileWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="notice warn">
      <AlertTriangle size={18} />
      <div>
        <strong>当前 profile 覆盖了全局配置</strong>
        {warnings.map((warning) => (
          <p key={`${warning.profile}-${warning.path}`}>
            {profileWarningText(warning)} 全局：{warning.rootValue ?? "unset"}，profile：{" "}
            {warning.profileValue}.
          </p>
        ))}
      </div>
    </section>
  );
}

function profileWarningText(warning: ProfileWarning) {
  const fieldName =
    warning.path === "features.fast_mode"
      ? "Fast 模式"
      : warning.path === "model"
        ? "模型"
        : fieldLabel(warning.path);

  return `当前 profile "${warning.profile}" 覆盖了全局 ${fieldName}。`;
}

function fieldLabel(path: string) {
  const labels: Record<string, string> = {
    model_provider: "模型提供方",
    oss_provider: "本地模型提供方",
    model_reasoning_effort: "推理强度",
    model_reasoning_summary: "推理摘要",
    model_verbosity: "输出详细度",
    service_tier: "服务层级",
    sandbox_mode: "沙盒模式",
    approval_policy: "审批策略",
    web_search: "网页搜索模式",
    hide_agent_reasoning: "隐藏推理过程",
    show_raw_agent_reasoning: "显示原始推理事件",
  };

  return labels[path] ?? path;
}

function RawToml({
  state,
  draft,
  dirty,
  writable,
  previewReady,
  onChange,
  onPreview,
  onSave,
}: {
  state: AppState;
  draft: string;
  dirty: boolean;
  writable: boolean;
  previewReady: boolean;
  onChange: (value: string) => void;
  onPreview: () => void;
  onSave: () => void;
}) {
  return (
    <section className="panel raw-panel raw-editor-panel" aria-labelledby="raw-toml-title">
      <div className="panel-heading">
        <Edit3 size={18} />
        <div>
          <h2 id="raw-toml-title">高级 TOML 编辑</h2>
          <p className="muted">用于配置字段目录中尚未提供专用控件的复杂配置。</p>
        </div>
        <div className="panel-actions">
          <button
            aria-label="预览原始 TOML"
            className="small-button"
            disabled={!writable || !dirty}
            onClick={onPreview}
            type="button"
          >
            预览
          </button>
          <button
            aria-label="保存原始 TOML"
            className="primary-button compact"
            disabled={!writable || !dirty || !previewReady}
            onClick={onSave}
            type="button"
          >
            保存 TOML
          </button>
        </div>
      </div>
      {state.parseIssue && (
        <div className="inline-error" role="alert">{state.parseIssue.message}</div>
      )}
      <label className="sr-only" htmlFor="raw-toml-editor">原始 TOML</label>
      <textarea
        className="toml-editor"
        id="raw-toml-editor"
        value={draft}
        placeholder="# config.toml 还不存在"
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </section>
  );
}

function DiffPanel({ preview }: { preview: PreviewResult | null }) {
  return (
    <section className="panel raw-panel" aria-labelledby="diff-preview-title">
      <div className="panel-heading">
        <FileCode2 size={18} />
        <h2 id="diff-preview-title">变更预览</h2>
      </div>
      {preview?.fieldDiffs.length ? (
        <div className="field-diff-list">
          {preview.fieldDiffs.map((diff) => (
            <div className="field-diff-row" key={`${diff.scope}-${diff.path}`}>
              <div>
                <strong>{diff.label}</strong>
                <code>{diff.path}</code>
              </div>
              <div className="field-diff-values">
                <span>{diff.before}</span>
                <span>改为</span>
                <strong>{diff.after}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <pre>{preview?.textDiff ?? "预览后会在这里显示 TOML diff。"}</pre>
    </section>
  );
}

function Backups({
  backups,
  backupDir,
  homeDir,
  writable,
  onRestore,
}: {
  backups: BackupSummary[];
  backupDir: string;
  homeDir?: string;
  writable: boolean;
  onRestore: (backupId: string) => void;
}) {
  return (
    <section className="panel backup-panel" aria-labelledby="backups-title">
      <div className="panel-heading">
        <DatabaseBackup size={18} />
        <h2 id="backups-title">备份</h2>
      </div>
      <p className="muted">{displayPath(backupDir, homeDir)}</p>
      {backups.length === 0 ? (
        <div className="empty-state">暂无备份。</div>
      ) : (
        <ul className="backup-list">
          {backups.slice(0, 5).map((backup) => (
            <li key={backup.id}>
              <div>
                <span>{backup.id}</span>
                <small>{formatBytes(backup.size)}</small>
              </div>
              <button
                aria-label={`恢复备份 ${backup.id}`}
                className="small-button"
                disabled={!writable}
                onClick={() => onRestore(backup.id)}
                title={`恢复备份 ${backup.id}`}
                type="button"
              >
                恢复此备份
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export default App;
