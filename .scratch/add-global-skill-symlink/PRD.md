# PRD: 新增本地 Skill 软链导入功能

Status: done

## Problem Statement

用户已经有一些本地 skill 目录，每个目录内包含 `SKILL.md`。现在 codex-config 的 Skills 工作区只能展示已经位于全局 skills 根目录下的 skills，并支持预览和启停，但不能从 UI 中把一个已有 skill 目录加入全局 skills。

用户希望在 codex-config 中新增一个简单的“新增 skill”能力：选择一个包含 `SKILL.md` 的目录后，应用在用户的 Agent global skills 根目录下创建一个指向该目录的软链。这样用户不用复制 skill，也不用手动执行 `ln -s`，就能让该 skill 出现在全局 skills 列表中并被后续 Codex/agent skill 发现。

当前代码里已经存在 `~/.agents/skills` 作为 Agent global skills root，但现有扫描逻辑只递归真实目录。目录软链在 macOS/Unix 上通常不会被 `read_dir` 的 `file_type().is_dir()` 当作真实目录处理，所以仅创建软链可能不足以让 skill 生效。实现必须同时保证全局 skills 扫描能发现有效的 skill 目录软链。

## Solution

在 Skills 工作区新增“新增 skill”操作。用户点击操作后选择一个本地目录；应用验证该目录中存在可读取的 `SKILL.md`；然后在 Agent global skills root 下创建一个同名或冲突处理后的目录软链，指向用户选择的目录；完成后重新加载 app state，让新 skill 出现在 Skills 列表里。

新增 skill 的语义应保持极简：只创建软链，不复制目录内容，不改写 `SKILL.md`，不自动修改 enable/disable 配置。软链创建成功后，skill 默认遵循现有默认启用规则；如果用户想停用，可以继续使用现有 Skills 工作区的启停开关。

实现还需要更新 skill discovery，让它在全局 skills root 下能安全地跟随目录软链并发现软链目标内的 `SKILL.md`。这样新增出来的软链和用户手动创建的合法 skill 软链都能被当前应用发现。

## User Stories

1. As a Codex user, I want to add an existing local skill directory from the Skills tab, so that I do not need to manually create a symlink in the terminal.
2. As a Codex user, I want to choose a directory that contains `SKILL.md`, so that the app only imports valid skill directories.
3. As a Codex user, I want the app to create a symlink under my Agent global skills root, so that the original skill directory remains the source of truth.
4. As a Codex user, I want the selected skill directory to remain in place, so that edits in my original directory continue to affect the installed skill.
5. As a Codex user, I want the new skill to appear in the global skills list after import, so that I can confirm it was added successfully.
6. As a Codex user, I want the newly added skill to be selectable immediately, so that I can preview its `SKILL.md` content.
7. As a Codex user, I want the imported skill to show its parsed name and description, so that it behaves like other discovered skills.
8. As a Codex user, I want the imported skill to keep the existing default enabled behavior, so that I do not need a second enable step.
9. As a Codex user, I want to be able to disable the imported skill with the existing switch, so that imported skills follow the same management model as other global skills.
10. As a Codex user, I want a clear success message after the symlink is created, so that I know the operation completed.
11. As a Codex user, I want the success message to mention that Codex may need a restart or fresh session to pick up the new skill, so that I understand the activation timing.
12. As a Codex user, I want the app to create the Agent global skills root if it does not exist, so that first-time setup is not blocked by a missing directory.
13. As a Codex user, I want the app to reject a selected directory that has no `SKILL.md`, so that invalid folders do not pollute my global skills root.
14. As a Codex user, I want the app to reject a selected path that is not a directory, so that I cannot accidentally link a file as a skill.
15. As a Codex user, I want the app to surface filesystem permission errors clearly, so that I know when the symlink cannot be created.
16. As a Codex user, I want the app to handle name collisions predictably, so that adding a skill does not overwrite an existing skill directory or symlink.
17. As a Codex user, I want the app to tell me when a skill with the same target is already linked, so that repeated imports are idempotent.
18. As a Codex user, I want the app to avoid creating broken symlinks, so that the Skills list remains trustworthy.
19. As a Codex user, I want the app to discover valid directory symlinks inside global skill roots, so that imported skills actually show up.
20. As a Codex user, I want manually created valid skill symlinks to show up too, so that the app's discovery behavior matches the import feature.
21. As a Codex user, I want the skill scanner to avoid infinite loops through symlinks, so that discovery remains reliable even if my filesystem has recursive links.
22. As a Codex user, I want the skill scanner to deduplicate skills by canonical `SKILL.md` path, so that the same target does not appear many times.
23. As a Codex user, I want symlinked skills to display useful paths, so that I can distinguish the global symlink location from the original directory when needed.
24. As a Codex user, I want search to include imported skills immediately, so that the existing Skills workflow remains consistent.
25. As a Codex user, I want the import action to be disabled or fail safely when the app is not writable, so that readonly states are respected.
26. As a keyboard user, I want the add skill control to be reachable and labelled, so that I can import a skill without mouse-only interaction.
27. As a maintainer, I want the symlink creation logic isolated in the skill store, so that frontend code does not own filesystem rules.
28. As a maintainer, I want the Tauri command contract to be small, so that adding a skill is easy to test and reason about.
29. As a maintainer, I want platform-specific symlink behavior handled behind one backend API, so that the UI remains platform-neutral.
30. As a maintainer, I want tests covering valid import, invalid directory, collisions, and discovery through symlinks, so that future changes do not break skill installation.

