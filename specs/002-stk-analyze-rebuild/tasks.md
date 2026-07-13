---
description: '重构 stk-analyze SKILL 实现任务列表'
---

# 任务: 重构 stk-analyze SKILL（多子Agent并行优化方案生成）

**输入**: 来自 `/specs/002-stk-analyze-rebuild/` 的设计文档
**前置条件**: plan.md(必需), spec.md(用户故事必需), research.md, data-model.md, contracts/

**测试**: 包含。CODEBUDDY.md 要求单测覆盖率 ≥ 60%；plan.md 阶段 2 准备已列 types 扩展测试与 SKILL.md 结构校验测试。按 TDD 风格：先写测试，再实现。

**组织结构**: 任务按用户故事分组（US1 P1, US2 P1, US3 P2, US4 P2），每个故事独立可测。

## 格式: `[ID] [P?] [Story] 描述`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 归属用户故事（US1-US4）
- 描述含确切文件路径

## 路径约定

- 单一项目：`src/`、`tests/`
- SKILL 模板：`src/templates/skills/`

---

## 阶段 1: 设置（共享基础设施）

**目的**: 分支与契约基线就绪

- [ ] T001 确认当前分支为 `002-stk-analyze-rebuild`（`git branch --show-current`）
- [ ] T002 [P] 备份现有 `src/templates/skills/stk-analyze/SKILL.md` 到 `/tmp/stk-analyze-SKILL.md.bak`
- [ ] T003 [P] 备份现有 `save-token/context.json` 到 `/tmp/context.json.bak`（用于回归对比）

**检查点**: 基线已备份，可安全重写

---

## 阶段 2: 基础（阻塞前置条件）

**目的**: types 契约扩展——所有用户故事依赖

**⚠️ 关键**: 此阶段完成前不可开始任何用户故事任务

- [ ] T004 在 `src/types/index.ts:224` 的 `OperationType` 联合类型新增 `'defer-tools' | 'knowledge-base'` 两个成员（保留既有 `defer-mcp`，不新增 `mcp-defer`）
- [ ] T005 在 `src/types/index.ts` 的 `AnalysisSuggestion` 接口（约 `:236`）新增可选字段 `scenario?: string` 与 `evidence?: string`，并补英文 JSDoc
- [ ] T006 在 `src/types/index.ts` 新增接口 `RepoScan`（字段对齐 `specs/002-stk-analyze-rebuild/contracts/repo-scan.md`：scannedAt/codeFileCount/docFileCount/codeLineCount/docLineCount/topLanguages/hasDocsDir/hasCodebuddyMd/isMonorepo/scanError?）
- [ ] T007 在 `src/types/index.ts` 的 `Context` 相关结构新增 `graphTool?: string` 字段（对齐 `contracts/context.md`）
- [ ] T008 运行 `pnpm build` 确认 types 编译通过，无破坏现有契约

**检查点**: 基础契约就绪，可并行实施用户故事

---

## 阶段 3: 用户故事 1 - 完整跑通"诊断→分析→待办"链路（P1）🎯 MVP

**目标**: `/stk-analyze` 自动收集场景与仓库、并行派发子 Agent、汇总 `tasks.md`

**独立测试**: 在已产生 `diagnosis-report.json` 的项目触发 `/stk-analyze`，验证 `save-token/tasks.md` 非空且分组正确

### 用户故事 1 的测试

> **先写测试，确保失败后再实现**

- [ ] T009 [P] [US1] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写结构校验测试：断言 SKILL.md 含四阶段章节标题（上下文与场景收集 / 仓库代码文档采集 / 并行子 Agent 派发 / 汇总生成 tasks.md）
- [ ] T010 [P] [US1] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写断言：SKILL.md 子 Agent 定义表含 8 行（tool-enable/mcp-opt/model-opt/defer-tools/skill-trim/knowledge-base/repo-scan/hook-audit）且每行含"启动条件"
- [ ] T011 [P] [US1] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写断言：tasks.md 输出格式章节保留"一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task"原则

### 用户故事 1 的实现

- [ ] T012 [US1] 重写 `src/templates/skills/stk-analyze/SKILL.md` 为四阶段结构：`## 目标`/`## 执行流程`/`## 边界`（对齐 diagnose/optimize/report 风格，移除 `allowed-tools` frontmatter）
- [ ] T013 [US1] 在 SKILL.md 步骤 1 实现诊断校验：读取 `save-token/diagnosis-report.json`，存在且 `scanTimestamp` ≤ 5 分钟复用；否则提示先运行 `stk diagnose` 并停止
- [ ] T014 [US1] 在 SKILL.md 步骤 4 实现汇总：读取 `save-token/suggestions-*.json`，按 `category` 分组写 `save-token/tasks.md`，顶部 `<!-- scenario: ... -->` 注释，ID 全局重编号，列出跳过/失败 Agent
- [ ] T015 [US1] 在 SKILL.md 步骤 5 实现控制台摘要：总计节省 Token/百分比、`tasks.md` 路径、场景标注、跳过列表、失败列表
- [ ] T016 [US1] 运行 `pnpm vitest run tests/unit/templates/stk-analyze-skill.test.ts` 确认 T009-T011 通过

