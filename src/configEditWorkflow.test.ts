import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitConfigEdit,
  previewConfigEdit,
  runConfigEditCommit,
  runConfigEditPreview,
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

  it("returns a notice without invoking Tauri for empty settings previews", async () => {
    const outcome = await runConfigEditPreview({
      kind: "rootSettings",
      changes: [],
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "notice",
      notice: "没有可预览的配置变更。",
    });
  });

  it("normalizes preview outcomes for App state application", async () => {
    invokeMock.mockResolvedValueOnce({
      changed: true,
      fieldDiffs: [],
      textDiff: "-[model_providers.local]",
      candidateRawToml: "model = \"gpt-5\"",
    });

    const outcome = await runConfigEditPreview({
      kind: "modelProviderDelete",
      id: "local",
    });

    expect(outcome).toMatchObject({
      status: "preview",
      previewKind: "modelProviderDelete",
      notice: null,
      pendingDeleteProviderId: "local",
      pendingDeleteServerId: null,
    });
  });

  it("normalizes commit outcomes and caught errors", async () => {
    invokeMock
      .mockResolvedValueOnce({
        changed: false,
        state: {
          homeDir: "/Users/test/.codex",
        },
      })
      .mockRejectedValueOnce("config.toml changed on disk");

    await expect(
      runConfigEditCommit(
        { kind: "fastMode" },
        { hash: "abc", size: 10 },
      ),
    ).resolves.toEqual({
      status: "commit",
      state: {
        homeDir: "/Users/test/.codex",
      },
      changed: false,
      notice: "没有需要保存的变更。",
    });

    await expect(
      runConfigEditCommit({ kind: "fastMode" }, undefined),
    ).resolves.toEqual({
      status: "error",
      message: "config.toml changed on disk",
    });
  });

});
