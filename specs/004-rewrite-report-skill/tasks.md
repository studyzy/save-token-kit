---
description: '重构 stk-report SKILL 实现优化前后 Token 对比效果报告的任务列表'
---
任务: 重构 stk-report SKILL 实现优化前后对比效果报告

**输入**: 来自 `/specs/004-rewrite-report-skill/` 的设计文档（plan.md / spec.md / research.md / data-model.md / quickstart.md）
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、quickstart.md
**测试**: 本功能为纯文档重构（SKILL 模板 + 命令文件），spec 未要求新增单元测试；任务含命令文件一致性校验与文档自审，不含代码测试任务。
**组织结构**: 任务按用户故事分组，每个故事可独立验证交付。

## 格式: `[ID] [P?] [Story] 描述`
- **[P]**: 可并行（不同文件，无依赖）
- **[Story]**: 归属用户故事（US1/US2/US3）
- 描述含确切文件路径

## 路径约定
单一项目：模板位于 `src/templates/`，契约位于 `src/types/index.ts`。

---

## 阶段 1: 设置（共享基础设施）

**目的**: 确认契约与现有产物命名，为重写建立事实基线。

- [X] T001 阅读 `src/types/index.ts` 中 `DiagnosisReport`（L153）、`TasksFile`/`OptimizationTask`（L347）、`SaveTokenReport`/`TokenChange`/`TaskResult`/`SavingsSummary`（L360-424）契约定义，记录字段到 `specs/004-rewrite-report-skill/data-model.md` 已对齐（无需改动类型）
- [X] T002 确认 `stk diagnose` 输出命名：读 `src/commands/diagnose.ts:99-111`，确认优化前写 `diagnosis-report.json`+`.md`，优化后重采应写 `diagnosis-report2.json`+`.md`（与 `report.md` 命令约定一致）

**检查点**: 契约与文件命名基线已确认，可开始重写。

---

## 阶段 2: 基础（阻塞前置条件）

**目的**: 重写 SKILL 的核心对比逻辑表述（所有用户故事共用）。

- [X] T003 重写 `src/templates/skills/stk-report/SKILL.md` 的「目标」与「执行流程」章节：数据源由 `diagnosis-report.md`/`diagnosis-report2.md` 文本相减改为读取 proxy 结构化 JSON（`diagnosis-report.json` 前 / `diagnosis-report2.json` 后），覆盖 R1-R3
- [X] T004 [P] 在 `SKILL.md` 执行流程中加入「基于 `tasks.json` 的任务归因」步骤：按 `suggestionId` 对齐前后 `DiagnosisReport.contextOverview.breakdown` 的 `TokenChange`，生成 `TaskResult[]`，含 `actualSavingTokens` 与 `deviation`（failed/skipped 记 0，实际≠预估时 `deviation` 非空），覆盖 R4-R6
- [X] T005 [P] 在 `SKILL.md` 中明确产出契约：必须写 `./save-token/save-token-report.json`（结构同 `SaveTokenReport`），并在对话输出中文摘要（总节省百分比 + 分类变化表 + 任务效果表），且声明只读闭环不修改配置，覆盖 R7-R9
- [X] T006 [P] 在 `SKILL.md` 新增「tasks.md 与 tasks.json 关系」说明段：前者为人读待办（来自 `/stk-analyze`），后者为机器契约（来自 `/stk-optimize` 执行后），归因以 `tasks.json` 为准；仅有 `tasks.md` 时提示先跑 `/stk-optimize`，覆盖 R10

**检查点**: SKILL 核心重写完成，可进入各用户故事校验。

---

## 阶段 3: 用户故事 1 — 基于任务清单与优化后实时诊断生成对比报告（优先级: P1）🎯 MVP

**目标**: 在「前 JSON + 后 proxy JSON + tasks.json」齐备时产出符合 `SaveTokenReport` 契约的对比报告。

- [X] T007 [US1] 在 `SKILL.md` 写入读取清单：优化前 `./save-token/diagnosis-report.json`、优化后 `./save-token/diagnosis-report2.json`、可选 `./save-token/tasks.json`
- [X] T008 [US1] 在 `SKILL.md` 写入缺失引导：缺 `diagnosis-report2.json` → 提示用户运行 `stk diagnose` 采集优化后数据并给出命令；缺 `diagnosis-report.json` → 提示先采基线；不臆造数据（R2/S3）
- [X] T009 [US1] 在 `SKILL.md` 写入分类对比规则：按 `ContextItemType` 八类（system-prompt/system-tools/memory-file/skill/mcp-tools/messages/rules/hooks）计算 `beforeTokens`/`afterTokens`/`deltaTokens`/`deltaPercentage`

