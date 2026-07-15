# 功能规范: 重构 stk-report SKILL 实现优化前后 Token 对比效果报告

**功能分支**: `[004-rewrite-report-skill]`
**创建时间**: 2026-07-14
**状态**: 草稿
**输入**: 用户描述: "重构 src/templates/skills/stk-report/SKILL.md 基于save-token/tasks.md,结合stk proxy拿到的新优化后的Token消耗报告，实现Token优化前后的对比，效果报告。"

## 用户场景与测试 _(必填)_

### 用户故事 1 基于任务清单与优化后实时诊断生成对比报告 (优先级: P1)

用户在执行完 `/stk-optimize` 优化后，希望重新用 `stk diagnose`（proxy 透明代理）采集"优化后"的真实 Token 消耗报告，再结合优化前的基线诊断与 `tasks.json` 任务执行结果，自动量化本次优化到底省了多少 Token、哪些任务真正生效、预估与实际偏差多少。

**优先级原因**: 这是 `/stk-report` 的核心价值——把"我做了优化"转化为"优化省了多少"，是闭环的最后一步，无此功能整个省 Token 工作流不可验证。

**独立测试**: 在已有 `diagnosis-report.json`（前）+ `tasks.json` 的目录下，再次运行 `stk diagnose` 生成"后"报告，触发 `/stk-report`，即可独立验证产出 `save-token-report.json` 与摘要，无需其他模块。

**验收场景**:

1. **给定** `save-token/` 下存在优化前 `diagnosis-report.json`、优化后 `diagnosis-report2.json`（或等价 proxy 报告）、`tasks.json`，**当** 触发 `/stk-report`，**则** 产出 `save-token-report.json`，含 before/after 总 Token、各分类 `TokenChange`、与 `tasks.json` 对齐的 `TaskResult[]` 及 `summary`。
2. **给定** 仅缺少优化后报告，**当** 触发 `/stk-report`，**则** 提示用户先运行 `stk diagnose`（proxy）采集优化后数据，并给出明确命令，不臆造数据。
3. **给定** `tasks.json` 中某任务 `status=failed`，**当** 生成报告，**则** `TaskResult` 标记 `failed`，实际节省记为 0 并在 `deviation`/`error` 说明原因，且 `summary.failedTasks` 计数 +1。

### 用户故事 2 任务效果归因与预估偏差分析 (优先级: P2)

用户不仅想知道总数，还想知道"每一项优化任务贡献了多少节省、预估 vs 实际差多少"，以便判断哪些优化手段最有效、后续是否值得继续。

**优先级原因**: 归因与偏差是报告从"数字"到"可决策洞察"的升级，帮助用户在下一轮优化中取舍。

**独立测试**: 在 `tasks.json` 含 completed/failed/partial/skipped 多种状态时，生成报告后检查 `TaskResult[].actualSavingTokens`、`deviation`、`summary` 各计数是否正确反映，可单独验证归因逻辑。

**验收场景**:

1. **给定** 某任务预估省 500、实际因其它任务联动只省 300，**当** 生成报告，**则** `actualSavingTokens=300` 且 `deviation` 注明"实际低于预估，可能存在任务间重叠节省"。
2. **给定** 某任务 `status=skipped`，**当** 生成报告，**则** 计入 `skippedTasks`，不纳入已节省统计，偏差标注"未执行"。

### 用户故事 3 缺失数据的友好引导 (优先级: P3)

当基线数据或任务数据缺失时，用户应得到明确、可执行的下一步提示，而非报错中断。

**优先级原因**: 降低使用门槛，保证工作流可被普通用户走通。

**独立测试**: 在人为删除 `diagnosis-report.json` 或 `tasks.json` 的副本目录中触发，验证提示文案与建议命令正确，可独立验证。

**验收场景**:

1. **给定** 缺少优化前 `diagnosis-report.json`，**当** 触发 `/stk-report`，**则** 提示"缺少优化前诊断基线，请先运行 `stk diagnose` 采集"并退出，不写报告。
2. **给定** 缺少 `tasks.json`（可选），**当** 触发，**则** 仍生成报告，但 `taskResults` 为空或基于前后报告自动归因，`summary` 不报错。

## 功能需求

### 需求 1 数据源从 markdown 文本相减升级为 proxy 结构化报告对比

R1. `/stk-report` 应以优化前 `diagnosis-report.json` 与优化后 proxy 采集的 `diagnosis-report2.json`（或等价的 `DiagnosisReport` 契约 JSON）为对比源，而非依赖 `diagnosis-report.md` 文本中总 Token 相减。

R2. 当优化后 JSON 报告缺失时，SKILL 必须提示用户先通过 `stk diagnose`（透明代理拦截真实请求）采集优化后数据，给出可执行命令，禁止从 markdown 文本估算兜底（除非用户显式选择兼容模式）。

R3. 对比须覆盖 `contextOverview.breakdown` 各分类（system-prompt / system-tools / memory-file / skill / mcp-tools / messages / rules / hooks）的 Token 前后变化。

