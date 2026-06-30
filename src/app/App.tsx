import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import {
  type McpServerDraft,
  type ModelProviderDraft,
} from "../features/config/configEditWorkflow";
import { type AppState, type CodexSessionState } from "../state/appState";
import {
  emptyMcpServerDraft,
  emptyModelProviderDraft,
} from "../features/config/configTableEntries";
import {
  draftValuesFromFields,
  settingsChanges,
  type FieldState,
} from "../features/config/configFieldDrafts";
import { SettingsForm } from "../features/config/ConfigFieldsWorkspace";
import { ProductSwitcher, TabBar, type MainTab } from "./AppShell";
import {
  McpServersPanel,
  ModelProvidersPanel,
} from "../features/config/ConfigTablesWorkspace";
import { ConfigPreviewSidebar } from "../features/config/ConfigPreviewSidebar";
import { displayPath } from "../lib/formatters";
import { SessionsWorkspace } from "../features/codex/SessionsWorkspace";
import { SkillsWorkspace } from "../features/skills/SkillsWorkspace";
import { PluginsWorkspace } from "../features/plugins/PluginsWorkspace";
import type { MarketplaceAddRequest } from "../features/plugins/codexPlugins";
import { ClaudeSessionsWorkspace } from "../features/claude/ClaudeSessionsWorkspace";
import { ClaudeMcpPanel } from "../features/claude/ClaudeMcpWorkspace";
import { ClaudeSkillsWorkspace } from "../features/claude/ClaudeSkillsWorkspace";
import {
  type ClaudeProduct,
  type ClaudeSessionState,
  type ClaudeState,
} from "../features/claude/claudeState";
import { type SkillState } from "../features/skills/globalSkills";
import { useConfigEditWorkflow } from "../features/config/useConfigEditWorkflow";
import { Button } from "../components/ui/button";
import { Notice } from "../components/ui/notice";
import { Toaster } from "../components/ui/sonner";
import { cn } from "../components/ui/utils";
import "./App.css";

const PRODUCT_STORAGE_KEY = "codex-config:product";

function initialProduct(): ClaudeProduct {
  return localStorage.getItem(PRODUCT_STORAGE_KEY) === "claude"
    ? "claude"
    : "codex";
}

