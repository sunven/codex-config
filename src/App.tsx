import { useEffect, useState } from "react";
import { Gauge, RefreshCw, ShieldAlert } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type McpServerDraft,
  type ModelProviderDraft,
} from "./configEditWorkflow";
import { type AppState } from "./appState";
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
import { ConfigPreviewSidebar } from "./ConfigPreviewSidebar";
import { displayPath } from "./formatters";
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
                <ConfigPreviewSidebar
                  state={state}
                  preview={preview}
                  rawTomlDraft={rawTomlDraft}
                  rawTomlDirty={rawTomlDirty}
                  rawTomlWritable={rawTomlWritable}
                  rawTomlPreviewReady={configEditWorkflow.previewReady("rawToml")}
                  onRawTomlChange={updateRawTomlDraft}
                  onPreviewRawToml={previewRawToml}
                  onSaveRawToml={saveRawToml}
                  onRestoreBackup={restoreBackup}
                />
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
                <ConfigPreviewSidebar
                  state={state}
                  preview={preview}
                  rawTomlDraft={rawTomlDraft}
                  rawTomlDirty={rawTomlDirty}
                  rawTomlWritable={rawTomlWritable}
                  rawTomlPreviewReady={configEditWorkflow.previewReady("rawToml")}
                  onRawTomlChange={updateRawTomlDraft}
                  onPreviewRawToml={previewRawToml}
                  onSaveRawToml={saveRawToml}
                  onRestoreBackup={restoreBackup}
                />
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

export default App;
