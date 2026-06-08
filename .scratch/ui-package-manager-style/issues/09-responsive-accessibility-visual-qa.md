# 09. 最终响应式、可访问性与视觉收敛 QA

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

完成一次面向人的最终 QA：将重构后的 codex-config 与 Package Manager Control Center 的桌面控制中心风格进行对照，检查 typography、spacing、card shape、button variants、tabs、alerts、list density、code panels、响应式行为、可访问性和行为保真度。该切片不应改变产品范围，只修复 QA 中发现的收敛性、可用性和安全语义问题。

## Acceptance criteria

- [x] 桌面宽度和窄窗口下完成手动截图/走查，确认无明显文本重叠、按钮溢出、列表抖动、代码面板尺寸问题。
- [x] 对照 Package Manager Control Center 检查 typography、spacing、卡片/按钮/tabs/alert/badge/list/code panel 风格，记录并修复明显偏离。
- [x] 检查 Config、Sessions、MCP、Skills 四个区域的核心工作流仍可完成，preview-before-save/delete/restore 安全语义未被削弱。
- [x] 检查 keyboard focus、tab navigation、icon-only action labels/titles 和 destructive/warning/success alert 语义。
- [x] `pnpm build` 通过；如项目已有 Rust/backend 测试，也应保持通过或记录无法运行的原因。

## QA notes

- Browser QA used `.scratch/ui-package-manager-style/qa-harness.html` with mocked Tauri IPC against the real React/Vite app.
- Screenshots captured:
  - `/tmp/codex-config-qa-desktop-config.png`
  - `/tmp/codex-config-qa-mobile-config-after.png`
  - `/tmp/codex-config-qa-mobile-sessions-after.png`
  - `/tmp/codex-config-qa-mobile-mcp.png`
  - `/tmp/codex-config-qa-mobile-skills.png`
- Fixed QA findings:
  - Prevented button labels from breaking inside short action words on narrow widths.
  - Allowed long `code` chips/paths to wrap within their container.
- Verified:
  - Config save stays disabled until preview diff is generated; provider delete requires delete preview first.
  - Sessions delete requires a second confirmation click.
  - MCP save stays disabled until preview; MCP delete requires delete preview first.
  - Skills search, content preview, and current direct enable/disable save behavior still work.
  - Primary tabs expose selected state, controls have accessible names, and TOML parse errors expose alert semantics.
- Commands passed:
  - `pnpm test`
  - `pnpm build`
  - `cargo test` from `src-tauri`

## Blocked by

- [02. Config 设置工作台重构](./02-config-settings-workbench.md)
- [03. Field catalog 搜索与 schema 元数据展示](./03-field-catalog-schema-metadata.md)
- [04. Model provider 编辑器重构](./04-model-provider-editor.md)
- [05. MCP server 编辑器重构](./05-mcp-server-editor.md)
- [06. Preview、diff、raw TOML、backup 面板重构](./06-preview-diff-raw-backup-panels.md)
- [07. Sessions 工作区重构](./07-sessions-workspace.md)
- [08. Skills 工作区重构](./08-skills-workspace.md)
