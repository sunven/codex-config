import { useRef, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Switch } from "./components/ui/switch";
import type { AppState, SaveResult } from "./appState";
import {
  globalSkillsWorkspace,
  importedSkillPath,
  type SkillContent,
} from "./globalSkills";
import { displayPath, formatBytes } from "./formatters";

type SkillsWorkspaceProps = {
  state: AppState;
  onStateChange: (state: AppState) => void;
  onError: (message: string | null) => void;
  onStatusMessage: (message: string | null) => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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
  const importingRef = useRef(false);

  async function readSkill(path: string) {
    onError(null);
    onStatusMessage(null);
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

  async function importSkillDirectory() {
    if (importingRef.current) {
      return;
    }

    importingRef.current = true;
    setImporting(true);
    onError(null);
    onStatusMessage(null);

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 skill 目录",
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      const result = await invoke<SaveResult>("import_skill_directory", {
        directory: selected,
      });
      onStateChange(result.state);
      setSelectedPath(importedSkillPath(result.state.skills.skills, selected));
      setContent(null);
      onStatusMessage(
        result.changed
          ? "已导入 skill。重启 Codex 或开启新会话后生效。"
          : "Skill 已经导入。重启 Codex 或开启新会话后生效。",
      );
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
      onQueryChange={setQuery}
      onSelect={readSkill}
      onSaveToggle={saveSkillEnabled}
      onImport={importSkillDirectory}
    />
  );
}

function SkillsPanel({
  state,
  query,
  selectedPath,
  content,
  importing,
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
        <span className="inline-flex min-h-6 flex-none items-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[0.72rem] font-bold text-[var(--secondary-foreground)]">{resultLabel}</span>
        <button
          aria-label="新增 skill"
          className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[9px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
          disabled={!state.writable || importing}
          onClick={onImport}
          type="button"
        >
          <Plus size={14} />
          <span>{importing ? "导入中" : "新增 skill"}</span>
        </button>
        <div className="ml-2 flex min-w-0 flex-[1_1_360px] flex-wrap gap-[5px]">
          {state.skills.roots.map((root) => (
            <span
              className={cx("max-w-full break-words rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-[3px] text-[0.72rem] font-bold text-[var(--secondary-foreground)]", root.label.toLowerCase().includes("agent") ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]", !root.exists && "border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)]")}
              key={root.path}
            >
              {root.label}: {root.exists ? displayPath(root.path, state.homeDir) : "未找到"}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(240px,0.42fr)_minmax(0,0.58fr)] gap-3 max-[940px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="mb-2 flex min-w-0 flex-col gap-[5px] [&>span]:text-[0.74rem] [&>span]:font-semibold [&>span]:text-[var(--muted-foreground)]">
            <span>搜索全局 skills</span>
            <input
              className="min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus-visible:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none !w-full !max-w-none"
              type="search"
              value={query}
              placeholder="搜索 skill 名称、描述或路径"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </label>
          {skills.length === 0 ? (
            <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">没有发现匹配的全局 skill。</div>
          ) : (
            skills.map((skill) => {
              return (
                <div
                  className={cx("relative flex min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] py-2.5 pl-3 pr-[84px]", skill.source.toLowerCase().includes("agent") ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#bfdbfe] bg-[#eff6ff]", skill.path === selectedSkill?.path && "border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.24)]")}
                  key={skill.path}
                >
                  <button
                    aria-label={`选择 skill ${skill.name}`}
                    className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0"
                    onClick={() => onSelect(skill.path)}
                    type="button"
                  />
                  <span className="absolute right-3 top-2.5 z-[1] inline-flex min-w-16 items-center justify-center whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--card)] px-[9px] py-1 text-[0.72rem] font-extrabold leading-[1.1] text-[var(--secondary-foreground)]">{formatBytes(skill.size)}</span>
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
                      {skill.symlink && <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-[7px] py-[3px] text-[0.68rem] font-extrabold leading-none text-[var(--primary)]">软链</span>}
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
                <span className={cx("self-start rounded-full border border-[var(--border)] bg-[var(--secondary)] px-[7px] py-0.5 text-[0.68rem] font-extrabold uppercase text-[var(--secondary-foreground)]", selectedSkill.enabled && "border-[#bbf7d0] bg-[var(--success-soft)] text-[var(--success)]")}>
                  {selectedSkill.enabled ? "enabled" : "disabled"}
                </span>
              </div>
              <pre className="m-0 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-[var(--code-background)] p-2.5 text-[0.76rem] leading-[1.42] text-[var(--code-foreground)]">{selectedMarkdown || "选择左侧 skill 后会显示 SKILL.md 内容。"}</pre>
              <p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
                保存启停配置后需要重启 Codex，新状态才会进入下一次 skills 列表。
              </p>
            </>
          ) : (
            <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]">没有可预览的 skill。</div>
          )}
        </div>
      </div>
    </section>
  );
}
