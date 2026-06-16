import { DatabaseBackup, Edit3, FileCode2 } from "lucide-react";
import type { AppState, BackupSummary } from "./appState";
import type { PreviewResult } from "./configEditWorkflow";
import { displayPath, formatBytes } from "./formatters";

type ConfigPreviewSidebarProps = {
  state: AppState;
  preview: PreviewResult | null;
  rawTomlDraft: string;
  rawTomlDirty: boolean;
  rawTomlWritable: boolean;
  rawTomlPreviewReady: boolean;
  onRawTomlChange: (value: string) => void;
  onPreviewRawToml: () => void;
  onSaveRawToml: () => void;
  onRestoreBackup: (backupId: string) => void;
};

export function ConfigPreviewSidebar({
  state,
  preview,
  rawTomlDraft,
  rawTomlDirty,
  rawTomlWritable,
  rawTomlPreviewReady,
  onRawTomlChange,
  onPreviewRawToml,
  onSaveRawToml,
  onRestoreBackup,
}: ConfigPreviewSidebarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 self-start sticky top-3 max-[940px]:static">
      <DiffPanel preview={preview} />
      <RawToml
        state={state}
        draft={rawTomlDraft}
        dirty={rawTomlDirty}
        writable={rawTomlWritable}
        previewReady={rawTomlPreviewReady}
        onChange={onRawTomlChange}
        onPreview={onPreviewRawToml}
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="raw-toml-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <Edit3 size={18} />
        <div>
          <h2 id="raw-toml-title">高级 TOML 编辑</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">用于配置字段目录中尚未提供专用控件的复杂配置。</p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <button
            aria-label="预览原始 TOML"
            className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
            disabled={!writable || !dirty}
            onClick={onPreview}
            type="button"
          >
            预览
          </button>
          <button
            aria-label="保存原始 TOML"
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)] px-[11px] text-[var(--primary-foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:border-[#1d4ed8] hover:bg-[#1d4ed8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            disabled={!writable || !dirty || !previewReady}
            onClick={onSave}
            type="button"
          >
            保存 TOML
          </button>
        </div>
      </div>
      {state.parseIssue && (
        <div className="mb-2 rounded-[var(--radius)] border border-[#fecaca] bg-[var(--destructive-soft)] p-2 text-[#991b1b]" role="alert">{state.parseIssue.message}</div>
      )}
      <label className="sr-only" htmlFor="raw-toml-editor">原始 TOML</label>
      <textarea
        className="min-h-80 w-full resize-y rounded-[var(--radius)] border border-[#3f3f46] bg-[var(--code-background)] p-2.5 text-[0.78rem] leading-[1.4] text-[var(--code-foreground)] outline-none [tab-size:2] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)]"
        id="raw-toml-editor"
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="diff-preview-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <FileCode2 size={18} />
        <h2 id="diff-preview-title">变更预览</h2>
      </div>
      {preview?.fieldDiffs.length ? (
        <div className="mb-2 flex flex-col gap-1.5">
          {preview.fieldDiffs.map((diff) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 max-[940px]:grid-cols-1 [&>div:first-child]:flex [&>div:first-child]:min-w-0 [&>div:first-child]:flex-col [&>div:first-child]:gap-[3px]" key={`${diff.scope}-${diff.path}`}>
              <div>
                <strong>{diff.label}</strong>
                <code>{diff.path}</code>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 max-[940px]:justify-start [&>span]:rounded-[var(--radius)] [&>span]:border [&>span]:border-[var(--border)] [&>span]:bg-[var(--card)] [&>span]:px-1.5 [&>span]:py-[3px] [&>span]:text-[0.78rem] [&>span]:text-[var(--foreground)] [&>strong]:rounded-[var(--radius)] [&>strong]:border [&>strong]:border-[#bbf7d0] [&>strong]:bg-[var(--success-soft)] [&>strong]:px-1.5 [&>strong]:py-[3px] [&>strong]:text-[0.78rem] [&>strong]:text-[var(--success)]">
                <span>{diff.before}</span>
                <span className="!border-0 !bg-transparent !p-0 !text-[var(--muted-foreground)]">改为</span>
                <strong>{diff.after}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-[var(--code-background)] p-2.5 text-[0.78rem] leading-[1.4] text-[var(--code-foreground)]">{preview?.textDiff ?? "预览后会在这里显示 TOML diff。"}</pre>
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
        <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">暂无备份。</div>
      ) : (
        <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
          {backups.slice(0, 5).map((backup) => (
            <li className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2" key={backup.id}>
              <div className="flex min-w-0 flex-col gap-px [&>span]:break-words [&>span]:text-[0.8rem] [&>small]:text-[var(--muted-foreground)]">
                <span>{backup.id}</span>
                <small>{formatBytes(backup.size)}</small>
              </div>
              <button
                aria-label={`恢复备份 ${backup.id}`}
                className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
                disabled={!writable}
                onClick={() => onRestore(backup.id)}
                title={`恢复备份 ${backup.id}`}
                type="button"
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
