# codex-config

Visual desktop editor for `~/.codex/config.toml`.

## v0.1 tester install

For macOS testers, share the generated DMG:

```bash
src-tauri/target/release/bundle/dmg/codex-config_0.1.0_aarch64.dmg
```

Open the DMG, drag `codex-config` to Applications, then launch it. macOS may show an
unidentified developer warning for this unsigned local build; open it from Finder with
Right Click -> Open.

The app edits the real Codex config at `~/.codex/config.toml` unless launched with a
custom `CODEX_HOME`. It previews changes before saving and writes directly to
`config.toml`.

If the app says Codex is not found, use "Codex 命令位置" to choose the `codex` binary,
for example `/opt/homebrew/bin/codex`.

For a safe local test config:

```bash
CODEX_HOME=/tmp/codex-config-test pnpm tauri dev
```

Current implementation status:
- Tauri 2 + React + TypeScript shell.
- Rust commands for loading, previewing, and saving config.
- Health strip with Codex binary detection.
- Manual Codex binary path preference stored outside Codex `config.toml`.
- Native file picker for choosing the Codex binary.
- Editable root/global fields: Fast mode, model, model provider, OSS provider, reasoning effort, reasoning summary, verbosity, service tier, sandbox mode, approval policy, web search mode, and reasoning display toggles.
- Editable active profile fields for the same common settings. Profile edits target only the current `profile = "..."` table and can create that profile table if it is missing.
- Bundled schema metadata drives the editable scalar field catalog and the backend write registry.
- Full-field catalog/search shows representative official Codex config fields, including complex areas such as `model_providers`, `mcp_servers`, `profiles`, `tools`, and `apps`.
- Dedicated `model_providers` editor for custom providers: create, edit, rename, delete, preview, save, and protected built-in provider IDs.
- Dedicated `mcp_servers` editor: create, edit, rename, delete, preview, save, and preserve unknown advanced fields on existing servers.
- Global and profile fields are grouped in the UI.
- Field-level diff plus raw TOML diff preview.
- Advanced TOML editor for configuring complex fields before dedicated visual editors exist. Raw edits are parsed, reserialized, reparsed, previewed, and protected by file tokens.
- Malformed existing TOML can be repaired through the advanced TOML editor.
- Active profile override warnings.
- Raw TOML preview.
- Optimistic file tokens to block overwriting config changed outside the app.

Planned next:
- Dedicated editor for profile management.
- Runtime schema refresh workflow.
- Dedicated visual controls for remaining complex nested settings.

## Development

```bash
pnpm install
pnpm tauri dev
```

## Checks

```bash
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug
```
