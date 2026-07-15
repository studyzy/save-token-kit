# 研究: 重构 stk-report SKILL 实现优化前后对比效果报告

**分支**: `004-rewrite-report-skill` | **日期**: 2026-07-14
**目的**: 阶段 0 研究——确认重构所需的所有未知项，为 data-model / quickstart 提供事实依据。

## 研究任务与发现

### 未知 1: 优化后报告从哪来（proxy 数据采集产物）

- **Decision**: 优化后报告 = 优化完成后再次运行 `stk diagnose`（透明代理拦截真实请求）得到的 `./save-token/diagnosis-report2.json`（即 `DiagnosisReport` 契约）。
- **Rationale**: 经读 `src/commands/diagnose.ts:99-111` 确认，`stk diagnose` 同时写出 `diagnosis-report.json`（结构化契约）与 `diagnosis-report.md`（人读）。旧 SKILL 读 markdown 文本相减，精度差且无法分类归因；改读 JSON 契约可逐分类对比并直接对齐 `contextOverview.breakdown`。
- **Alternatives considered**:
  - (a) 仍读 `.md` 文本解析总 Token —— 拒绝：文本脆弱、无法分类、与 `tasks.json` 类型不对齐。
  - (b) 让 SKILL 自己跑 proxy —— 拒绝：违反"SKILL 仅读取对比、不改配置"（spec 边界），且 proxy 需真实 API 可达，应由 `stk diagnose` 命令负责。

### 未知 2: tasks.md 与 tasks.json 的关系

- **Decision**: `tasks.md` 是 `/stk-analyze` 产出的人读待办清单；`tasks.json` 是 `/stk-optimize` 执行后落盘的机器契约（`TasksFile`）。本报告归因以 `tasks.json` 为准；仅有 `tasks.md` 时提示先跑 `/stk-optimize`。
- **Rationale**: 读 `src/templates/commands/analyze.md:43` 与 `optimize.md:13` 确认两者生命周期；`src/types/index.ts` 中 `TasksFile`/`OptimizationTask` 含 `status` 与 `estimatedSavingTokens`，是归因唯一可靠源。
- **Alternatives considered**: 直接从 `tasks.md` 解析 —— 拒绝：markdown 复选框非机器契约，易错且缺 `status` 枚举。

### 未知 3: 前后报告如何对齐分类

- **Decision**: 以 `DiagnosisReport.contextOverview.breakdown[].type`（ContextItemType 八类）为键，分别取前/后 `estimatedTokens` 计算 `TokenChange`。无法精确归属到单任务的节省，按该分类 delta 占已执行任务预估总节省的比例估算，并在 `deviation` 注明。
- **Rationale**: `src/types/index.ts:16-44` 已定义稳定枚举与 `percentage` 字段，前后两次诊断同构，可直接按 type 相减。
- **Alternatives considered**: 按 skill/mcp 名称精确匹配 —— 部分可行但 messages/system-prompt 类无法单任务归因，故采用占比估算 + 标注。

### 未知 4: 缺失数据的引导策略

- **Decision**: 缺 `diagnosis-report.json`（前）→ 提示先跑 `stk diagnose` 采基线；缺 `diagnosis-report2.json`（后）→ 提示优化后跑 `stk diagnose`；缺 `tasks.json` → 仍可生成报告（taskResults 空或自动归因），不报错。
- **Rationale**: spec R2/S3 要求可执行引导且不伪造；`report.md` 命令已含同类前置提示，保持对齐。

## 结论

所有 4 项未知已解决，无遗留 NEEDS CLARIFICATION。重构为纯文档变更，技术方法完全基于既有 `src/types/index.ts` 契约与既有命令产物，无需新增依赖或代码。
