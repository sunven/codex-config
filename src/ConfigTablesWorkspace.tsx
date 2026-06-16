import { Trash2 } from "lucide-react";
import type { AppState } from "./appState";
import {
  draftFromMcpServer,
  draftFromModelProvider,
  emptyMcpServerDraft,
  emptyModelProviderDraft,
  isMcpServerDraftDirty,
  isModelProviderDraftDirty,
  mcpServerDraftId,
  modelProviderDraftId,
  type McpServerDraft,
  type ModelProviderDraft,
} from "./configTableEntries";
import {
  LabeledInput,
  LabeledNumber,
  StringListEditor,
  StringMapEditor,
  TableEntryEditor,
} from "./ConfigTableEntryEditor";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ModelProvidersPanel({
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

export function McpServersPanel({
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
