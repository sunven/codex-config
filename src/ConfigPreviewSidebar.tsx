import { Edit3 } from "lucide-react";
import type { AppState } from "./appState";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";

type ConfigPreviewSidebarProps = {
  state: AppState;
  rawTomlDraft: string;
  rawTomlDirty: boolean;
  rawTomlWritable: boolean;
  onRawTomlChange: (value: string) => void;
  onSaveRawToml: () => void;
};

export function ConfigPreviewSidebar({
  state,
  rawTomlDraft,
  rawTomlDirty,
  rawTomlWritable,
  onRawTomlChange,
  onSaveRawToml,
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
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <Edit3 size={18} />
        <div>
          <h2>高级 TOML 编辑</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">用于编辑尚未提供专用控件的复杂配置。</p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <Button
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
        <div className="mb-2 rounded-[var(--radius)] border border-[#fecaca] bg-[var(--destructive-soft)] p-2 text-[#991b1b]">{state.parseIssue.message}</div>
      )}
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
