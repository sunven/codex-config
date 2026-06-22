import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { AppState } from "./appState";
import {
  draftFromMcpServer,
  draftFromModelProvider,
  emptyMcpServerDraft,
  emptyModelProviderDraft,
  isMcpServerDraftDirty,
  isModelProviderDraftDirty,
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
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Select } from "./components/ui/select";
import { cn } from "./components/ui/utils";

export function ModelProvidersPanel({
  state,
  draft,
  onDraftChange,
  onSave,
  onDelete,
}: {
  state: AppState;
  draft: ModelProviderDraft;
  onDraftChange: (draft: ModelProviderDraft) => void;
  onSave: () => void;
  onDelete: (id: string) => boolean | Promise<boolean>;
}) {
  const providers = state.modelProviders.providers;
  const dirty = isModelProviderDraftDirty(draft, providers);
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  function patch(patch: Partial<ModelProviderDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  async function confirmDeleteProvider() {
    if (!deleteProviderId || deleteSubmitting) {
      return;
    }

    const id = deleteProviderId;
    setDeleteSubmitting(true);

    try {
      if (await onDelete(id)) {
        setDeleteProviderId(null);
      }
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const entries =
    providers.length > 0
      ? providers.map((provider) => {
          const providerName = provider.name || provider.id;
          const reserved = state.modelProviders.reservedIds.includes(provider.id);

          return (
            <div className={cn("flex w-full min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 text-left text-[var(--foreground)]", draft.originalId === provider.id && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.16)]")} key={provider.id}>
              <button
                className="flex w-full min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left text-inherit"
                onClick={() => onDraftChange(draftFromModelProvider(provider))}
                type="button"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-[5px] [&>strong]:min-w-0 [&>strong]:break-words">
                  <strong>{providerName}</strong>
                  <Badge variant={!reserved ? "success" : "secondary"}>
                    {reserved ? "built-in" : "custom"}
                  </Badge>
                  {provider.hasAdvancedFields && (
                    <Badge variant="muted">advanced fields</Badge>
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
                <Button
                  disabled={!state.writable || reserved}
                  onClick={() => setDeleteProviderId(provider.id)}
                  title={reserved ? "内置 provider 不能删除" : `删除 provider ${provider.id}`}
                  size="sm"
                >
                  <Trash2 data-icon="inline-start" />
                  删除
                </Button>
              </div>
            </div>
          );
        })
      : null;

  return (
    <>
      <TableEntryEditor
        title="Model providers"
        description={<>管理写入 <code>model_providers</code> 的自定义 provider。</>}
        countLabel={`${providers.length} providers`}
        saveButtonText="保存 provider"
        writable={state.writable}
        dirty={dirty}
        onSave={onSave}
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
                <Select
                  className="!w-full !max-w-none"
                  value={draft.wireApi ?? "responses"}
                  onChange={(event) => patch({ wireApi: event.currentTarget.value })}
                >
                  <option value="">unset</option>
                  <option value="responses">responses</option>
                </Select>
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
      <Dialog
        open={deleteProviderId !== null}
        onOpenChange={(open) => !open && !deleteSubmitting && setDeleteProviderId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 model provider</DialogTitle>
            <DialogDescription>
              将删除「{deleteProviderId ?? ""}」对应的 model provider 配置，不会删除其它配置。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={deleteSubmitting}>取消</Button>
            </DialogClose>
            <Button disabled={deleteSubmitting} variant="primary" onClick={confirmDeleteProvider}>
              {deleteSubmitting ? (
                "删除中"
              ) : (
                <>
                  <Trash2 data-icon="inline-start" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function McpServersPanel({
  state,
  draft,
  onDraftChange,
  onSave,
  onDelete,
}: {
  state: AppState;
  draft: McpServerDraft;
  onDraftChange: (draft: McpServerDraft) => void;
  onSave: () => void;
  onDelete: (id: string) => boolean | Promise<boolean>;
}) {
  const servers = state.mcpServers.servers;
  const dirty = isMcpServerDraftDirty(draft, servers);
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  function patch(patch: Partial<McpServerDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  async function confirmDeleteServer() {
    if (!deleteServerId || deleteSubmitting) {
      return;
    }

    const id = deleteServerId;
    setDeleteSubmitting(true);

    try {
      if (await onDelete(id)) {
        setDeleteServerId(null);
      }
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const entries =
    servers.length > 0
      ? servers.map((server) => {
          const enabled = server.enabled !== false;

          return (
            <div className={cn("flex w-full min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 text-left text-[var(--foreground)]", draft.originalId === server.id && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.16)]")} key={server.id}>
              <button
                className="flex w-full min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left text-inherit"
                onClick={() => onDraftChange(draftFromMcpServer(server))}
                type="button"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-[5px] [&>strong]:min-w-0 [&>strong]:break-words">
                  <strong>{server.id}</strong>
                  <Badge
                    className="self-start text-[0.68rem] font-extrabold uppercase"
                    variant={enabled ? "success" : "secondary"}
                  >
                    {enabled ? "enabled" : "disabled"}
                  </Badge>
                  {server.hasAdvancedFields && (
                    <Badge variant="muted">advanced fields</Badge>
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
                <Button
                  disabled={!state.writable}
                  onClick={() => setDeleteServerId(server.id)}
                  title={`删除 MCP server ${server.id}`}
                  size="sm"
                >
                  <Trash2 data-icon="inline-start" />
                  删除
                </Button>
              </div>
            </div>
          );
        })
      : null;

  return (
    <>
      <TableEntryEditor
        title="MCP servers"
        description={<>管理写入 <code>mcp_servers</code> 的 server 启动配置。</>}
        countLabel={`${servers.length} servers`}
        saveButtonText="保存 server"
        writable={state.writable}
        dirty={dirty}
        onSave={onSave}
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
                <Select
                  className="!w-full !max-w-none"
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
                </Select>
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
      <Dialog
        open={deleteServerId !== null}
        onOpenChange={(open) => !open && !deleteSubmitting && setDeleteServerId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 MCP server</DialogTitle>
            <DialogDescription>
              将删除「{deleteServerId ?? ""}」对应的 MCP server 配置。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={deleteSubmitting}>取消</Button>
            </DialogClose>
            <Button disabled={deleteSubmitting} variant="primary" onClick={confirmDeleteServer}>
              {deleteSubmitting ? (
                "删除中"
              ) : (
                <>
                  <Trash2 data-icon="inline-start" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
