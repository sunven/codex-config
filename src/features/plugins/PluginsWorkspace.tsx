import { useState } from "react";
import { Blocks, RefreshCw, Store, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { CompactEmpty } from "../../components/ui/compact-empty";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Notice } from "../../components/ui/notice";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import { displayPath } from "../../lib/formatters";
import {
  availablePluginsMatchingQuery,
  codexPluginsWorkspace,
  parseSparsePaths,
  type MarketplaceAddRequest,
  type MarketplaceSummary,
  type PluginState,
  type PluginSummary,
} from "./codexPlugins";

type PluginSection = "installed" | "marketplaces" | "available";

type PluginsWorkspaceProps = {
  plugins: PluginState;
  homeDir?: string;
  savingPluginId?: string | null;
  writable: boolean;
  onSaveEnabled: (pluginId: string, enabled: boolean) => void;
  onRemove: (pluginId: string) => Promise<boolean>;
  onAddMarketplace: (request: MarketplaceAddRequest) => Promise<boolean>;
  onRemoveMarketplace: (name: string) => Promise<boolean>;
  onUpgradeMarketplace: (name: string | null) => Promise<boolean>;
};

export function PluginsWorkspace({
  plugins,
  homeDir,
  savingPluginId,
  writable,
  onSaveEnabled,
  onRemove,
  onAddMarketplace,
  onRemoveMarketplace,
  onUpgradeMarketplace,
}: PluginsWorkspaceProps) {
  const { installed, available, marketplaces, resultLabel } = codexPluginsWorkspace(plugins);
  const [activeSection, setActiveSection] = useState<PluginSection>("installed");
  const [removeDialog, setRemoveDialog] = useState<PluginSummary | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [availableQuery, setAvailableQuery] = useState("");
  const [marketplaceSource, setMarketplaceSource] = useState("");
  const [marketplaceRef, setMarketplaceRef] = useState("");
  const [marketplaceSparse, setMarketplaceSparse] = useState("");
  const [marketplaceSubmitting, setMarketplaceSubmitting] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [marketplaceRemoveDialog, setMarketplaceRemoveDialog] =
    useState<MarketplaceSummary | null>(null);

  function requestRemove(plugin: PluginSummary) {
    setRemoveDialog(plugin);
    setRemoveError(null);
  }

  async function addMarketplace() {
    const source = marketplaceSource.trim();
    if (!source || marketplaceSubmitting) {
      return;
    }

    setMarketplaceSubmitting(true);
    setMarketplaceError(null);

    try {
      const added = await onAddMarketplace({
        source,
        refName: marketplaceRef.trim() || undefined,
        sparse: parseSparsePaths(marketplaceSparse),
      });
      if (added) {
        setMarketplaceSource("");
        setMarketplaceRef("");
        setMarketplaceSparse("");
      }
    } catch (error) {
      setMarketplaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setMarketplaceSubmitting(false);
    }
  }

  async function confirmRemoveMarketplace() {
    if (!marketplaceRemoveDialog || marketplaceSubmitting) {
      return;
    }

    setMarketplaceSubmitting(true);
    setMarketplaceError(null);

    try {
      const removed = await onRemoveMarketplace(marketplaceRemoveDialog.name);
      if (removed) {
        setMarketplaceRemoveDialog(null);
      }
    } catch (error) {
      setMarketplaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setMarketplaceSubmitting(false);
    }
  }

  async function upgradeMarketplace(name: string | null) {
    if (marketplaceSubmitting) {
      return;
    }

    setMarketplaceSubmitting(true);
    setMarketplaceError(null);

    try {
      await onUpgradeMarketplace(name);
    } catch (error) {
      setMarketplaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setMarketplaceSubmitting(false);
    }
  }

  async function confirmRemove() {
    if (!removeDialog || removeSubmitting) {
      return;
    }

    setRemoveSubmitting(true);
    setRemoveError(null);

    try {
      const removed = await onRemove(removeDialog.pluginId);
      if (removed) {
        setRemoveDialog(null);
      }
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemoveSubmitting(false);
    }
  }

  return (
    <>
      <section className="flex h-full min-h-0 flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="-mx-3 -mt-3 mb-3 flex min-h-12 flex-wrap items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:items-start [&>div]:min-w-0">
          <Blocks size={18} />
          <div>
            <h2>Codex plugins</h2>
          </div>
          <Badge size="count">{resultLabel}</Badge>
        </div>

        <div className="mb-3 flex flex-wrap gap-2" aria-label="Codex plugin sections">
          <SectionTab
            active={activeSection === "installed"}
            onClick={() => setActiveSection("installed")}
          >
            Installed
          </SectionTab>
          <SectionTab
            active={activeSection === "marketplaces"}
            onClick={() => setActiveSection("marketplaces")}
          >
            Marketplaces
          </SectionTab>
          <SectionTab
            active={activeSection === "available"}
            onClick={() => setActiveSection("available")}
          >
            Available
          </SectionTab>
        </div>

        {activeSection === "installed" && plugins.loadError && (
          <Notice className="mb-3" variant="warning">
            <Store size={18} />
            <span>{plugins.loadError}</span>
          </Notice>
        )}

        {activeSection === "installed" && removeError && (
          <Notice className="mb-3" variant="warning">
            <Store size={18} />
            <span>{removeError}</span>
          </Notice>
        )}

        {activeSection === "marketplaces" && plugins.marketplaceLoadError && (
          <Notice className="mb-3" variant="warning">
            <Store size={18} />
            <span>{plugins.marketplaceLoadError}</span>
          </Notice>
        )}

        {activeSection === "marketplaces" && marketplaceError && (
          <Notice className="mb-3" variant="warning">
            <Store size={18} />
            <span>{marketplaceError}</span>
          </Notice>
        )}

        {activeSection === "available" && plugins.availableLoadError && (
          <Notice className="mb-3" variant="warning">
            <Store size={18} />
            <span>{plugins.availableLoadError}</span>
          </Notice>
        )}

        <div className="min-h-0 flex-1 overflow-auto pr-1">
          {activeSection === "installed" ? (
            <InstalledPlugins
              installed={installed}
              homeDir={homeDir}
              savingPluginId={savingPluginId}
              writable={writable}
              onSaveEnabled={onSaveEnabled}
              onRemove={requestRemove}
            />
          ) : activeSection === "marketplaces" ? (
            <MarketplacesPanel
              marketplaces={marketplaces}
              homeDir={homeDir}
              source={marketplaceSource}
              refName={marketplaceRef}
              sparse={marketplaceSparse}
              submitting={marketplaceSubmitting}
              writable={writable}
              onSourceChange={setMarketplaceSource}
              onRefChange={setMarketplaceRef}
              onSparseChange={setMarketplaceSparse}
              onAdd={addMarketplace}
              onRemove={setMarketplaceRemoveDialog}
              onUpgrade={upgradeMarketplace}
            />
          ) : (
            <AvailablePlugins
              available={available}
              homeDir={homeDir}
              query={availableQuery}
              onQueryChange={setAvailableQuery}
            />
          )}
        </div>
      </section>

      <Dialog
        open={removeDialog !== null}
        onOpenChange={(open) => !open && !removeSubmitting && setRemoveDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>卸载 plugin</DialogTitle>
            <DialogDescription>
              将卸载「{removeDialog?.name ?? ""}」对应的 Codex plugin bundle。不会移除 ChatGPT 中管理的外部 app 连接。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={removeSubmitting}>取消</Button>
            </DialogClose>
            <Button disabled={removeSubmitting} variant="primary" onClick={confirmRemove}>
              {removeSubmitting ? (
                "卸载中"
              ) : (
                <>
                  <Trash2 data-icon="inline-start" />
                  确认卸载
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={marketplaceRemoveDialog !== null}
        onOpenChange={(open) =>
          !open && !marketplaceSubmitting && setMarketplaceRemoveDialog(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移除 marketplace</DialogTitle>
            <DialogDescription>
              将移除「{marketplaceRemoveDialog?.name ?? ""}」marketplace source。已安装 plugin 不会在这里被卸载。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={marketplaceSubmitting}>取消</Button>
            </DialogClose>
            <Button
              disabled={marketplaceSubmitting}
              variant="primary"
              onClick={confirmRemoveMarketplace}
            >
              {marketplaceSubmitting ? (
                "移除中"
              ) : (
                <>
                  <Trash2 data-icon="inline-start" />
                  确认移除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AvailablePlugins({
  available,
  homeDir,
  query,
  onQueryChange,
}: {
  available: PluginSummary[];
  homeDir?: string;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const filtered = availablePluginsMatchingQuery(available, query);

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-[0.74rem] font-semibold text-[var(--muted-foreground)]">
        <span>搜索 available plugins</span>
        <Input
          aria-label="搜索 available plugins"
          className="!w-full !max-w-none"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="搜索 plugin 名称、ID、marketplace 或 policy"
          type="search"
          value={query}
        />
      </label>

      {filtered.length === 0 ? (
        <CompactEmpty className="min-h-[180px] flex-col gap-1.5">
          <strong className="text-[var(--foreground)]">没有可浏览的 marketplace plugin。</strong>
          <span>{available.length === 0 ? "添加或升级 marketplace 后刷新列表。" : "没有匹配当前搜索条件的 plugin。"}</span>
        </CompactEmpty>
      ) : (
        <div className="grid gap-2">
          {filtered.map((plugin) => (
            <AvailablePluginCard key={plugin.pluginId} plugin={plugin} homeDir={homeDir} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTab({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={[
        "min-h-8 rounded-[var(--radius)] border px-3 text-[0.82rem] font-bold",
        active
          ? "border-[var(--primary)] bg-[#eff6ff] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function AvailablePluginCard({
  plugin,
  homeDir,
}: {
  plugin: PluginSummary;
  homeDir?: string;
}) {
  const sourcePath = plugin.source.path;

  return (
    <article className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] p-3">
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="min-w-0 truncate text-[0.95rem]">{plugin.name}</h3>
            <Badge variant="secondary">available</Badge>
            {plugin.version && <Badge variant="primary">v{plugin.version}</Badge>}
            {plugin.authPolicy && <Badge variant="warning">{plugin.authPolicy}</Badge>}
          </div>
          <code className="mt-1 block break-words">{plugin.pluginId}</code>
        </div>
      </div>

      <div className="mt-2 grid gap-1 text-[0.76rem] text-[var(--muted-foreground)]">
        {plugin.marketplaceName && (
          <span>
            Marketplace: <strong>{plugin.marketplaceName}</strong>
          </span>
        )}
        {plugin.installPolicy && (
          <span>
            Install policy: <strong>{plugin.installPolicy}</strong>
          </span>
        )}
        {plugin.source.source && (
          <span className="break-words">
            Source: <code>{plugin.source.source}</code>
          </span>
        )}
        {sourcePath && (
          <span className="break-words">
            Path: <code>{displayPath(sourcePath, homeDir)}</code>
          </span>
        )}
      </div>
    </article>
  );
}

function InstalledPlugins({
  installed,
  homeDir,
  savingPluginId,
  writable,
  onSaveEnabled,
  onRemove,
}: {
  installed: PluginSummary[];
  homeDir?: string;
  savingPluginId?: string | null;
  writable: boolean;
  onSaveEnabled: (pluginId: string, enabled: boolean) => void;
  onRemove: (plugin: PluginSummary) => void;
}) {
  if (installed.length === 0) {
    return (
      <CompactEmpty className="min-h-[180px] flex-col gap-1.5">
        <strong className="text-[var(--foreground)]">还没有已安装的 Codex plugin。</strong>
        <span>在 Codex CLI 运行 /plugins，或打开 Codex app 的 Plugins 页面安装。</span>
      </CompactEmpty>
    );
  }

  return (
    <div className="grid gap-2">
      {installed.map((plugin) => (
        <PluginCard
          key={plugin.pluginId}
          plugin={plugin}
          homeDir={homeDir}
          saving={savingPluginId === plugin.pluginId}
          writable={writable}
          onSaveEnabled={onSaveEnabled}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function MarketplacesPanel({
  marketplaces,
  homeDir,
  source,
  refName,
  sparse,
  submitting,
  writable,
  onSourceChange,
  onRefChange,
  onSparseChange,
  onAdd,
  onRemove,
  onUpgrade,
}: {
  marketplaces: MarketplaceSummary[];
  homeDir?: string;
  source: string;
  refName: string;
  sparse: string;
  submitting: boolean;
  writable: boolean;
  onSourceChange: (value: string) => void;
  onRefChange: (value: string) => void;
  onSparseChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (marketplace: MarketplaceSummary) => void;
  onUpgrade: (name: string | null) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,0.32fr)] gap-2 max-[720px]:grid-cols-1">
          <label className="grid gap-1 text-[0.74rem] font-semibold text-[var(--muted-foreground)]">
            <span>Marketplace source</span>
            <Input
              aria-label="Marketplace source"
              value={source}
              onChange={(event) => onSourceChange(event.currentTarget.value)}
              placeholder="owner/repo, https://..., or ./local-root"
            />
          </label>
          <label className="grid gap-1 text-[0.74rem] font-semibold text-[var(--muted-foreground)]">
            <span>Git ref</span>
            <Input
              aria-label="Git ref"
              value={refName}
              onChange={(event) => onRefChange(event.currentTarget.value)}
              placeholder="main"
            />
          </label>
        </div>
        <label className="grid gap-1 text-[0.74rem] font-semibold text-[var(--muted-foreground)]">
          <span>Sparse paths</span>
          <textarea
            aria-label="Sparse paths"
            className="min-h-20 w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-[0.82rem] text-[var(--foreground)] outline-none transition-[border-color,box-shadow] focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_rgba(37,99,235,0.16)] disabled:cursor-not-allowed disabled:opacity-[0.55]"
            value={sparse}
            onChange={(event) => onSparseChange(event.currentTarget.value)}
            placeholder=".agents/plugins, more/plugins"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!writable || !source.trim() || submitting} onClick={onAdd} variant="primary">
            添加 marketplace
          </Button>
          <Button
            disabled={!writable || submitting || marketplaces.length === 0}
            onClick={() => onUpgrade(null)}
          >
            <RefreshCw data-icon="inline-start" />
            升级全部 Git marketplaces
          </Button>
        </div>
      </div>

      {marketplaces.length === 0 ? (
        <CompactEmpty className="min-h-[160px] flex-col gap-1.5">
          <strong className="text-[var(--foreground)]">还没有配置 plugin marketplace。</strong>
          <span>添加 GitHub repo、Git URL 或本地 marketplace root。</span>
        </CompactEmpty>
      ) : (
        <div className="grid gap-2">
          {marketplaces.map((marketplace) => (
            <article
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] p-3"
              key={marketplace.name}
            >
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <h3 className="min-w-0 truncate text-[0.95rem]">{marketplace.name}</h3>
                    {marketplace.kind && <Badge variant="primary">{marketplace.kind}</Badge>}
                    {marketplace.refName && <Badge variant="secondary">{marketplace.refName}</Badge>}
                  </div>
                  <code className="mt-1 block break-words">{marketplace.source}</code>
                </div>
                <Button
                  aria-label={`升级 marketplace ${marketplace.name}`}
                  disabled={!writable || submitting}
                  onClick={() => onUpgrade(marketplace.name)}
                  size="sm"
                >
                  <RefreshCw data-icon="inline-start" />
                  升级
                </Button>
                <Button
                  aria-label={`移除 marketplace ${marketplace.name}`}
                  className="size-7 flex-none justify-center p-0 text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
                  disabled={!writable || submitting}
                  onClick={() => onRemove(marketplace)}
                  size="sm"
                  title={`移除 marketplace ${marketplace.name}`}
                  variant="ghost"
                >
                  <Trash2 data-icon="inline-start" />
                </Button>
              </div>
              <div className="mt-2 grid gap-1 text-[0.76rem] text-[var(--muted-foreground)]">
                {marketplace.rootPath && (
                  <span className="break-words">
                    Root: <code>{displayPath(marketplace.rootPath, homeDir)}</code>
                  </span>
                )}
                {marketplace.sparse.length > 0 && (
                  <span className="break-words">
                    Sparse: <code>{marketplace.sparse.join(", ")}</code>
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function PluginCard({
  plugin,
  homeDir,
  saving,
  writable,
  onSaveEnabled,
  onRemove,
}: {
  plugin: PluginSummary;
  homeDir?: string;
  saving: boolean;
  writable: boolean;
  onSaveEnabled: (pluginId: string, enabled: boolean) => void;
  onRemove: (plugin: PluginSummary) => void;
}) {
  const sourcePath = plugin.source.path;

  return (
    <article className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] p-3">
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Switch
              aria-label={`启用或停用 plugin ${plugin.name}`}
              checked={plugin.enabled}
              disabled={!writable || saving}
              onCheckedChange={(checked) => onSaveEnabled(plugin.pluginId, checked)}
              size="sm"
            />
            <h3 className="min-w-0 truncate text-[0.95rem]">{plugin.name}</h3>
            <Badge variant={plugin.enabled ? "success" : "secondary"}>
              {saving ? "saving" : plugin.enabled ? "enabled" : "disabled"}
            </Badge>
            {plugin.version && <Badge variant="primary">v{plugin.version}</Badge>}
          </div>
          <code className="mt-1 block break-words">{plugin.pluginId}</code>
        </div>
        <Button
          aria-label={`卸载 plugin ${plugin.name}`}
          className="size-7 flex-none justify-center p-0 text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
          disabled={!writable || saving}
          onClick={() => onRemove(plugin)}
          size="sm"
          title={`卸载 plugin ${plugin.name}`}
          variant="ghost"
        >
          <Trash2 data-icon="inline-start" />
        </Button>
        {plugin.authPolicy && <Badge variant="warning">{plugin.authPolicy}</Badge>}
      </div>

      <div className="mt-2 grid gap-1 text-[0.76rem] text-[var(--muted-foreground)]">
        {plugin.marketplaceName && (
          <span>
            Marketplace: <strong>{plugin.marketplaceName}</strong>
          </span>
        )}
        {plugin.installPolicy && (
          <span>
            Install policy: <strong>{plugin.installPolicy}</strong>
          </span>
        )}
        {sourcePath && (
          <span className="break-words">
            Source: <code>{displayPath(sourcePath, homeDir)}</code>
          </span>
        )}
      </div>
    </article>
  );
}
