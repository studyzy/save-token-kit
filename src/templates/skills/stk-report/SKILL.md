---
name: stk-report
description: "对比优化前后诊断报告，生成 save-token-report.json 结果对比"
argument-hint: ""
---

# SKILL: stk-report

本 SKILL 指导 AI Agent 执行 `/stk-report` 的对比报告生成。

## 目标

量化优化效果，产出可程序化消费的对比报告。

## 执行流程

1. 读取：
   - `./save-token/diagnosis-report.md`（前）
   - `./save-token/diagnosis-report2.md`（后）
   - `./save-token/tasks.json`（可选）
2. 缺失前置数据给出明确提示（见命令文件错误处理）。
3. 计算：
   - before/after 总 Token 差值（两 `.md` 总 Token 直接相减）
   - 各分类（System Prompt / Tools / Skills / Memory / Messages）变化明细
4. 若 `tasks.json` 存在，将任务执行状态与 Token 变化归因，标注偏差（预估 vs 实际）。JSON 解析失败报具体文件行号。
5. **必须**写入 `./save-token/save-token-report.json`（结构见 data-model.md §4）。
6. 可选 `save-token-report.md` 展示，对话中输出摘要。

## 边界

- 不修改任何配置，仅读取与对比。
- 无法归因的节省统一记 0 并在 `deviation` 说明。
