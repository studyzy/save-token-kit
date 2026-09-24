---
name: stk-report
description: '对比优化前后诊断报告'
disable-model-invocation: true
---

# SKILL: stk-report

本 SKILL 指导 AI Agent 执行 `/stk-report`，量化本次 Token 优化的前后对比与任务效果。

## 目标

基于优化前/后两份 proxy 结构化诊断报告（`DiagnosisReport` JSON），量化优化节省，并按分类归因、标注变化，产出可程序化消费的对比报告。

## 数据源

对比源为 **proxy 透明代理采集的诊断报告**（由 `stk diagnose` 拦截真实请求产出）：

- 优化前：`save-token/diagnosis-report.md`（`stk diagnose` 首次采集）
- 优化后：`save-token/diagnosis-report2.md`（优化后运行 `stk diagnose --report-path=./save-token/diagnosis-report2.md` 产出）

> 注：`stk diagnose` 默认同时写 `diagnosis-report.json`（结构化）+ `diagnosis-report.md`（Markdown）。但优化后用 `--report-path` 重定向时，**JSON 仍覆盖写回 `save-token/diagnosis-report.json`**，会冲掉优化前基线。因此对比统一以两份 **Markdown** 报告为准：优化前 `diagnosis-report.md`、优化后 `diagnosis-report2.md`。

## 执行流程

1. **采集优化后报告（必须）**：运行 `stk diagnose --report-path=./save-token/diagnosis-report2.md`，通过 proxy 透明代理拦截真实请求，产出优化后诊断报告 `diagnosis-report2.md`。此步是后续分析的前提，不可跳过。
   - 仅当 `diagnosis-report2.md` 已存在且用户要求复用（如 `--no-diagnose`）时，可跳过重新采集。
2. 读取文件（路径见数据源）：优化前 `diagnosis-report.md`、优化后 `diagnosis-report2.md`。Markdown 解析失败报具体文件与位置，**不崩溃**。
3. **缺失数据引导**（不臆造）：
   - 缺 `diagnosis-report.md`（前）→ 提示"缺少优化前诊断基线，请先运行 `stk diagnose` 采集"，退出不写报告。
   - 缺 `diagnosis-report2.md`（后）→ 提示"缺少优化后诊断报告，请先运行 `stk diagnose --report-path=./save-token/diagnosis-report2.md` 采集"，退出不写报告。
4. 从两份 Markdown 解析：
   - 总 Token：定位"总 Token / 总估算 Token"行，取数值。
   - 分类明细：解析类别表格（System Prompt / Tools / Skills / Memory / Messages / Rules / Hooks 等），提取每类 `estimatedTokens`。
   - 得出 `beforeTotalTokens` / `afterTotalTokens`。
5. 计算差值：
   - `totalSavedTokens` = 前 - 后；`savingsPercentage` = 节省 / 前
   - 分类 `TokenChange`：`beforeTokens` / `afterTokens` / `deltaTokens`（负=节省）/ `deltaPercentage`（按类别对齐；报告无某类时按 0 处理）
6. 任务效果归因（基于 `tasks.md` 中的复选框状态 + 优化前报告实测占用）：
   - 读取 `tasks.md`，按已完成（`- [x]`）与未完成（`- [ ]`）判断每条任务状态。
   - **预估必须来自优化前报告实测，禁止照搬 `tasks.md` 里的文案数字**：
     - `tasks.md` 中的"预估节省 ~XXX Token"是分析阶段粗估，常偏高（如禁用某插件被估 1000，实际仅移除该 skill 的 name+description 常驻占用）。报告一律**忽略该文案数字**，改为从优化前 `diagnosis-report.md` 实测占用推导：
       - 禁用插件 / 禁用 skill：取优化前报告中该 skill 条目的实测 `~NNN tok`（name + description 常驻部分）。无对应条目则记 0。
       - 移除 MCP：取优化前报告中该 MCP 条目实测 `~NNN tok`。无则记 0。
       - 改写子代理工具列表 / 限定 rule paths / enable-tool 等结构性改动：优化前报告无法直接给出该项自身的常驻占用，**记 0** 并在 `deviation` 注明"预估无法从报告实测，按 0 处理"，不得臆造数值。
     - 即 `estimatedSavingTokens` = 优化前报告里被该任务移除/缩减的那部分 token；报告中找不到对应项即为 0。
   - `actualSavingTokens` 取值规则：
     - 已完成：取对应分类前后 delta 中可归属部分；无法精确归属按占比估算，并在 `deviation` 注明"可能存在任务间重叠节省"
     - 未完成 / 跳过：记 0
   - 实际 ≠ 预估时 `deviation` 必非空，说明偏差原因（如"插件禁用仅移除 skill 定义，系统/工具上下文未等量削减"）。
   - 汇总 `summary`：`completedTasks` / `failedTasks` / `skippedTasks` / `partialTasks` 计数 + 总节省与百分比
7. **必须**写入 `save-token/save-token-report.json`（结构见 `src/types/index.ts` 的 `SaveTokenReport` 契约：generatedAt / beforeSource / afterSource / beforeTotalTokens / afterTotalTokens / changes[] / taskResults[] / summary）。
8. 对话中输出中文摘要：总节省 Token 与百分比、分类变化表、任务效果表（含预估/实际偏差标记）；可另写 `save-token-report.md` 展示。

## 边界

- 不修改任何配置或前置文件，仅读取与对比（只读闭环）。
- Token 估算为 `length/4` 经验值（非真实 tokenizer），报告须注明"估算值，仅用于相对比较"。
- 无法归因的节省统一记 0 并在 `deviation` 说明，不夸大效果。
- 所有产物统一落在 `save-token/`。
