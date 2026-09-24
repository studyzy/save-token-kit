---
name: stk-report
description: '高级·单步：仅执行流水线「报告」阶段（完整流程请用 /stk）'
disable-model-invocation: true
---

# SKILL: stk-report

本命令 = Token 优化流水线的「报告」单步（前后对比、只读闭环）；**完整流程请用 `/stk`**。

## 执行

按 `../stk/stages/report.md` 执行报告阶段（采集优化后报告 → 双 Markdown 对比 → 任务归因 → 写入 `save-token/save-token-report.json` 并输出中文摘要）。

> 路径回退：若上述相对路径不可达，尝试 `<skills 根目录>/stk/stages/report.md`；仍找不到则提示用户重跑 `stk init` 更新 SKILL 模板，停止。

## 边界

- 缺优化前基线 `diagnosis-report.md` → 提示先运行 `stk diagnose` 采集，退出不写报告。
- 仅执行报告，不触发新一轮诊断；完成后提示可用 `/stk` 开新一轮。
