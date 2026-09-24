---
name: stk-analyze
description: '高级·单步：仅执行流水线「分析」阶段（完整流程请用 /stk）'
disable-model-invocation: true
---

# SKILL: stk-analyze

本命令 = Token 优化流水线的「分析」单步（场景收集 → 仓库扫描 → 并行子 Agent → 汇总 tasks.md）；**完整流程请用 `/stk`**。

## 执行

按 `../stk/stages/analyze.md` 执行分析阶段；子 Agent 详细规则见 `../stk/agents/` 目录，按需读取。

> 路径回退：若上述相对路径不可达，尝试 `<skills 根目录>/stk/stages/analyze.md` 与 `<skills 根目录>/stk/agents/`；仍找不到则提示用户重跑 `stk init` 更新 SKILL 模板，停止。

## 边界

- 前置 `./save-token/diagnosis-report.md` 缺失或超过 5 分钟 → 提示先运行 `stk diagnose`（或 `/stk`），停止，不产生任何输出文件。
- 仅执行分析，不触发优化阶段；tasks.md 产出并展示后，提示可用 `/stk` 进入任务级选择执行优化。