### 需求 2 基于 tasks.json 的任务效果归因

R4. SKILL 必须读取 `save-token/tasks.json`，按 `suggestionId` 将每个 `OptimizationTask` 与前后报告的总/分类 Token 变化归因，生成 `TaskResult[]`。

R5. 每个 `TaskResult` 须包含 `status`、`estimatedSavingTokens`、`actualSavingTokens`、`deviation`（实际与预估差异说明）、`error`（失败/部分时）。

R6. `actualSavingTokens` 归因规则：completed 取对应分类前后 delta 中可归属部分（无法精确归属时按占比估算并在 `deviation` 注明）；failed/partial 按实际生效部分计算；skipped 记 0。

### 需求 3 输出结构化对比报告

R7. SKILL 必须将结果写入 `./save-token/save-token-report.json`，结构遵循 `SaveTokenReport` 契约（`generatedAt`、`beforeSource`、`afterSource`、`beforeTotalTokens`、`afterTotalTokens`、`changes[]`、`taskResults[]`、`summary`）。

R8. SKILL 应在对话中输出一份中文 Markdown 摘要：总节省 Token 与百分比、分类变化表、任务效果表（含偏差标记）、失败/跳过项提示。

R9. 报告不修改任何用户配置或前置数据，仅读取与对比（只读闭环）。

### 需求 4 与 tasks.md 的衔接说明

R10. SKILL 须在文档中明确 `tasks.md`（人读待办，来自 `/stk-analyze`）与 `tasks.json`（机器契约，来自 `/stk-optimize` 执行后）的关系：本报告归因以 `tasks.json` 为准；若用户仅有 `tasks.md` 而无 `tasks.json`，提示先运行 `/stk-optimize` 生成执行结果。

## 关键实体

- **优化前诊断** (`DiagnosisReport`)：`stk diagnose` 在优化前采集，存 `save-token/diagnosis-report.json`。
- **优化后诊断** (`DiagnosisReport`)：优化后再次 `stk diagnose`（proxy）采集，存 `save-token/diagnosis-report2.json`。
- **任务执行结果** (`TasksFile`)：`/stk-optimize` 落盘 `save-token/tasks.json`，含每项 `OptimizationTask.status` 与 `estimatedSavingTokens`。
- **对比报告** (`SaveTokenReport`)：本 SKILL 产出 `save-token/save-token-report.json`，含 `TokenChange[]` 与 `TaskResult[]`。
- **tasks.md**：人读待办清单（来自 `/stk-analyze`），作为 `tasks.json` 的来源说明，不直接参与计算。

## 边界与约束

- SKILL 仅指导 Agent 读取与对比，**不修改**任何配置、诊断文件或任务文件。
- Token 估算为 `length/4` 经验值（非真实 tokenizer），报告须注明"估算值，仅用于相对比较"。
- 所有产物统一落在 `./save-token/`。
- 无法归因的节省统一记 0 并在 `deviation` 说明，不夸大效果。
- proxy 采集依赖真实 CodeBuddy API 可达；SKILL 不发起额外 Agent 调用。

## 假设

- A1：`stk diagnose` 默认将优化后报告写入 `save-token/diagnosis-report2.json`（与现有 `report.md` 命令约定一致）；若文件名不同，SKILL 以"最新一次 proxy 采集的 `DiagnosisReport` JSON"为准。
- A2：优化前基线文件名为 `diagnosis-report.json`；若用户未重命名，SKILL 优先读取该文件。
- A3：`tasks.json` 由 `/stk-optimize` 在其执行流程中落盘，属性名与 `src/types/index.ts` 中 `TasksFile` 契约一致。
- A4：归因无法做到 100% 精确（任务间节省可能重叠），允许按占比估算并明确标注，此为合理默认。
- A5：report 命令（`/stk-report`）与 `stk-report` SKILL 协同工作，SKILL 文档须与命令文件（`report.md`）的"前置条件/步骤"保持一致。

## 成功标准

- S1：在"前基线 JSON + 后 proxy JSON + tasks.json"齐备的样本目录下，触发 `/stk-report` 后 100% 产出符合 `SaveTokenReport` 契约的 `save-token-report.json`，且 `beforeTotalTokens`/`afterTotalTokens`/`summary.totalSavedTokens` 与前后报告总 Token 一致。
- S2：报告对 `tasks.json` 中 completed/failed/partial/skipped 四类状态均给出正确计数与归因，`deviation` 字段非空当实际≠预估。
- S3：缺失优化后报告时，用户收到的引导提示包含可执行采集命令，且系统不写入任何伪造报告。
- S4：对话摘要以中文呈现总节省百分比、分类变化表、任务效果表，普通用户无需阅读 JSON 即可理解优化效果。
- S5：SKILL 文档与 `report.md` 命令的"前置条件/步骤"描述无冲突，用户照文档即可走通闭环。
