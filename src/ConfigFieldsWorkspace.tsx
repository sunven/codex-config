import { FileCode2 } from "lucide-react";
import type { FieldState } from "./configFieldDrafts";
import { Button } from "./components/ui/button";
import { CompactEmpty } from "./components/ui/compact-empty";
import { Input } from "./components/ui/input";
import { Select } from "./components/ui/select";

export function SettingsForm({
  fields,
  draftValues,
  dirty,
  writable,
  title,
  emptyMessage,
  onChange,
  onSave,
}: {
  fields: FieldState[];
  draftValues: Record<string, string>;
  dirty: boolean;
  writable: boolean;
  title: string;
  emptyMessage: string;
  onChange: (path: string, value: string, kind: FieldState["kind"]) => void;
  onSave: () => void;
}) {
  const groupedFields = groupFields(fields);
  const saveLabel =
    title === "全局配置" ? "保存全局配置" : `保存${title}`;

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby={sectionTitleId(title)}>
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
        <FileCode2 size={18} />
        <div>
          <h2 id={sectionTitleId(title)}>{title}</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">保存会直接写入 config.toml。</p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 max-[940px]:ml-0 max-[940px]:w-full [&>button]:max-[940px]:flex-1 [&>button]:max-[940px]:justify-center">
          <Button
            className="ml-auto max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center !min-h-7 !px-2.5"
            aria-label={saveLabel}
            disabled={!writable || !dirty}
            onClick={onSave}
            variant="primary"
            size="sm"
          >
            保存到 config.toml
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {fields.length === 0 ? (
          <CompactEmpty>
            {emptyMessage}
          </CompactEmpty>
        ) : (
          groupedFields.map((group) => (
            <section className="flex flex-col gap-0" key={group.name}>
              <h3 className="border-b border-[var(--border)] pb-[5px] text-[0.72rem] font-semibold uppercase text-[var(--muted-foreground)]">{group.name}</h3>
              {group.fields.map((field) => (
                <div className="grid min-h-[68px] grid-cols-[minmax(0,1fr)_minmax(150px,220px)] items-start gap-3.5 border-t border-[var(--border)] py-2.5 first:border-t-0 max-[940px]:grid-cols-1" key={field.path}>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&_code]:max-w-full [&_label]:block [&_label]:font-semibold [&_label]:leading-tight [&_label]:text-[var(--foreground)]">
                      <label htmlFor={fieldControlId(title, field.path)}>{field.label}</label>
                      <code>{field.path}</code>
                    </div>
                    {field.note && <p className="text-[0.82rem] leading-[1.35] text-[var(--muted-foreground)]">{field.note}</p>}
                  </div>
                  <FieldValue
                    field={field}
                    id={fieldControlId(title, field.path)}
                    value={draftValues[field.path]}
                    onChange={(value) => onChange(field.path, value, field.kind)}
                  />
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function groupFields(fields: FieldState[]) {
  return fields.reduce<{ name: string; fields: FieldState[] }[]>((groups, field) => {
    const name = field.group || "其他";
    const existing = groups.find((group) => group.name === name);

    if (existing) {
      existing.fields.push(field);
    } else {
      groups.push({ name, fields: [field] });
    }

    return groups;
  }, []);
}

function FieldValue({
  field,
  id,
  value,
  onChange,
}: {
  field: FieldState;
  id: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  if (!field.editable) {
    return <span className="inline-flex min-w-[72px] justify-center rounded-full bg-[var(--muted)] px-2 py-1 font-bold text-[var(--muted-foreground)] justify-self-end max-[940px]:justify-self-stretch">{field.value || "unset"}</span>;
  }

  if (field.kind === "boolean") {
    return (
      <Select
        className="!w-[132px]"
        id={id}
        value={value ?? "inherited"}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="inherited">inherited</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  }

  if (field.kind === "select") {
    return (
      <Select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">unset</option>
        {(field.options ?? []).map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </Select>
    );
  }

  if (field.kind === "number") {
    return (
      <Input
        id={id}
        value={value ?? ""}
        placeholder="unset"
        type="number"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }

  return (
    <Input
      id={id}
      value={value ?? ""}
      placeholder="unset"
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function sectionTitleId(title: string) {
  return `${slugify(title)}-settings-title`;
}

function fieldControlId(title: string, path: string) {
  return `${slugify(title)}-${slugify(path)}-field`;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || encodeURIComponent(value).replace(/%/g, "").toLowerCase();
}
