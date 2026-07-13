# 实施计划: 重构 stk-analyze SKILL（多子Agent并行优化方案生成）

**分支**: `002-stk-analyze-rebuild` | **日期**: 2026-07-13 | **规范**: [spec.md](./spec.md)
**输入**: 来自 `/specs/002-stk-analyze-rebuild/spec.md` 的功能规范

## 摘要

重构 `src/templates/skills/stk-analyze/SKILL.md`，建立"收集场景 → 收集仓库 → 派发子 Agent → 汇总 tasks.md"四阶段流程。新增仓库代码/文档扫描与代码知识图谱工具倾向性询问（Graphify / Codebase-Memory MCP / CodeGraph / GitNexus）。8 个子 Agent 按对象存在性条件并行启动，统一输出 `suggestions-<agent-name>.json`，最终汇总为 `tasks.md`。同时扩展 `src/types/index.ts` 的 `OperationType` 与 `AnalysisSuggestion`（新增 `scenario`/`evidence`/`graphTool` 等字段，不破坏现有契约）。

## 技术背景

**语言/版本**: TypeScript 5.x（strict: true），ESM，NodeNext 模块解析
**主要依赖**: unbuild（构建）、cac（CLI）、vitest（测试）；本次重构不新增运行时依赖
**存储**: 文件系统（`save-token/*.json`、`save-token/tasks.md`）
**测试**: vitest，覆盖率 ≥ 60%；本次新增针对 SKILL.md 内容的结构校验测试与 types 扩展的字段测试
**目标平台**: CodeBuddy Code（SKILL 执行环境）+ Node.js >= 18 LTS（CLI 构建）
**项目类型**: CLI 工具（`stk`）+ SKILL 模板仓库
**性能目标**: `/stk-analyze` 端到端 < 5 分钟（子 Agent 并行）
**约束条件**: 不修改 `src/types/index.ts` 已有字段（仅扩展）；不破坏 `stk-optimize`/`stk-report` 下游契约；SKILL 内部不执行实际优化动作
**规模/范围**: 1 个 SKILL.md 完整重写 + `src/types/index.ts` 扩展字段 + `save-token/context.json` 结构扩展（新增 `graphTool`）+ 新增 `save-token/repo-scan.json` 与 `save-token/suggestions-*.json` 契约文档

## 章程检查

*门控: 必须在阶段 0 研究前通过. 阶段 1 设计后重新检查. *

| 原则               | 合规 | 说明                                                                                                                                                     |
| ------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. CLI 优先        | ✅   | 本次重构对象是 SKILL 模板（由 CodeBuddy Code 加载），非 CLI 命令；CLI 入口 `stk diagnose` 不变。SKILL 内部通过 Bash 调用 `cat`/`ls` 等命令符合文本协议。 |
| II. Token 效率优先 | ✅   | SKILL.md 本身需精简（目标 < 300 行）；子 Agent 输出 JSON 紧凑；tasks.md 一项一行可执行。新增 `evidence` 字段为可选，避免膨胀。                           |
| III. 测试驱动质量  | ✅   | 新增 types 字段需配 vitest 类型测试；SKILL.md 结构（章节标题、子 Agent 启动条件表）需有快照/结构校验测试。                                               |
| IV. 简洁至上       | ✅   | 8 个子 Agent 各自职责单一；统一 Schema 避免定制解析；不引入新运行时依赖；YAGNI——不预留未指定的子 Agent。                                                 |
| V. 文档即产品      | ✅   | SKILL.md 用户可见文案中文；代码注释英文；types 扩展配英文 JSDoc。                                                                                        |

**结论**: 全部通过，无需复杂度跟踪豁免。

## 项目结构

### 文档(此功能)

```
specs/002-stk-analyze-rebuild/
├── plan.md              # 此文件
├── spec.md              # 功能规范
├── research.md          # 阶段 0 输出
├── data-model.md        # 阶段 1 输出
├── quickstart.md        # 阶段 1 输出
├── contracts/           # 阶段 1 输出
│   ├── suggestion-file.md      # suggestions-<agent>.json 契约
│   ├── repo-scan.md            # repo-scan.json 契约
│   └── context.md              # context.json 契约（扩展）
└── tasks.md             # 阶段 2 输出（/speckit.tasks 创建）
```

