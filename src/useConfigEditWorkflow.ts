import {
  runConfigEditCommit,
  type ConfigEditIntent,
  type FileToken,
  type WorkflowCommitRunOutcome,
} from "./configEditWorkflow";

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

export function useConfigEditWorkflow<TState extends { fileToken?: FileToken; homeDir?: string }>({
  currentState,
  onCommitState,
  onError,
  onStatusMessage,
}: ConfigEditWorkflowOptions<TState>) {
  function reset(options: ResetOptions = {}) {
    if (options.clearStatus) {
      onStatusMessage(null);
    }

    if (options.clearError) {
      onError(null);
    }
  }

  function applyWorkflowOutcome(outcome: WorkflowCommitRunOutcome<TState>) {
    if (outcome.status === "error") {
      onError(outcome.message);
      return;
    }

    reset();
    onCommitState(outcome.state);
    onStatusMessage(outcome.notice);
  }

  async function runCommit(intent: ConfigEditIntent) {
    onError(null);
    const outcome = await runConfigEditCommit<TState>(intent, currentState?.fileToken);
    applyWorkflowOutcome(outcome);

    return outcome;
  }

  return {
    reset,
    runCommit,
  };
}
