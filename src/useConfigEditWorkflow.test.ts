import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runConfigEditCommit,
  runConfigEditPreview,
  type ConfigEditIntent,
} from "./configEditWorkflow";
import { useConfigEditWorkflow } from "./useConfigEditWorkflow";

vi.mock("./configEditWorkflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./configEditWorkflow")>();

  return {
    ...actual,
    runConfigEditPreview: vi.fn(),
    runConfigEditCommit: vi.fn(),
  };
});

const runPreviewMock = vi.mocked(runConfigEditPreview);
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
    runPreviewMock.mockReset();
    runCommitMock.mockReset();
  });

  it("stores changed previews and keeps them readable", async () => {
    runPreviewMock.mockResolvedValueOnce({
      status: "preview",
      preview: {
        changed: true,
        fieldDiffs: [],
        textDiff: "+model = \"gpt-5.5\"",
        candidateRawToml: "model = \"gpt-5.5\"",
      },
      previewKind: "rootSettings",
      notice: null,
    });
    const { result, onError, onStatusMessage } = renderWorkflow();
    const intent: ConfigEditIntent = {
      kind: "rootSettings",
      changes: [{ path: "model", action: "set", value: "gpt-5.5" }],
    };

    await act(async () => {
      await result.current.runPreview(intent);
    });

    expect(runPreviewMock).toHaveBeenCalledWith(intent);
    expect(result.current.preview?.textDiff).toContain("gpt-5.5");
    expect(onError).toHaveBeenCalledWith(null);
    expect(onStatusMessage).toHaveBeenCalledWith(null);
  });

  it("resets previews and status when callers invalidate a draft", async () => {
    runPreviewMock.mockResolvedValueOnce({
      status: "preview",
      preview: {
        changed: true,
        fieldDiffs: [],
        textDiff: "-[model_providers.local]",
        candidateRawToml: "model = \"gpt-5\"",
      },
      previewKind: "modelProviderDelete",
      notice: null,
    });
    const { result, onStatusMessage } = renderWorkflow();

    await act(async () => {
      await result.current.runPreview({ kind: "modelProviderDelete", id: "local" });
    });

    act(() => {
      result.current.reset({ clearStatus: true });
    });

    expect(result.current.preview).toBeNull();
    expect(onStatusMessage).toHaveBeenLastCalledWith(null);
  });

  it("keeps delete previews scoped to changed delete previews", async () => {
    runPreviewMock
      .mockResolvedValueOnce({
        status: "preview",
        preview: {
          changed: true,
          fieldDiffs: [],
          textDiff: "-[mcp_servers.filesystem]",
          candidateRawToml: "model = \"gpt-5\"",
        },
        previewKind: "mcpServerDelete",
        notice: null,
      })
      .mockResolvedValueOnce({
        status: "preview",
        preview: {
          changed: true,
          fieldDiffs: [],
          textDiff: "+[model_providers.local]",
          candidateRawToml: "[model_providers.local]",
        },
        previewKind: "modelProviderSave",
        notice: null,
      });
    const { result } = renderWorkflow();

    await act(async () => {
      await result.current.runPreview({ kind: "mcpServerDelete", id: "filesystem" });
    });

    await act(async () => {
      await result.current.runPreview({
        kind: "modelProviderSave",
        draft: {
          id: "local",
          queryParams: {},
          httpHeaders: {},
          envHttpHeaders: {},
        },
      });
    });
  });

  it("applies committed state and clears preview state", async () => {
    runPreviewMock.mockResolvedValueOnce({
      status: "preview",
      preview: {
        changed: true,
        fieldDiffs: [],
        textDiff: "+model = \"gpt-5.5\"",
        candidateRawToml: "model = \"gpt-5.5\"",
      },
      previewKind: "rootSettings",
      notice: null,
    });
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
      await result.current.runPreview(intent);
    });
    await act(async () => {
      await result.current.runCommit(intent);
    });

    expect(runCommitMock).toHaveBeenCalledWith(intent, { hash: "abc", size: 10 });
    expect(onCommitState).toHaveBeenCalledWith({ homeDir: "/Users/test/.codex" });
    expect(result.current.preview).toBeNull();
    expect(onStatusMessage).toHaveBeenLastCalledWith("已保存。备份：~/backups/config.toml.bak");
  });

  it("allows restore backup commits without a preview ticket", async () => {
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
    runPreviewMock.mockResolvedValueOnce({
      status: "preview",
      preview: {
        changed: true,
        fieldDiffs: [],
        textDiff: "+features.fast_mode = true",
        candidateRawToml: "[features]\nfast_mode = true",
      },
      previewKind: "fast",
      notice: null,
    });
    runCommitMock.mockResolvedValueOnce({
      status: "error",
      message: "config.toml changed on disk",
    });
    const { result, onCommitState, onError } = renderWorkflow();

    await act(async () => {
      await result.current.runPreview({ kind: "fastMode" });
    });
    await act(async () => {
      await result.current.runCommit({ kind: "fastMode" });
    });

    expect(onError).toHaveBeenLastCalledWith("config.toml changed on disk");
    expect(onCommitState).not.toHaveBeenCalled();
  });

  it("commits changes without requiring a prior preview", async () => {
    runCommitMock.mockResolvedValueOnce({
      status: "commit",
      state: { homeDir: "/Users/test/.codex" },
      changed: true,
      notice: "已保存。备份：~/backups/config.toml.bak",
    });
    const { result, onCommitState } = renderWorkflow({
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
  });
});
