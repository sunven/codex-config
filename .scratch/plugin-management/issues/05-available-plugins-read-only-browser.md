# Available plugins read-only browser

Status: done

## What to build

Add a read-only `Available` sub-tab that shows plugins available from configured plugin marketplaces. This slice helps users confirm marketplace contents without adding install behavior to this app.

## Acceptance criteria

- [x] The `Available` sub-tab lists marketplace plugins from `codex plugin list --available --json`.
- [x] Available plugin cards or rows show CLI metadata such as name, plugin id, marketplace name, version, source, install policy, and auth policy when present.
- [x] Available plugins are searchable or filterable without affecting installed plugin state.
- [x] The UI clearly does not offer install actions in this slice.
- [x] Empty and CLI failure states are visible inside the `Available` sub-tab.
- [x] Rust and UI tests cover available plugin parsing, rendering, filtering, empty state, and failure state.

## Blocked by

- `.scratch/plugin-management/issues/04-plugin-marketplace-management.md`