**检查点**: 用户故事 1 功能化且独立可测（无子 Agent 细节也能跑通主干）

---

## 阶段 4: 用户故事 2 - 仓库代码与文档采集以推荐知识图谱工具（P1）

**目标**: 扫描仓库规模、询问图谱工具倾向性、基于特征推荐

**独立测试**: 代码文件 ≥ 20 仓库触发图谱询问并生成推荐建议；文件 < 5 不询问

### 用户故事 2 的测试

- [ ] T017 [P] [US2] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写断言：SKILL.md 第二阶段含仓库扫描步骤，列出 `repo-scan.json` 字段（codeFileCount/docFileCount/topLanguages/hasCodebuddyMd/isMonorepo）
- [ ] T018 [P] [US2] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写断言：SKILL.md 含图谱工具倾向性询问，选项含 Graphify/Codebase-Memory MCP/CodeGraph/GitNexus/暂不需要，且带推荐标记逻辑
- [ ] T019 [P] [US2] 在 `tests/unit/types/stk-analyze-types.test.ts` 编写 `RepoScan` 与 `graphTool` 字段类型测试（对齐 contracts）

### 用户故事 2 的实现

- [ ] T020 [US2] 在 SKILL.md 步骤 2 实现仓库扫描：用 Bash（`find`/`wc -l`）+ Glob 统计代码/文档文件数、行数、Top3 语言、CODEBUDDY.md 检测、monorepo 检测，写 `save-token/repo-scan.json`（排除 node_modules/.git/dist/build/coverage/.cache）
- [ ] T021 [US2] 在 SKILL.md 步骤 2 实现第一轮问答（purpose + sameRepo）与第二轮条件问答（codeFileCount ≥ 5 触发图谱工具倾向性，含推荐矩阵：TS/JS→Graphify、多语言大型→Codebase-Memory MCP、monorepo→GitNexus、默认→Graphify）
- [ ] T022 [US2] 在 SKILL.md 写入 `context.json` 结构（含 `graphTool` 可选字段，存储值小写 kebab，展示名首字母大写），7 天复用窗口
- [ ] T023 [US2] 运行 `pnpm vitest run tests/unit/templates/stk-analyze-skill.test.ts tests/unit/types/stk-analyze-types.test.ts` 确认 T017-T019 通过

**检查点**: 用户故事 1+2 独立可测

---

## 阶段 5: 用户故事 3 - 子 Agent 输出统一 Schema（P2）

**目标**: 每个子 Agent 输出 `suggestions-<agent-name>.json`，统一 Schema

**独立测试**: 模拟两个子 Agent JSON，汇总逻辑无差别合并

### 用户故事 3 的测试

- [ ] T024 [P] [US3] 在 `tests/unit/types/stk-analyze-types.test.ts` 编写 `SuggestionFile` 接口测试：字段 agentName/category/generatedAt/skipped/suggestions[]，suggestion 含 id/title/detail/operationType/target/estimatedSavingTokens/risk/reversible/scenario/evidence?
- [ ] T025 [P] [US3] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写断言：SKILL.md "统一 Schema" 章节字段定义与 `contracts/suggestion-file.md` 一致

### 用户故事 3 的实现

- [ ] T026 [US3] 在 SKILL.md 定义统一 Schema 章节（对齐 `contracts/suggestion-file.md`），明确 `operationType` 取值含 `defer-tools`/`knowledge-base`，`defer-mcp` 语义 = `.mcp.json` 中 `"defer_loading": true`
- [ ] T027 [US3] 在 SKILL.md 步骤 3 实现并行派发：单条消息多次 Agent 调用，每个子 Agent 输出 `save-token/suggestions-<agent-name>.json`
- [ ] T028 [US3] 运行 `pnpm vitest run tests/unit/types/stk-analyze-types.test.ts tests/unit/templates/stk-analyze-skill.test.ts` 确认 T024-T025 通过

**检查点**: 用户故事 1+2+3 独立可测

---

## 阶段 6: 用户故事 4 - 旧版 SKILL 内容完整替换（P2）

**目标**: 文档结构四阶段清晰，启动条件按对象存在性表达

**独立测试**: 对比重构前后章节标题与子 Agent 启动条件

### 用户故事 4 的测试

- [ ] T029 [P] [US4] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写断言：SKILL.md 子 Agent 启动条件均为"诊断报告某对象存在/非空"形式（如 `mcpList[]` 非空）
- [ ] T030 [P] [US4] 在 `tests/unit/templates/stk-analyze-skill.test.ts` 编写断言：FR-4 表格 8 行与 data-model.md 子 Agent 映射表一致

