import { AlertTriangle, CheckCircle2, FileCode2 } from "lucide-react";
import type { AppState, ProfileWarning } from "./appState";
import type { FieldState } from "./configFieldDrafts";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { CompactEmpty } from "./components/ui/compact-empty";
import { Input } from "./components/ui/input";
import { Notice } from "./components/ui/notice";
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
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&_label]:mb-0.5 [&_label]:block [&_label]:font-semibold [&_label]:leading-tight [&_label]:text-[var(--foreground)]">
                      <label htmlFor={fieldControlId(title, field.path)}>{field.label}</label>
                      <Badge variant={riskBadgeVariant(field.risk)}>{field.risk}</Badge>
                      <Badge variant={field.editable ? "success" : "secondary"}>
                        {field.editable ? "editable" : "read-only"}
                      </Badge>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&_code]:max-w-full">
                      <code>{field.path}</code>
                      <span className="inline-flex min-h-6 max-w-full min-w-0 items-center gap-[5px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-[7px] py-0.5 text-[var(--muted-foreground)] [&>span]:whitespace-nowrap [&>span]:text-[0.68rem] [&>span]:font-semibold [&>span]:uppercase [&>strong]:max-w-[220px] [&>strong]:truncate [&>strong]:text-[0.72rem] [&>strong]:font-medium [&>strong]:text-[var(--foreground)]">
                        <span>当前值</span>
                        <strong>{fieldDisplayValue(field)}</strong>
                      </span>
                    </div>
                    {field.note && <p>{field.note}</p>}
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

export function FieldCatalog({
  fields,
  query,
  onQueryChange,
}: {
  fields: FieldState[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const normalized = query.trim().toLowerCase();
  const visibleFields = normalized
    ? fields.filter((field) =>
        [field.label, field.path, field.group, field.risk, field.kind]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
    : fields;
  const resultLabel = normalized
    ? `${visibleFields.length} / ${fields.length} 个字段`
    : `${fields.length} 个字段`;

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 max-h-[460px] overflow-hidden" aria-labelledby="field-catalog-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0 items-start gap-2.5 [&>div]:min-w-0">
        <FileCode2 size={18} />
        <div>
          <h2 id="field-catalog-title">字段目录</h2>
          <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">所有 bundled schema 字段都可搜索；复杂字段第一期只读。</p>
        </div>
        <Badge size="count">{resultLabel}</Badge>
      </div>
      <label className="mb-2 flex min-w-0 flex-col gap-[5px] [&>span]:text-[0.74rem] [&>span]:font-semibold [&>span]:text-[var(--muted-foreground)]">
        <span>搜索字段目录</span>
        <Input
          className="!w-full !max-w-none"
          type="search"
          value={query}
          placeholder="搜索 label / TOML path / group / risk"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <div className="flex max-h-[336px] flex-col gap-1.5 overflow-auto pr-1">
        {visibleFields.length === 0 ? (
          <CompactEmpty>没有匹配的 schema 字段。</CompactEmpty>
        ) : (
          visibleFields.map((field) => (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2.5 max-[940px]:grid-cols-1" key={field.path}>
              <div className="flex min-w-0 flex-col gap-[5px]">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&>strong]:min-w-0 [&>strong]:break-words [&>strong]:text-[var(--foreground)]">
                  <strong>{field.label}</strong>
                  <Badge variant="muted">{field.kind}</Badge>
                </div>
                <code>{field.path}</code>
                {field.note && <p className="mt-0 break-words text-[0.8rem] leading-[1.45] text-[var(--muted-foreground)]">{field.note}</p>}
              </div>
              <div className="flex max-w-[180px] flex-col flex-wrap items-end justify-start gap-1 max-[940px]:max-w-none max-[940px]:items-start" aria-label={`${field.label} metadata`}>
                <Badge variant={riskBadgeVariant(field.risk)}>{field.risk}</Badge>
                <Badge variant={field.editable ? "success" : "secondary"}>
                  {field.editable ? "editable" : "read-only"}
                </Badge>
                <Badge variant="muted">{field.group || "其他"}</Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function ProfileSettingsForm({
  state,
  draftValues,
  dirty,
  onChange,
  onSave,
}: {
  state: AppState;
  draftValues: Record<string, string>;
  dirty: boolean;
  onChange: (path: string, value: string, kind: FieldState["kind"]) => void;
  onSave: () => void;
}) {
  const status = state.profileStatus;

  if (!status?.activeProfile) {
    return (
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0">
          <FileCode2 size={18} />
          <h2>当前 profile 配置</h2>
        </div>
        <CompactEmpty>
          当前没有 active profile。设置 root 的 <code>profile</code> 后，这里会显示该 profile
          的覆盖配置。
        </CompactEmpty>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <ProfileStatusNotice status={status} />
      <SettingsForm
        fields={state.profileFields}
        draftValues={draftValues}
        dirty={dirty}
        writable={state.writable}
        title={`当前 profile：${status.activeProfile}`}
        emptyMessage="当前 profile 没有可编辑字段。"
        onChange={onChange}
        onSave={onSave}
      />
    </section>
  );
}

function ProfileStatusNotice({
  status,
}: {
  status: NonNullable<AppState["profileStatus"]>;
}) {
  if (status.exists) {
    return (
      <Notice className="mb-2" variant="success">
        <CheckCircle2 size={18} />
        <span>正在编辑 active profile：{status.activeProfile}</span>
      </Notice>
    );
  }

  return (
    <Notice variant="warning">
      <AlertTriangle size={18} />
      <span>
        active profile "{status.activeProfile}" 还没有配置表。保存 profile 配置时会创建它。
      </span>
    </Notice>
  );
}

export function ProfileWarnings({ warnings }: { warnings: ProfileWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <Notice variant="warning">
      <AlertTriangle size={18} />
      <div>
        <strong>当前 profile 覆盖了全局配置</strong>
        {warnings.map((warning) => (
          <p key={`${warning.profile}-${warning.path}`}>
            {profileWarningText(warning)} 全局：{warning.rootValue ?? "unset"}，profile：{" "}
            {warning.profileValue}.
          </p>
        ))}
      </div>
    </Notice>
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

function fieldDisplayValue(field: FieldState) {
  if (field.value === undefined || field.value === "") {
    return "继承 / 未设置";
  }

  return field.value;
}

function riskBadgeVariant(risk: FieldState["risk"]) {
  if (risk === "normal") {
    return "success";
  }

  if (risk === "caution") {
    return "warning";
  }

  if (risk === "experimental") {
    return "primary";
  }

  return "destructive";
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

function profileWarningText(warning: ProfileWarning) {
  const fieldName =
    warning.path === "features.fast_mode"
      ? "Fast 模式"
      : warning.path === "model"
        ? "模型"
        : fieldLabel(warning.path);

  return `当前 profile "${warning.profile}" 覆盖了全局 ${fieldName}。`;
}

function fieldLabel(path: string) {
  const labels: Record<string, string> = {
    model_provider: "模型提供方",
    oss_provider: "本地模型提供方",
    model_reasoning_effort: "推理强度",
    model_reasoning_summary: "推理摘要",
    model_verbosity: "输出详细度",
    service_tier: "服务层级",
    sandbox_mode: "沙盒模式",
    approval_policy: "审批策略",
    web_search: "网页搜索模式",
    hide_agent_reasoning: "隐藏推理过程",
    show_raw_agent_reasoning: "显示原始推理事件",
  };

  return labels[path] ?? path;
}
