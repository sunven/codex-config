# Codex Config

Visual desktop editor for local Codex configuration, sessions, MCP servers, global skills, and plugins.

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

**Codex plugin**:
A Codex installable distribution unit that can bundle skills, app integrations, MCP servers, hooks, or related assets.
_Avoid_: skill, extension, generic plugin

**Plugin marketplace**:
A Codex plugin catalog source that exposes installable Codex plugins, such as a repo-scoped or personal marketplace.
_Avoid_: plugin store, skill marketplace, package registry