## Implementation Decisions

- Add a backend skill-store operation that accepts a selected directory path, validates that it is a directory, validates that it contains a readable `SKILL.md`, ensures the Agent global skills root exists, creates a symlink inside that root, and returns the refreshed app state.
- Expose the backend operation through a new Tauri command used by the Skills workspace.
- The symlink target should be the selected skill directory, not the `SKILL.md` file.
- The symlink location should be the Agent global skills root, because the user specifically asked for `/Users/sunven/.agents/skills` behavior and the current app already labels that root as Agent global skills.
- The symlink name should default to the selected directory's basename. If that name already exists, the operation must not overwrite it.
- If an existing symlink under the target name already points at the same selected directory, treat the operation as already satisfied and return refreshed state with a clear no-op/success message.
- If an existing directory, file, or symlink under the target name points somewhere else, return a collision error rather than deleting or replacing it.
- The backend should create the Agent global skills root if it is missing.
- The operation should not mutate Codex config TOML or write any `skills.config` entry. Imported skills should use the existing default enabled semantics.
- The operation should not copy, edit, normalize, or scaffold `SKILL.md`.
- Skill discovery should be updated to follow valid directory symlinks under discovered global skill roots.
- Discovery should continue to avoid duplicate entries by canonical path.
- Discovery should track canonical directories while recursing so symlink cycles cannot create infinite recursion.
- Discovery should preserve the existing maximum scan-depth guard.
- Validation for reading skill content and changing enablement should continue to require that the selected `SKILL.md` is discoverable under a global skill root. After discovery follows symlinks, imported skills should pass the existing verification path.
- The Skills workspace should add an import action near the Skills heading/search area, using the existing Tauri dialog plugin to select a directory.
- After import, the frontend should update app state from the command result, clear stale skill preview content if needed, select the imported skill when the returned state contains it, and show a concise status message.
- Errors should use the existing app-level error display pattern.
- The UI copy can remain Chinese to match the current Skills workspace.
- The feature should keep the current preview, search, and enable/disable workflows unchanged.

## Testing Decisions

- Good tests should verify externally visible behavior: a valid skill directory can be imported and then appears in discovered skills; invalid selections are rejected; existing entries are not overwritten; imported skills can still be read and toggled through existing skill operations.
- Backend unit tests should cover creating a symlink to a valid skill directory and refreshing/discovering that skill.
- Backend unit tests should cover missing `SKILL.md`, non-directory paths, missing Agent global root creation, existing same-target symlink no-op behavior, and existing different-target collision errors.
- Backend unit tests should cover scanner behavior for directory symlinks and symlink cycles, using canonical-directory tracking plus the existing maximum depth.
- Existing skill-store tests for metadata parsing, config disable entries, and `verified_skill_path` behavior should remain green.
- Frontend tests should mock the directory picker and new Tauri command, then assert that the Skills workspace exposes an add action, calls the command with the selected directory, updates the list from returned state, and displays a success message.
- Frontend tests should cover canceling the directory picker: no backend command should be called and no error should be shown.
- Frontend tests should cover backend import failure: the existing error display should show the message and the current skill list should remain usable.
- Existing Skills workspace tests for roots, filtering, previewing markdown content, and enable/disable should remain green.
- Manual QA should add a real local skill directory through the UI, confirm that the symlink exists under Agent global skills, confirm the skill appears in the list, preview its content, restart Codex or start a fresh session, and confirm the skill is available to the agent.

## Out of Scope

- Creating new skill scaffolds from scratch.
- Editing `SKILL.md` content in codex-config.
- Deleting imported skill symlinks.
- Removing or cleaning up original skill directories.
- Copying skills into global roots.
- Installing skills from GitHub or a marketplace.
- Managing `.codex/skills` imports separately from Agent global skills.
- Replacing the existing enable/disable `skills.config` behavior.
- Auto-restarting Codex or current agent sessions after import.
- Changing the broader Skills workspace design beyond adding the import control and status states needed for this feature.

## Further Notes

- Yes, the intended model should make the skill effective, but only after discovery follows symlinked skill directories. The current scanner is likely to miss directory symlinks because it filters child entries by real directory type before recursing.
- Imported skills may still require a new Codex/agent session or restart before they are included in the runtime skill list, matching the current enable/disable copy.
- The local issue tracker label for this PRD is `done`.

## Completion Notes

- Completed issues:
  - [01. 安全发现 skill 目录软链](./issues/01-discover-skill-directory-symlinks-safely.md)
  - [02. 添加 Agent global skill 软链导入后端命令](./issues/02-add-backend-import-command-for-agent-global-skill-symlinks.md)
  - [03. 添加 Skills 工作区导入流程](./issues/03-add-skills-ui-import-flow.md)
- Final verification passed:
  - `pnpm test`
  - `pnpm build`
  - `cargo test` from `src-tauri`
