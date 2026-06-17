import { useState } from "react";
import {
  runConfigEditCommit,
  runConfigEditPreview,
  type ConfigEditIntent,
  type FileToken,
  type PreviewResult,
  type WorkflowRunOutcome,
} from "./configEditWorkflow";

type ConfigEditWorkflowState = {
  preview: PreviewResult | null;
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

  function applyWorkflowOutcome(outcome: WorkflowRunOutcome<TState>) {
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
    applyWorkflowOutcome(await runConfigEditPreview(intent));
  }

  async function runCommit(intent: ConfigEditIntent) {
    onError(null);
    applyWorkflowOutcome(
      await runConfigEditCommit<TState>(intent, currentState?.fileToken),
    );
  }

  return {
    preview: workflowState.preview,
    reset,
    runPreview,
    runCommit,
  };
}
