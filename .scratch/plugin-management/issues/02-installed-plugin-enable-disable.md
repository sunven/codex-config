# Installed plugin enable and disable

Status: ready-for-agent

## What to build

Let users enable or disable an installed Codex plugin from the Plugins workspace. Disabling writes an `enabled = false` override under the plugin's config table; enabling removes that override while preserving unrelated plugin settings such as plugin-provided MCP server policy.

## Acceptance criteria

- [ ] Installed plugin rows expose a switch for the plugin enabled state.
- [ ] Disabling an installed plugin writes `[plugins."<plugin-id>"] enabled = false` using existing file-token checks.
- [ ] Enabling a disabled plugin removes the `enabled = false` override.
- [ ] Re-enabling preserves any unrelated plugin subsettings and removes an empty plugin table when no settings remain.
- [ ] Successful changes refresh both plugin state and app state so `fileToken` stays current.
- [ ] Success copy says the change takes effect after restarting Codex or starting a new thread.
- [ ] Rust and UI tests cover disable, re-enable, preserved subsettings, empty-table cleanup, and stale file-token errors.

## Blocked by

- `.scratch/plugin-management/issues/01-plugins-tab-read-only-state.md`
