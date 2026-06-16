import { useEffect, useState } from "react";
import {
  DatabaseBackup,
  Edit3,
  FileCode2,
  Gauge,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type McpServerDraft,
  type ModelProviderDraft,
  type PreviewResult,
} from "./configEditWorkflow";
import {
  type AppState,
  type BackupSummary,
} from "./appState";
import {
  emptyMcpServerDraft,
  emptyModelProviderDraft,
} from "./configTableEntries";
import {
  draftValuesFromFields,
  settingsChanges,
} from "./configFieldDrafts";
import {
  FieldCatalog,
  ProfileSettingsForm,
  ProfileWarnings,
  SettingsForm,
} from "./ConfigFieldsWorkspace";
import { McpServersPanel, ModelProvidersPanel } from "./ConfigTablesWorkspace";
import { displayPath, formatBytes } from "./formatters";
import { SessionsWorkspace } from "./SessionsWorkspace";
import { SkillsWorkspace } from "./SkillsWorkspace";
import { useConfigEditWorkflow } from "./useConfigEditWorkflow";
import "./App.css";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type MainTab = "config" | "sessions" | "mcp" | "skills";

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>("config");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [profileDraftValues, setProfileDraftValues] = useState<Record<string, string>>({});
  const [modelProviderDraft, setModelProviderDraft] =
    useState<ModelProviderDraft>(emptyModelProviderDraft());
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(emptyMcpServerDraft());
  const [rawTomlDraft, setRawTomlDraft] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const configEditWorkflow = useConfigEditWorkflow<AppState>({
    currentState: state,
    onCommitState: applyAppState,
    onError: setError,
    onStatusMessage: setStatusMessage,
  });

  function applyAppState(nextState: AppState) {
    setState(nextState);
    setDraftValues(draftValuesFromFields(nextState.fields));
    setProfileDraftValues(draftValuesFromFields(nextState.profileFields));
    setModelProviderDraft(emptyModelProviderDraft());
    setMcpServerDraft(emptyMcpServerDraft());
    setRawTomlDraft(nextState.rawToml);
    configEditWorkflow.reset();
  }

  async function loadState() {
    setLoading(true);
    setError(null);
    configEditWorkflow.reset();

    try {
      const nextState = await invoke<AppState>("load_state");
      applyAppState(nextState);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function switchTab(tab: MainTab) {
    setActiveTab(tab);
    configEditWorkflow.reset();
    setStatusMessage(null);
  }

  async function previewFastMode() {
    await configEditWorkflow.runPreview({ kind: "fastMode" });
  }

  async function saveFastMode() {
    await configEditWorkflow.runCommit({ kind: "fastMode" });
  }

  async function previewSettings() {
    if (!state) {
      return;
    }

    await configEditWorkflow.runPreview({
      kind: "rootSettings",
      changes: settingsChanges(state.fields, draftValues, "root"),
    });
  }

  async function saveSettings() {
    if (!state) {
      return;
    }

    await configEditWorkflow.runCommit({
      kind: "rootSettings",
      changes: settingsChanges(state.fields, draftValues, "root"),
    });
  }

  function updateDraftValue(path: string, value: string) {
    setDraftValues((current) => ({
      ...current,
      [path]: value,
    }));
    configEditWorkflow.reset({ clearStatus: true });
  }

  async function previewProfileSettings() {
    if (!state) {
      return;
    }

    await configEditWorkflow.runPreview({
      kind: "profileSettings",
      changes: settingsChanges(state.profileFields, profileDraftValues, "profile"),
    });
  }

  async function saveProfileSettings() {
    if (!state) {
      return;
    }

    await configEditWorkflow.runCommit({
      kind: "profileSettings",
      changes: settingsChanges(state.profileFields, profileDraftValues, "profile"),
    });
  }

  function updateProfileDraftValue(path: string, value: string) {
    setProfileDraftValues((current) => ({
      ...current,
      [path]: value,
    }));
    configEditWorkflow.reset({ clearStatus: true });
  }

  async function previewRawToml() {
    await configEditWorkflow.runPreview({
      kind: "rawToml",
      rawToml: rawTomlDraft,
    });
  }

  async function saveRawToml() {
    await configEditWorkflow.runCommit({
      kind: "rawToml",
      rawToml: rawTomlDraft,
    });
  }

  function updateRawTomlDraft(value: string) {
    setRawTomlDraft(value);
    configEditWorkflow.reset({ clearStatus: true });
  }

  function updateModelProviderDraft(draft: ModelProviderDraft) {
    setModelProviderDraft(draft);
    configEditWorkflow.reset({ clearStatus: true });
  }

  function updateMcpServerDraft(draft: McpServerDraft) {
    setMcpServerDraft(draft);
    configEditWorkflow.reset({ clearStatus: true });
  }

  async function previewModelProvider() {
    await configEditWorkflow.runPreview({
      kind: "modelProviderSave",
      draft: modelProviderDraft,
    });
  }

  async function saveModelProvider() {
    await configEditWorkflow.runCommit({
      kind: "modelProviderSave",
      draft: modelProviderDraft,
    });
  }

  async function previewDeleteModelProvider(id: string) {
    await configEditWorkflow.runPreview({
      kind: "modelProviderDelete",
      id,
    });
  }

  async function deleteModelProvider(id: string) {
    await configEditWorkflow.runCommit({
      kind: "modelProviderDelete",
      id,
    });
  }

  async function previewMcpServer() {
    await configEditWorkflow.runPreview({
      kind: "mcpServerSave",
      draft: mcpServerDraft,
    });
  }

  async function saveMcpServer() {
    await configEditWorkflow.runCommit({
      kind: "mcpServerSave",
      draft: mcpServerDraft,
    });
  }

  async function previewDeleteMcpServer(id: string) {
    await configEditWorkflow.runPreview({
      kind: "mcpServerDelete",
      id,
    });
  }

  async function deleteMcpServer(id: string) {
    await configEditWorkflow.runCommit({
      kind: "mcpServerDelete",
      id,
    });
  }

  async function restoreBackup(backupId: string) {
    configEditWorkflow.reset({ clearError: true, clearStatus: true });
    await configEditWorkflow.runCommit({
      kind: "restoreBackup",
      backupId,
    });
  }

  const settingChanges = state ? settingsChanges(state.fields, draftValues, "root") : [];
  const profileSettingChanges = state
    ? settingsChanges(state.profileFields, profileDraftValues, "profile")
    : [];
  const settingsDirty = settingChanges.length > 0;
  const profileSettingsDirty = profileSettingChanges.length > 0;
  const rawTomlDirty = state ? rawTomlDraft !== state.rawToml : false;
  const rawTomlWritable = Boolean(state?.health.codex.found);
  const preview = configEditWorkflow.preview;
  const pendingDeleteProviderId = configEditWorkflow.pendingDeleteProviderId;
  const pendingDeleteServerId = configEditWorkflow.pendingDeleteServerId;

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
                    previewReady={configEditWorkflow.previewReady("fast")}
                  />
                  <SettingsForm
                    fields={state.fields}
                    draftValues={draftValues}
                    dirty={settingsDirty}
                    writable={state.writable}
                    title="全局配置"
                    emptyMessage="config.toml 当前无法解析。请先在右侧原始 TOML 中查看错误，修复后刷新。"
                    previewReady={configEditWorkflow.previewReady("rootSettings")}
                    onChange={updateDraftValue}
                    onPreview={previewSettings}
                    onSave={saveSettings}
                  />
                  <ModelProvidersPanel
                    state={state}
                    draft={modelProviderDraft}
                    savePreviewReady={configEditWorkflow.previewReady("modelProviderSave")}
                    pendingDeleteId={pendingDeleteProviderId}
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
                    previewReady={configEditWorkflow.previewReady("profileSettings")}
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
                    previewReady={configEditWorkflow.previewReady("rawToml")}
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
                <SessionsWorkspace
                  state={state}
                  onStateChange={applyAppState}
                  onError={setError}
                  onStatusMessage={setStatusMessage}
                />
              </div>
            ) : activeTab === "mcp" ? (
              <>
                <div className="flex min-w-0 flex-col gap-3">
                  <McpServersPanel
                    state={state}
                    draft={mcpServerDraft}
                    savePreviewReady={configEditWorkflow.previewReady("mcpServerSave")}
                    pendingDeleteId={pendingDeleteServerId}
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
                    previewReady={configEditWorkflow.previewReady("rawToml")}
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
                <SkillsWorkspace
                  state={state}
                  onStateChange={applyAppState}
                  onError={setError}
                  onStatusMessage={setStatusMessage}
                />
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
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
  previewReady,
}: {
  state: AppState;
  onPreview: () => void;
  onSave: () => void;
  previewReady: boolean;
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
          disabled={!canSave || !previewReady}
          onClick={onSave}
        >
          保存到 config.toml
        </button>
      </div>
    </section>
  );
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

export default App;
