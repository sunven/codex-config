# 03. Field catalog 搜索与 schema 元数据展示

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

将 field catalog 搜索与结果列表重构为目标应用的可搜索运营列表风格。用户应能清晰浏览 schema 字段、风险/实验性/secret 等元数据、继承状态和空结果状态，同时保留现有搜索与展示语义。

## Acceptance criteria

- [x] field catalog 搜索输入、结果列表、空结果和字段详情使用统一 list/card/badge 语言。
- [x] caution、dangerous、secret、experimental 等风险信息以一致 badge 展示，颜色语义克制且可扫描。
- [x] 搜索过滤行为、字段结果数量和字段元数据展示保持现有语义。
- [x] 长字段路径、说明和默认值在桌面与窄窗口下不会重叠或撑破布局。
- [x] keyboard focus 与 icon/button accessible label 保持可用。
- [x] `pnpm build` 通过。

## Blocked by

- [01. 目标应用壳与共享 UI primitives](./01-target-shell-ui-primitives.md)
