# 02. 添加 Agent global skill 软链导入后端命令

Status: done

## Parent

[PRD: 新增本地 Skill 软链导入功能](../PRD.md)

## What to build

Add a backend operation and Tauri command that imports an existing local skill directory into Agent global skills by creating a directory symlink under the Agent global skills root. The operation should validate the selected directory, create the root if needed, create or reuse the symlink safely, and return refreshed app state so the imported skill is immediately visible to the UI.

The command should only create a symlink. It must not copy skill files, edit `SKILL.md`, or write any `skills.config` entry.

The command should only create an Agent global skills symlink when that root is discoverable in the current app state. If the current environment suppresses the Agent global root, fail clearly rather than creating a hidden symlink that will not appear in the Skills workspace.

## Acceptance criteria

- [x] The command accepts a selected directory path and rejects paths that are not directories.
- [x] The command rejects directories that do not contain a readable `SKILL.md`.
- [x] The command creates the Agent global skills root when it does not exist.
- [x] The command fails clearly when the Agent global skills root is not part of current skill discovery.
- [x] The command creates a directory symlink under the Agent global skills root using the selected directory basename.
- [x] The command does not overwrite an existing file, directory, or symlink that points to a different target.
- [x] Re-importing a directory that is already linked at the expected location is treated as an idempotent success.
- [x] The command returns refreshed app state containing the imported skill once discovery sees the symlink.
- [x] The command does not modify Codex config TOML or add `skills.config` entries.
- [x] Backend tests cover valid import, missing `SKILL.md`, non-directory input, unavailable Agent global root, root creation, collision handling, and idempotent same-target import.

## Blocked by

- [01. 安全发现 skill 目录软链](./01-discover-skill-directory-symlinks-safely.md)
