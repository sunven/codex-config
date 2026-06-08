# 05. MCP server 编辑器重构

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

将 MCP server 的列表、创建/编辑表单、参数与环境变量编辑、preview/save/delete 操作重构为与 model provider 相同的目标风格工作流。用户应能用一致的资源管理模式管理 MCP servers，并保留现有预览优先和写入安全语义。

## Acceptance criteria

- [x] MCP server 列表和表单与 provider 编辑器共享相同的 selectable-list、form grid、badge、button 和 empty state 语言。
- [x] command、args、env、working directory 等长技术文本在桌面与窄窗口中不会覆盖其他 UI。
- [x] create/edit/select/delete 行为保持不变，save/delete 仍必须先 preview。
- [x] 不可写、无变更、preview 未完成等状态下的操作禁用清晰且布局稳定。
- [x] MCP diff 与右侧辅助面板在 MCP tab 内仍能正常协同。
- [x] `pnpm build` 通过。

## Blocked by

- [04. Model provider 编辑器重构](./04-model-provider-editor.md)
