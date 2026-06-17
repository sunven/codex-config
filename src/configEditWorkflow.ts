import { invoke } from "@tauri-apps/api/core";
import {
  compactMcpServerDraft,
  compactModelProviderDraft,
  type McpServerDraft,
  type ModelProviderDraft,
} from "./configTableEntries";
export {
  compactMcpServerDraft,
  compactModelProviderDraft,
  type McpServerDraft,
  type ModelProviderDraft,
} from "./configTableEntries";

export type FileToken = {
  hash: string;
  modifiedMs?: number;
  size: number;
};

export type DraftChange = {
  path: string;
  scope?: "root" | "profile";
  action: "set" | "unset";
  value?: boolean | string;
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

export type WorkflowCommitOutcome<TState> = {
  state: TState;
  changed: boolean;
  notice: string;
};

export type WorkflowCommitRunOutcome<TState> =
  | {
      status: "commit";
      state: TState;
      changed: boolean;
      notice: string;
    }
  | { status: "error"; message: string };

export type WorkflowRunOutcome<TState> =
  | WorkflowCommitRunOutcome<TState>;

export async function runConfigEditCommit<TState extends { homeDir?: string }>(
  intent: ConfigEditIntent,
  fileToken: FileToken | null | undefined,
): Promise<WorkflowCommitRunOutcome<TState>> {
  try {
    const outcome = await commitConfigEdit<TState>(intent, fileToken);

    return {
      status: "commit",
      state: outcome.state,
      changed: outcome.changed,
      notice: outcome.notice,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
