# 01. 目标应用壳与共享 UI primitives

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

建立 codex-config 的 Package Manager Control Center 风格基础体验：顶层应用壳、标题与状态区、刷新/loading 表达、主 tabs，以及可复用的按钮、卡片/面板、alert、badge、空态、icon button、代码面板等 UI primitives。完成后，用户应能在不改变现有工作流的前提下，看到应用已经进入统一的桌面控制中心视觉语言。

## Acceptance criteria

- [x] 应用启动后显示目标风格的顶层 shell，包含标题、简短说明、当前配置/Codex 状态摘要和刷新操作。
- [x] Config、Sessions、MCP、Skills 四个主导航仍可切换，且使用统一的 tabs 视觉与交互处理。
- [x] 成功、警告、错误、loading、disabled、empty state、badge、icon-only action 均通过共享 primitives 表达。
- [x] 现有 Tauri/backend command contract 不发生行为变化，所有已有导航区域仍能渲染。
- [x] `pnpm build` 通过。

## Blocked by

None - can start immediately
