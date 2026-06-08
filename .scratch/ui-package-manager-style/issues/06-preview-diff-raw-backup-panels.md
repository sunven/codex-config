# 06. Preview、diff、raw TOML、backup 面板重构

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

将 preview、field-level diff、raw TOML diff、raw TOML editor、parse error 和 backup history/restore 面板重构为目标风格的卡片、代码面板和操作列表。用户应能清楚地区分预览、保存、解析错误、备份记录和恢复操作，并继续依赖现有写入安全模型。

## Acceptance criteria

- [x] diff panel 使用统一 card/code 样式，field diff 的 before/after 值以可读 row 或 chip 形式展示。
- [x] raw TOML editor 保持高对比代码编辑体验，并与目标应用的 code surface、spacing 和 error styling 一致。
- [x] TOML parse error 显示在 raw editor 附近，使用 destructive alert 语义且不遮挡编辑内容。
- [x] backup history 使用 operational list 样式，空备份状态安静清晰，restore 在不可写时保持禁用。
- [x] Config 与 MCP 区域中共享的 preview/raw/backup 面板行为一致，不改变 backend save/preview/restore contract。
- [x] `pnpm build` 通过。

## Blocked by

- [01. 目标应用壳与共享 UI primitives](./01-target-shell-ui-primitives.md)
- [02. Config 设置工作台重构](./02-config-settings-workbench.md)
