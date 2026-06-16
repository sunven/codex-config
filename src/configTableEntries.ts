export type ModelProviderDraft = {
  id: string;
  originalId?: string;
  name?: string;
  baseUrl?: string;
  envKey?: string;
  envKeyInstructions?: string;
  wireApi?: string;
  requestMaxRetries?: number;
  streamMaxRetries?: number;
  streamIdleTimeoutMs?: number;
  requiresOpenaiAuth?: boolean;
  supportsWebsockets?: boolean;
  queryParams: Record<string, string>;
  httpHeaders: Record<string, string>;
  envHttpHeaders: Record<string, string>;
};

export type McpServerDraft = {
  id: string;
  originalId?: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  startupTimeoutMs?: number;
  enabled?: boolean;
};

export type ModelProviderTableEntry = {
  id: string;
  name?: string;
  baseUrl?: string;
  envKey?: string;
  envKeyInstructions?: string;
  wireApi?: string;
  requestMaxRetries?: number;
  streamMaxRetries?: number;
  streamIdleTimeoutMs?: number;
  requiresOpenaiAuth?: boolean;
  supportsWebsockets?: boolean;
  queryParams: Record<string, string>;
  httpHeaders: Record<string, string>;
  envHttpHeaders: Record<string, string>;
};

export type McpServerTableEntry = {
  id: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  startupTimeoutMs?: number;
  enabled?: boolean;
};

export function emptyModelProviderDraft(): ModelProviderDraft {
  return {
    id: "",
    name: "",
    baseUrl: "",
    envKey: "",
    envKeyInstructions: "",
    wireApi: "responses",
    requestMaxRetries: undefined,
    streamMaxRetries: undefined,
    streamIdleTimeoutMs: undefined,
    requiresOpenaiAuth: undefined,
    supportsWebsockets: undefined,
    queryParams: {},
    httpHeaders: {},
    envHttpHeaders: {},
  };
}

export function draftFromModelProvider(provider: ModelProviderTableEntry): ModelProviderDraft {
  return {
    id: provider.id,
    originalId: provider.id,
    name: provider.name ?? "",
    baseUrl: provider.baseUrl ?? "",
    envKey: provider.envKey ?? "",
    envKeyInstructions: provider.envKeyInstructions ?? "",
    wireApi: provider.wireApi ?? "responses",
    requestMaxRetries: provider.requestMaxRetries,
    streamMaxRetries: provider.streamMaxRetries,
    streamIdleTimeoutMs: provider.streamIdleTimeoutMs,
    requiresOpenaiAuth: provider.requiresOpenaiAuth,
    supportsWebsockets: provider.supportsWebsockets,
    queryParams: { ...provider.queryParams },
    httpHeaders: { ...provider.httpHeaders },
    envHttpHeaders: { ...provider.envHttpHeaders },
  };
}

export function modelProviderDraftId(draft: ModelProviderDraft) {
  return draft.id || draft.originalId || "new";
}

export function isModelProviderDraftDirty(
  draft: ModelProviderDraft,
  providers: ReadonlyArray<ModelProviderTableEntry>,
) {
  return isTableEntryDraftDirty(
    draft,
    providers,
    compactModelProviderDraft,
    draftFromModelProvider,
    isEmptyModelProviderDraft,
  );
}

export function emptyMcpServerDraft(): McpServerDraft {
  return {
    id: "",
    command: "",
    args: [],
    env: {},
    startupTimeoutMs: undefined,
    enabled: undefined,
  };
}

export function draftFromMcpServer(server: McpServerTableEntry): McpServerDraft {
  return {
    id: server.id,
    originalId: server.id,
    command: server.command ?? "",
    args: [...server.args],
    env: { ...server.env },
    startupTimeoutMs: server.startupTimeoutMs,
    enabled: server.enabled,
  };
}

export function mcpServerDraftId(draft: McpServerDraft) {
  return draft.id || draft.originalId || "new";
}

export function isMcpServerDraftDirty(
  draft: McpServerDraft,
  servers: ReadonlyArray<McpServerTableEntry>,
) {
  return isTableEntryDraftDirty(
    draft,
    servers,
    compactMcpServerDraft,
    draftFromMcpServer,
    isEmptyMcpServerDraft,
  );
}

export function compactModelProviderDraft(draft: ModelProviderDraft): ModelProviderDraft {
  return {
    ...draft,
    id: draft.id.trim(),
    originalId: draft.originalId?.trim() || undefined,
    name: optionalText(draft.name),
    baseUrl: optionalText(draft.baseUrl),
    envKey: optionalText(draft.envKey),
    envKeyInstructions: optionalText(draft.envKeyInstructions),
    wireApi: optionalText(draft.wireApi),
    queryParams: cleanStringMap(draft.queryParams),
    httpHeaders: cleanStringMap(draft.httpHeaders),
    envHttpHeaders: cleanStringMap(draft.envHttpHeaders),
  };
}

export function compactMcpServerDraft(draft: McpServerDraft): McpServerDraft {
  return {
    ...draft,
    id: draft.id.trim(),
    originalId: draft.originalId?.trim() || undefined,
    command: optionalText(draft.command),
    args: draft.args.map((arg) => arg.trim()).filter(Boolean),
    env: cleanStringMap(draft.env),
  };
}

function isTableEntryDraftDirty<TDraft extends { originalId?: string }, TEntry extends { id: string }>(
  draft: TDraft,
  entries: ReadonlyArray<TEntry>,
  compactDraft: (draft: TDraft) => TDraft,
  draftFromEntry: (entry: TEntry) => TDraft,
  isEmptyDraft: (draft: TDraft) => boolean,
) {
  const compact = compactDraft(draft);
  const original = compact.originalId
    ? entries.find((entry) => entry.id === compact.originalId)
    : undefined;

  if (original) {
    return JSON.stringify(compact) !== JSON.stringify(compactDraft(draftFromEntry(original)));
  }

  return !isEmptyDraft(compact);
}

function isEmptyModelProviderDraft(draft: ModelProviderDraft) {
  return !(
    draft.id ||
    draft.originalId ||
    draft.name ||
    draft.baseUrl ||
    draft.envKey ||
    draft.envKeyInstructions ||
    draft.wireApi !== "responses" ||
    draft.requestMaxRetries !== undefined ||
    draft.streamMaxRetries !== undefined ||
    draft.streamIdleTimeoutMs !== undefined ||
    draft.requiresOpenaiAuth !== undefined ||
    draft.supportsWebsockets !== undefined ||
    Object.keys(draft.queryParams).length ||
    Object.keys(draft.httpHeaders).length ||
    Object.keys(draft.envHttpHeaders).length
  );
}

function isEmptyMcpServerDraft(draft: McpServerDraft) {
  return !(
    draft.id ||
    draft.originalId ||
    draft.command ||
    draft.args.length ||
    Object.keys(draft.env).length ||
    draft.startupTimeoutMs !== undefined ||
    draft.enabled !== undefined
  );
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringMap(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key && value),
  );
}
