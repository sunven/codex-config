import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runConfigEditCommit,
  type ConfigEditIntent,
} from "./configEditWorkflow";
import { useConfigEditWorkflow } from "./useConfigEditWorkflow";

vi.mock("./configEditWorkflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./configEditWorkflow")>();

  return {
    ...actual,
    runConfigEditCommit: vi.fn(),
  };
});

const runCommitMock = vi.mocked(runConfigEditCommit);

type TestState = {
  homeDir?: string;
  fileToken?: {
    hash: string;
    size: number;
  };
};

function renderWorkflow(currentState: TestState | null = null) {
  const onCommitState = vi.fn();
  const onError = vi.fn();
  const onStatusMessage = vi.fn();
  const hook = renderHook(() =>
    useConfigEditWorkflow<TestState>({
      currentState,
      onCommitState,
      onError,
      onStatusMessage,
    }),
  );

  return {
    ...hook,
    onCommitState,
    onError,
    onStatusMessage,
  };
}

describe("useConfigEditWorkflow", () => {
  beforeEach(() => {
    runCommitMock.mockReset();
  });

  it("applies committed state and status messages", async () => {
    runCommitMock.mockResolvedValueOnce({
      status: "commit",
      state: { homeDir: "/Users/test/.codex" },
      changed: true,
      notice: "已保存。备份：~/backups/config.toml.bak",
    });
    const { result, onCommitState, onStatusMessage } = renderWorkflow({
      fileToken: { hash: "abc", size: 10 },
    });
    const intent: ConfigEditIntent = {
      kind: "rootSettings",
      changes: [{ path: "model", action: "set", value: "gpt-5.5" }],
    };

    await act(async () => {
      await result.current.runCommit(intent);
    });

    expect(runCommitMock).toHaveBeenCalledWith(intent, { hash: "abc", size: 10 });
    expect(onCommitState).toHaveBeenCalledWith({ homeDir: "/Users/test/.codex" });
    expect(onStatusMessage).toHaveBeenLastCalledWith("已保存。备份：~/backups/config.toml.bak");
  });

  it("allows restore backup commits without any preview state", async () => {
    runCommitMock.mockResolvedValueOnce({
      status: "commit",
      state: { homeDir: "/Users/test/.codex" },
      changed: true,
      notice: "已恢复备份。恢复前备份：~/backups/config.toml.bak",
    });
    const { result, onCommitState, onStatusMessage } = renderWorkflow({
      fileToken: { hash: "abc", size: 10 },
    });

    await act(async () => {
      await result.current.runCommit({
        kind: "restoreBackup",
        backupId: "config.toml.bak",
      });
    });

    expect(runCommitMock).toHaveBeenCalledWith(
      { kind: "restoreBackup", backupId: "config.toml.bak" },
      { hash: "abc", size: 10 },
    );
    expect(onCommitState).toHaveBeenCalledWith({ homeDir: "/Users/test/.codex" });
    expect(onStatusMessage).toHaveBeenLastCalledWith(
      "已恢复备份。恢复前备份：~/backups/config.toml.bak",
    );
  });

  it("surfaces commit errors without applying state", async () => {
    runCommitMock.mockResolvedValueOnce({
      status: "error",
      message: "config.toml changed on disk",
    });
    const { result, onCommitState, onError } = renderWorkflow();

    await act(async () => {
      await result.current.runCommit({ kind: "fastMode" });
    });

    expect(onError).toHaveBeenLastCalledWith("config.toml changed on disk");
    expect(onCommitState).not.toHaveBeenCalled();
  });

  it("clears status and errors when callers invalidate a draft", () => {
    const { result, onError, onStatusMessage } = renderWorkflow();

    act(() => {
      result.current.reset({ clearError: true, clearStatus: true });
    });

    expect(onError).toHaveBeenCalledWith(null);
    expect(onStatusMessage).toHaveBeenCalledWith(null);
  });
});
