# 07. Sessions 工作区重构

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

将 Sessions tab 重构为目标风格的单 pane 工作区：年份/月分组、当前 sessions 目录状态、session rows、metadata、size、parse error、delete actions 和空状态都应使用统一 list/card/badge/action 语言。完成后，用户仍可安全浏览和管理 session records。

## Acceptance criteria

- [x] 年份 tabs、月份分组和 session rows 使用目标应用的紧凑列表与状态 badge 语言。
- [x] session metadata、size、path/title、parse error 和 delete action 在常见窗口尺寸下可扫描且不覆盖。
- [x] delete preview/confirmation 行为保持可用，不引入新的危险操作。
- [x] sessions 目录状态与空状态使用统一 status/empty state 表达，不把普通空数据误呈现为错误。
- [x] keyboard focus、icon button label/title 和 tab/list navigation 保持可用。
- [x] `pnpm build` 通过。

## Blocked by

- [01. 目标应用壳与共享 UI primitives](./01-target-shell-ui-primitives.md)
