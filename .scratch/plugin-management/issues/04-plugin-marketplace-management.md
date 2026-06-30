# Plugin marketplace management

Status: ready-for-agent

## What to build

Add marketplace source management to the Plugins workspace. Users should be able to list configured plugin marketplaces, add a new marketplace source, remove a configured marketplace, and upgrade one or all Git-backed marketplaces through Codex CLI marketplace commands.

## Acceptance criteria

- [ ] The `Marketplaces` sub-tab lists marketplace sources from `codex plugin marketplace list --json`.
- [ ] Users can add a marketplace with required `source`, optional `ref`, and optional sparse checkout paths parsed from comma-separated or newline-separated text.
- [ ] Users can remove a configured marketplace after confirmation.
- [ ] Users can upgrade one marketplace or upgrade all configured Git marketplaces.
- [ ] Marketplace add and upgrade commands use a longer timeout than plugin list/remove commands.
- [ ] Successful marketplace mutations refresh both plugin state and app state.
- [ ] CLI failures display as local Plugins workspace errors.
- [ ] Rust and UI tests cover list, add payloads, remove confirmation, upgrade one, upgrade all, timeout/error mapping, and refresh behavior.

## Blocked by

- `.scratch/plugin-management/issues/01-plugins-tab-read-only-state.md`
