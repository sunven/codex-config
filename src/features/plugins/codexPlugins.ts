export type PluginState = {
  installed: PluginSummary[];
  available: PluginSummary[];
  marketplaces: MarketplaceSummary[];
  loadError?: string;
  marketplaceLoadError?: string;
  availableLoadError?: string;
};

export type PluginSummary = {
  pluginId: string;
  name: string;
  marketplaceName?: string;
  version?: string;
  installed: boolean;
  enabled: boolean;
  source: PluginSource;
  installPolicy?: string;
  authPolicy?: string;
};

export type PluginSource = {
  source?: string;
  path?: string;
};

export type MarketplaceSummary = {
  name: string;
  source: string;
  rootPath?: string;
  refName?: string;
  sparse: string[];
  kind?: string;
};

export type MarketplaceAddRequest = {
  source: string;
  refName?: string;
  sparse: string[];
};

export type PluginsWorkspaceModel = {
  installed: PluginSummary[];
  available: PluginSummary[];
  marketplaces: MarketplaceSummary[];
  resultLabel: string;
};

export function codexPluginsWorkspace(state: PluginState): PluginsWorkspaceModel {
  return {
    installed: state.installed,
    available: state.available,
    marketplaces: state.marketplaces,
    resultLabel: `${state.installed.length} installed`,
  };
}

export function availablePluginsMatchingQuery(
  plugins: PluginSummary[],
  rawQuery: string,
): PluginSummary[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return plugins;
  }

  return plugins.filter((plugin) => {
    const values = [
      plugin.name,
      plugin.pluginId,
      plugin.marketplaceName,
      plugin.version,
      plugin.source.source,
      plugin.source.path,
      plugin.installPolicy,
      plugin.authPolicy,
    ];

    return values.some((value) => value?.toLowerCase().includes(query));
  });
}

export function parseSparsePaths(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}
