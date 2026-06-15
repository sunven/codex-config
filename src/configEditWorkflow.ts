import { invoke } from "@tauri-apps/api/core";

export type FileToken = {
  hash: string;
  modifiedMs?: number;
  size: number;
};

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

export type PreviewResult = {
  changed: boolean;
  fieldDiffs: FieldDiff[];
  textDiff: string;
  candidateRawToml: string;
};

export type DraftChange = {
  path: string;
  scope?: "root" | "profile";
  action: "set" | "unset";
  value?: boolean | string;
};

type FieldDiff = {
  scope: "root" | "profile";
  path: string;
  label: string;
  before: string;
  after: string;
};

type SaveResult<TState> = {
  backupPath?: string;
  changed: boolean;
  state: TState;
};

export type ConfigEditIntent =
  | { kind: "fastMode" }
  | { kind: "rootSettings"; changes: DraftChange[] }
  | { kind: "profileSettings"; changes: DraftChange[] }
  | { kind: "rawToml"; rawToml: string }
  | { kind: "restoreBackup"; backupId: string }
  | { kind: "modelProviderSave"; draft: ModelProviderDraft }
  | { kind: "modelProviderDelete"; id: string }
  | { kind: "mcpServerSave"; draft: McpServerDraft }
  | { kind: "mcpServerDelete"; id: string };

export type ConfigEditPreviewKind =
  | "fast"
  | Exclude<ConfigEditIntent["kind"], "fastMode" | "restoreBackup">;

export type WorkflowPreviewOutcome = {
  preview: PreviewResult;
  previewKind: ConfigEditPreviewKind;
  notice?: string;
  pendingDeleteProviderId?: string | null;
  pendingDeleteServerId?: string | null;
};

export type WorkflowCommitOutcome<TState> = {
  state: TState;
  changed: boolean;
  notice: string;
};

export async function previewConfigEdit(
  intent: ConfigEditIntent,
): Promise<WorkflowPreviewOutcome> {
  switch (intent.kind) {
    case "fastMode": {
      const preview = await invoke<PreviewResult>("preview_changes", {
        changes: fastModeChanges(),
      });

      return {
        preview,
        previewKind: "fast",
        notice: preview.changed ? undefined : "没有可预览的配置变更。",
      };
    }
    case "rootSettings": {
      const preview = await invoke<PreviewResult>("preview_changes", {
        changes: intent.changes,
      });

      return {
        preview,
        previewKind: intent.kind,
        notice: preview.changed ? undefined : "没有可预览的配置变更。",
      };
    }
    case "profileSettings": {
      const preview = await invoke<PreviewResult>("preview_changes", {
        changes: intent.changes,
      });

      return {
        preview,
        previewKind: intent.kind,
        notice: preview.changed ? undefined : "没有可预览的 profile 配置变更。",
      };
    }
    case "rawToml": {
      const preview = await invoke<PreviewResult>("preview_raw_toml", {
        rawToml: intent.rawToml,
      });

      return {
        preview,
        previewKind: intent.kind,
        notice: preview.changed ? undefined : "原始 TOML 没有可预览的变更。",
      };
    }
    case "restoreBackup": {
      throw new Error("restoreBackup does not support preview");
    }
    case "modelProviderSave": {
      const preview = await invoke<PreviewResult>("preview_save_model_provider", {
        draft: compactModelProviderDraft(intent.draft),
      });

      return {
        preview,
        previewKind: intent.kind,
        pendingDeleteProviderId: null,
        notice: preview.changed ? undefined : "Model provider 没有可预览的变更。",
      };
    }
    case "modelProviderDelete": {
      const preview = await invoke<PreviewResult>("preview_delete_model_provider", {
        id: intent.id,
      });

      return {
        preview,
        previewKind: intent.kind,
        pendingDeleteProviderId: preview.changed ? intent.id : null,
        notice: preview.changed ? undefined : "Model provider 没有可删除的变更。",
      };
    }
    case "mcpServerSave": {
      const preview = await invoke<PreviewResult>("preview_save_mcp_server", {
        draft: compactMcpServerDraft(intent.draft),
      });

      return {
        preview,
        previewKind: intent.kind,
        pendingDeleteServerId: null,
        notice: preview.changed ? undefined : "MCP server 没有可预览的变更。",
      };
    }
    case "mcpServerDelete": {
      const preview = await invoke<PreviewResult>("preview_delete_mcp_server", {
        id: intent.id,
      });

      return {
        preview,
        previewKind: intent.kind,
        pendingDeleteServerId: preview.changed ? intent.id : null,
        notice: preview.changed ? undefined : "MCP server 没有可删除的变更。",
      };
    }
  }
}

