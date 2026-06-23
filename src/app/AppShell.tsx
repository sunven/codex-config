import { cn } from "../components/ui/utils";
import type { ClaudeProduct } from "../features/claude/claudeState";

export type MainTab = "config" | "sessions" | "mcp" | "skills";

export function ProductSwitcher({
  product,
  onChange,
}: {
  product: ClaudeProduct;
  onChange: (product: ClaudeProduct) => void;
}) {
  const options: { value: ClaudeProduct; label: string }[] = [
    { value: "codex", label: "Codex" },
    { value: "claude", label: "Claude Code" },
  ];

  return (
    <div className="inline-flex flex-none gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-1">
      {options.map((option) => (
        <button
          className={cn(
            "min-h-[34px] min-w-[104px] rounded-[calc(var(--radius)-2px)] px-3 py-1 text-[0.84rem] font-semibold text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]",
            product === option.value &&
              "bg-[var(--primary)] text-[var(--primary-foreground)] hover:text-[var(--primary-foreground)]",
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TabBar({
  activeTab,
  onChange,
  product = "codex",
}: {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
  product?: ClaudeProduct;
}) {
  const tabClass = (active: boolean) =>
    cn(
      "min-h-[42px] min-w-[132px] flex-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[0.86rem] font-medium text-[var(--muted-foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:translate-y-px",
      active &&
        "border-[var(--primary)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--primary),0_4px_12px_rgba(37,99,235,0.12)]",
    );

  return (
    <nav className="mx-auto mb-4 flex w-full max-w-[1440px] gap-2 overflow-x-auto pb-0.5">
      {product === "codex" && (
        <button
          className={tabClass(activeTab === "config")}
          onClick={() => onChange("config")}
          type="button"
        >
          Codex 配置
        </button>
      )}
      <button
        className={tabClass(activeTab === "sessions")}
        onClick={() => onChange("sessions")}
        type="button"
      >
        Sessions
      </button>
      <button
        className={tabClass(activeTab === "mcp")}
        onClick={() => onChange("mcp")}
        type="button"
      >
        MCP Servers
      </button>
      <button
        className={tabClass(activeTab === "skills")}
        onClick={() => onChange("skills")}
        type="button"
      >
        Skills
      </button>
    </nav>
  );
}
