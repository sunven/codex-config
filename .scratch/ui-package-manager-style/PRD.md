# PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格

Status: done

## Problem Statement

当前 codex-config 已经具备较完整的 Codex 配置编辑能力，但前端 UI 仍是单文件 CSS 和手写组件风格：视觉密度、组件语言、布局节奏、按钮/卡片/表格/空态/错误态的表达方式都和 Package Manager Control Center 不一致。

用户希望本项目 UI 重构成与 Package Manager Control Center 同一套桌面工具风格，让两个 Tauri 工具在视觉、交互和信息架构上看起来属于同一产品族，同时保留 codex-config 现有的配置预览、保存、备份、sessions、MCP servers、skills 管理等能力。

## Solution

将 codex-config 的前端体验重构为 Package Manager Control Center 风格的工作台式桌面 UI：使用类似的应用壳、JetBrains Mono 字体、shadcn/Tailwind 组件语言、白底极简背景、卡片/表格/徽章/按钮/提醒条/空态/代码块样式，以及紧凑但可扫描的信息布局。

重构完成后，用户打开 codex-config 时应能明显感觉它和 Package Manager Control Center 属于同一设计系统：顶部是清晰的应用标题、说明和主要刷新/状态操作；主体用 tabs 和卡片组织；配置项、provider、MCP server、session、skill、diff、raw TOML、backup 等内容用一致的控件表达；危险或不可写状态用统一的 destructive/warning 语义表达；所有现有工作流仍然可用。

## User Stories

1. As a Codex user, I want codex-config to visually match Package Manager Control Center, so that my local desktop tools feel consistent.
2. As a Codex user, I want a clean top-level shell with title, short description, refresh action, and current status, so that I can understand the app state immediately.
3. As a Codex user, I want the UI to use the same typography and spacing rhythm as Package Manager Control Center, so that dense configuration data remains readable.
4. As a Codex user, I want root/global config settings to appear in polished cards, so that editing common settings feels deliberate rather than like a raw form dump.
5. As a Codex user, I want active profile settings to share the same component language as global settings, so that I can compare and edit them without context switching.
6. As a Codex user, I want profile override warnings to appear as first-class alerts, so that profile/root conflicts are easy to notice.
7. As a Codex user, I want config target details to appear in a concise status component, so that I can confirm whether I am editing test, custom, or real Codex home.
8. As a Codex user, I want Codex binary detection to be presented in the same status-card language as other app health indicators, so that setup problems are obvious.
9. As a Codex user, I want refresh/loading states to use a consistent button and spinner treatment, so that background reloads are clear but not distracting.
10. As a Codex user, I want success messages to use the same alert style as Package Manager Control Center messages, so that save and backup outcomes are easy to scan.
11. As a Codex user, I want errors to use the same destructive alert style, so that parse, file, and backend errors stand out clearly.
12. As a Codex user, I want the main tabs to feel like the Package Manager Control Center tab controls, so that moving between Config, Sessions, MCP, and Skills feels familiar.
13. As a Codex user, I want the Config tab to preserve its two-column workbench layout on desktop, so that editing controls and preview/raw TOML panels can stay side by side.
14. As a Codex user, I want the Config tab to collapse cleanly on narrow screens, so that the app remains usable in smaller windows.
15. As a Codex user, I want the fast mode recommendation to look like a deliberate action card, so that the recommended path is prominent without feeling like marketing copy.
16. As a Codex user, I want preview and save buttons to use consistent primary/outline variants, so that I can understand which action is preparatory and which action writes.
17. As a Codex user, I want disabled write actions to be visibly disabled with stable layout, so that read-only and unchanged states are clear.
18. As a Codex user, I want boolean, select, text, and number controls to share the target style, so that the settings form feels unified.
19. As a Codex user, I want unset/inherited values to have a clear visual treatment, so that profile inheritance remains understandable.
20. As a Codex user, I want risk labels such as caution, dangerous, secret, and experimental to appear as consistent badges, so that risk is visible without noisy colors.
21. As a Codex user, I want the field catalog search and result list to look like the target app's searchable operational lists, so that schema exploration is easier.
22. As a Codex user, I want model provider rows to use a polished selectable-list pattern, so that selecting, editing, creating, and deleting providers is clear.
23. As a Codex user, I want model provider forms to use the same form grid and controls as the rest of the app, so that advanced provider settings do not feel bolted on.
24. As a Codex user, I want MCP server rows and forms to match the model provider pattern, so that similar configuration workflows look and behave similarly.
25. As a Codex user, I want string-list and key/value-map editors to use compact, predictable controls, so that advanced fields remain editable without layout jitter.
26. As a Codex user, I want delete flows to keep their preview-before-delete behavior, so that destructive edits remain intentional.
27. As a Codex user, I want the diff panel to use the same card and code styling as the target app, so that previews feel integrated with the rest of the UI.
28. As a Codex user, I want field diffs to show before/after values in readable chips or rows, so that I can verify changes before saving.
29. As a Codex user, I want the raw TOML editor to keep a high-contrast code-editor look, so that raw config editing remains legible.
30. As a Codex user, I want TOML parse issues to appear next to the raw editor with clear destructive styling, so that repair work is obvious.
31. As a Codex user, I want backup history to look like an operational list, so that restoring a previous config is easy to understand.
32. As a Codex user, I want backup restore controls to remain disabled when the config is not writable, so that the UI accurately reflects write safety.
33. As a Codex user, I want session year/month grouping to use the same tab/list/card design language, so that session history is easier to navigate.
34. As a Codex user, I want session rows to keep metadata, size, parse error, and delete actions visible, so that I can manage session records safely.
35. As a Codex user, I want skills roots to appear as badges and skills as selectable rows, so that global skill inventory is easier to browse.
36. As a Codex user, I want skill preview markdown to appear in a styled code/preview panel, so that reading a selected skill remains comfortable.
37. As a Codex user, I want skill enable/disable controls to preserve their current behavior, so that the visual refactor does not change skill management semantics.
38. As a Codex user, I want empty states to use the same quiet visual treatment as the target app, so that missing providers, sessions, skills, or scan data do not look like errors.
39. As a Codex user, I want all icon buttons to keep accessible labels and hover titles, so that compact controls remain understandable.
40. As a keyboard user, I want existing keyboard-accessible controls and focus states to remain usable, so that the refactor does not reduce accessibility.
41. As a desktop user, I want long paths, TOML snippets, session titles, provider IDs, and skill descriptions to truncate or wrap cleanly, so that dense rows do not overlap.
42. As a maintainer, I want the new UI to use shared reusable primitives, so that future Codex config features can be added without expanding one-off CSS.
43. As a maintainer, I want the refactor to preserve backend command contracts, so that the Rust/Tauri side does not need to change for a visual update.
44. As a maintainer, I want the build to remain green after the UI refactor, so that the app can still be packaged and tested normally.
45. As a maintainer, I want a visual QA pass against the target app's style, so that the final result is judged by the actual UI rather than by code structure alone.

