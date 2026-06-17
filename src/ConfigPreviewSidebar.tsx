import { DatabaseBackup, Edit3 } from "lucide-react";
import type { AppState, BackupSummary } from "./appState";
import { displayPath, formatBytes } from "./formatters";
import { Button } from "./components/ui/button";
import { CompactEmpty } from "./components/ui/compact-empty";
import { Textarea } from "./components/ui/textarea";

type ConfigPreviewSidebarProps = {
  state: AppState;
  rawTomlDraft: string;
  rawTomlDirty: boolean;
  rawTomlWritable: boolean;
  onRawTomlChange: (value: string) => void;
  onSaveRawToml: () => void;
  onRestoreBackup: (backupId: string) => void;
};

export function ConfigPreviewSidebar({
  state,
  rawTomlDraft,
  rawTomlDirty,
  rawTomlWritable,
  onRawTomlChange,
  onSaveRawToml,
  onRestoreBackup,
}: ConfigPreviewSidebarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 self-start sticky top-3 max-[940px]:static">
      <RawToml
        state={state}
        draft={rawTomlDraft}
        dirty={rawTomlDirty}
        writable={rawTomlWritable}
        onChange={onRawTomlChange}
        onSave={onSaveRawToml}
      />
      <Backups
        backups={state.backups}
        backupDir={state.backupDir}
        homeDir={state.homeDir}
        writable={state.writable}
        onRestore={onRestoreBackup}
      />
    </div>
  );
}

function RawToml({
  state,
  draft,
  dirty,
  writable,
  onChange,
  onSave,
}: {
  state: AppState;
  draft: string;
  dirty: boolean;
  writable: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="raw-toml-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <Edit3 size={18} />
        <div>
          <h2 id="raw-toml-title">高级 TOML 编辑</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">用于配置字段目录中尚未提供专用控件的复杂配置。</p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <Button
            aria-label="保存原始 TOML"
            className="ml-auto max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            disabled={!writable || !dirty}
            onClick={onSave}
            variant="primary"
            size="sm"
          >
            保存 TOML
          </Button>
        </div>
      </div>
      {state.parseIssue && (
        <div className="mb-2 rounded-[var(--radius)] border border-[#fecaca] bg-[var(--destructive-soft)] p-2 text-[#991b1b]" role="alert">{state.parseIssue.message}</div>
      )}
      <label className="sr-only" htmlFor="raw-toml-editor">原始 TOML</label>
      <Textarea
        className="min-h-80"
        id="raw-toml-editor"
        value={draft}
        variant="code"
        placeholder="# config.toml 还不存在"
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </section>
  );
}

function Backups({
  backups,
  backupDir,
  homeDir,
  writable,
  onRestore,
}: {
  backups: BackupSummary[];
  backupDir: string;
  homeDir?: string;
  writable: boolean;
  onRestore: (backupId: string) => void;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="backups-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <DatabaseBackup size={18} />
        <h2 id="backups-title">备份</h2>
      </div>
      <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">{displayPath(backupDir, homeDir)}</p>
      {backups.length === 0 ? (
        <CompactEmpty>暂无备份。</CompactEmpty>
      ) : (
        <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
          {backups.slice(0, 5).map((backup) => (
            <li className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2" key={backup.id}>
              <div className="flex min-w-0 flex-col gap-px [&>span]:break-words [&>span]:text-[0.8rem] [&>small]:text-[var(--muted-foreground)]">
                <span>{backup.id}</span>
                <small>{formatBytes(backup.size)}</small>
              </div>
              <Button
                aria-label={`恢复备份 ${backup.id}`}
                disabled={!writable}
                onClick={() => onRestore(backup.id)}
                title={`恢复备份 ${backup.id}`}
                size="sm"
              >
                恢复此备份
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
