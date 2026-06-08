# 04. Model provider 编辑器重构

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

将 model provider 的选择列表、创建/编辑表单、string-list 与 key/value-map 编辑、preview/save/delete 操作重构为目标风格的 selectable-list + form 工作流。用户应能像管理控制中心资源一样选择、编辑、新建、预览保存和预览删除 provider，同时保留现有保护规则与安全语义。

## Acceptance criteria

- [x] provider 列表使用 polished selectable-list 样式，选中、新建、空列表、受保护 provider 和删除操作状态清晰。
- [x] provider 表单使用统一 form grid 和 field control，advanced 字段、string-list、key/value-map 编辑不会产生布局抖动。
- [x] create/edit/select/delete 的现有行为不变，受保护 provider ID 的限制仍由现有行为保护。
- [x] save/delete 仍必须先 preview，preview diff 与 disabled 状态语义清楚。
- [x] 长 provider ID、URL、env key、header key/value 在常见窗口尺寸下可截断、换行或滚动，不发生覆盖。
- [x] `pnpm build` 通过。

## Blocked by

- [01. 目标应用壳与共享 UI primitives](./01-target-shell-ui-primitives.md)
- [02. Config 设置工作台重构](./02-config-settings-workbench.md)