## Implementation Decisions

- The refactor should target the React/Tauri frontend only unless a missing frontend dependency requires package metadata changes.
- The existing backend commands, data shapes, save/preview/delete/restore semantics, and Codex config write-safety model should remain unchanged.
- The target visual language is Package Manager Control Center: white application background, compact desktop-workbench density, JetBrains Mono typography, shadcn/Tailwind component primitives, rounded but controlled cards/buttons, quiet borders/rings, muted secondary text, status badges, alerts, and table/list patterns.
- The app should introduce or adopt shared UI primitives for buttons, cards/panels, alerts, badges, tabs, table/list rows, empty states, icon buttons, and code blocks rather than continuing to style every control independently.
- The top-level shell should be reworked into a target-style header: title, concise explanatory copy, Codex/config status summary, and a refresh action with loading state.
- Main navigation should use the target app's tabs pattern, adapted to this app's four areas: Config, Sessions, MCP, and Skills.
- The Config area should keep the current two-column desktop workbench shape: primary editing cards on the left, preview/raw TOML/backup cards on the right.
- The Sessions and Skills areas can remain single-pane workspaces, but their internal rows, grouped lists, badges, and preview panels should match the target component language.
- The MCP area should mirror the provider editor layout pattern: selectable list plus form, with preview/save/delete actions presented consistently.
- Global settings and profile settings should use the same field-row language so users can scan labels, notes, values, inherited states, and controls consistently.
- Risk and editability metadata should be represented as badges using neutral, warning, destructive, and outline variants rather than custom one-off pills.
- Diff previews should remain prominent and readable. Field-level diffs and raw TOML diffs should use target-style cards and code surfaces.
- Raw TOML editing should retain a code-editor feel, but should align with the target app's code block styling and spacing.
- Success, warning, and error messages should use shared alert components and consistent tone mapping.
- Empty states should be quiet, centered or padded states matching the target app, not high-emphasis warnings unless the state is actually dangerous.
- Long technical text such as paths, provider IDs, command snippets, TOML, session paths, and skill paths should use truncation, wrapping, or scroll containers that avoid overlap.
- Responsive behavior should be explicit: desktop workbench layouts should collapse to one column, action bars should wrap without overflowing, and wide lists should scroll horizontally only when needed.
- Icons should continue to come from the existing icon library. Icon-only actions should have accessible labels and titles.
- The implementation may add Tailwind/shadcn dependencies and configuration if that is the most direct way to match the target style, but should avoid changing runtime behavior.
- The refactor should prefer extracting components from the large existing frontend component body when that reduces meaningful duplication or makes the design system reusable.
- Existing Chinese product copy can be retained and tightened only where necessary for layout clarity.
- The UI should remain a tool-first desktop application, not a landing page or marketing surface.

