import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState } from "./appState";
import {
  codexSessionBrowserState,
  sessionDeleteLabel,
  toggleCollapsedMonth,
} from "./codexSessions";
import { displayPath, formatBytes, formatIsoDateTime } from "./formatters";

type SessionsWorkspaceProps = {
  state: AppState;
  onStateChange: (state: AppState) => void;
  onError: (message: string | null) => void;
  onStatusMessage: (message: string | null) => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SessionsWorkspace({
  state,
  onStateChange,
  onError,
  onStatusMessage,
}: SessionsWorkspaceProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function deleteSession(id: string) {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id);
      onStatusMessage("再次点击删除会删除这个 Codex 会话 .jsonl 文件。");
      return;
    }

    onError(null);
    onStatusMessage(null);

    try {
      const nextState = await invoke<AppState>("delete_session", { id });
      onStateChange(nextState);
      setPendingDeleteId(null);
      onStatusMessage("已删除 Codex session 文件。");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <SessionsPanel
      state={state}
      pendingDeleteId={pendingDeleteId}
      onDelete={deleteSession}
    />
  );
}

function SessionsPanel({
  state,
  pendingDeleteId,
  onDelete,
}: {
  state: AppState;
  pendingDeleteId: string | null;
  onDelete: (id: string) => void;
}) {
  const sessions = state.codexSessions.sessions;
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const {
    years: sessionYears,
    selectedYearKey,
    selectedYear,
    totalSessionSize,
  } = codexSessionBrowserState(sessions, activeYear);

  function toggleMonth(monthKey: string) {
    setCollapsedMonths((current) => toggleCollapsedMonth(current, monthKey));
  }

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="codex-sessions-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-3 border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <BookOpen size={18} />
        <div>
          <h2 id="codex-sessions-title">Codex sessions</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
            {displayPath(state.codexSessions.sessionsDir, state.homeDir)}
          </p>
        </div>
        {sessionYears.length > 0 && (
          <div className="flex min-h-[42px] min-w-0 flex-auto items-center justify-center gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Session years">
            {sessionYears.map((year) => (
              <button
                aria-selected={year.key === selectedYearKey}
                className={cx("flex min-h-[54px] min-w-[146px] flex-none cursor-pointer flex-col items-start gap-0.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-2.5 py-[7px] text-left text-[var(--foreground)] [&_strong]:text-[0.88rem] [&_strong]:text-[var(--foreground)] [&_span]:whitespace-nowrap [&_span]:text-[0.74rem] [&_span]:text-[var(--muted-foreground)]", year.key === selectedYearKey && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.14)]")}
                key={year.key}
                onClick={() => setActiveYear(year.key)}
                role="tab"
                type="button"
              >
                <strong>{year.label}</strong>
                <span className="flex gap-2.5">
                  <span>{year.sessionCount} sessions</span>
                  <span>{formatBytes(year.totalSize)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto grid flex-none grid-cols-2 gap-3.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1.5 max-[940px]:ml-0 max-[940px]:w-full max-[940px]:grid-cols-1 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-px [&_span]:text-[0.68rem] [&_span]:font-bold [&_span]:uppercase [&_span]:text-[var(--muted-foreground)] [&_strong]:whitespace-nowrap [&_strong]:text-[0.88rem]">
          <div>
            <span>会话数量</span>
            <strong>{sessions.length}</strong>
          </div>
          <div>
            <span>总大小</span>
            <strong>{formatBytes(totalSessionSize)}</strong>
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)] mb-2.5 mt-0">
          删除会移除对应的 <code>.jsonl</code> 会话文件，不会修改 <code>config.toml</code>。
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-3.5">
        {sessions.length === 0 ? (
          <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">当前 Codex Home 下没有 session 记录。</div>
        ) : selectedYear ? (
          selectedYear.months.map((group) => {
            const isCollapsed = collapsedMonths[group.key] ?? false;

            return (
              <section className="flex min-w-0 flex-col gap-[7px]" key={group.key}>
                <button
                  aria-expanded={!isCollapsed}
                  className="flex w-full cursor-pointer items-center justify-between gap-2.5 border-x-0 border-t-0 border-b border-[var(--border)] bg-transparent px-0.5 pb-[7px] pt-0 text-left text-inherit focus-visible:rounded-[var(--radius)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(37,99,235,0.32)] [&>strong]:whitespace-nowrap [&>strong]:text-[0.78rem] [&>strong]:text-[var(--muted-foreground)] [&_span]:text-[0.76rem] [&_span]:text-[var(--muted-foreground)]"
                  onClick={() => toggleMonth(group.key)}
                  type="button"
                >
                  <span className="inline-flex flex-none text-[var(--muted-foreground)]" aria-hidden="true">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3>{group.label}</h3>
                    <span>{group.sessions.length} sessions</span>
                  </div>
                  <strong>{formatBytes(group.totalSize)}</strong>
                </button>
                {!isCollapsed && (
                  <div className="flex min-w-0 flex-col gap-2">
                    {group.sessions.map((session) => {
                      const deleting = pendingDeleteId === session.id;
                      const deleteLabel = sessionDeleteLabel(session, pendingDeleteId);

                      return (
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2.5 text-left text-[var(--foreground)] max-[940px]:grid-cols-1" key={session.id}>
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex min-w-0 items-center justify-between gap-2 [&>strong]:break-words [&>strong]:text-[var(--foreground)]">
                              <strong>{session.title}</strong>
                              <span className="inline-flex min-w-16 flex-none items-center justify-center self-start whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--secondary)] px-[9px] py-1 text-[0.72rem] font-extrabold leading-[1.1] text-[var(--secondary-foreground)]">{formatBytes(session.size)}</span>
                            </div>
                            <code>{displayPath(session.path, state.homeDir)}</code>
                            <div className="flex flex-wrap gap-1.5 text-[0.78rem] text-[var(--muted-foreground)] [&>span]:break-words">
                              <span>{formatIsoDateTime(session.lastTimestamp ?? session.createdAt)}</span>
                              <span>{session.userMessageCount} user / {session.messageCount} messages</span>
                              {session.cwd && <span>{displayPath(session.cwd, state.homeDir)}</span>}
                              {session.cliVersion && <span>codex {session.cliVersion}</span>}
                              {session.modelProvider && <span>{session.modelProvider}</span>}
                            </div>
                            {session.parseError && (
                              <p className="text-[0.8rem] text-[var(--destructive)]">{session.parseError}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap justify-end gap-[5px]">
                            <button
                              aria-label={deleteLabel}
                              className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
                              onClick={() => onDelete(session.id)}
                              title={deleteLabel}
                              type="button"
                            >
                              <Trash2 size={14} />
                              {deleting ? "确认删除" : "删除"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">当前 Codex Home 下没有 session 记录。</div>
        )}
      </div>
    </section>
  );
}
