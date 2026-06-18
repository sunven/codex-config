import { useRef, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Switch } from "./components/ui/switch";
import type { AppState, SaveResult, SkillImportBatchResult } from "./appState";
import {
  globalSkillsWorkspace,
  importedSkillBatchPath,
  type SkillContent,
} from "./globalSkills";
import { displayPath, formatBytes } from "./formatters";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { CompactEmpty } from "./components/ui/compact-empty";
import { Input } from "./components/ui/input";
import { cn } from "./components/ui/utils";

type SkillsWorkspaceProps = {
  state: AppState;
  onStateChange: (state: AppState) => void;
  onError: (message: string | null) => void;
  onStatusMessage: (message: string | null) => void;
};

export function SkillsWorkspace({
  state,
  onStateChange,
  onError,
  onStatusMessage,
}: SkillsWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<SkillContent | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<SkillImportBatchResult | null>(null);
  const importingRef = useRef(false);

  async function readSkill(path: string) {
    onError(null);
    onStatusMessage(null);
    setImportResult(null);
    setSelectedPath(path);

    try {
      setContent(
        await invoke<SkillContent>("read_skill_content", {
          path,
        }),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveSkillEnabled(path: string, enabled: boolean) {
    onError(null);
    onStatusMessage(null);
    setImportResult(null);

    try {
      const result = await invoke<SaveResult>("save_skill_enabled", {
        path,
        enabled,
        fileToken: state.fileToken ?? null,
      });
      onStateChange(result.state);
      onStatusMessage(
        result.changed
          ? `已${enabled ? "启用" : "停用"} skill。重启 Codex 后生效。`
          : "Skill 启停状态没有变化。",
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function importSkillDirectories() {
    if (importingRef.current) {
      return;
    }

    importingRef.current = true;
    setImporting(true);
    onError(null);
    onStatusMessage(null);
    setImportResult(null);

    try {
      const selected = await open({
        directory: true,
        multiple: true,
        title: "选择 skill 目录或父目录",
      });

      const directories = selectedDirectories(selected);
      if (directories.length === 0) {
        return;
      }

      const result = await invoke<SkillImportBatchResult>("import_skill_directories", {
        directories,
      });
      if (result.state) {
        onStateChange(result.state);
        setSelectedPath(
          importedSkillBatchPath(
            result.state.skills.skills,
            [...result.imported, ...result.existing].map((item) => item.skillPath),
            directories,
          ),
        );
      }
      setContent(null);
      setImportResult(result);
      onStatusMessage(importStatusMessage(result));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  return (
    <SkillsPanel
      state={state}
      query={query}
      selectedPath={selectedPath}
      content={content}
      importing={importing}
      importResult={importResult}
      onQueryChange={setQuery}
      onSelect={readSkill}
      onSaveToggle={saveSkillEnabled}
      onImport={importSkillDirectories}
    />
  );
}

function SkillsPanel({
  state,
  query,
  selectedPath,
  content,
  importing,
  importResult,
  onQueryChange,
  onSelect,
  onSaveToggle,
  onImport,
}: {
  state: AppState;
  query: string;
  selectedPath: string | null;
  content: SkillContent | null;
  importing: boolean;
  importResult: SkillImportBatchResult | null;
  onQueryChange: (value: string) => void;
  onSelect: (path: string) => void;
  onSaveToggle: (path: string, enabled: boolean) => void;
  onImport: () => void;
}) {
  const {
    visibleSkills: skills,
    selectedSkill,
    selectedMarkdown,
    resultLabel,
  } = globalSkillsWorkspace(state.skills, query, selectedPath, content);

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3" aria-labelledby="global-skills-title">
      <div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0 flex-wrap items-center [&>div]:min-w-0">
        <BookOpen size={18} />
        <div>
          <h2 id="global-skills-title">全局 Skills</h2>
        </div>
        <Badge size="count">{resultLabel}</Badge>
        <Button
          aria-label="新增 skill"
          disabled={!state.writable || importing}
          onClick={onImport}
          size="sm"
        >
          <Plus size={14} />
          <span>{importing ? "导入中" : "新增 skill"}</span>
        </Button>
        <div className="ml-2 flex min-w-0 flex-[1_1_360px] flex-wrap gap-[5px]">
          {state.skills.roots.map((root) => (
            <Badge
              className="max-w-full break-words whitespace-normal px-2 py-[3px]"
              variant={!root.exists ? "muted" : root.label.toLowerCase().includes("agent") ? "success" : "primary"}
              key={root.path}
            >
              {root.label}: {root.exists ? displayPath(root.path, state.homeDir) : "未找到"}
            </Badge>
          ))}
        </div>
      </div>

      <SkillImportDetails result={importResult} homeDir={state.homeDir} />

      <div className="grid grid-cols-[minmax(240px,0.42fr)_minmax(0,0.58fr)] gap-3 max-[940px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="mb-2 flex min-w-0 flex-col gap-[5px] [&>span]:text-[0.74rem] [&>span]:font-semibold [&>span]:text-[var(--muted-foreground)]">
            <span>搜索全局 skills</span>
            <Input
              className="!w-full !max-w-none"
              type="search"
              value={query}
              placeholder="搜索 skill 名称、描述或路径"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </label>
          {skills.length === 0 ? (
            <CompactEmpty>没有发现匹配的全局 skill。</CompactEmpty>
          ) : (
            skills.map((skill) => {
              return (
                <div
                  className={cn("relative flex min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] py-2.5 pl-3 pr-[84px]", skill.source.toLowerCase().includes("agent") ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#bfdbfe] bg-[#eff6ff]", skill.path === selectedSkill?.path && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.24)]")}
                  key={skill.path}
                >
                  <button
                    aria-label={`选择 skill ${skill.name}`}
                    className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0"
                    onClick={() => onSelect(skill.path)}
                    type="button"
                  />
                  <Badge className="absolute right-3 top-2.5 z-[1] bg-[var(--card)] px-[9px] py-1 font-extrabold leading-[1.1]" variant="card">
                    {formatBytes(skill.size)}
                  </Badge>
                  <div className="relative z-[1] flex min-w-0 items-start gap-[7px]">
                    <Switch
                      aria-label={`${skill.enabled ? "停用" : "启用"} skill ${skill.name}`}
                      checked={skill.enabled}
                      className="z-[2] flex-none"
                      disabled={!state.writable}
                      onCheckedChange={(checked) => onSaveToggle(skill.path, checked)}
                      size="sm"
                    />
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 [&>strong]:text-[var(--foreground)]">
                      <strong>{skill.name}</strong>
                      {skill.symlink && <Badge className="py-[3px] text-[0.68rem] font-extrabold leading-none" variant="primary">软链</Badge>}
                    </span>
                  </div>
                  <code>{displayPath(skill.path, state.homeDir)}</code>
                  {skill.symlink && skill.targetDirectory && (
                    <small className="relative z-[1] break-words text-[0.74rem] font-bold text-[var(--foreground)]">
                      原始位置：{displayPath(skill.targetDirectory, state.homeDir)}
                    </small>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2">
          {selectedSkill ? (
            <>
              <div className="flex min-w-0 items-start justify-between gap-2 [&_p]:mt-[3px] [&_p]:break-words [&_p]:text-[0.72rem] [&_p]:text-[var(--muted-foreground)]">
                <div>
                  <h3>{selectedSkill.name}</h3>
                  <p>{displayPath(selectedSkill.directory, state.homeDir)}</p>
                  {selectedSkill.symlink && selectedSkill.targetDirectory && (
                    <p className="font-semibold text-[var(--foreground)]">
                      原始位置：{displayPath(selectedSkill.targetDirectory, state.homeDir)}
                    </p>
                  )}
                </div>
                <Badge
                  className="self-start text-[0.68rem] font-extrabold uppercase"
                  variant={selectedSkill.enabled ? "success" : "secondary"}
                >
                  {selectedSkill.enabled ? "enabled" : "disabled"}
                </Badge>
              </div>
              <pre className="m-0 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-[var(--code-background)] p-2.5 text-[0.76rem] leading-[1.42] text-[var(--code-foreground)]">{selectedMarkdown || "选择左侧 skill 后会显示 SKILL.md 内容。"}</pre>
              <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
                保存启停配置后需要重启 Codex，新状态才会进入下一次 skills 列表。
              </p>
            </>
          ) : (
            <CompactEmpty>没有可预览的 skill。</CompactEmpty>
          )}
        </div>
      </div>
    </section>
  );
}

function selectedDirectories(selected: string | string[] | null) {
  if (!selected) {
    return [];
  }

  return Array.isArray(selected) ? selected : [selected];
}

function importStatusMessage(result: SkillImportBatchResult) {
  const imported = result.imported.length;
  const existing = result.existing.length;
  const skipped = result.skipped.length;
  const conflicts = result.conflicts.length;
  const parts = [];

  if (imported > 0) {
    parts.push(`已导入 ${imported} 个 skills`);
  }
  if (existing > 0) {
    parts.push(`${existing} 个已存在`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} 个跳过`);
  }
  if (conflicts > 0) {
    parts.push(`${conflicts} 个名称冲突`);
  }

  if (parts.length === 0) {
    return "没有找到可导入的 skill。请选择包含 SKILL.md 的目录，或选择包含多个 skill 子目录的父目录。";
  }

  const suffix = result.refreshError
    ? `状态刷新失败：${result.refreshError}`
    : "重启 Codex 或开启新会话后生效。";

  return `${parts.join("，")}。${suffix}`;
}

function SkillImportDetails({
  result,
  homeDir,
}: {
  result: SkillImportBatchResult | null;
  homeDir?: string;
}) {
  if (!result || !shouldShowImportDetails(result)) {
    return null;
  }

  const rows = importDetailRows(result);
  const visibleRows = rows.slice(0, 12);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className="mb-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2">
      <div className="mb-1.5 text-[0.74rem] font-extrabold text-[var(--muted-foreground)]">
        导入结果明细
      </div>
      <div className="grid gap-1">
        {visibleRows.map((row) => (
          <div
            className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 rounded-[var(--radius)] bg-[var(--card)] px-2 py-1.5 text-[0.76rem]"
            key={`${row.kind}-${row.path}-${row.message}`}
          >
            <Badge className="w-fit" variant={row.variant}>
              {row.label}
            </Badge>
            <span className="min-w-0 break-words">
              {displayPath(row.path, homeDir)}
              <span className="text-[var(--muted-foreground)]">{" -> "}{row.message}</span>
            </span>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <details className="mt-2 text-[0.76rem] font-semibold">
          <summary>查看其余 {hiddenCount} 条结果</summary>
          <div className="mt-1 grid gap-1">
            {rows.slice(12).map((row) => (
              <div
                className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 rounded-[var(--radius)] bg-[var(--card)] px-2 py-1.5"
                key={`${row.kind}-${row.path}-${row.message}`}
              >
                <Badge className="w-fit" variant={row.variant}>
                  {row.label}
                </Badge>
                <span className="min-w-0 break-words">
                  {displayPath(row.path, homeDir)}
                  <span className="text-[var(--muted-foreground)]">{" -> "}{row.message}</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      {result.refreshError && (
        <div className="mt-2 rounded-[var(--radius)] bg-[#fff7ed] px-2 py-1.5 text-[0.76rem] font-semibold text-[#9a3412]">
          文件系统导入已完成，但状态刷新失败：{result.refreshError}
        </div>
      )}
    </div>
  );
}

function shouldShowImportDetails(result: SkillImportBatchResult) {
  return (
    result.refreshError ||
    result.existing.length > 0 ||
    result.skipped.length > 0 ||
    result.conflicts.length > 0
  );
}

function importDetailRows(result: SkillImportBatchResult) {
  return [
    ...result.imported.map((item) => ({
      kind: "imported",
      label: "已导入",
      variant: "success" as const,
      path: item.sourceDirectory,
      message: item.linkDirectory,
    })),
    ...result.existing.map((item) => ({
      kind: "existing",
      label: "已存在",
      variant: "primary" as const,
      path: item.sourceDirectory,
      message: item.linkDirectory,
    })),
    ...result.conflicts.map((problem) => ({
      kind: "conflict",
      label: "冲突",
      variant: "destructive" as const,
      path: problem.sourceDirectory,
      message: problem.reason,
    })),
    ...result.skipped.map((problem) => ({
      kind: "skipped",
      label: "跳过",
      variant: "muted" as const,
      path: problem.sourceDirectory,
      message: problem.reason,
    })),
  ];
}
