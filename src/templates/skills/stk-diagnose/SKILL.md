---
name: stk-diagnose
description: '高级·单步：仅执行流水线「诊断」阶段（完整流程请用 /stk）'
disable-model-invocation: true
---

# SKILL: stk-diagnose

本命令 = Token 优化流水线的「诊断」单步，供精确重跑使用；**完整流程请用 `/stk`**（自动断点续跑、阶段链式衔接）。

## 执行

按 `../stk/stages/diagnose.md` 执行诊断阶段（stk 安装检测 → 会话级环境变量判定 agent → `stk diagnose` → 如实展示报告）。

> 路径回退：若上述相对路径不可达，尝试 `<skills 根目录>/stk/stages/diagnose.md`；仍找不到则提示用户重跑 `stk init` 更新 SKILL 模板，停止。

## 边界

- 仅执行诊断，不触发后续阶段；完成后提示可用 `/stk` 继续。
- 如实展示 `diagnosis-report.md`，无需点评或建议。
