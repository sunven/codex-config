import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
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
  fieldChange,
  settingsChanges,
  type FieldState,
} from "./configFieldDrafts";
import {
  FieldCatalog,
  ProfileSettingsForm,
  ProfileWarnings,
  SettingsForm,
} from "./ConfigFieldsWorkspace";
import { FastModeTask, TabBar, type MainTab } from "./AppShell";
import { McpServersPanel, ModelProvidersPanel } from "./ConfigTablesWorkspace";
import { ConfigPreviewSidebar } from "./ConfigPreviewSidebar";
import { displayPath } from "./formatters";
import { SessionsWorkspace } from "./SessionsWorkspace";
import { SkillsWorkspace } from "./SkillsWorkspace";
import { useConfigEditWorkflow } from "./useConfigEditWorkflow";
import { Button } from "./components/ui/button";
import { Notice } from "./components/ui/notice";
import { cn } from "./components/ui/utils";
import "./App.css";

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

  async function updateFieldValue(
    path: string,
    value: string,
    kind: FieldState["kind"],
  ) {
    if (!state) {
      return;
    }

    const field = state.fields.find((item) => item.path === path);
    if (!field || !field.editable) {
      updateDraftValue(path, value);
      return;
    }

    if (kind === "boolean" || kind === "select") {
      const changes = fieldChange(field, value, "root");
      if (changes.length === 0) {
        updateDraftValue(path, value);
        return;
      }

      await configEditWorkflow.runCommit({
        kind: "rootSettings",
        changes,
      });
      return;
    }

    updateDraftValue(path, value);
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

  async function updateProfileFieldValue(
    path: string,
    value: string,
    kind: FieldState["kind"],
  ) {
    if (!state) {
      return;
    }

    const field = state.profileFields.find((item) => item.path === path);
    if (!field || !field.editable) {
      updateProfileDraftValue(path, value);
      return;
    }

    if (kind === "boolean" || kind === "select") {
      const changes = fieldChange(field, value, "profile");
      if (changes.length === 0) {
        updateProfileDraftValue(path, value);
        return;
      }

      await configEditWorkflow.runCommit({
        kind: "profileSettings",
        changes,
      });
      return;
    }

    updateProfileDraftValue(path, value);
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
        </div>
        <Button onClick={loadState} disabled={loading}>
          <RefreshCw size={18} />
          <span>{loading ? "刷新中" : "刷新"}</span>
        </Button>
      </header>

      {error && (
        <Notice role="alert" variant="destructive">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </Notice>
      )}

      {state && (
        <>
          {statusMessage && (
            <Notice className="mb-2" variant="success">
              {statusMessage}
            </Notice>
          )}
          <TabBar activeTab={activeTab} onChange={switchTab} />
          <section
            className={cn("mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-4 max-[940px]:grid-cols-1", (activeTab === "skills" || activeTab === "sessions") && "grid-cols-[minmax(0,1fr)]")}
          >
            {activeTab === "config" ? (
              <>
                <div className="flex min-w-0 flex-col gap-3">
                  <FastModeTask
                    state={state}
                    onPreview={previewFastMode}
                    onSave={saveFastMode}
                  />
                  <SettingsForm
                    fields={state.fields}
                    draftValues={draftValues}
                    dirty={settingsDirty}
                    writable={state.writable}
                    title="全局配置"
                    emptyMessage="config.toml 当前无法解析。请先在右侧原始 TOML 中查看错误，修复后刷新。"
                    onChange={updateFieldValue}
                    onPreview={previewSettings}
                    onSave={saveSettings}
                  />
                  <ModelProvidersPanel
                    state={state}
                    draft={modelProviderDraft}
                    onDraftChange={updateModelProviderDraft}
                    onPreview={previewModelProvider}
                    onSave={saveModelProvider}
                    onDelete={deleteModelProvider}
                  />
                  <ProfileSettingsForm
                    state={state}
                    draftValues={profileDraftValues}
                    dirty={profileSettingsDirty}
                    onChange={updateProfileFieldValue}
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
                    onDraftChange={updateMcpServerDraft}
                    onPreview={previewMcpServer}
                    onSave={saveMcpServer}
                    onDelete={deleteMcpServer}
                  />
                </div>
                <ConfigPreviewSidebar
                  state={state}
                  preview={preview}
                  rawTomlDraft={rawTomlDraft}
                  rawTomlDirty={rawTomlDirty}
                  rawTomlWritable={rawTomlWritable}
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

export default App;
