# 数据模型: 重构 stk-report SKILL

**分支**: `004-rewrite-report-skill` | **日期**: 2026-07-14
**说明**: 本功能为 SKILL 文档重构，**不新定义数据模型**。所有结构直接复用 `src/types/index.ts` 既有契约。此处列出来源与字段用途，供 SKILL 编写与测试对齐。

## 输入实体（读取，来自 `./save-token/`）

### 1. 优化前诊断 — `DiagnosisReport` (diagnosis-report.json)
来源：`stk diagnose`（优化前）
关键字段：
- `contextOverview.totalEstimatedTokens` — 前总 Token
- `contextOverview.breakdown: ContextItem[]` — 前分类明细（type / estimatedTokens / percentage）

### 2. 优化后诊断 — `DiagnosisReport` (diagnosis-report2.json)
来源：`stk diagnose`（优化后，proxy 重采）
关键字段：同上（后值）

### 3. 任务执行结果 — `TasksFile` (tasks.json)
来源：`/stk-optimize` 落盘
关键字段：
- `tasks: OptimizationTask[]`
  - `suggestionId` — 与前后报告归因关联键
  - `status`: 'completed' | 'failed' | 'skipped' | 'partial'
  - `estimatedSavingTokens` — 预估节省
  - `operationType` / `target` / `description` / `error` / `appliedChange`

## 输出实体（写入，本功能产出）

### 4. 对比报告 — `SaveTokenReport` (save-token-report.json)
契约：`src/types/index.ts:407-424`
- `generatedAt`, `beforeSource`, `afterSource`
- `beforeTotalTokens`, `afterTotalTokens`
- `changes: TokenChange[]` — 每分类前后 delta（`category`/`beforeTokens`/`afterTokens`/`deltaTokens`/`deltaPercentage`）
- `taskResults: TaskResult[]` — 每任务归因（`suggestionId`/`status`/`estimatedSavingTokens`/`actualSavingTokens`/`deviation`/`error`）
- `summary: SavingsSummary` — 总节省、百分比、各状态计数

## 关系与转换

```
DiagnosisReport(前)  ┐
DiagnosisReport(后)  ├─ 按 ContextItem.type 对齐 → TokenChange[]
TasksFile.tasks      ┘— 按 suggestionId 对齐 → TaskResult[]（actualSaving 取可归属分类 delta，偏差标 deviation）
                                          ↓
                                  SaveTokenReport
```

## 验证规则（来自 spec 需求）

- V1 (R1): 对比源为两份 JSON 契约，非 markdown 文本。
- V2 (R2): 缺后报告 → 引导 `stk diagnose`，不写伪造报告。
- V3 (R4-R6): `taskResults` 覆盖 tasks.json 全部任务；failed/skipped 实际节省记 0；实际≠预估时 `deviation` 非空。
- V4 (R7): 输出结构严格匹配 `SaveTokenReport`。
- V5 (R9): 不修改任何输入文件（只读闭环）。
- V6 (R10): 文档明示 tasks.md（人读）/ tasks.json（机器）区别。
