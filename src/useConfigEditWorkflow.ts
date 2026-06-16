import { useState } from "react";
import {
  runConfigEditCommit,
  runConfigEditPreview,
  type ConfigEditIntent,
  type ConfigEditPreviewKind,
  type FileToken,
  type PreviewResult,
  type WorkflowRunOutcome,
} from "./configEditWorkflow";

type ConfigEditWorkflowState = {
  preview: PreviewResult | null;
  previewKind: ConfigEditPreviewKind | null;
  previewTicket: string | null;
  pendingDeleteProviderId: string | null;
  pendingDeleteServerId: string | null;
};

type ConfigEditWorkflowOptions<TState extends { fileToken?: FileToken; homeDir?: string }> = {
  currentState: TState | null;
  onCommitState: (state: TState) => void;
  onError: (message: string | null) => void;
  onStatusMessage: (message: string | null) => void;
};

type ResetOptions = {
  clearStatus?: boolean;
  clearError?: boolean;
};

const emptyWorkflowState: ConfigEditWorkflowState = {
  preview: null,
  previewKind: null,
  previewTicket: null,
  pendingDeleteProviderId: null,
  pendingDeleteServerId: null,
};

export function useConfigEditWorkflow<TState extends { fileToken?: FileToken; homeDir?: string }>({
  currentState,
  onCommitState,
  onError,
  onStatusMessage,
}: ConfigEditWorkflowOptions<TState>) {
  const [workflowState, setWorkflowState] =
    useState<ConfigEditWorkflowState>(emptyWorkflowState);

  function reset(options: ResetOptions = {}) {
    setWorkflowState(emptyWorkflowState);

    if (options.clearStatus) {
      onStatusMessage(null);
    }

    if (options.clearError) {
      onError(null);
    }
  }

  function applyWorkflowOutcome(
    outcome: WorkflowRunOutcome<TState>,
    previewIntent?: ConfigEditIntent,
  ) {
    if (outcome.status === "error") {
      onError(outcome.message);
      return;
    }

    if (outcome.status === "notice") {
      setWorkflowState(emptyWorkflowState);
      onStatusMessage(outcome.notice);
      return;
    }

    if (outcome.status === "preview") {
      setWorkflowState({
        preview: outcome.preview,
        previewKind: outcome.previewKind,
        previewTicket:
          outcome.preview.changed && previewIntent
            ? previewTicket(previewIntent)
            : null,
        pendingDeleteProviderId: outcome.pendingDeleteProviderId,
        pendingDeleteServerId: outcome.pendingDeleteServerId,
      });
      onStatusMessage(outcome.notice);
      return;
    }

    setWorkflowState(emptyWorkflowState);
    onCommitState(outcome.state);
    onStatusMessage(outcome.notice);
  }

  async function runPreview(intent: ConfigEditIntent) {
    onError(null);
    onStatusMessage(null);
    applyWorkflowOutcome(await runConfigEditPreview(intent), intent);
  }

  async function runCommit(intent: ConfigEditIntent) {
    if (intent.kind !== "restoreBackup" && !canCommit(intent)) {
      onError("请先预览配置变更。");
      return;
    }

    onError(null);
    applyWorkflowOutcome(
      await runConfigEditCommit<TState>(intent, currentState?.fileToken),
    );
  }

  function previewReady(kind: ConfigEditPreviewKind) {
    return workflowState.previewKind === kind && Boolean(workflowState.preview?.changed);
  }

  function canCommit(intent: ConfigEditIntent) {
    const kind = previewKindForIntent(intent);

    return Boolean(
      kind &&
        previewReady(kind) &&
        workflowState.previewTicket === previewTicket(intent),
    );
  }

  return {
    preview: workflowState.preview,
    previewKind: workflowState.previewKind,
    pendingDeleteProviderId: previewReady("modelProviderDelete")
      ? workflowState.pendingDeleteProviderId
      : null,
    pendingDeleteServerId: previewReady("mcpServerDelete")
      ? workflowState.pendingDeleteServerId
      : null,
    reset,
    runPreview,
    runCommit,
    previewReady,
  };
}

function previewKindForIntent(intent: ConfigEditIntent): ConfigEditPreviewKind | null {
  if (intent.kind === "fastMode") {
    return "fast";
  }

  if (intent.kind === "restoreBackup") {
    return null;
  }

  return intent.kind;
}

function previewTicket(intent: ConfigEditIntent) {
  return JSON.stringify(intent);
}
