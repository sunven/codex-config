import type { ReactNode } from "react";
import { FileCode2, Plus } from "lucide-react";

export function TableEntryEditor({
  titleId,
  title,
  description,
  countLabel,
  previewLabel,
  saveLabel,
  saveButtonText,
  writable,
  dirty,
  savePreviewReady,
  onPreview,
  onSave,
  newEntryAriaLabel,
  newEntryText,
  onNewEntry,
  emptyMessage,
  entries,
  form,
}: {
  titleId: string;
  title: string;
  description: ReactNode;
  countLabel: string;
  previewLabel: string;
  saveLabel: string;
  saveButtonText: string;
  writable: boolean;
  dirty: boolean;
  savePreviewReady: boolean;
  onPreview: () => void;
  onSave: () => void;
  newEntryAriaLabel: string;
  newEntryText: string;
  onNewEntry: () => void;
  emptyMessage: string;
  entries: ReactNode;
  form: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby={titleId}>
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <FileCode2 size={18} />
        <div>
          <h2 id={titleId}>{title}</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">{description}</p>
        </div>
        <span className="inline-flex min-h-6 flex-none items-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[0.72rem] font-bold text-[var(--secondary-foreground)]">{countLabel}</span>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <button
            aria-label={previewLabel}
            className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
            disabled={!writable || !dirty}
            onClick={onPreview}
            type="button"
          >
            预览
          </button>
          <button
            aria-label={saveLabel}
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)] px-[11px] text-[var(--primary-foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:border-[#1d4ed8] hover:bg-[#1d4ed8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            disabled={!writable || !dirty || !savePreviewReady}
            onClick={onSave}
            type="button"
          >
            {saveButtonText}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(240px,0.34fr)_minmax(0,1fr)] gap-3 max-[940px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <button
            aria-label={newEntryAriaLabel}
            className="flex w-full min-w-0 flex-row items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 text-left font-bold text-[var(--foreground)]"
            onClick={onNewEntry}
            type="button"
          >
            <Plus size={16} />
            {newEntryText}
          </button>
          {entries ? entries : <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">{emptyMessage}</div>}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">{form}</div>
      </div>
    </section>
  );
}

export function LabeledInput({
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
    <label className="flex min-w-0 flex-col gap-[3px] [&>span]:text-[0.76rem] [&>span]:font-bold [&>span]:text-[var(--muted-foreground)]">
      <span>{label}</span>
      <input
        className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export function LabeledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-[3px] [&>span]:text-[0.76rem] [&>span]:font-bold [&>span]:text-[var(--muted-foreground)]">
      <span>{label}</span>
      <input
        className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
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

export function StringListEditor({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder?: string;
  onChange: (values: string[]) => void;
}) {
  function updateValue(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function remove(index: number) {
    const next = [...values];
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
      <div className="flex items-center justify-between gap-1.5 [&>strong]:text-[0.76rem] [&>strong]:font-bold [&>strong]:text-[var(--muted-foreground)]">
        <strong>{label}</strong>
        <button className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]" onClick={() => onChange([...values, ""])}>
          <Plus size={14} />
          添加
        </button>
      </div>
      {values.length === 0 ? (
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">未设置。</p>
      ) : (
        values.map((value, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 max-[940px]:grid-cols-1" key={`${label}-${index}`}>
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              value={value}
              placeholder={placeholder ?? "value"}
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <button className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]" onClick={() => remove(index)}>
              删除
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export function StringMapEditor({
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
    <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
      <div className="flex items-center justify-between gap-1.5 [&>strong]:text-[0.76rem] [&>strong]:font-bold [&>strong]:text-[var(--muted-foreground)]">
        <strong>{label}</strong>
        <button
          className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
          onClick={() => onChange({ ...values, "": "" })}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">未设置。</p>
      ) : (
        rows.map(([key, value], index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 max-[940px]:grid-cols-1" key={`${label}-${index}`}>
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              value={key}
              placeholder="key"
              onChange={(event) => updateKey(index, event.currentTarget.value)}
            />
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              value={value}
              placeholder="value"
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <button className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]" onClick={() => remove(index)}>
              删除
            </button>
          </div>
        ))
      )}
    </div>
  );
}