export async function commitConfigEdit<TState extends { homeDir?: string }>(
  intent: ConfigEditIntent,
  fileToken: FileToken | null | undefined,
): Promise<WorkflowCommitOutcome<TState>> {
  switch (intent.kind) {
    case "fastMode": {
      const result = await invoke<SaveResult<TState>>("save_changes", {
        changes: fastModeChanges(),
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已保存。备份：${backupPathLabel(result.backupPath, result.state.homeDir)}`
          : "没有需要保存的变更。",
      };
    }
    case "rootSettings": {
      const result = await invoke<SaveResult<TState>>("save_changes", {
        changes: intent.changes,
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已保存。备份：${backupPathLabel(result.backupPath, result.state.homeDir)}`
          : "没有需要保存的变更。",
      };
    }
    case "profileSettings": {
      const result = await invoke<SaveResult<TState>>("save_changes", {
        changes: intent.changes,
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已保存 profile 配置。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的变更。",
      };
    }
    case "rawToml": {
      const result = await invoke<SaveResult<TState>>("save_raw_toml", {
        rawToml: intent.rawToml,
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已保存原始 TOML。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的原始 TOML 变更。",
      };
    }
    case "restoreBackup": {
      const result = await invoke<SaveResult<TState>>("restore_backup", {
        backupId: intent.backupId,
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: `已恢复备份。恢复前备份：${backupPathLabel(
          result.backupPath,
          result.state.homeDir,
        )}`,
      };
    }
    case "modelProviderSave": {
      const result = await invoke<SaveResult<TState>>("save_model_provider", {
        draft: compactModelProviderDraft(intent.draft),
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已保存 model provider。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的 model provider 变更。",
      };
    }
    case "modelProviderDelete": {
      const result = await invoke<SaveResult<TState>>("delete_model_provider", {
        id: intent.id,
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已删除 model provider。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要删除的 model provider。",
      };
    }
    case "mcpServerSave": {
      const result = await invoke<SaveResult<TState>>("save_mcp_server", {
        draft: compactMcpServerDraft(intent.draft),
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已保存 MCP server。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要保存的 MCP server 变更。",
      };
    }
    case "mcpServerDelete": {
      const result = await invoke<SaveResult<TState>>("delete_mcp_server", {
        id: intent.id,
        fileToken: fileToken ?? null,
      });

      return {
        state: result.state,
        changed: result.changed,
        notice: result.changed
          ? `已删除 MCP server。备份：${backupPathLabel(
              result.backupPath,
              result.state.homeDir,
            )}`
          : "没有需要删除的 MCP server。",
      };
    }
  }
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

function fastModeChanges(): DraftChange[] {
  return [
    {
      path: "features.fast_mode",
      scope: "root",
      action: "set",
      value: true,
    },
  ];
}

function backupPathLabel(path: string | undefined, homeDir: string | undefined) {
  return path ? displayPath(path, homeDir) : "新配置无需备份";
}

function displayPath(path: string, homeDir: string | undefined) {
  const home = normalizedHomeDir(homeDir);

  if (!home) {
    return path;
  }

  if (path.replace(/[\\/]+$/, "") === home) {
    return "~";
  }

  for (const separator of ["/", "\\"]) {
    const prefix = `${home}${separator}`;
    if (path.startsWith(prefix)) {
      return `~${separator}${path.slice(prefix.length)}`;
    }
  }

  return path;
}

function normalizedHomeDir(homeDir: string | undefined) {
  const trimmed = homeDir?.trim();

  if (!trimmed || trimmed === "." || trimmed === "/" || trimmed === "\\") {
    return undefined;
  }

  const normalized = trimmed.replace(/[\\/]+$/, "");

  return normalized && !/^[A-Za-z]:$/.test(normalized) ? normalized : undefined;
}
