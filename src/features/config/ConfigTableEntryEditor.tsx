import type { ReactNode } from "react";
import { FileCode2, Plus } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { CompactEmpty } from "../../components/ui/compact-empty";
import { Input } from "../../components/ui/input";

export function TableEntryEditor({
  title,
  description,
  countLabel,
  saveButtonText,
  writable,
  dirty,
  onSave,
  newEntryText,
  onNewEntry,
  emptyMessage,
  entries,
  form,
}: {
  title: string;
  description: ReactNode;
  countLabel: string;
  saveButtonText: string;
  writable: boolean;
  dirty: boolean;
  onSave: () => void;
  newEntryText: string;
  onNewEntry: () => void;
  emptyMessage: string;
  entries: ReactNode;
  form: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <FileCode2 size={18} />
        <div>
          <h2>{title}</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">{description}</p>
        </div>
        <Badge size="count">{countLabel}</Badge>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <Button
            className="ml-auto max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            disabled={!writable || !dirty}
            onClick={onSave}
            variant="primary"
            size="sm"
          >
            {saveButtonText}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(240px,0.34fr)_minmax(0,1fr)] gap-3 max-[940px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Button
            className="flex w-full min-w-0 flex-row items-center whitespace-normal border-[var(--border)] bg-[var(--muted)] p-2 text-left font-bold text-[var(--foreground)]"
            onClick={onNewEntry}
            variant="ghost"
          >
            <Plus size={16} />
            {newEntryText}
          </Button>
          {entries ? entries : <CompactEmpty>{emptyMessage}</CompactEmpty>}
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
      <Input
        className="!w-full !max-w-none"
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
      <Input
        className="!w-full !max-w-none"
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
        <Button size="sm" onClick={() => onChange([...values, ""])}>
          <Plus size={14} />
          添加
        </Button>
      </div>
      {values.length === 0 ? (
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">未设置。</p>
      ) : (
        values.map((value, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 max-[940px]:grid-cols-1" key={`${label}-${index}`}>
            <Input
              className="!w-full !max-w-none"
              value={value}
              placeholder={placeholder ?? "value"}
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <Button size="sm" onClick={() => remove(index)}>
              删除
            </Button>
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
        <Button
          size="sm"
          onClick={() => onChange({ ...values, "": "" })}
        >
          <Plus size={14} />
          添加
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">未设置。</p>
      ) : (
        rows.map(([key, value], index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 max-[940px]:grid-cols-1" key={`${label}-${index}`}>
            <Input
              className="!w-full !max-w-none"
              value={key}
              placeholder="key"
              onChange={(event) => updateKey(index, event.currentTarget.value)}
            />
            <Input
              className="!w-full !max-w-none"
              value={value}
              placeholder="value"
              onChange={(event) => updateValue(index, event.currentTarget.value)}
            />
            <Button size="sm" onClick={() => remove(index)}>
              删除
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
