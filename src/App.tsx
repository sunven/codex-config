import { type ReactNode, useEffect, useRef, useState } from "react";
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
import {
  runConfigEditCommit,
  runConfigEditPreview,
  type ConfigEditIntent,
  type ConfigEditPreviewKind,
  type DraftChange,
  type McpServerDraft,
  type ModelProviderDraft,
  type PreviewResult,
  type WorkflowRunOutcome,
} from "./configEditWorkflow";
import {
  draftFromMcpServer,
  draftFromModelProvider,
  emptyMcpServerDraft,
  emptyModelProviderDraft,
  isMcpServerDraftDirty,
  isModelProviderDraftDirty,
  mcpServerDraftId,
  modelProviderDraftId,
} from "./configTableEntries";
import {
  codexSessionBrowserState,
  sessionDeleteLabel,
  toggleCollapsedMonth,
  type CodexSessionSummary,
} from "./codexSessions";
import "./App.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

type SaveResult = {
  backupPath?: string;
  changed: boolean;
  state: AppState;
};

type MainTab = "config" | "sessions" | "mcp" | "skills";

type ApplyAppStateOptions = {
  nextSelectedSkillPath?: string | null;
  clearSkillContent?: boolean;
  clearPendingSessionDelete?: boolean;
};

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewKind, setPreviewKind] = useState<ConfigEditPreviewKind | null>(null);
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

  function applyAppState(nextState: AppState, options: ApplyAppStateOptions = {}) {
    setState(nextState);
    setDraftValues(draftValuesFromFields(nextState.fields));
    setProfileDraftValues(draftValuesFromFields(nextState.profileFields));
    setModelProviderDraft(emptyModelProviderDraft());
    setMcpServerDraft(emptyMcpServerDraft());
    setPendingDeleteProviderId(null);
    setPendingDeleteServerId(null);
    setRawTomlDraft(nextState.rawToml);
    setPreview(null);
    setPreviewKind(null);

    if (options.clearPendingSessionDelete) {
      setPendingDeleteSessionId(null);
    }

    if ("nextSelectedSkillPath" in options) {
      setSelectedSkillPath(options.nextSelectedSkillPath ?? null);
    }

    if (options.clearSkillContent) {
      setSkillContent(null);
    }
  }

  async function loadState() {
    setLoading(true);
    setError(null);
    setPreview(null);
    setPreviewKind(null);

    try {
      const nextState = await invoke<AppState>("load_state");
      applyAppState(nextState, {
        nextSelectedSkillPath: nextState.skills.skills[0]?.path ?? null,
        clearSkillContent: true,
        clearPendingSessionDelete: true,
      });
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

  function clearConfigEditStatus() {
    setError(null);
    setStatusMessage(null);
  }

  function clearConfigEditPreview() {
    setPreview(null);
    setPreviewKind(null);
  }

  function applyConfigEditOutcome(outcome: WorkflowRunOutcome<AppState>) {
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }

    if (outcome.status === "notice") {
      clearConfigEditPreview();
      setStatusMessage(outcome.notice);
      return;
    }

    if (outcome.status === "preview") {
      setPreview(outcome.preview);
      setPreviewKind(outcome.previewKind);
      setPendingDeleteProviderId(outcome.pendingDeleteProviderId);
      setPendingDeleteServerId(outcome.pendingDeleteServerId);
      setStatusMessage(outcome.notice);
      return;
    }

    applyAppState(outcome.state);
    setStatusMessage(outcome.notice);
  }

  async function runPreview(intent: ConfigEditIntent) {
    clearConfigEditStatus();
    applyConfigEditOutcome(await runConfigEditPreview(intent));
  }

  async function runCommit(intent: ConfigEditIntent) {
    setError(null);
    applyConfigEditOutcome(await runConfigEditCommit<AppState>(intent, state?.fileToken));
  }

  async function previewFastMode() {
    await runPreview({ kind: "fastMode" });
  }

  async function saveFastMode() {
    await runCommit({ kind: "fastMode" });
  }

  async function previewSettings() {
    if (!state) {
      return;
    }

    await runPreview({
      kind: "rootSettings",
      changes: settingsChanges(state.fields, draftValues, "root"),
    });
  }

  async function saveSettings() {
    if (!state) {
      return;
    }

    await runCommit({
      kind: "rootSettings",
      changes: settingsChanges(state.fields, draftValues, "root"),
    });
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

    await runPreview({
      kind: "profileSettings",
      changes: settingsChanges(state.profileFields, profileDraftValues, "profile"),
    });
  }

  async function saveProfileSettings() {
    if (!state) {
      return;
    }

    await runCommit({
      kind: "profileSettings",
      changes: settingsChanges(state.profileFields, profileDraftValues, "profile"),
    });
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
    await runPreview({
      kind: "rawToml",
      rawToml: rawTomlDraft,
    });
  }

  async function saveRawToml() {
    await runCommit({
      kind: "rawToml",
      rawToml: rawTomlDraft,
    });
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
    await runPreview({
      kind: "modelProviderSave",
      draft: modelProviderDraft,
    });
  }

  async function saveModelProvider() {
    await runCommit({
      kind: "modelProviderSave",
      draft: modelProviderDraft,
    });
  }

  async function previewDeleteModelProvider(id: string) {
    await runPreview({
      kind: "modelProviderDelete",
      id,
    });
  }

  async function deleteModelProvider(id: string) {
    await runCommit({
      kind: "modelProviderDelete",
      id,
    });
  }

  async function previewMcpServer() {
    await runPreview({
      kind: "mcpServerSave",
      draft: mcpServerDraft,
    });
  }

  async function saveMcpServer() {
    await runCommit({
      kind: "mcpServerSave",
      draft: mcpServerDraft,
    });
  }

  async function previewDeleteMcpServer(id: string) {
    await runPreview({
      kind: "mcpServerDelete",
      id,
    });
  }

  async function deleteMcpServer(id: string) {
    await runCommit({
      kind: "mcpServerDelete",
      id,
    });
  }

  async function restoreBackup(backupId: string) {
    clearConfigEditStatus();
    await runCommit({
      kind: "restoreBackup",
      backupId,
    });
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
      applyAppState(result.state);
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
      applyAppState(result.state, {
        nextSelectedSkillPath: imported?.path ?? result.state.skills.skills[0]?.path ?? null,
        clearSkillContent: true,
      });
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
      applyAppState(nextState, { clearPendingSessionDelete: true });
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
    <main className="min-h-screen p-3">
      <header className="mx-auto mb-5 flex max-w-[1440px] items-start justify-between gap-5 max-[940px]:flex-col max-[940px]:gap-3">
        <div className="min-w-0">
          <h1>Codex 配置</h1>
          <p className="mt-2 max-w-[780px] text-[0.9rem] leading-[1.6] text-[var(--muted-foreground)]">
            管理本机 Codex 配置、MCP servers、profiles 和全局 skills。
          </p>
        </div>
        <button className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[11px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]" onClick={loadState} disabled={loading}>
          <RefreshCw size={18} />
          <span>{loading ? "刷新中" : "刷新"}</span>
        </button>
      </header>

      {error && (
        <section className="mx-auto mb-3 flex max-w-[1440px] min-w-0 items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 [&>div]:min-w-0 [&>span]:min-w-0 [&>span]:break-words border-[#fecaca] bg-[var(--destructive-soft)] text-[#991b1b]" role="alert">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </section>
      )}

      {state && (
        <>
          {statusMessage && <section className="mx-auto mb-3 flex max-w-[1440px] min-w-0 items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 [&>div]:min-w-0 [&>span]:min-w-0 [&>span]:break-words mb-2 border-[#bbf7d0] bg-[var(--success-soft)] text-[var(--success)]">{statusMessage}</section>}
          <TabBar activeTab={activeTab} onChange={switchTab} />
          <section
            className={cx("mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-4 max-[940px]:grid-cols-1", (activeTab === "skills" || activeTab === "sessions") && "grid-cols-[minmax(0,1fr)]")}
          >
            {activeTab === "config" ? (
              <>
                <div className="flex min-w-0 flex-col gap-3">
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
                <div className="flex min-w-0 flex-col gap-3 self-start sticky top-3 max-[940px]:static">
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
              <div className="min-w-0">
                <SessionsPanel
                  state={state}
                  pendingDeleteId={pendingDeleteSessionId}
                  onDelete={deleteSession}
                />
              </div>
            ) : activeTab === "mcp" ? (
              <>
                <div className="flex min-w-0 flex-col gap-3">
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
                <div className="flex min-w-0 flex-col gap-3 self-start sticky top-3 max-[940px]:static">
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
              <div className="min-w-0">
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

function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  return (
    <nav className="mx-auto mb-4 flex max-w-[1440px] gap-2 overflow-x-auto pb-0.5" aria-label="配置区域" role="tablist">
      <button
        aria-selected={activeTab === "config"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "config" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
        onClick={() => onChange("config")}
        role="tab"
        type="button"
      >
        Codex 配置
      </button>
      <button
        aria-selected={activeTab === "sessions"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "sessions" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
        onClick={() => onChange("sessions")}
        role="tab"
        type="button"
      >
        Sessions
      </button>
      <button
        aria-selected={activeTab === "mcp"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "mcp" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
        onClick={() => onChange("mcp")}
        role="tab"
        type="button"
      >
        MCP Servers
      </button>
      <button
        aria-selected={activeTab === "skills"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "skills" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
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
  previewKind: ConfigEditPreviewKind | null;
}) {
  const fastMode = state.fields.find((field) => field.path === "features.fast_mode");
  const value = fastMode?.value ?? "inherited";
  const canSave = state.writable && value !== "true";

  return (
    <section className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 max-[940px]:grid-cols-1">
      <div className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-[var(--secondary)] text-[var(--primary)]">
        <Gauge size={22} />
      </div>
      <div>
        <p className="mb-1 text-[0.75rem] font-medium uppercase text-[var(--muted-foreground)]">
          推荐操作
        </p>
        <h2>开启 Fast 模式</h2>
        <p className="mt-[3px] text-[var(--muted-foreground)]">
          当前全局值是 <strong>{value}</strong>。先预览 TOML 变更，再保存；
          保存前会自动备份。
        </p>
      </div>
      <div className="flex justify-end gap-1.5 max-[940px]:w-full [&>button]:max-[940px]:flex-1">
        <button
          className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[11px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
          aria-label="预览 Fast 模式"
          disabled={!canSave}
          onClick={onPreview}
        >
          预览
        </button>
        <button
          className="ml-auto inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)] px-[11px] text-[var(--primary-foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:border-[#1d4ed8] hover:bg-[#1d4ed8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center"
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby={sectionTitleId(title)}>
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <FileCode2 size={18} />
        <div>
          <h2 id={sectionTitleId(title)}>{title}</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">先预览 TOML diff，再写入 config.toml。</p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <button
            className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
            aria-label={previewLabel}
            disabled={!writable || !dirty}
            onClick={onPreview}
          >
            预览
          </button>
          <button
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)] px-[11px] text-[var(--primary-foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:border-[#1d4ed8] hover:bg-[#1d4ed8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            aria-label={saveLabel}
            disabled={!writable || !dirty || !previewReady}
            onClick={onSave}
          >
            保存到 config.toml
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {fields.length === 0 ? (
          <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">
            {emptyMessage}
          </div>
        ) : (
          groupedFields.map((group) => (
            <section className="flex flex-col gap-0" key={group.name}>
              <h3 className="border-b border-[var(--border)] pb-[5px] text-[0.72rem] font-semibold uppercase text-[var(--muted-foreground)]">{group.name}</h3>
              {group.fields.map((field) => (
                <div className="grid min-h-[68px] grid-cols-[minmax(0,1fr)_minmax(150px,220px)] items-start gap-3.5 border-t border-[var(--border)] py-2.5 first:border-t-0 max-[940px]:grid-cols-1" key={field.path}>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&_label]:mb-0.5 [&_label]:block [&_label]:font-semibold [&_label]:leading-tight [&_label]:text-[var(--foreground)]">
                      <label htmlFor={fieldControlId(title, field.path)}>{field.label}</label>
                      <span className={cx("inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)]", field.risk === "normal" ? "bg-[var(--success-soft)] text-[var(--success)]" : field.risk === "caution" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : field.risk === "experimental" ? "bg-[#eff6ff] text-[var(--primary)]" : "bg-[var(--destructive-soft)] text-[var(--destructive)]")}>{field.risk}</span>
                      <span className={cx("inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)]", field.editable ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--secondary)] text-[var(--secondary-foreground)]")}>
                        {field.editable ? "editable" : "read-only"}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&_code]:max-w-full">
                      <code>{field.path}</code>
                      <span className="inline-flex min-h-6 max-w-full min-w-0 items-center gap-[5px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-[7px] py-0.5 text-[var(--muted-foreground)] [&>span]:whitespace-nowrap [&>span]:text-[0.68rem] [&>span]:font-semibold [&>span]:uppercase [&>strong]:max-w-[220px] [&>strong]:truncate [&>strong]:text-[0.72rem] [&>strong]:font-medium [&>strong]:text-[var(--foreground)]">
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

function TableEntryEditor({
  titleId,
  title,
  description,
  countLabel,
  previewLabel,
  saveLabel,
  saveButtonText,
  writable,
  dirty,
  savePreviewReady,
  onPreview,
  onSave,
  newEntryAriaLabel,
  newEntryText,
  onNewEntry,
  emptyMessage,
  entries,
  form,
}: {
  titleId: string;
  title: string;
  description: ReactNode;
  countLabel: string;
  previewLabel: string;
  saveLabel: string;
  saveButtonText: string;
  writable: boolean;
  dirty: boolean;
  savePreviewReady: boolean;
  onPreview: () => void;
  onSave: () => void;
  newEntryAriaLabel: string;
  newEntryText: string;
  onNewEntry: () => void;
  emptyMessage: string;
  entries: ReactNode;
  form: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby={titleId}>
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <FileCode2 size={18} />
        <div>
          <h2 id={titleId}>{title}</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">{description}</p>
        </div>
        <span className="inline-flex min-h-6 flex-none items-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[0.72rem] font-bold text-[var(--secondary-foreground)]">{countLabel}</span>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <button
            aria-label={previewLabel}
            className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
            disabled={!writable || !dirty}
            onClick={onPreview}
            type="button"
          >
            预览
          </button>
          <button
            aria-label={saveLabel}
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)] px-[11px] text-[var(--primary-foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:border-[#1d4ed8] hover:bg-[#1d4ed8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            disabled={!writable || !dirty || !savePreviewReady}
            onClick={onSave}
            type="button"
          >
            {saveButtonText}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(240px,0.34fr)_minmax(0,1fr)] gap-3 max-[940px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <button
            aria-label={newEntryAriaLabel}
            className="flex w-full min-w-0 flex-row items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 text-left font-bold text-[var(--foreground)]"
            onClick={onNewEntry}
            type="button"
          >
            <Plus size={16} />
            {newEntryText}
          </button>
          {entries ? entries : <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">{emptyMessage}</div>}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">{form}</div>
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
  const dirty = isModelProviderDraftDirty(draft, providers);
  const draftProviderId = modelProviderDraftId(draft);
  const previewLabel = `预览保存 provider ${draftProviderId}`;
  const saveLabel = `保存 provider ${draftProviderId}`;

  function patch(patch: Partial<ModelProviderDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  const entries =
    providers.length > 0
      ? providers.map((provider) => {
          const providerName = provider.name || provider.id;
          const reserved = state.modelProviders.reservedIds.includes(provider.id);

          return (
            <div className={cx("flex w-full min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 text-left text-[var(--foreground)]", draft.originalId === provider.id && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.16)]")} key={provider.id}>
              <button
                aria-label={`选择 provider ${providerName}`}
                className="flex w-full min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left text-inherit"
                onClick={() => onDraftChange(draftFromModelProvider(provider))}
                type="button"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-[5px] [&>strong]:min-w-0 [&>strong]:break-words">
                  <strong>{providerName}</strong>
                  <span className={cx("inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)]", !reserved ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--secondary)] text-[var(--secondary-foreground)]")}>
                    {reserved ? "built-in" : "custom"}
                  </span>
                  {provider.hasAdvancedFields && (
                    <span className="inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)] bg-[var(--secondary)] text-[var(--muted-foreground)]">advanced fields</span>
                  )}
                </div>
                <code>{provider.id}</code>
                <div className="flex min-w-0 flex-col gap-0.5 text-[var(--muted-foreground)] [&>span]:break-words [&>span]:text-[0.78rem] [&>span]:text-[var(--muted-foreground)]">
                  {provider.baseUrl && <span>{provider.baseUrl}</span>}
                  {provider.envKey && <span>{provider.envKey}</span>}
                  {provider.wireApi && <span>{provider.wireApi}</span>}
                </div>
              </button>
              <div className="flex flex-wrap gap-[5px]">
                <button
                  aria-label={`预览删除 provider ${provider.id}`}
                  className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
                  disabled={!state.writable || reserved}
                  onClick={() => onPreviewDelete(provider.id)}
                  title={reserved ? "内置 provider 不能删除" : `预览删除 provider ${provider.id}`}
                  type="button"
                >
                  预览删除
                </button>
                <button
                  aria-label={`确认删除 provider ${provider.id}`}
                  className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
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
      : null;

  return (
    <TableEntryEditor
      titleId="model-providers-title"
      title="Model providers"
      description={<>管理写入 <code>model_providers</code> 的自定义 provider。</>}
      countLabel={`${providers.length} providers`}
      previewLabel={previewLabel}
      saveLabel={saveLabel}
      saveButtonText="保存 provider"
      writable={state.writable}
      dirty={dirty}
      savePreviewReady={savePreviewReady}
      onPreview={onPreview}
      onSave={onSave}
      newEntryAriaLabel="新建 model provider"
      newEntryText="新建 provider"
      onNewEntry={() => onDraftChange(emptyModelProviderDraft())}
      emptyMessage="还没有自定义 model provider。"
      entries={entries}
      form={
        <>
          <div className="grid gap-2 grid-cols-2 max-[940px]:grid-cols-1">
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
            <label className="flex min-w-0 flex-col gap-[3px] [&>span]:text-[0.76rem] [&>span]:font-bold [&>span]:text-[var(--muted-foreground)]">
              <span>Wire API</span>
              <select
                className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
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

          <div className="grid gap-2 grid-cols-3 max-[940px]:grid-cols-1">
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

          <div className="flex flex-wrap gap-2.5">
            <label className="inline-flex items-center gap-1.5 text-[0.88rem] text-[var(--foreground)]">
              <input
                checked={draft.requiresOpenaiAuth ?? false}
                type="checkbox"
                onChange={(event) => patch({ requiresOpenaiAuth: event.currentTarget.checked })}
              />
              requires_openai_auth
            </label>
            <label className="inline-flex items-center gap-1.5 text-[0.88rem] text-[var(--foreground)]">
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

          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
            内置 provider ID 保留不可覆盖：{state.modelProviders.reservedIds.join(", ")}。
          </p>
        </>
      }
    />
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
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const {
    years: sessionYears,
    selectedYearKey,
    selectedYear,
    totalSessionSize,
  } = codexSessionBrowserState(sessions, activeYear);

  function toggleMonth(monthKey: string) {
    setCollapsedMonths((current) => toggleCollapsedMonth(current, monthKey));
  }

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="codex-sessions-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-3 border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <BookOpen size={18} />
        <div>
          <h2 id="codex-sessions-title">Codex sessions</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
            {displayPath(state.codexSessions.sessionsDir, state.homeDir)}
          </p>
        </div>
        {sessionYears.length > 0 && (
          <div className="flex min-h-[42px] min-w-0 flex-auto items-center justify-center gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Session years">
            {sessionYears.map((year) => (
              <button
                aria-selected={year.key === selectedYearKey}
                className={cx("flex min-h-[54px] min-w-[146px] flex-none cursor-pointer flex-col items-start gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-2.5 py-[7px] text-left text-[var(--foreground)] [&_strong]:text-[0.88rem] [&_strong]:text-[var(--foreground)] [&_span]:whitespace-nowrap [&_span]:text-[0.74rem] [&_span]:text-[var(--muted-foreground)]", year.key === selectedYearKey && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.14)]")}
                key={year.key}
                onClick={() => setActiveYear(year.key)}
                role="tab"
                type="button"
              >
                <strong>{year.label}</strong>
                <span className="flex gap-2.5">
                  <span>{year.sessionCount} sessions</span>
                  <span>{formatBytes(year.totalSize)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto grid flex-none grid-cols-2 gap-3.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1.5 max-[940px]:ml-0 max-[940px]:w-full max-[940px]:grid-cols-1 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-px [&_span]:text-[0.68rem] [&_span]:font-bold [&_span]:uppercase [&_span]:text-[var(--muted-foreground)] [&_strong]:whitespace-nowrap [&_strong]:text-[0.88rem]">
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
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)] mb-2.5 mt-0">
          删除会移除对应的 <code>.jsonl</code> 会话文件，不会修改 <code>config.toml</code>。
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-3.5">
        {sessions.length === 0 ? (
          <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">当前 Codex Home 下没有 session 记录。</div>
        ) : selectedYear ? (
          selectedYear.months.map((group) => {
            const isCollapsed = collapsedMonths[group.key] ?? false;

            return (
              <section className="flex min-w-0 flex-col gap-[7px]" key={group.key}>
                <button
                  aria-expanded={!isCollapsed}
                  className="flex w-full cursor-pointer items-center justify-between gap-2.5 border-x-0 border-t-0 border-b border-[var(--border)] bg-transparent px-0.5 pb-[7px] pt-0 text-left text-inherit focus-visible:rounded-[var(--radius)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(37,99,235,0.32)] [&>strong]:whitespace-nowrap [&>strong]:text-[0.78rem] [&>strong]:text-[var(--muted-foreground)] [&_span]:text-[0.76rem] [&_span]:text-[var(--muted-foreground)]"
                  onClick={() => toggleMonth(group.key)}
                  type="button"
                >
                  <span className="inline-flex flex-none text-[var(--muted-foreground)]" aria-hidden="true">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3>{group.label}</h3>
                    <span>{group.sessions.length} sessions</span>
                  </div>
                  <strong>{formatBytes(group.totalSize)}</strong>
                </button>
                {!isCollapsed && (
                  <div className="flex min-w-0 flex-col gap-2">
                    {group.sessions.map((session) => {
                      const deleting = pendingDeleteId === session.id;
                      const deleteLabel = sessionDeleteLabel(session, pendingDeleteId);

                      return (
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2.5 text-left text-[var(--foreground)] max-[940px]:grid-cols-1" key={session.id}>
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex min-w-0 items-center justify-between gap-2 [&>strong]:break-words [&>strong]:text-[var(--foreground)]">
                              <strong>{session.title}</strong>
                              <span className="inline-flex min-w-16 flex-none items-center justify-center self-start whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--secondary)] px-[9px] py-1 text-[0.72rem] font-extrabold leading-[1.1] text-[var(--secondary-foreground)]">{formatBytes(session.size)}</span>
                            </div>
                            <code>{displayPath(session.path, state.homeDir)}</code>
                            <div className="flex flex-wrap gap-1.5 text-[0.78rem] text-[var(--muted-foreground)] [&>span]:break-words">
                              <span>{formatIsoDateTime(session.lastTimestamp ?? session.createdAt)}</span>
                              <span>{session.userMessageCount} user / {session.messageCount} messages</span>
                              {session.cwd && <span>{displayPath(session.cwd, state.homeDir)}</span>}
                              {session.cliVersion && <span>codex {session.cliVersion}</span>}
                              {session.modelProvider && <span>{session.modelProvider}</span>}
                            </div>
                            {session.parseError && (
                              <p className="text-[0.8rem] text-[var(--destructive)]">{session.parseError}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap justify-end gap-[5px]">
                            <button
                              aria-label={deleteLabel}
                              className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
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
          <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">当前 Codex Home 下没有 session 记录。</div>
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
  const dirty = isMcpServerDraftDirty(draft, servers);
  const draftServerId = mcpServerDraftId(draft);
  const previewLabel = `预览保存 MCP server ${draftServerId}`;
  const saveLabel = `保存 MCP server ${draftServerId}`;

  function patch(patch: Partial<McpServerDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  const entries =
    servers.length > 0
      ? servers.map((server) => {
          const enabled = server.enabled !== false;

          return (
            <div className={cx("flex w-full min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 text-left text-[var(--foreground)]", draft.originalId === server.id && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.16)]")} key={server.id}>
              <button
                aria-label={`选择 MCP server ${server.id}`}
                className="flex w-full min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left text-inherit"
                onClick={() => onDraftChange(draftFromMcpServer(server))}
                type="button"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-[5px] [&>strong]:min-w-0 [&>strong]:break-words">
                  <strong>{server.id}</strong>
                  <span className={cx("self-start rounded-full border border-[var(--border)] bg-[var(--secondary)] px-[7px] py-0.5 text-[0.68rem] font-extrabold uppercase text-[var(--secondary-foreground)]", enabled && "border-[#bbf7d0] bg-[var(--success-soft)] text-[var(--success)]")}>
                    {enabled ? "enabled" : "disabled"}
                  </span>
                  {server.hasAdvancedFields && (
                    <span className="inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)] bg-[var(--secondary)] text-[var(--muted-foreground)]">advanced fields</span>
                  )}
                </div>
                <code>{server.command || "command unset"}</code>
                <div className="flex min-w-0 flex-col gap-0.5 text-[var(--muted-foreground)] [&>span]:break-words [&>span]:text-[0.78rem] [&>span]:text-[var(--muted-foreground)]">
                  <span>{server.args.length ? server.args.join(" ") : "args unset"}</span>
                  {Object.entries(server.env).map(([key, value]) => (
                    <span key={key}>{key}={value}</span>
                  ))}
                </div>
              </button>
              <div className="flex flex-wrap gap-[5px]">
                <button
                  aria-label={`预览删除 MCP server ${server.id}`}
                  className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
                  disabled={!state.writable}
                  onClick={() => onPreviewDelete(server.id)}
                  title={`预览删除 MCP server ${server.id}`}
                  type="button"
                >
                  预览删除
                </button>
                <button
                  aria-label={`确认删除 MCP server ${server.id}`}
                  className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
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
      : null;

  return (
    <TableEntryEditor
      titleId="mcp-servers-title"
      title="MCP servers"
      description={<>管理写入 <code>mcp_servers</code> 的 server 启动配置。</>}
      countLabel={`${servers.length} servers`}
      previewLabel={previewLabel}
      saveLabel={saveLabel}
      saveButtonText="保存 server"
      writable={state.writable}
      dirty={dirty}
      savePreviewReady={savePreviewReady}
      onPreview={onPreview}
      onSave={onSave}
      newEntryAriaLabel="新建 MCP server"
      newEntryText="新建 MCP server"
      onNewEntry={() => onDraftChange(emptyMcpServerDraft())}
      emptyMessage="还没有配置 MCP server。"
      entries={entries}
      form={
        <>
          <div className="grid gap-2 grid-cols-2 max-[940px]:grid-cols-1">
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
            <label className="flex min-w-0 flex-col gap-[3px] [&>span]:text-[0.76rem] [&>span]:font-bold [&>span]:text-[var(--muted-foreground)]">
              <span>Enabled</span>
              <select
                className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
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
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
            编辑器会保留当前 server 下未识别的高级字段；删除 server 会移除整个
            <code>mcp_servers.&lt;id&gt;</code> 表。
          </p>
        </>
      }
    />
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="global-skills-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0 flex-wrap items-center [&>div]:min-w-0">
        <BookOpen size={18} />
        <div>
          <h2 id="global-skills-title">全局 Skills</h2>
        </div>
        <span className="inline-flex min-h-6 flex-none items-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[0.72rem] font-bold text-[var(--secondary-foreground)]">{resultLabel}</span>
        <button
          aria-label="新增 skill"
          className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
          disabled={!state.writable || importing}
          onClick={onImport}
          type="button"
        >
          <Plus size={14} />
          <span>{importing ? "导入中" : "新增 skill"}</span>
        </button>
        <div className="ml-2 flex min-w-0 flex-[1_1_360px] flex-wrap gap-[5px]">
          {state.skills.roots.map((root) => (
            <span
              className={cx("max-w-full break-words rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-[3px] text-[0.72rem] font-bold text-[var(--secondary-foreground)]", root.label.toLowerCase().includes("agent") ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]", !root.exists && "border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)]")}
              key={root.path}
            >
              {root.label}: {root.exists ? displayPath(root.path, state.homeDir) : "未找到"}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(240px,0.42fr)_minmax(0,0.58fr)] gap-3 max-[940px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="mb-2 flex min-w-0 flex-col gap-[5px] [&>span]:text-[0.74rem] [&>span]:font-semibold [&>span]:text-[var(--muted-foreground)]">
            <span>搜索全局 skills</span>
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              type="search"
              value={query}
              placeholder="搜索 skill 名称、描述或路径"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </label>
          {skills.length === 0 ? (
            <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">没有发现匹配的全局 skill。</div>
          ) : (
            skills.map((skill) => {
              return (
                <div
                  className={cx("relative flex min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] py-2.5 pl-3 pr-[84px]", skill.source.toLowerCase().includes("agent") ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#bfdbfe] bg-[#eff6ff]", skill.path === selectedSkill?.path && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.24)]")}
                  key={skill.path}
                >
                  <button
                    aria-label={`选择 skill ${skill.name}`}
                    className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0"
                    onClick={() => onSelect(skill.path)}
                    type="button"
                  />
                  <span className="absolute right-3 top-2.5 z-[1] inline-flex min-w-16 items-center justify-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--card)] px-[9px] py-1 text-[0.72rem] font-extrabold leading-[1.1] text-[var(--secondary-foreground)]">{formatBytes(skill.size)}</span>
                  <div className="relative z-[1] flex min-w-0 items-start gap-[7px]">
                    <Switch
                      aria-label={`${skill.enabled ? "停用" : "启用"} skill ${skill.name}`}
                      checked={skill.enabled}
                      className="z-[2] flex-none"
                      disabled={!state.writable}
                      onCheckedChange={(checked) => onSaveToggle(skill.path, checked)}
                      size="sm"
                    />
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 [&>strong]:text-[var(--foreground)]">
                      <strong>{skill.name}</strong>
                      {skill.symlink && <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-[7px] py-[3px] text-[0.68rem] font-extrabold leading-none text-[var(--primary)]">软链</span>}
                    </span>
                  </div>
                  <code>{displayPath(skill.path, state.homeDir)}</code>
                  {skill.symlink && skill.targetDirectory && (
                    <small className="relative z-[1] break-words text-[0.74rem] font-bold text-[var(--foreground)]">
                      原始位置：{displayPath(skill.targetDirectory, state.homeDir)}
                    </small>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2">
          {selectedSkill ? (
            <>
              <div className="flex min-w-0 items-start justify-between gap-2 [&_p]:mt-[3px] [&_p]:break-words [&_p]:text-[0.72rem] [&_p]:text-[var(--muted-foreground)]">
                <div>
                  <h3>{selectedSkill.name}</h3>
                  <p>{displayPath(selectedSkill.directory, state.homeDir)}</p>
                  {selectedSkill.symlink && selectedSkill.targetDirectory && (
                    <p className="font-semibold text-[var(--foreground)]">
                      原始位置：{displayPath(selectedSkill.targetDirectory, state.homeDir)}
                    </p>
                  )}
                </div>
                <span className={cx("self-start rounded-full border border-[var(--border)] bg-[var(--secondary)] px-[7px] py-0.5 text-[0.68rem] font-extrabold uppercase text-[var(--secondary-foreground)]", selectedSkill.enabled && "border-[#bbf7d0] bg-[var(--success-soft)] text-[var(--success)]")}>
                  {selectedSkill.enabled ? "enabled" : "disabled"}
                </span>
              </div>
              <pre className="m-0 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-[var(--code-background)] p-2.5 text-[0.76rem] leading-[1.42] text-[var(--code-foreground)]">{selectedContent || "选择左侧 skill 后会显示 SKILL.md 内容。"}</pre>
              <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
                保存启停配置后需要重启 Codex，新状态才会进入下一次 skills 列表。
              </p>
            </>
          ) : (
            <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">没有可预览的 skill。</div>
          )}
        </div>
      </div>
    </section>
  );
}function LabeledInput({
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
    <label className="flex min-w-0 flex-col gap-[3px] [&>span]:text-[0.76rem] [&>span]:font-bold [&>span]:text-[var(--muted-foreground)]">
      <span>{label}</span>
      <input
        className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
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
    <label className="flex min-w-0 flex-col gap-[3px] [&>span]:text-[0.76rem] [&>span]:font-bold [&>span]:text-[var(--muted-foreground)]">
      <span>{label}</span>
      <input
        className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
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
    <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
      <div className="flex items-center justify-between gap-1.5 [&>strong]:text-[0.76rem] [&>strong]:font-bold [&>strong]:text-[var(--muted-foreground)]">
        <strong>{label}</strong>
        <button className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]" onClick={() => onChange([...values, ""])}>
          <Plus size={14} />
          添加
        </button>
      </div>
      {values.length === 0 ? (
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">未设置。</p>
      ) : (
        values.map((value, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 max-[940px]:grid-cols-1" key={`${label}-${index}`}>
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              value={value}
              placeholder={placeholder ?? "value"}
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <button className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]" onClick={() => remove(index)}>
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
    <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
      <div className="flex items-center justify-between gap-1.5 [&>strong]:text-[0.76rem] [&>strong]:font-bold [&>strong]:text-[var(--muted-foreground)]">
        <strong>{label}</strong>
        <button
          className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
          onClick={() => onChange({ ...values, "": "" })}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">未设置。</p>
      ) : (
        rows.map(([key, value], index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 max-[940px]:grid-cols-1" key={`${label}-${index}`}>
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              value={key}
              placeholder="key"
              onChange={(event) => updateKey(index, event.currentTarget.value)}
            />
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              value={value}
              placeholder="value"
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <button className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]" onClick={() => remove(index)}>
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 max-h-[460px] overflow-hidden" aria-labelledby="field-catalog-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0 items-start gap-2.5 [&>div]:min-w-0">
        <FileCode2 size={18} />
        <div>
          <h2 id="field-catalog-title">字段目录</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">所有 bundled schema 字段都可搜索；复杂字段第一期只读。</p>
        </div>
        <span className="inline-flex min-h-6 flex-none items-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[0.72rem] font-bold text-[var(--secondary-foreground)]">{resultLabel}</span>
      </div>
      <label className="mb-2 flex min-w-0 flex-col gap-[5px] [&>span]:text-[0.74rem] [&>span]:font-semibold [&>span]:text-[var(--muted-foreground)]">
        <span>搜索字段目录</span>
        <input
          className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
          type="search"
          value={query}
          placeholder="搜索 label / TOML path / group / risk"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <div className="flex max-h-[336px] flex-col gap-1.5 overflow-auto pr-1">
        {visibleFields.length === 0 ? (
          <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">没有匹配的 schema 字段。</div>
        ) : (
          visibleFields.map((field) => (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2.5 max-[940px]:grid-cols-1" key={field.path}>
              <div className="flex min-w-0 flex-col gap-[5px]">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&>strong]:min-w-0 [&>strong]:break-words [&>strong]:text-[var(--foreground)]">
                  <strong>{field.label}</strong>
                  <span className="inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)] bg-[var(--secondary)] text-[var(--muted-foreground)]">{field.kind}</span>
                </div>
                <code>{field.path}</code>
                {field.note && <p className="mt-0 break-words text-[0.8rem] leading-[1.45] text-[var(--muted-foreground)]">{field.note}</p>}
              </div>
              <div className="flex max-w-[180px] flex-col flex-wrap items-end justify-start gap-1 max-[940px]:max-w-none max-[940px]:items-start" aria-label={`${field.label} metadata`}>
                <span className={cx("inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)]", field.risk === "normal" ? "bg-[var(--success-soft)] text-[var(--success)]" : field.risk === "caution" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : field.risk === "experimental" ? "bg-[#eff6ff] text-[var(--primary)]" : "bg-[var(--destructive-soft)] text-[var(--destructive)]")}>{field.risk}</span>
                <span className={cx("inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)]", field.editable ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--secondary)] text-[var(--secondary-foreground)]")}>
                  {field.editable ? "editable" : "read-only"}
                </span>
                <span className="inline-flex min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[var(--border)] px-[7px] py-0.5 text-center text-[0.72rem] font-bold text-[var(--muted-foreground)] bg-[var(--secondary)] text-[var(--muted-foreground)]">{field.group || "其他"}</span>
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
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
          <FileCode2 size={18} />
          <h2>当前 profile 配置</h2>
        </div>
        <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">
          当前没有 active profile。设置 root 的 <code>profile</code> 后，这里会显示该 profile
          的覆盖配置。
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
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
      <section className="mx-auto mb-3 flex max-w-[1440px] min-w-0 items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 [&>div]:min-w-0 [&>span]:min-w-0 [&>span]:break-words mb-2 border-[#bbf7d0] bg-[var(--success-soft)] text-[var(--success)]">
        <CheckCircle2 size={18} />
        <span>正在编辑 active profile：{status.activeProfile}</span>
      </section>
    );
  }

  return (
    <section className="mx-auto mb-3 flex max-w-[1440px] min-w-0 items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 [&>div]:min-w-0 [&>span]:min-w-0 [&>span]:break-words border-[#fde68a] bg-[var(--warning-soft)] text-[#713f12]">
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
    return <span className="inline-flex min-w-[72px] justify-center rounded-full bg-[var(--muted)] px-2 py-1 font-bold text-[var(--muted-foreground)] justify-self-end max-[940px]:justify-self-stretch">{field.value || "unset"}</span>;
  }

  if (field.kind === "boolean") {
    return (
      <select
        className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-[132px]"
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
        className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none"
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
        className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none"
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
      className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none"
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
    <section className="mx-auto mb-3 flex max-w-[1440px] min-w-0 items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 [&>div]:min-w-0 [&>span]:min-w-0 [&>span]:break-words border-[#fde68a] bg-[var(--warning-soft)] text-[#713f12]">
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="raw-toml-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <Edit3 size={18} />
        <div>
          <h2 id="raw-toml-title">高级 TOML 编辑</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">用于配置字段目录中尚未提供专用控件的复杂配置。</p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <button
            aria-label="预览原始 TOML"
            className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
            disabled={!writable || !dirty}
            onClick={onPreview}
            type="button"
          >
            预览
          </button>
          <button
            aria-label="保存原始 TOML"
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)] px-[11px] text-[var(--primary-foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:border-[#1d4ed8] hover:bg-[#1d4ed8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            disabled={!writable || !dirty || !previewReady}
            onClick={onSave}
            type="button"
          >
            保存 TOML
          </button>
        </div>
      </div>
      {state.parseIssue && (
        <div className="mb-2 rounded-[var(--radius)] border border-[#fecaca] bg-[var(--destructive-soft)] p-2 text-[#991b1b]" role="alert">{state.parseIssue.message}</div>
      )}
      <label className="sr-only" htmlFor="raw-toml-editor">原始 TOML</label>
      <textarea
        className="min-h-80 w-full resize-y rounded-[var(--radius)] border border-[#3f3f46] bg-[var(--code-background)] p-2.5 text-[0.78rem] leading-[1.4] text-[var(--code-foreground)] outline-none [tab-size:2] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)]"
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="diff-preview-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <FileCode2 size={18} />
        <h2 id="diff-preview-title">变更预览</h2>
      </div>
      {preview?.fieldDiffs.length ? (
        <div className="mb-2 flex flex-col gap-1.5">
          {preview.fieldDiffs.map((diff) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 max-[940px]:grid-cols-1 [&>div:first-child]:flex [&>div:first-child]:min-w-0 [&>div:first-child]:flex-col [&>div:first-child]:gap-[3px]" key={`${diff.scope}-${diff.path}`}>
              <div>
                <strong>{diff.label}</strong>
                <code>{diff.path}</code>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 max-[940px]:justify-start [&>span]:rounded-[var(--radius)] [&>span]:border [&>span]:border-[var(--border)] [&>span]:bg-[var(--card)] [&>span]:px-1.5 [&>span]:py-[3px] [&>span]:text-[0.78rem] [&>span]:text-[var(--foreground)] [&>strong]:rounded-[var(--radius)] [&>strong]:border [&>strong]:border-[#bbf7d0] [&>strong]:bg-[var(--success-soft)] [&>strong]:px-1.5 [&>strong]:py-[3px] [&>strong]:text-[0.78rem] [&>strong]:text-[var(--success)]">
                <span>{diff.before}</span>
                <span className="!border-0 !bg-transparent !p-0 !text-[var(--muted-foreground)]">改为</span>
                <strong>{diff.after}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-[var(--code-background)] p-2.5 text-[0.78rem] leading-[1.4] text-[var(--code-foreground)]">{preview?.textDiff ?? "预览后会在这里显示 TOML diff。"}</pre>
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="backups-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <DatabaseBackup size={18} />
        <h2 id="backups-title">备份</h2>
      </div>
      <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">{displayPath(backupDir, homeDir)}</p>
      {backups.length === 0 ? (
        <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">暂无备份。</div>
      ) : (
        <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
          {backups.slice(0, 5).map((backup) => (
            <li className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2" key={backup.id}>
              <div className="flex min-w-0 flex-col gap-px [&>span]:break-words [&>span]:text-[0.8rem] [&>small]:text-[var(--muted-foreground)]">
                <span>{backup.id}</span>
                <small>{formatBytes(backup.size)}</small>
              </div>
              <button
                aria-label={`恢复备份 ${backup.id}`}
                className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
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
