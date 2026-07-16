---
name: stk:report
description: '对比优化前后诊断报告，生成 Token 节省结果对比报告并落盘 save-token-report.json'
argument-hint: ''
---

# /stk-report

生成优化结果对比报告。

## 前置条件

对比源为 proxy 透明代理采集的诊断报告（由 `stk diagnose` 拦截真实请求产出）：

- 优化前基线 `save-token/diagnosis-report.md` 应已存在（`stk diagnose` 首次采集）。

> 注：`stk diagnose` 默认同时写 `.json`+`.md`，但优化后用 `--report-path` 时 JSON 会覆盖写回 `diagnosis-report.json` 冲掉基线。故对比统一以两份 Markdown（`diagnosis-report.md` 前 / `diagnosis-report2.md` 后）为准。

## 步骤

1. **采集优化后报告（必须）**：运行 `stk diagnose --report-path=./save-token/diagnosis-report2.md`，通过 proxy 拦截真实请求产出优化后诊断报告。此步是后续分析的前提，不可跳过；仅当用户指定复用已有 `diagnosis-report2.md` 时可跳过。
2. 读取文件：
   - `./save-token/diagnosis-report.md`（优化前）
   - `./save-token/diagnosis-report2.md`（优化后，上一步产出）
3. 从两份 Markdown 解析总 Token 与分类明细（System Prompt / Tools / Skills / Memory / Messages / Rules / Hooks），计算 before / after 差值与百分比。
3. 任务效果归因（基于 `tasks.md` 中的复选框状态）：
   - 读取 `tasks.md`，按已完成（`- [x]`）与未完成（`- [ ]`）判断每条任务状态
   - `actualSavingTokens`：已完成取可归属分类 delta（无法精确归属按占比估算并标 `deviation`）；未完成/跳过记 0。
   - 预估 ≠ 实际时 `deviation` 必非空。
   - 总体节省摘要（总节省 Token 数、节省比例、各状态计数）。
4. **必须**以 JSON 落盘 `./save-token/save-token-report.json`（结构见 `src/types/index.ts` 的 `SaveTokenReport` 契约）。
5. 可另写 `./save-token/save-token-report.md` 作展示（可选），并在对话中展示中文摘要（总节省百分比 + 分类变化表 + 任务效果表）。

## 错误处理

- Markdown 解析失败 → 报告具体文件与位置，**不崩溃**。
