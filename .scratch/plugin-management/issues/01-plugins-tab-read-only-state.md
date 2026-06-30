# Plugins tab read-only state

Status: ready-for-agent

## What to build

Add the first end-to-end Codex Plugins workspace slice. Users should see a `Plugins` main tab, load normalized Codex plugin state from `codex plugin list --json`, and see installed Codex plugins in a read-only `Installed` sub-tab. CLI failures should appear as local Plugins workspace errors without making unrelated app workspaces read-only.

## Acceptance criteria

- [ ] A Codex `Plugins` main tab appears beside the existing Config, Sessions, MCP Servers, and Skills tabs.
- [ ] The Plugins workspace has `Installed`, `Marketplaces`, and `Available` sub-tabs, with only `Installed` populated in this slice.
- [ ] Installed plugin summaries come from `codex plugin list --json` through a backend adapter that ignores unknown JSON fields.
- [ ] Empty installed state is visible and points users to Codex `/plugins` or the Codex app Plugins page.
- [ ] CLI load errors render inside the Plugins workspace and do not block other app tabs.
- [ ] Rust and UI tests cover successful installed plugin loading, empty state, and CLI error display.

## Blocked by

None - can start immediately