## Testing Decisions

- Good tests for this refactor should assert user-visible behavior and safety semantics, not internal component structure or exact CSS class strings.
- The highest verification seam is the built frontend/Tauri shell: the app should compile, render the main shell, and preserve all existing navigation areas.
- Because the current frontend has no established React test suite, the baseline automated check should be the existing TypeScript/Vite build.
- Existing Rust tests should remain the behavioral guardrail for backend config parsing, preview, save, backup, session, provider, MCP, and skill logic. The UI refactor should not require backend test changes unless a real contract changes.
- If a frontend test seam is added, it should cover high-level App behavior with mocked Tauri commands: initial load, error state, tab switching, dirty settings, preview-ready save flow, and empty states.
- Config tab testing should focus on visible outcomes: global settings render, profile settings render, dirty fields enable preview, preview enables save, read-only state disables writes, and status messages appear after save.
- Model provider testing should focus on visible outcomes: create/edit/select/delete controls render, dirty state enables preview, preview state enables save/delete, and protected provider IDs remain protected by existing behavior.
- MCP server testing should mirror provider tests because it shares the same workflow shape.
- Raw TOML testing should focus on visible outcomes: editor renders current TOML, parse error displays, preview state displays diff, and save stays gated by preview state.
- Backup testing should focus on visible outcomes: backup list renders, restore action remains disabled when not writable, and empty backup state is clear.
- Sessions testing should focus on visible outcomes: year/month grouping renders, session metadata is visible, parse errors display, and delete preview/confirmation behavior remains available.
- Skills testing should focus on visible outcomes: roots render as status badges, search filters rows, selection loads preview, and enable/disable actions remain available.
- Visual QA should compare the refactored codex-config app against Package Manager Control Center for typography, spacing, card shape, button variants, tab treatment, alerts, list density, code panels, and responsive behavior.
- Manual QA should include at least desktop-width and narrow-window screenshots to catch text overflow, action wrapping, sticky/sidebar layout problems, and code panel sizing.
- Accessibility checks should include keyboard focus visibility, icon-button labels, tab navigation semantics, and no overlapping text at common window sizes.

## Out of Scope

- Changing how Codex config is parsed, serialized, previewed, saved, or backed up.
- Adding new Codex configuration fields or changing the bundled schema coverage.
- Adding direct execution of commands or new dangerous operations.
- Reworking the Rust/Tauri command API except where unavoidable for frontend compatibility.
- Replacing the app's Chinese UI copy wholesale.
- Implementing profile management features that are currently only planned.
- Adding runtime schema refresh workflows.
- Redesigning Package Manager Control Center itself.
- Creating a shared cross-repo package for the design system.
- Pixel-perfect cloning of every target component; the goal is a coherent shared style adapted to codex-config's domain.

## Further Notes

- The reference style should be interpreted as an operational desktop control center: dense, restrained, information-first, and optimized for repeated use.
- The most important acceptance criterion is behavioral preservation plus visual convergence. A refactor that looks correct but changes save/preview/delete safety semantics is not acceptable.
- The current codex-config frontend is large and heavily concentrated in one component body, so incremental extraction into shared primitives is likely useful if it keeps the final diff understandable.
- The local issue tracker label for this PRD is `done`.

## Completion Notes

- Completed issues: 01 through 09 under `.scratch/ui-package-manager-style/issues/`.
- Final QA issue: [09. 最终响应式、可访问性与视觉收敛 QA](./issues/09-responsive-accessibility-visual-qa.md).
- Final verification passed:
  - `pnpm test`
  - `pnpm build`
  - `cargo test` from `src-tauri`