### 用户故事 4 的实现

- [ ] T031 [US4] 在 SKILL.md `## 子 Agent 定义` 重写 8 个子 Agent（tool-enable/mcp-opt/model-opt/defer-tools/skill-trim/knowledge-base/repo-scan/hook-audit），每个含输入、规则表、输出 category
- [ ] T032 [US4] 同步 `src/templates/commands/analyze.md`：修复第 36 行 7 维度与 8 子 Agent 不一致，引用 `suggestions-*.json` 与 `context.graphTool`
- [ ] T033 [US4] 运行 `pnpm vitest run tests/unit/templates/stk-analyze-skill.test.ts` 确认 T029-T030 通过

**检查点**: 所有用户故事独立功能化

---

## 阶段 7: 完善与横切关注点

**目的**: 全量验证与文档对齐

- [ ] T034 [P] 运行 `pnpm cover` 确认整体覆盖率 ≥ 60%
- [ ] T035 [P] 运行 `pnpm lint` 确认无 lint 错误
- [ ] T036 运行 `pnpm format` 格式化新增文件
- [ ] T037 按 `specs/002-stk-analyze-rebuild/quickstart.md` 4 个用例（标准/无 MCP/小仓库/7天复用）人工验证 SKILL 行为
- [ ] T038 对比 `save-token/context.json` 新旧结构，确认 `graphTool` 字段向后兼容
- [ ] T039 提交所有变更到 `002-stk-analyze-rebuild` 分支（`git add -A && git commit -m "refactor(stk-analyze): 四阶段结构 + 8 子 Agent 并行 + 统一 Schema"`）

---

## 依赖关系与执行顺序

### 阶段依赖关系

- **设置（阶段 1）**: 无依赖，立即开始
- **基础（阶段 2）**: 依赖设置，阻塞所有用户故事
- **用户故事（阶段 3-6）**: 依赖基础，按优先级 P1→P1→P2→P2
- **完善（阶段 7）**: 依赖全部用户故事完成

### 用户故事依赖关系

- **US1（P1）**: 基础后开始，无故事依赖
- **US2（P1）**: 基础后开始，与 US1 独立但共享 SKILL.md 文件（需顺序写或合并提交）
- **US3（P2）**: 基础后开始，依赖 SKILL.md 存在（T012）
- **US4（P2）**: 基础后开始，依赖 SKILL.md 存在（T012）

### 并行机会

- 阶段 1 的 T002/T003 可并行
- 阶段 2 的 T004-T007 可并行（不同 types 区域）
- 用户故事测试任务（T009-T011 / T017-T019 / T024-T025 / T029-T030）可并行编写
- 阶段 7 的 T034/T035 可并行

### 注意

- US2/US3/US4 均修改同一文件 `src/templates/skills/stk-analyze/SKILL.md`，实现任务（T012-T015/T020-T022/T026-T027/T031-T032）应顺序执行或单 PR 内合并，避免冲突
- 测试任务 [P] 可并行编写，因为测试文件不同

---

## 并行示例: 用户故事 1

```bash
# 并行编写 US1 测试：
任务 T009: tests/unit/templates/stk-analyze-skill.test.ts 四阶段章节断言
任务 T010: tests/unit/templates/stk-analyze-skill.test.ts 8 子 Agent 表断言
任务 T011: tests/unit/templates/stk-analyze-skill.test.ts 一个 Task 原则断言

# US1 实现（顺序，同文件）：
任务 T012: 重写 SKILL.md 四阶段骨架
任务 T013: 步骤1 诊断校验
任务 T014: 步骤4 汇总 tasks.md
任务 T015: 步骤5 控制台摘要
```

---

## 实施策略

### 仅 MVP（US1）

1. 阶段 1 设置 → 阶段 2 基础（types 扩展）→ 阶段 3 US1
2. 停止验证：SKILL.md 四阶段骨架 + 汇总逻辑跑通

### 增量交付

1. 设置 + 基础 → 契约就绪
2. US1 → 主干链路可测
3. US2 → 仓库扫描 + 图谱询问
4. US3 → 统一 Schema
5. US4 → 8 子 Agent 定义 + 命令模板同步
6. 阶段 7 → 全量验证

### 并行团队策略

- 单人实现：按 US1→US2→US3→US4 顺序（同文件约束）
- 测试可抽离：T009-T030 测试编写可与实现并行

---

## 注意事项

- [P] = 不同文件/无依赖
- [Story] 标签映射可追溯性
- 每用户故事独立可完成可测
- 实现前验证测试失败
- 逻辑组后提交
- 避免：模糊任务、同文件冲突、跨故事破坏独立性
