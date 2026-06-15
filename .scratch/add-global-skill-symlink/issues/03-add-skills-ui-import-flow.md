# 03. 添加 Skills 工作区导入流程

Status: done

## Parent

[PRD: 新增本地 Skill 软链导入功能](../PRD.md)

## What to build

Add an import action to the Skills workspace so a user can choose an existing local skill directory and add it to Agent global skills without using the terminal. The flow should open a directory picker, call the backend import command with the selected path, refresh the Skills state from the command result, select the imported skill when available, and show clear success or error feedback.

The existing search, preview, and enable/disable behavior should remain unchanged.

## Acceptance criteria

- [x] The Skills workspace exposes a clearly labelled add/import skill action near the existing Skills heading or search controls.
- [x] The action opens a directory picker and does nothing when the picker is canceled.
- [x] Selecting a directory calls the backend import command with the selected directory path.
- [x] On success, the Skills list updates from returned app state and the imported skill is visible/searchable.
- [x] On success, the imported skill is selected when it can be found in returned state.
- [x] On success, the UI shows a concise message explaining that Codex or a new session may be needed before the skill is active at runtime.
- [x] On backend failure, the existing app error display shows the failure and the current Skills workspace remains usable.
- [x] The import action respects the app's writable/readonly state.
- [x] The import action is disabled or reports a clear backend error when Agent global skills are not discoverable in the current environment.
- [x] Frontend tests cover success, canceled picker, and backend failure.
- [x] Existing Skills workspace tests for roots, filtering, markdown preview, and enable/disable remain green.

## Blocked by

- [02. 添加 Agent global skill 软链导入后端命令](./02-add-backend-import-command-for-agent-global-skill-symlinks.md)
