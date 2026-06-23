import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { ClaudeSessionState } from "./claudeState";
import {
  claudeSessionsOlderThanCount,
  groupClaudeSessionsByProject,
} from "./claudeState";
import {
  displayPath,
  formatBytes,
  formatIsoDateTime,
} from "../../lib/formatters";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { CompactEmpty } from "../../components/ui/compact-empty";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

type ClaudeSessionsWorkspaceProps = {
  sessions: ClaudeSessionState | undefined;
  homeDir?: string;
  sessionsLoading?: boolean;
  onSessionsChange: (sessions: ClaudeSessionState) => void;
  onError: (message: string | null) => void;
  onStatusMessage: (message: string | null) => void;
};

type DeleteDialogState =
  | { kind: "single"; id: string; title: string }
  | { kind: "bulk"; days: number; count: number };

export function ClaudeSessionsWorkspace({
  sessions,
  homeDir,
  sessionsLoading,
  onSessionsChange,
  onError,
  onStatusMessage,
}: ClaudeSessionsWorkspaceProps) {
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  async function confirmDelete() {
    if (!deleteDialog || deleteSubmitting) {
      return;
    }

    const target = deleteDialog;
    setDeleteSubmitting(true);
    onError(null);
    onStatusMessage(null);

    try {
      const nextState = target.kind === "single"
        ? await invoke<ClaudeSessionState>("delete_claude_session", { id: target.id })
        : await invoke<ClaudeSessionState>("delete_claude_sessions_older_than", { days: target.days });
      onSessionsChange(nextState);
      toast.success(
        target.kind === "single"
          ? "已删除 Claude session 文件。"
          : `已删除 ${target.days} 天前的 Claude session 文件。`,
      );
      setDeleteDialog(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function requestDeleteSession(session: { id: string; title: string }) {
    setDeleteSubmitting(false);
    setDeleteDialog({ kind: "single", id: session.id, title: session.title });
  }

  function requestDeleteSessionsOlderThan(days: number, count: number) {
    setDeleteSubmitting(false);
    setDeleteDialog({ kind: "bulk", days, count });
  }

  if (!sessions) {
    return (
      <CompactEmpty>
        {sessionsLoading ? "正在加载 Claude sessions…" : "尚未加载 Claude sessions。"}
      </CompactEmpty>
    );
  }

  return (
    <>
      <ClaudeSessionsPanel
        sessions={sessions}
        homeDir={homeDir}
        onDelete={requestDeleteSession}
        onDeleteOlderThan={requestDeleteSessionsOlderThan}
      />
      <Dialog
        open={deleteDialog !== null}
        onOpenChange={(open) => !open && !deleteSubmitting && setDeleteDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteDialog?.kind === "bulk" ? "批量删除 Claude sessions" : "删除 Claude session"}
            </DialogTitle>
            <DialogDescription>
              {deleteDialog?.kind === "bulk"
                ? `将删除 ${deleteDialog.count} 个 ${deleteDialog.days} 天前的 .jsonl 会话文件，不会修改 ~/.claude.json。`
                : `将删除「${deleteDialog?.title ?? ""}」对应的 .jsonl 会话文件，不会修改 ~/.claude.json。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={deleteSubmitting}>取消</Button>
            </DialogClose>
            <Button disabled={deleteSubmitting} variant="primary" onClick={confirmDelete}>
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

function ClaudeSessionsPanel({
  sessions,
  homeDir,
  onDelete,
  onDeleteOlderThan,
}: {
  sessions: ClaudeSessionState;
  homeDir?: string;
  onDelete: (session: { id: string; title: string }) => void;
  onDeleteOlderThan: (days: number, count: number) => void;
}) {
  const sessionList = sessions.sessions;
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const groups = groupClaudeSessionsByProject(sessionList);
  const totalSessionSize = sessionList.reduce((total, session) => total + session.size, 0);

  function toggleProject(projectKey: string) {
    setCollapsedProjects((current) => ({
      ...current,
      [projectKey]: !(current[projectKey] ?? false),
    }));
  }

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-10 items-center gap-3 border-b border-[var(--border)] px-3 py-1.5 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <BookOpen size={18} />
        <div className="flex min-w-0 max-w-[260px] flex-none items-baseline gap-2 max-[940px]:max-w-full">
          <h2 className="flex-none whitespace-nowrap">Claude sessions</h2>
          <p className="truncate text-[0.8rem] text-[var(--muted-foreground)]">
            {displayPath(sessions.projectsDir, homeDir)}
          </p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-3.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1.5 max-[940px]:ml-0 max-[940px]:w-full max-[940px]:flex-wrap [&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-1.5 [&_span]:whitespace-nowrap [&_span]:text-[0.68rem] [&_span]:font-bold [&_span]:uppercase [&_span]:text-[var(--muted-foreground)] [&_strong]:whitespace-nowrap [&_strong]:text-[0.88rem]">
          <div>
            <span>会话数量</span>
            <strong>{sessionList.length}</strong>
          </div>
          <div>
            <span>总大小</span>
            <strong>{formatBytes(totalSessionSize)}</strong>
          </div>
        </div>
      </div>

      {sessionList.length > 0 && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
            删除会移除对应的 <code>.jsonl</code> 会话文件，不会修改 <code>~/.claude.json</code>。
          </p>
          <div className="flex flex-wrap justify-end gap-[5px]">
            {[7, 30].map((days) => {
              const count = claudeSessionsOlderThanCount(sessionList, days);

              return (
                <Button
                  disabled={count === 0}
                  key={days}
                  onClick={() => onDeleteOlderThan(days, count)}
                  size="sm"
                  title={`删除 ${days} 天前 ${count} 个 Claude session`}
                >
                  <Trash2 data-icon="inline-start" />
                  删除 {days} 天前 {count} 个
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3.5">
        {sessionList.length === 0 ? (
          <CompactEmpty>当前 Claude Home 下没有 session 记录。</CompactEmpty>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsedProjects[group.key] ?? false;

            return (
              <section className="flex min-w-0 flex-col gap-[7px]" key={group.key}>
                <button
                  className="flex w-full cursor-pointer items-center justify-between gap-2.5 border-x-0 border-t-0 border-b border-[var(--border)] bg-transparent px-0.5 pb-[7px] pt-0 text-left text-inherit [&>strong]:whitespace-nowrap [&>strong]:text-[0.78rem] [&>strong]:text-[var(--muted-foreground)] [&_span]:text-[0.76rem] [&_span]:text-[var(--muted-foreground)]"
                  onClick={() => toggleProject(group.key)}
                  type="button"
                >
                  <span className="inline-flex flex-none text-[var(--muted-foreground)]">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <h3 className="flex-none">{group.label}</h3>
                    <span className="whitespace-nowrap">{group.sessions.length} sessions</span>
                  </div>
                  <strong>{formatBytes(group.totalSize)}</strong>
                </button>
                {!isCollapsed && (
                  <div className="flex min-w-0 flex-col gap-2">
                    {group.sessions.map((session) => {
                      const deleteLabel = `删除 ${session.title}`;

                      return (
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2.5 text-left text-[var(--foreground)] max-[940px]:grid-cols-1" key={session.id}>
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex min-w-0 items-center justify-between gap-2 [&>strong]:break-words [&>strong]:text-[var(--foreground)]">
                              <strong>{session.title}</strong>
                              <Badge className="flex-none self-start px-[9px] py-1 font-extrabold leading-[1.1]">
                                {formatBytes(session.size)}
                              </Badge>
                            </div>
                            <code>{displayPath(session.path, homeDir)}</code>
                            <div className="flex flex-wrap gap-1.5 text-[0.78rem] text-[var(--muted-foreground)] [&>span]:break-words">
                              <span>{formatIsoDateTime(session.lastTimestamp ?? session.createdAt)}</span>
                              <span>{session.userMessageCount} user / {session.messageCount} messages</span>
                              {session.cwd && <span>{displayPath(session.cwd, homeDir)}</span>}
                              {session.cliVersion && <span>claude {session.cliVersion}</span>}
                              {session.gitBranch && (
                                <Badge className="flex-none self-start px-[9px] py-1 font-extrabold leading-[1.1]">
                                  {session.gitBranch}
                                </Badge>
                              )}
                            </div>
                            {session.parseError && (
                              <p className="text-[0.8rem] text-[var(--destructive)]">{session.parseError}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap justify-end gap-[5px]">
                            <Button
                              onClick={() => onDelete({ id: session.id, title: session.title })}
                              title={deleteLabel}
                              size="sm"
                            >
                              <Trash2 data-icon="inline-start" />
                              删除
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}
