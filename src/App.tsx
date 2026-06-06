import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  DatabaseBackup,
  Edit3,
  Eye,
  FileCode2,
  Gauge,
  Power,
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type HealthStatus = "ready" | "readOnly" | "needsAttention";

type AppState = {
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
  | "modelProviderDelete";

type MainTab = "config" | "skills";

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
  const [rawTomlDraft, setRawTomlDraft] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<SkillContent | null>(null);
  const [pendingDeleteProviderId, setPendingDeleteProviderId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      setPendingDeleteProviderId(null);
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
      setPendingDeleteProviderId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存。备份：${result.backupPath ?? "新配置无需备份"}`
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
      setPendingDeleteProviderId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存。备份：${result.backupPath ?? "新配置无需备份"}`
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
      setPendingDeleteProviderId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存 profile 配置。备份：${result.backupPath ?? "新配置无需备份"}`
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
      setPendingDeleteProviderId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存原始 TOML。备份：${result.backupPath ?? "新配置无需备份"}`
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
      setPendingDeleteProviderId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已保存 model provider。备份：${result.backupPath ?? "新配置无需备份"}`
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
      setPendingDeleteProviderId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        result.changed
          ? `已删除 model provider。备份：${result.backupPath ?? "新配置无需备份"}`
          : "没有需要删除的 model provider。",
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
      setPendingDeleteProviderId(null);
      setRawTomlDraft(result.state.rawToml);
      setPreview(null);
      setPreviewKind(null);
      setStatusMessage(
        `已恢复备份。恢复前备份：${
          result.backupPath ?? "新配置无需备份"
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
      setPendingDeleteProviderId(null);
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="top-title">
          <p className="eyebrow">codex-config</p>
          <h1>Codex 配置</h1>
          {state && <TopCodexSummary state={state} />}
        </div>
        <button className="icon-button" onClick={loadState} disabled={loading}>
          <RefreshCw size={18} />
          <span>{loading ? "刷新中" : "刷新"}</span>
        </button>
      </header>

      {error && (
        <section className="notice danger">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </section>
      )}

      {state && (
        <>
          {statusMessage && <section className="notice ok">{statusMessage}</section>}
          <section className="status-grid">
            <ConfigTarget state={state} />
            <HealthStrip state={state} />
          </section>
          <TabBar activeTab={activeTab} onChange={switchTab} />
          <section className={`workspace ${activeTab === "skills" ? "skills-workspace" : ""}`}>
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

function ConfigTarget({ state }: { state: AppState }) {
  const target = configTarget(state.configPath);

  return (
    <section className={`target-strip ${target.tone}`}>
      {target.tone === "real" ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
      <div>
        <strong>{target.label}</strong>
        <p>{state.configPath}</p>
      </div>
    </section>
  );
}

function configTarget(path: string) {
  const normalized = path.startsWith("/private/tmp/")
    ? path.replace("/private/tmp/", "/tmp/")
    : path;

  if (normalized.startsWith("/tmp/")) {
    return {
      label: "正在编辑测试配置",
      tone: "test",
    };
  }

  if (normalized.endsWith("/.codex/config.toml")) {
    return {
      label: "正在编辑真实 Codex 配置",
      tone: "real",
    };
  }

  return {
    label: "正在编辑自定义配置",
    tone: "custom",
  };
}

function TopCodexSummary({ state }: { state: AppState }) {
  const codex = state.health.codex;

  return (
    <div className="top-codex-summary">
      <code>{codex.binaryPath ?? "未检测到 Codex 命令"}</code>
      <span>{codex.version ?? codex.message ?? "版本未知"}</span>
    </div>
  );
}

function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  return (
    <nav className="tabbar" aria-label="配置区域">
      <button
        className={activeTab === "config" ? "tab-button active" : "tab-button"}
        onClick={() => onChange("config")}
      >
        Codex 配置
      </button>
      <button
        className={activeTab === "skills" ? "tab-button active" : "tab-button"}
        onClick={() => onChange("skills")}
      >
        Skills
      </button>
    </nav>
  );
}

function HealthStrip({ state }: { state: AppState }) {
  const health = state.health;
  const tone =
    health.status === "ready"
      ? "ok"
      : health.status === "readOnly"
        ? "warn"
        : "danger";
  const label =
    health.status === "ready"
      ? "可保存"
      : health.status === "readOnly"
        ? "只读"
        : "需要处理";

  return (
    <section className={`health-strip ${tone}`}>
      <div className="health-status">
        {tone === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <strong>{label}</strong>
      </div>
      <dl>
        <div>
          <dt>Config</dt>
          <dd>{health.configExists ? "已存在" : "未创建"}</dd>
        </div>
        <div>
          <dt>Codex</dt>
          <dd>{health.codex.version ?? health.codex.message ?? "未找到"}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{health.schemaVersion}</dd>
        </div>
      </dl>
      {state.readonlyReason && <p>{state.readonlyReason}</p>}
    </section>
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
        <button className="icon-button" disabled={!canSave} onClick={onPreview}>
          预览
        </button>
        <button
          className="primary-button"
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

  return (
    <section className="panel">
      <div className="panel-heading">
        <FileCode2 size={18} />
        <h2>{title}</h2>
        <div className="panel-actions">
          <button
            className="small-button"
            disabled={!writable || !dirty}
            onClick={onPreview}
          >
            预览
          </button>
          <button
            className="primary-button compact"
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
                  <div>
                    <label>{field.label}</label>
                    <code>{field.path}</code>
                    {field.note && <p>{field.note}</p>}
                  </div>
                  <FieldValue
                    field={field}
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

  function patch(patch: Partial<ModelProviderDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  return (
    <section className="panel provider-panel">
      <div className="panel-heading">
        <FileCode2 size={18} />
        <div>
          <h2>Model providers</h2>
          <p className="muted">管理写入 <code>model_providers</code> 的自定义 provider。</p>
        </div>
        <div className="panel-actions">
          <button
            className="small-button"
            disabled={!state.writable || !dirty}
            onClick={onPreview}
          >
            预览
          </button>
          <button
            className="primary-button compact"
            disabled={!state.writable || !dirty || !savePreviewReady}
            onClick={onSave}
          >
            保存 provider
          </button>
        </div>
      </div>

      <div className="provider-layout">
        <div className="provider-list">
          <button
            className="provider-row new-provider"
            onClick={() => onDraftChange(emptyModelProviderDraft())}
          >
            <Plus size={16} />
            新建 provider
          </button>
          {providers.length === 0 ? (
            <div className="empty-state">还没有自定义 model provider。</div>
          ) : (
            providers.map((provider) => (
              <div
                className={`provider-row ${draft.originalId === provider.id ? "active" : ""}`}
                key={provider.id}
              >
                <button onClick={() => onDraftChange(draftFromModelProvider(provider))}>
                  <strong>{provider.name || provider.id}</strong>
                  <code>{provider.id}</code>
                  {provider.baseUrl && <span>{provider.baseUrl}</span>}
                </button>
                <div className="provider-row-actions">
                  <button
                    className="small-button"
                    disabled={!state.writable}
                    onClick={() => onPreviewDelete(provider.id)}
                  >
                    预览删除
                  </button>
                  <button
                    className="small-button"
                    disabled={!state.writable || pendingDeleteId !== provider.id}
                    onClick={() => onDelete(provider.id)}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>
            ))
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

function SkillsPanel({
  state,
  query,
  selectedPath,
  content,
  onQueryChange,
  onSelect,
  onSaveToggle,
}: {
  state: AppState;
  query: string;
  selectedPath: string | null;
  content: SkillContent | null;
  onQueryChange: (value: string) => void;
  onSelect: (path: string) => void;
  onSaveToggle: (path: string, enabled: boolean) => void;
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

  return (
    <section className="panel skills-panel">
      <div className="panel-heading skills-heading">
        <BookOpen size={18} />
        <div>
          <h2>全局 Skills</h2>
          <p className="muted">
            发现全局 <code>SKILL.md</code>；启停写入 <code>skills.config</code>。
          </p>
        </div>
      </div>

      <div className="skill-roots">
        {state.skills.roots.map((root) => (
          <span className={root.exists ? "skill-root ok" : "skill-root"} key={root.path}>
            {root.label}: {root.exists ? root.path : "未找到"}
          </span>
        ))}
      </div>

      <div className="skills-layout">
        <div className="skills-list">
          <input
            className="field-control skill-search"
            value={query}
            placeholder="搜索 skill 名称、描述或路径"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
          {skills.length === 0 ? (
            <div className="empty-state">没有发现匹配的全局 skill。</div>
          ) : (
            skills.map((skill) => {
              const nextEnabled = !skill.enabled;

              return (
                <div
                  className={`skill-row ${skill.path === selectedSkill?.path ? "active" : ""}`}
                  key={skill.path}
                >
                  <button onClick={() => onSelect(skill.path)}>
                    <span className={skill.enabled ? "skill-status enabled" : "skill-status"}>
                      {skill.enabled ? "enabled" : "disabled"}
                    </span>
                    <strong>{skill.name}</strong>
                    {skill.description && (
                      <p title={skill.description}>{shortDescription(skill.description)}</p>
                    )}
                    <code>{skill.path}</code>
                    <small>
                      {skill.source} · {formatBytes(skill.size)}
                      {skill.configured ? " · configured" : ""}
                    </small>
                  </button>
                  <div className="skill-actions">
                    <button className="small-button" onClick={() => onSelect(skill.path)}>
                      <Eye size={14} />
                      查看内容
                    </button>
                    <button
                      className="small-button"
                      disabled={!state.writable}
                      onClick={() => onSaveToggle(skill.path, nextEnabled)}
                    >
                      <Power size={14} />
                      {nextEnabled ? "启用" : "停用"}
                    </button>
                  </div>
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
                  <p>{selectedSkill.directory}</p>
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

  return (
    <section className="panel catalog-panel">
      <div className="panel-heading catalog-heading">
        <FileCode2 size={18} />
        <div>
          <h2>字段目录</h2>
          <p className="muted">所有 bundled schema 字段都可搜索；复杂字段第一期只读。</p>
        </div>
      </div>
      <input
        className="field-control catalog-search"
        value={query}
        placeholder="搜索 label / TOML path / group / risk"
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
      <div className="catalog-list">
        {visibleFields.map((field) => (
          <div className="catalog-row" key={field.path}>
            <div>
              <strong>{field.label}</strong>
              <code>{field.path}</code>
              {field.note && <p>{field.note}</p>}
            </div>
            <div className="catalog-badges">
              <span className={`risk-badge ${field.risk}`}>{field.risk}</span>
              <span className="kind-badge">{field.kind}</span>
              <span className={field.editable ? "edit-badge editable" : "edit-badge"}>
                {field.editable ? "editable" : "read-only"}
              </span>
            </div>
          </div>
        ))}
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
  value,
  onChange,
}: {
  field: FieldState;
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
      value={value ?? ""}
      placeholder="unset"
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
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
    <section className="panel raw-panel raw-editor-panel">
      <div className="panel-heading">
        <Edit3 size={18} />
        <div>
          <h2>高级 TOML 编辑</h2>
          <p className="muted">用于配置字段目录中尚未提供专用控件的复杂配置。</p>
        </div>
        <div className="panel-actions">
          <button
            className="small-button"
            disabled={!writable || !dirty}
            onClick={onPreview}
          >
            预览
          </button>
          <button
            className="primary-button compact"
            disabled={!writable || !dirty || !previewReady}
            onClick={onSave}
          >
            保存 TOML
          </button>
        </div>
      </div>
      {state.parseIssue && (
        <div className="inline-error">{state.parseIssue.message}</div>
      )}
      <textarea
        className="toml-editor"
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
    <section className="panel raw-panel">
      <div className="panel-heading">
        <FileCode2 size={18} />
        <h2>变更预览</h2>
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
  writable,
  onRestore,
}: {
  backups: BackupSummary[];
  backupDir: string;
  writable: boolean;
  onRestore: (backupId: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <DatabaseBackup size={18} />
        <h2>备份</h2>
      </div>
      <p className="muted">{backupDir}</p>
      {backups.length === 0 ? (
        <p>暂无备份。</p>
      ) : (
        <ul className="backup-list">
          {backups.slice(0, 5).map((backup) => (
            <li key={backup.id}>
              <div>
                <span>{backup.id}</span>
                <small>{formatBytes(backup.size)}</small>
              </div>
              <button
                className="small-button"
                disabled={!writable}
                onClick={() => onRestore(backup.id)}
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

function shortDescription(description: string) {
  const compact = description.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default App;
