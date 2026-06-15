# Codex Config

Visual desktop editor for local Codex configuration, sessions, MCP servers, and global skills.

## Language

**Codex config**:
The local Codex configuration document edited by this app, normally `config.toml` under the active Codex home.
_Avoid_: settings file, preferences file

**Config edit workflow**:
The preview-before-save/delete interaction used when changing Codex config through structured editors or raw TOML.
_Avoid_: save handler, command wrapper

**Codex config table entry**:
A named TOML table nested under a Codex config table root, such as `[model_providers.local]` or `[mcp_servers.filesystem]`.
_Avoid_: table row, generic config item