function App() {
  const [product, setProduct] = useState<ClaudeProduct>(initialProduct);
  const [state, setState] = useState<AppState | null>(null);
  const [claudeState, setClaudeState] = useState<ClaudeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>(
    initialProduct() === "claude" ? "sessions" : "config",
  );
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [modelProviderDraft, setModelProviderDraft] =
    useState<ModelProviderDraft>(emptyModelProviderDraft());
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(emptyMcpServerDraft());
  const [claudeMcpDraft, setClaudeMcpDraft] = useState<McpServerDraft>(emptyMcpServerDraft());
  const [rawTomlDraft, setRawTomlDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeSessionsLoading, setClaudeSessionsLoading] = useState(false);
  const [savingPluginId, setSavingPluginId] = useState<string | null>(null);
  const configEditWorkflow = useConfigEditWorkflow<AppState>({
    currentState: state,
    onCommitState: applyAppState,
    onError: setError,
    onStatusMessage: showStatusMessage,
  });

  function showStatusMessage(message: string | null) {
    if (!message) {
      return;
    }

    if (message.startsWith("已")) {
      toast.success(message);
    } else {
      toast(message);
    }
  }

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

  async function loadClaudeState() {
    setClaudeLoading(true);
    setError(null);

    try {
      const nextState = await invoke<ClaudeState>("load_claude_state");
      setClaudeState(nextState);
      setClaudeMcpDraft(emptyMcpServerDraft());
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setClaudeLoading(false);
    }
  }

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const sessions = await invoke<CodexSessionState>("load_sessions");
      setState((current) =>
        current ? { ...current, codexSessions: sessions } : current,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadClaudeSessions() {
    setClaudeSessionsLoading(true);
    try {
      const sessions = await invoke<ClaudeSessionState>("load_claude_sessions");
      setClaudeState((current) => (current ? { ...current, sessions } : current));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setClaudeSessionsLoading(false);
    }
  }

  function switchProduct(next: ClaudeProduct) {
    setProduct(next);
    localStorage.setItem(PRODUCT_STORAGE_KEY, next);
    setError(null);
    configEditWorkflow.reset();
    setActiveTab(next === "claude" ? "sessions" : "config");
  }

  function switchTab(tab: MainTab) {
    setActiveTab(tab);
    configEditWorkflow.reset();
  }

  async function saveSettings() {
    if (!state) {
      return;
    }

    await configEditWorkflow.runCommit({
      kind: "rootSettings",
      changes: settingsChanges(state.fields, draftValues),
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
    const outcome = await configEditWorkflow.runCommit({
      kind: "modelProviderDelete",
      id,
    });

    return outcome.status === "commit";
  }

  async function saveMcpServer() {
    await configEditWorkflow.runCommit({
      kind: "mcpServerSave",
      draft: mcpServerDraft,
    });
  }

  async function deleteMcpServer(id: string) {
    const outcome = await configEditWorkflow.runCommit({
      kind: "mcpServerDelete",
      id,
    });

    return outcome.status === "commit";
  }

  async function savePluginEnabled(pluginId: string, enabled: boolean) {
    if (!state || savingPluginId) {
      return;
    }

    setSavingPluginId(pluginId);
    setError(null);

    try {
      const result = await invoke<{ changed: boolean; state: AppState }>("save_plugin_enabled", {
        pluginId,
        enabled,
        fileToken: state.fileToken ?? null,
      });
      applyAppState(result.state);
      showStatusMessage(
        enabled
          ? "已启用 plugin。重启 Codex 或开启新会话后生效。"
          : "已停用 plugin。重启 Codex 或开启新会话后生效。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingPluginId(null);
    }
  }

  async function removePlugin(pluginId: string) {
    setError(null);

    try {
      const result = await invoke<{ changed: boolean; state: AppState }>("remove_plugin", {
        pluginId,
      });
      applyAppState(result.state);
      showStatusMessage("已卸载 plugin。外部 app 连接仍需在 ChatGPT 管理。");
      return true;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async function addPluginMarketplace(request: MarketplaceAddRequest) {
    setError(null);

    try {
      const result = await invoke<{ changed: boolean; state: AppState }>("add_plugin_marketplace", {
        request,
      });
      applyAppState(result.state);
      showStatusMessage("已添加 plugin marketplace。");
      return true;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async function removePluginMarketplace(name: string) {
    setError(null);

    try {
      const result = await invoke<{ changed: boolean; state: AppState }>(
        "remove_plugin_marketplace",
        { name },
      );
      applyAppState(result.state);
      showStatusMessage("已移除 plugin marketplace。");
      return true;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async function upgradePluginMarketplace(name: string | null) {
    setError(null);

    try {
      const result = await invoke<{ changed: boolean; state: AppState }>(
        "upgrade_plugin_marketplace",
        { name },
      );
      applyAppState(result.state);
      showStatusMessage(
        name ? "已升级 plugin marketplace。" : "已升级全部 Git plugin marketplaces。",
      );
      return true;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveClaudeMcpServer() {
    if (!claudeState) {
      return;
    }

    try {
      const result = await invoke<ClaudeState>("save_claude_mcp_server", {
        draft: claudeMcpDraft,
        fileToken: claudeState.mcp.fileToken ?? null,
      });
      setClaudeState(result);
      setClaudeMcpDraft(emptyMcpServerDraft());
      showStatusMessage("已保存 MCP server。");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteClaudeMcpServer(id: string) {
    if (!claudeState) {
      return false;
    }

    try {
      const result = await invoke<ClaudeState>("delete_claude_mcp_server", {
        id,
        fileToken: claudeState.mcp.fileToken ?? null,
      });
      setClaudeState(result);
      setClaudeMcpDraft(emptyMcpServerDraft());
      showStatusMessage("已删除 MCP server。");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  const settingChanges = state ? settingsChanges(state.fields, draftValues) : [];
  const settingsDirty = settingChanges.length > 0;
  const rawTomlDirty = state ? rawTomlDraft !== state.rawToml : false;
  const rawTomlWritable = Boolean(state?.health.codex.found);

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    if (product === "claude" && !claudeState && !claudeLoading) {
      void loadClaudeState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, claudeState]);

  useEffect(() => {
    if (
      product === "codex" &&
      activeTab === "sessions" &&
      state &&
      !state.codexSessions &&
      !sessionsLoading
    ) {
      void loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, activeTab, state]);

  useEffect(() => {
    if (
      product === "claude" &&
      activeTab === "sessions" &&
      claudeState &&
      !claudeState.sessions &&
      !claudeSessionsLoading
    ) {
      void loadClaudeSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, activeTab, claudeState]);

  useEffect(() => {
    const title = appTitle(state);
    document.title = title;

    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    void getCurrentWindow().setTitle(title).catch(() => undefined);
  }, [state]);

  const refreshing = product === "claude" ? claudeLoading : loading;
  const showSkeleton =
    !error &&
    (product === "claude" ? claudeLoading && !claudeState : loading && !state);

  return (
    <>
      <main className="flex h-screen min-h-0 flex-col overflow-hidden p-3">
      <header className="mx-auto mb-5 flex w-full max-w-[1440px] flex-none items-start justify-between gap-5 max-[940px]:flex-col max-[940px]:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1>{product === "claude" ? "Claude Code 配置" : "Codex 配置"}</h1>
          <ProductSwitcher product={product} onChange={switchProduct} />
        </div>
        <Button
          onClick={product === "claude" ? loadClaudeState : loadState}
          disabled={refreshing}
        >
          <RefreshCw size={18} />
          <span>{refreshing ? "刷新中" : "刷新"}</span>
        </Button>
      </header>

      {error && (
        <Notice variant="destructive">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </Notice>
      )}

      {showSkeleton && (
        <div className="mx-auto min-h-0 w-full max-w-[1440px] flex-1 overflow-auto">
          <div className="mb-4 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[42px] min-w-[132px] flex-none animate-pulse rounded-[var(--radius)] bg-[var(--muted)]"
              />
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-4 max-[940px]:grid-cols-1">
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]"
                />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]" />
          </div>
        </div>
      )}

      {product === "codex" && state && (
        <>
          <TabBar activeTab={activeTab} onChange={switchTab} product="codex" />
          <section
            className={cn(
              "mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-4 overflow-hidden max-[940px]:grid-cols-1",
              (activeTab === "config" || activeTab === "mcp") &&
                "max-[940px]:grid-rows-[minmax(0,0.5fr)_minmax(0,0.5fr)]",
              (activeTab === "skills" || activeTab === "sessions" || activeTab === "plugins") &&
                "grid-cols-[minmax(0,1fr)]",
            )}
          >
            {activeTab === "config" ? (
              <>
                <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto pr-1">
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
                <div className="min-h-0 min-w-0 overflow-auto pr-1">
                  <ConfigPreviewSidebar
                    state={state}
                    rawTomlDraft={rawTomlDraft}
                    rawTomlDirty={rawTomlDirty}
                    rawTomlWritable={rawTomlWritable}
                    onRawTomlChange={updateRawTomlDraft}
                    onSaveRawToml={saveRawToml}
                  />
                </div>
              </>
            ) : activeTab === "sessions" ? (
              <div className="min-h-0 min-w-0 overflow-auto pr-1">
                <SessionsWorkspace
                  state={state}
                  sessionsLoading={sessionsLoading}
                  onStateChange={applyAppState}
                  onError={setError}
                  onStatusMessage={showStatusMessage}
                />
              </div>
            ) : activeTab === "mcp" ? (
              <>
                <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto pr-1">
                  <McpServersPanel
                    state={state}
                    draft={mcpServerDraft}
                    onDraftChange={updateMcpServerDraft}
                    onSave={saveMcpServer}
                    onDelete={deleteMcpServer}
                  />
                </div>
                <div className="min-h-0 min-w-0 overflow-auto pr-1">
                  <ConfigPreviewSidebar
                    state={state}
                    rawTomlDraft={rawTomlDraft}
                    rawTomlDirty={rawTomlDirty}
                    rawTomlWritable={rawTomlWritable}
                    onRawTomlChange={updateRawTomlDraft}
                    onSaveRawToml={saveRawToml}
                  />
                </div>
              </>
            ) : activeTab === "skills" ? (
              <div className="h-full min-h-0 min-w-0">
                <SkillsWorkspace
                  state={state}
                  onStateChange={applyAppState}
                  onError={setError}
                  onStatusMessage={showStatusMessage}
                />
              </div>
            ) : (
              <div className="h-full min-h-0 min-w-0">
                <PluginsWorkspace
                  plugins={state.plugins}
                  homeDir={state.homeDir}
                  savingPluginId={savingPluginId}
                  writable={state.writable}
                  onSaveEnabled={savePluginEnabled}
                  onRemove={removePlugin}
                  onAddMarketplace={addPluginMarketplace}
                  onRemoveMarketplace={removePluginMarketplace}
                  onUpgradeMarketplace={upgradePluginMarketplace}
                />
              </div>
            )}
          </section>
        </>
      )}

      {product === "claude" && claudeState && (
        <>
          <TabBar activeTab={activeTab} onChange={switchTab} product="claude" />
          <section className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-[minmax(0,1fr)] gap-4 overflow-hidden">
            {activeTab === "sessions" ? (
              <div className="min-h-0 min-w-0 overflow-auto pr-1">
                <ClaudeSessionsWorkspace
                  sessions={claudeState.sessions}
                  homeDir={state?.homeDir}
                  sessionsLoading={claudeSessionsLoading}
                  onSessionsChange={(sessions) =>
                    setClaudeState((current) =>
                      current ? { ...current, sessions } : current,
                    )
                  }
                  onError={setError}
                  onStatusMessage={showStatusMessage}
                />
              </div>
            ) : activeTab === "mcp" ? (
              <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto pr-1">
                <ClaudeMcpPanel
                  mcp={claudeState.mcp}
                  homeDir={state?.homeDir}
                  draft={claudeMcpDraft}
                  onDraftChange={setClaudeMcpDraft}
                  onSave={saveClaudeMcpServer}
                  onDelete={deleteClaudeMcpServer}
                />
              </div>
            ) : (
              <div className="h-full min-h-0 min-w-0">
                <ClaudeSkillsWorkspace
                  skills={claudeState.skills}
                  homeDir={state?.homeDir}
                  onSkillsChange={(skills: SkillState) =>
                    setClaudeState((current) =>
                      current ? { ...current, skills } : current,
                    )
                  }
                  onError={setError}
                  onStatusMessage={showStatusMessage}
                />
              </div>
            )}
          </section>
        </>
      )}
      </main>
      <Toaster />
    </>
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
