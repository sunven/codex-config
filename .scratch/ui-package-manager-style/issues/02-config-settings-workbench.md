# 02. Config 设置工作台重构

Status: done

## Parent

[PRD: 将 codex-config UI 重构为 Package Manager Control Center 风格](../PRD.md)

## What to build

将 Config tab 的全局设置、active profile 设置、config target 状态、Codex binary 状态、fast mode 推荐、profile override warning 和设置表单重构为目标风格的工作台。桌面端继续保留左侧编辑、右侧预览/原始 TOML/备份的两列形态；窄窗口下应清晰折叠为单列。

## Acceptance criteria

- [x] 全局设置与 active profile 设置使用一致的 field-row/card 语言展示 label、说明、当前值、继承/未设置状态、风险 badge 和编辑控件。
- [x] profile/root override warning、config target、Codex binary 检测和 fast mode 推荐使用统一 alert/status/action-card 表达。
- [x] preview 与 save 操作保持现有 gating：有变更才可预览，preview 成功后才可保存，read-only/unchanged 状态清楚禁用。
- [x] boolean、select、text、number 控件视觉一致，长路径、长值和说明文本不会互相覆盖。
- [x] 桌面两列布局与窄窗口单列布局均可用，action bar 可换行且不溢出。
- [x] `pnpm build` 通过。

## Blocked by

- [01. 目标应用壳与共享 UI primitives](./01-target-shell-ui-primitives.md)