**独立测试**: 在含前 JSON + 后 proxy JSON + tasks.json 的样本 `save-token/` 目录触发 `/stk-report`，验证产出 `save-token-report.json` 且 `beforeTotalTokens`/`afterTotalTokens`/`summary.totalSavedTokens` 与两份 JSON 总 Token 一致（S1）。

**检查点**: US1 可独立交付——产出结构化对比报告。

---

## 阶段 4: 用户故事 2 — 任务效果归因与预估偏差分析（优先级: P2）

**目标**: 每项优化任务的节省归因、预估 vs 实际偏差可见。

- [X] T010 [US2] 在 `SKILL.md` 写入 `TaskResult` 归因规则：completed 取可归属分类 delta（无法精确归属按占比估算并标 `deviation`）；partial 按实际生效部分；failed/skipped 记 0
- [X] T011 [US2] 在 `SKILL.md` 写入 `summary` 计数规则：`completedTasks`/`failedTasks`/`skippedTasks`/`partialTasks` 与 `totalSavedTokens`/`savingsPercentage` 的正确计算

**独立测试**: 构造 `tasks.json` 含 completed/failed/partial/skipped 混合状态，生成报告后检查 `TaskResult[].actualSavingTokens`、`deviation`、`summary` 各计数正确反映（S2）。

**检查点**: US2 可独立交付——归因与偏差分析。

---

## 阶段 5: 用户故事 3 — 缺失数据的友好引导（优先级: P3）

**目标**: 基线/任务数据缺失时给可执行提示，不报错中断。

- [X] T012 [US3] 在 `SKILL.md` 写入缺 `diagnosis-report.json` 提示文案："缺少优化前诊断基线，请先运行 `stk diagnose` 采集"并退出、不写报告
- [X] T013 [US3] 在 `SKILL.md` 写入缺 `tasks.json`（可选）处理：仍生成报告，`taskResults` 为空或基于前后报告自动归因，`summary` 不报错

**独立测试**: 在人为删除 `diagnosis-report.json` 或 `tasks.json` 的副本目录触发，验证提示文案与建议命令正确、不写伪造报告（S3）。

**检查点**: US3 可独立交付——缺失数据引导。

---

## 阶段 6: 完善与横切关注点

**目的**: 命令文件一致性、章程合规、文档自审。

- [X] T014 [P] 校验并对齐 `src/templates/commands/report.md` 的「前置条件/步骤」与重写后的 `SKILL.md` 一致（数据源为 JSON、tasks.json 归因、缺失引导文案），必要时小改报告命令（R10/S5）
- [X] T015 [P] 自审 `SKILL.md` 遵循章程 II（精简去冗余）、V（中文文档/英文术语）与 IV（无过度抽象），移除旧 markdown 文本相减表述
- [X] T016 运行 `specs/004-rewrite-report-skill/quickstart.md` 流程在样本目录走通闭环，确认摘要中文输出含总节省百分比、分类变化表、任务效果表（S4/S5）

**检查点**: 全部任务完成，文档自洽、命令一致、闭环可走通。

---

## 依赖关系

```
T001 ─┐
T002 ─┴─► T003 ─► T004 ─┐
                         ├─► T007 ─┬─► T008 ─┬─► T009 ─┐ (US1 / P1 MVP)
            T005 ────────┤         T010 ─┬─► T011 ─┤ (US2 / P2)
            T006 ────────┘         T012 ─┬─► T013 ─┤ (US3 / P3)
                                          └─────────┴─► T014 ─► T015 ─► T016
```

- US1 是 MVP，依赖 T001-T006 基础重写完成后即可独立验证。
- US2、US3 在基础重写（T003-T006）后可与 US1 部分并行（T010-T013 互不依赖）。
- T014-T016 为收尾，依赖全部用户故事。

## 并行执行示例

- **基础阶段**: T004、T005、T006 标记 `[P]`，分别改 `SKILL.md` 不同章节，可并行。
- **用户故事阶段**: US2 的 T010-T011 与 US3 的 T012-T013 互不依赖，可并行编写。
- **收尾阶段**: T014、T015 标记 `[P]`，分属命令文件与 SKILL 自审，可并行。

## 实现策略

- **MVP 范围**: 阶段 1-3（T001-T009）——交付「前/后 proxy JSON + tasks.json → 结构化对比报告」，即 US1，可独立验证 S1。
- **增量交付**: US2（归因/偏差）、US3（缺失引导）在 MVP 之上增量追加，各自独立可测。
- **收尾**: 命令一致性 + 章程自审 + quickstart 走通，确保 S4/S5 达成。
