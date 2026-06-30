# Spec: Codex Plugin Management

## Objective
Add a Codex Plugins workspace for managing installed Codex plugins and configured plugin marketplaces. Success means users can inspect installed plugins from Codex CLI JSON, enable or disable installed plugins through `config.toml`, uninstall installed plugins through the Codex CLI, manage marketplace sources, and browse available marketplace plugins read-only.

## Tech Stack
React + TypeScript frontend, Tauri commands, Rust backend using existing TOML workflow and file-token checks, plus Codex CLI plugin commands.

## Commands
- Frontend tests: `pnpm test -- --run`
- Frontend build: `pnpm build`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`

## Source Evidence
- Codex plugins are installable distribution units that can bundle skills, app integrations, and MCP servers.
- Installed plugin enablement can be overridden in `~/.codex/config.toml` with `[plugins."<plugin-id>"] enabled = false`.
- Plugin uninstall is a Codex plugin-browser/CLI operation, not just removing a config table.
- Codex CLI exposes `codex plugin list --json`, `codex plugin remove --json`, and `codex plugin marketplace list/add/remove/upgrade --json`.

## Project Structure
- `src/app/AppShell.tsx` -> add a Codex `Plugins` main tab
- `src/app/App.tsx` -> load and refresh plugin state, route plugin command results into app state
- `src/features/plugins/PluginsWorkspace.tsx` -> Installed, Marketplaces, and Available sub-tabs
- `src/features/plugins/codexPlugins.ts` -> filtering, labels, command payload helpers
- `src/state/appState.ts` -> plugin state TypeScript types
- `src-tauri/src/app_state.rs` -> expose plugin state without making unrelated app areas read-only on plugin CLI failure
- `src-tauri/src/plugin_store.rs` -> Codex CLI JSON adapter and plugin config enablement edits
- `src-tauri/src/lib.rs` -> Tauri command registration

## Code Style
```tsx
<Button onClick={() => onRemove(plugin.pluginId)} size="sm">
  <Trash2 data-icon="inline-start" />
  卸载
</Button>
```

Use existing small function components, Chinese UI copy, lucide icons, `Switch` for enabled state, and Tauri `invoke` calls. Rust command wrappers stay thin; CLI execution and JSON normalization live in `plugin_store`.

## Backend Design
- Treat `codex plugin list --json` as the source of truth for installed and available plugins.
- Deserialize CLI JSON permissively: require only fields needed by the UI contract and ignore unknown fields.
- Expose installed plugin summaries with `pluginId`, `name`, `marketplaceName`, `version`, `enabled`, `installed`, `source`, `installPolicy`, and `authPolicy`.
- Expose available plugins read-only from `codex plugin list --available --json`.
- Expose marketplaces from `codex plugin marketplace list --json`.
- Use the configured Codex binary path from existing app preferences and discovery.
- Use 15 second timeouts for plugin list/remove commands.
- Use 60 second timeouts for marketplace add/upgrade commands.
- Surface plugin CLI failures as plugin-state errors, not global app read-only state.

## Config Editing
- Disabling an installed plugin writes `[plugins."<plugin-id>"] enabled = false`.
- Enabling a disabled plugin removes the `enabled = false` override.
- If a plugin table has other settings such as `mcp_servers` or tool policy, keep the table and remove only the `enabled` field.
- If a plugin table becomes empty after removing `enabled`, remove the empty table.
- Use the existing file-token checks before writing `config.toml`.
- After a successful config or CLI mutation, refresh both plugin state and app state so `fileToken` stays current.

## UI Design
- Add a Codex main tab named `Plugins`.
- Inside the Plugins workspace, use three sub-tabs: `Installed`, `Marketplaces`, and `Available`.
- `Installed` lists installed plugins, supports search, enable/disable, and uninstall.
- `Marketplaces` lists configured marketplace sources and supports add, remove, upgrade one, and upgrade all.
- Marketplace add form supports `source`, optional `ref`, and optional sparse checkout paths parsed from comma-separated or newline-separated text.
- `Available` shows read-only marketplace plugins to confirm marketplace contents; it does not install plugins.
- Empty installed state should point users to Codex `/plugins` or the Codex app Plugins page to install plugins.
- Enable/disable success text should say the change takes effect after restarting Codex or starting a new thread.
- Uninstall requires an explicit confirmation dialog and says external bundled app connections remain managed in ChatGPT.

## Testing Strategy
- Add Rust tests for parsing plugin list JSON, marketplace list JSON, and malformed CLI output.
- Add Rust tests for writing `enabled = false`, removing the enabled override, preserving plugin subsettings, and cleaning empty plugin tables.
- Add Rust tests for CLI command construction and timeout/error mapping using fake Codex binaries.
- Add UI tests for the Plugins main tab, installed empty state, installed plugin toggle, uninstall confirmation, marketplace add/remove/upgrade flows, available read-only listing, and local error display.

## Boundaries
- Always: Treat Codex CLI JSON as the installed-plugin source of truth.
- Always: Keep plugin CLI failures local to the Plugins workspace.
- Always: Preserve non-enable plugin config such as plugin-provided MCP server policy.
- Always: Require confirmation before uninstalling a plugin.
- Ask first: Installing plugins from the Available tab.
- Ask first: Parsing plugin manifests for bundled skills, MCP servers, apps, or hooks.
- Ask first: Editing plugin-provided MCP server tool policy in this workspace.
- Never: Infer installed plugins from `[plugins]` config tables alone.
- Never: Delete plugin cache directories directly; use `codex plugin remove`.
- Never: Manage ChatGPT app connector installation or removal from this desktop app.

## Success Criteria
- A Codex `Plugins` tab appears beside the existing Config, Sessions, MCP Servers, and Skills tabs.
- Installed plugins come from `codex plugin list --json`.
- Users can disable and re-enable an installed plugin while preserving unrelated plugin config.
- Users can uninstall an installed plugin through `codex plugin remove --json` after explicit confirmation.
- Users can list, add, remove, and upgrade plugin marketplaces through Codex CLI commands.
- Users can browse available marketplace plugins read-only.
- CLI failures show actionable local errors and do not block other app workspaces.

## Open Questions
None for this scoped implementation.
