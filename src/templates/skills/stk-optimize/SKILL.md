---
name: stk-optimize
description: '高级·单步：仅执行流水线「优化」阶段（完整流程请用 /stk）'
disable-model-invocation: true
---

# SKILL: stk-optimize

本命令 = Token 优化流水线的「优化」单步，供精确控制执行集合使用；**完整流程请用 `/stk`**。

## 执行

按 `../stk/stages/optimize.md` 执行优化阶段。

> 路径回退：若上述相对路径不可达，尝试 `<skills 根目录>/stk/stages/optimize.md`；仍找不到则提示用户重跑 `stk init` 更新 SKILL 模板，停止。

## 边界

- 前置 `./save-token/tasks.md` 缺失时：提示先运行 `/stk-analyze`（或 `/stk`），停止，不凭空生成任务。
- 任务级选择规则（展示编号清单 → AskUserQuestion「全部（推荐）/仅初级/初级+中级」/ Other 输入编号）以 stage 文档为准；用户未显式选择前不执行任何任务、不修改任何文件。
- 仅执行优化，不触发报告阶段；完成后提示可用 `/stk` 继续。
