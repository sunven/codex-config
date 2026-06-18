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
  settingsChanges,
  type FieldState,
} from "./configFieldDrafts";
import { SettingsForm } from "./ConfigFieldsWorkspace";
import { TabBar, type MainTab } from "./AppShell";
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
  const [modelProviderDraft, setModelProviderDraft] =
    useState<ModelProviderDraft>(emptyModelProviderDraft());
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(emptyMcpServerDraft());
  const [rawTomlDraft, setRawTomlDraft] = useState("");
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

  function updateFieldValue(
    path: string,
    value: string,
    _kind: FieldState["kind"],
  ) {
    updateDraftValue(path, value);
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

  const settingChanges = state ? settingsChanges(state.fields, draftValues, "root") : [];
  const settingsDirty = settingChanges.length > 0;
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
                  <SettingsForm
                    fields={state.fields}
                    draftValues={draftValues}
                    dirty={settingsDirty}
                    writable={state.writable}
                    title="全局配置"
                    emptyMessage="config.toml 当前无法解析。请先在右侧原始 TOML 中查看错误，修复后刷新。"
                    onChange={updateFieldValue}
                    onSave={saveSettings}
                  />
                  <ModelProvidersPanel
                    state={state}
                    draft={modelProviderDraft}
                    onDraftChange={updateModelProviderDraft}
                    onSave={saveModelProvider}
                    onDelete={deleteModelProvider}
                  />
                </div>
                <ConfigPreviewSidebar
                  state={state}
                  rawTomlDraft={rawTomlDraft}
                  rawTomlDirty={rawTomlDirty}
                  rawTomlWritable={rawTomlWritable}
                  onRawTomlChange={updateRawTomlDraft}
                  onSaveRawToml={saveRawToml}
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
                    onSave={saveMcpServer}
                    onDelete={deleteMcpServer}
                  />
                </div>
                <ConfigPreviewSidebar
                  state={state}
                  rawTomlDraft={rawTomlDraft}
                  rawTomlDirty={rawTomlDirty}
                  rawTomlWritable={rawTomlWritable}
                  onRawTomlChange={updateRawTomlDraft}
                  onSaveRawToml={saveRawToml}
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
