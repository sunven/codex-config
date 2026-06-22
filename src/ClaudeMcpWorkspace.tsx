import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  draftFromMcpServer,
  emptyMcpServerDraft,
  isMcpServerDraftDirty,
  type McpServerDraft,
} from "./configTableEntries";
import type { ClaudeMcpState } from "./claudeState";
import {
  LabeledInput,
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
import { Notice } from "./components/ui/notice";
import { cn } from "./components/ui/utils";

export function ClaudeMcpPanel({
  mcp,
  homeDir: _homeDir,
  draft,
  onDraftChange,
  onSave,
  onDelete,
}: {
  mcp: ClaudeMcpState;
  homeDir?: string;
  draft: McpServerDraft;
  onDraftChange: (draft: McpServerDraft) => void;
  onSave: () => void;
  onDelete: (id: string) => boolean | Promise<boolean>;
}) {
  const servers = mcp.servers;
  const writable = !mcp.parseIssue;
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
          return (
            <div className={cn("flex w-full min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 text-left text-[var(--foreground)]", draft.originalId === server.id && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.16)]")} key={server.id}>
              <button
                className="flex w-full min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left text-inherit"
                onClick={() => onDraftChange(draftFromMcpServer(server))}
                type="button"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-[5px] [&>strong]:min-w-0 [&>strong]:break-words">
                  <strong>{server.id}</strong>
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
                  disabled={!writable}
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
      {mcp.parseIssue && (
        <Notice variant="destructive">
          <span>{mcp.parseIssue}</span>
        </Notice>
      )}
      <TableEntryEditor
        title="MCP servers (Claude)"
        description={<>管理写入 <code>~/.claude.json</code> 的 mcpServers 启动配置。</>}
        countLabel={`${servers.length} servers`}
        saveButtonText="保存 server"
        writable={writable}
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
              <code>mcpServers.&lt;id&gt;</code> 表。
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
