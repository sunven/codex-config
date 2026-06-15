import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitConfigEdit,
  compactMcpServerDraft,
  compactModelProviderDraft,
  previewConfigEdit,
} from "./configEditWorkflow";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("config edit workflow", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("hides the Fast mode draft behind a named intent", async () => {
    invokeMock.mockResolvedValueOnce({
      changed: true,
      fieldDiffs: [],
      textDiff: "+features.fast_mode = true",
      candidateRawToml: "[features]\nfast_mode = true",
    });

    const outcome = await previewConfigEdit({ kind: "fastMode" });

    expect(invokeMock).toHaveBeenCalledWith("preview_changes", {
      changes: [
        {
          path: "features.fast_mode",
          scope: "root",
          action: "set",
          value: true,
        },
      ],
    });
    expect(outcome.previewKind).toBe("fast");
    expect(outcome.notice).toBeUndefined();
  });

  it("maps settings intents to the shared preview command", async () => {
    const changes = [
      {
        path: "model",
        scope: "profile" as const,
        action: "set" as const,
        value: "gpt-5-mini",
      },
    ];
    invokeMock.mockResolvedValueOnce({
      changed: false,
      fieldDiffs: [],
      textDiff: "No changes",
      candidateRawToml: "model = \"gpt-5\"",
    });

    const outcome = await previewConfigEdit({ kind: "profileSettings", changes });

    expect(invokeMock).toHaveBeenCalledWith("preview_changes", { changes });
    expect(outcome.previewKind).toBe("profileSettings");
    expect(outcome.notice).toBe("没有可预览的 profile 配置变更。");
  });

  it("maps raw TOML saves to a state outcome with backup notice", async () => {
    invokeMock.mockResolvedValueOnce({
      changed: true,
      backupPath: "/Users/test/.codex/backups/config.toml.bak",
      state: {
        homeDir: "/Users/test/.codex",
      },
    });

    const outcome = await commitConfigEdit(
      { kind: "rawToml", rawToml: "model = \"gpt-5-mini\"" },
      { hash: "abc", size: 10 },
    );

    expect(invokeMock).toHaveBeenCalledWith("save_raw_toml", {
      rawToml: "model = \"gpt-5-mini\"",
      fileToken: { hash: "abc", size: 10 },
    });
    expect(outcome.state.homeDir).toBe("/Users/test/.codex");
    expect(outcome.notice).toBe("已保存原始 TOML。备份：~/backups/config.toml.bak");
  });

  it("sets pending delete ids for table delete previews", async () => {
    invokeMock.mockResolvedValueOnce({
      changed: true,
      fieldDiffs: [],
      textDiff: "-[mcp_servers.filesystem]",
      candidateRawToml: "model = \"gpt-5\"",
    });

    const outcome = await previewConfigEdit({
      kind: "mcpServerDelete",
      id: "filesystem",
    });

    expect(invokeMock).toHaveBeenCalledWith("preview_delete_mcp_server", {
      id: "filesystem",
    });
    expect(outcome.previewKind).toBe("mcpServerDelete");
    expect(outcome.pendingDeleteServerId).toBe("filesystem");
  });

  it("compacts provider and MCP drafts before invoking table saves", async () => {
    expect(
      compactModelProviderDraft({
        id: " local ",
        originalId: " local ",
        name: " Local ",
        baseUrl: " ",
        envKey: "LOCAL_KEY",
        envKeyInstructions: "",
        wireApi: " responses ",
        queryParams: { " organization ": " alpha ", empty: " " },
        httpHeaders: { " X-Test ": " yes " },
        envHttpHeaders: {},
      }),
    ).toMatchObject({
      id: "local",
      originalId: "local",
      name: "Local",
      baseUrl: undefined,
      envKey: "LOCAL_KEY",
      envKeyInstructions: undefined,
      wireApi: "responses",
      queryParams: { organization: "alpha" },
      httpHeaders: { "X-Test": "yes" },
    });

    expect(
      compactMcpServerDraft({
        id: " filesystem ",
        originalId: " filesystem ",
        command: " npx ",
        args: [" -y ", " ", "server"],
        env: { " NODE_ENV ": " production ", empty: " " },
      }),
    ).toMatchObject({
      id: "filesystem",
      originalId: "filesystem",
      command: "npx",
      args: ["-y", "server"],
      env: { NODE_ENV: "production" },
    });
  });
});