### 源代码(仓库根目录)

```
src/
├── templates/
│   └── skills/
│       └── stk-analyze/
│           └── SKILL.md          # 【重写】核心交付物
├── types/
│   └── index.ts                  # 【扩展】OperationType 新增值、AnalysisSuggestion 新增字段、新增 RepoScan/Context 接口
└── ...（其他目录不变）

tests/
└── unit/
    ├── types/
    │   └── stk-analyze-types.test.ts   # 【新增】types 扩展字段校验
    └── templates/
        └── stk-analyze-skill.test.ts   # 【新增】SKILL.md 结构校验（章节、子 Agent 表、Schema 引用）

save-token/                       # 【运行时产物，非源码】
├── context.json                  # 扩展：新增 graphTool 字段
├── repo-scan.json                # 新增
├── suggestions-<agent>.json      # 新增（多个）
└── tasks.md                      # 既有
```

**结构决策**: 沿用现有 `src/templates/skills/` 单一项目结构。SKILL.md 是唯一需要重写的核心文件；types 扩展作为契约同步项。不引入新目录。

## 复杂度跟踪

> 无必须证明的违规，本表留空。

## 阶段 1 完成清单

- [x] research.md — 4 项研究任务全部定稿（图谱工具矩阵 / SKILL 风格统一 / 扫描逻辑不复用 / 问答分轮）
- [x] data-model.md — 6 个实体定义（Context 扩展 / RepoScan 新增 / SuggestionFile 新增 / AnalysisSuggestion 扩展 / OperationType 扩展 / TasksFile 不变）
- [x] contracts/suggestion-file.md — 子 Agent 输出统一 Schema 契约
- [x] contracts/repo-scan.md — 仓库扫描结果契约（含阈值表）
- [x] contracts/context.md — context.json 扩展契约（新增 graphTool）
- [x] quickstart.md — 4 个验证用例（标准 / 无 MCP / 小仓库 / 7 天复用）
- [x] agent 上下文更新 — `update-agent-context.sh codebuddy` 执行成功，CODEBUDDY.md 无实质修改（无新技术需添加）

## 章程检查（设计后重评估）

| 原则               | 合规 | 说明                                                                                                        |
| ------------------ | ---- | ----------------------------------------------------------------------------------------------------------- |
| I. CLI 优先        | ✅   | 无变更。SKILL 通过 Bash 调用 `cat`/`find`/`wc` 等文本协议命令。                                             |
| II. Token 效率优先 | ✅   | data-model 中 `evidence`/`scenario` 均为可选字段；suggestions-*.json 紧凑；tasks.md 一项一行。              |
| III. 测试驱动质量  | ✅   | data-model 明确验证规则；types 扩展配 vitest；SKILL.md 结构校验测试。                                       |
| IV. 简洁至上       | ✅   | 不新增 TypeScript 模块（repo-scan 在 SKILL 内用 Bash）；8 子 Agent 各自单一职责；统一 Schema 避免定制解析。 |
| V. 文档即产品      | ✅   | contracts/ 与 data-model.md 中文；types JSDoc 英文；SKILL.md 用户文案中文。                                 |

**结论**: 设计阶段后全部合规。

## 阶段 2 准备

阶段 1 制品已就绪，可进入 `/speckit.tasks` 生成实施任务清单（tasks.md）。

**预期任务分组**:

1. 扩展 `src/types/index.ts`（OperationType + AnalysisSuggestion + RepoScan/Context 接口）
2. 重写 `src/templates/skills/stk-analyze/SKILL.md`（四阶段结构 + 8 子 Agent + 统一 Schema）
3. 新增 types 扩展测试 `tests/unit/types/stk-analyze-types.test.ts`
4. 新增 SKILL.md 结构校验测试 `tests/unit/templates/stk-analyze-skill.test.ts`
5. 同步 `src/templates/commands/analyze.md`（修复 7 维度与 8 子 Agent 的不一致）
6. 文档校对与 lint
