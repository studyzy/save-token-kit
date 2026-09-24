# Proposal

## Why

当前 `stk init` 安装 4 个平级 SKILL（`/stk-diagnose` → `/stk-analyze` → `/stk-optimize` → `/stk-report`），构成严格串行的流水线但暴露成 4 个独立入口：用户必须自己记住顺序、靠"前置产物缺失才提示先跑上一步"导航、完整旅程需 4 次手动触发、进度只能靠翻 `save-token/` 产物文件推断。用户体验差，需要整合为单一入口。

## What Changes

- 新增第 5 个 SKILL `/stk` 作为唯一主入口：薄状态机分发器（~2K SKILL.md），启动时从 `save-token/` 产物推导流水线状态（diagnosis-report.md / context.json / tasks.md / save-token-report.json），输出流水线状态图并从断点续跑。
- 新增 `stages/` 目录 4 份阶段文档（diagnose / analyze / optimize / report），作为各阶段执行细节的单一事实源，由主入口按需读取。
- **BREAKING**：旧 4 个 SKILL（stk-diagnose / stk-analyze / stk-optimize / stk-report）瘦身为"高级·单步"入口（~0.5K，指向对应 stage 文档），description 加"高级·单步"前缀；不再承载完整执行细节。
- 优化阶段交互升级：从"按等级单选（初级/初级+中级/全部）"改为**任务级选择**——展示 tasks.md 编号清单，AskUserQuestion 选项"全部（推荐）/ 仅初级 / 初级+中级"，Other 支持输入编号（如 `1.1, 2.3`）圈定执行集合。
- 每阶段结束设停点：AskUserQuestion 询问是否继续下一阶段（默认值驱动），无显式确认不落地任何修改。
- `stk init` / `stk install --agent` 安装清单加入新 `stk/` skill。
- analyze 第一轮 3 个必问问题合并为一次 AskUserQuestion 调用。

## Capabilities

### New Capabilities

- `stk-single-entry`: /stk 单一入口流水线编排——产物状态推导、断点续跑、流水线状态图展示、每阶段停点确认、优化阶段任务级选择。

### Modified Capabilities

（无既有 spec，项目 `openspec/specs/` 为空。）

## Impact

- **模板**：`src/templates/skills/` 目录重组——新增 `stk/`（SKILL.md + stages/），旧 4 个 SKILL.md 瘦身。
- **CLI**：`src/cli.ts` init 命令及 `stk install` 的安装清单需加入 `stk/` skill；核心数据采集逻辑（proxy / diagnose）不动。
- **测试**：`tests/` 中与 SKILL 模板安装、内容相关的用例需同步调整。
- **用户**：已有用户的旧命令仍可用（保留为高级入口），新用户默认走 `/stk`。
