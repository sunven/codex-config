import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitConfigEdit,
  runConfigEditCommit,
} from "./configEditWorkflow";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

type TestState = {
  homeDir?: string;
};

describe("config edit workflow", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("hides the Fast mode draft behind a named save intent", async () => {
    invokeMock.mockResolvedValueOnce({
      changed: true,
      state: {
        homeDir: "/Users/test/.codex",
      },
    });

    const outcome = await commitConfigEdit(
      { kind: "fastMode" },
      { hash: "abc", size: 10 },
    );

    expect(invokeMock).toHaveBeenCalledWith("save_changes", {
      changes: [
        {
          path: "features.fast_mode",
          scope: "root",
          action: "set",
          value: true,
        },
      ],
      fileToken: { hash: "abc", size: 10 },
    });
    expect(outcome.notice).toBe("已保存。");
  });

  it("maps raw TOML saves to a state outcome", async () => {
    invokeMock.mockResolvedValueOnce({
      changed: true,
      state: {
        homeDir: "/Users/test/.codex",
      },
    });

    const outcome = await commitConfigEdit<TestState>(
      { kind: "rawToml", rawToml: "model = \"gpt-5-mini\"" },
      { hash: "abc", size: 10 },
    );

    expect(invokeMock).toHaveBeenCalledWith("save_raw_toml", {
      rawToml: "model = \"gpt-5-mini\"",
      fileToken: { hash: "abc", size: 10 },
    });
    expect(outcome.state.homeDir).toBe("/Users/test/.codex");
    expect(outcome.notice).toBe("已保存原始 TOML。");
  });

  it("maps table saves and deletes to their save commands", async () => {
    invokeMock
      .mockResolvedValueOnce({
        changed: true,
        state: {
          homeDir: "/Users/test/.codex",
        },
      })
      .mockResolvedValueOnce({
        changed: true,
        state: {
          homeDir: "/Users/test/.codex",
        },
      });

    await commitConfigEdit(
      {
        kind: "modelProviderSave",
        draft: {
          id: "local",
          queryParams: {},
          httpHeaders: {},
          envHttpHeaders: {},
        },
      },
      { hash: "abc", size: 10 },
    );
    await commitConfigEdit(
      {
        kind: "mcpServerDelete",
        id: "filesystem",
      },
      { hash: "abc", size: 10 },
    );

    expect(invokeMock).toHaveBeenNthCalledWith(1, "save_model_provider", {
      draft: {
        id: "local",
        queryParams: {},
        httpHeaders: {},
        envHttpHeaders: {},
      },
      fileToken: { hash: "abc", size: 10 },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "delete_mcp_server", {
      id: "filesystem",
      fileToken: { hash: "abc", size: 10 },
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
