# 08. Skills 工作区重构

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

将 Skills tab 重构为目标风格的单 pane 工作区：skills roots、搜索、skill rows、enabled/disabled 状态、选择行为、markdown preview 和 enable/disable actions 都应使用统一 list/card/badge/code-panel 语言。完成后，用户应能更舒适地浏览全局 skill inventory，并保持现有启用/禁用语义。

## Acceptance criteria

- [x] skills roots 以 status badge 展示，root 可用性和路径状态清晰。
- [x] skill 搜索、列表、选中行、enabled/disabled 状态和空状态使用一致的 operational list 风格。
- [x] markdown preview 使用目标风格 code/preview panel，长描述、路径和 markdown 内容不会覆盖其他 UI。
- [x] enable/disable 控制保留当前行为，写入成功、失败和 disabled 状态使用共享 alert/button 语义。
- [x] keyboard focus、icon button label/title 和窄窗口布局保持可用。
- [x] `pnpm build` 通过。

## Blocked by

- [01. 目标应用壳与共享 UI primitives](./01-target-shell-ui-primitives.md)
