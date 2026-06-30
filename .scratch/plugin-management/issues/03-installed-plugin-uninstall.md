# Installed plugin uninstall

Status: ready-for-agent

## What to build

Let users uninstall an installed Codex plugin from the Plugins workspace through `codex plugin remove --json`. The UI must require explicit confirmation and must explain that external bundled app connections remain managed in ChatGPT.

## Acceptance criteria

- [ ] Installed plugin rows expose an uninstall action.
- [ ] Uninstall opens an explicit confirmation dialog before invoking the backend command.
- [ ] Confirming uninstall calls `codex plugin remove --json` with the selected plugin identifier.
- [ ] Successful uninstall refreshes both plugin state and app state.
- [ ] Failed uninstall displays an actionable local error in the Plugins workspace.
- [ ] The confirmation copy says uninstall removes the Codex plugin bundle and does not remove external app connections managed in ChatGPT.
- [ ] Rust and UI tests cover command construction, success refresh, failure display, and dialog confirmation behavior.

## Blocked by

- `.scratch/plugin-management/issues/01-plugins-tab-read-only-state.md`
