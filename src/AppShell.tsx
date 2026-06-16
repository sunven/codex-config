import { Gauge } from "lucide-react";
import type { AppState } from "./appState";

export type MainTab = "config" | "sessions" | "mcp" | "skills";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  return (
    <nav className="mx-auto mb-4 flex max-w-[1440px] gap-2 overflow-x-auto pb-0.5" aria-label="配置区域" role="tablist">
      <button
        aria-selected={activeTab === "config"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "config" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
        onClick={() => onChange("config")}
        role="tab"
        type="button"
      >
        Codex 配置
      </button>
      <button
        aria-selected={activeTab === "sessions"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "sessions" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
        onClick={() => onChange("sessions")}
        role="tab"
        type="button"
      >
        Sessions
      </button>
      <button
        aria-selected={activeTab === "mcp"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "mcp" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
        onClick={() => onChange("mcp")}
        role="tab"
        type="button"
      >
        MCP Servers
      </button>
      <button
        aria-selected={activeTab === "skills"}
        className={cx("min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px", activeTab === "skills" && "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]")}
        onClick={() => onChange("skills")}
        role="tab"
        type="button"
      >
        Skills
      </button>
    </nav>
  );
}

export function FastModeTask({
  state,
  onPreview,
  onSave,
  previewReady,
}: {
  state: AppState;
  onPreview: () => void;
  onSave: () => void;
  previewReady: boolean;
}) {
  const fastMode = state.fields.find((field) => field.path === "features.fast_mode");
  const value = fastMode?.value ?? "inherited";
  const canSave = state.writable && value !== "true";

  return (
    <section className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 max-[940px]:grid-cols-1">
      <div className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-[var(--secondary)] text-[var(--primary)]">
        <Gauge size={22} />
      </div>
      <div>
        <p className="mb-1 text-[0.75rem] font-medium uppercase text-[var(--muted-foreground)]">
          推荐操作
        </p>
        <h2>开启 Fast 模式</h2>
        <p className="mt-[3px] text-[var(--muted-foreground)]">
          当前全局值是 <strong>{value}</strong>。先预览 TOML 变更，再保存；
          保存前会自动备份。
        </p>
      </div>
      <div className="flex justify-end gap-1.5 max-[940px]:w-full [&>button]:max-[940px]:flex-1">
        <button
          className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-[11px] text-[var(--foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]"
          aria-label="预览 Fast 模式"
          disabled={!canSave}
          onClick={onPreview}
        >
          预览
        </button>
        <button
          className="ml-auto inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)] px-[11px] text-[var(--primary-foreground)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] hover:border-[#1d4ed8] hover:bg-[#1d4ed8] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-center"
          aria-label="保存 Fast 模式"
          disabled={!canSave || !previewReady}
          onClick={onSave}
        >
          保存到 config.toml
        </button>
      </div>
    </section>
  );
}
