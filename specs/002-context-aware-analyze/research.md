# 研究: 上下文感知的 /stk:analyze

**功能**: 002-context-aware-analyze
**日期**: 2026-07-13

## 关键发现

### Decision 1: 实现形态 = 仅修改现有 Markdown 模板，不新增代码/子 Agent

- **Rationale**: `/stk:analyze` 是 AI Agent 消费的 Command（prompt）+ SKILL，由 Agent 读取后执行。它本身就是"提示词工程"产物，不是可编译代码。用户明确表示不熟悉 SKILL/Agent 编写，要求最简实践。参考的 `st-analyze` 用 6 个并行子 Agent + 结构化 JSON 协议，复杂且超出用户能力圈。
- **Alternatives considered**:
  - 复制 `st-analyze` 的 6 子 Agent 架构 → 复杂、难维护、用户无法修改。
  - 在 `stk` CLI 新增 `analyze` 命令做程序化分析 → 需解析诊断数据、写启发式，工程量与现有"CLI 仅采集、决策交给 Agent"的架构约束（CODEBUDDY.md §项目定位）冲突。
- **结论**: 在 `src/templates/commands/analyze.md` 与 `src/templates/skills/stk-analyze/SKILL.md` 中增加"上下文收集"与"按场景过滤"的提示词规则即可。零代码、零子 Agent。

### Decision 2: 上下文收集方式 = AskUserQuestion 直接问 2 个问题 + 本地缓存文件

- **Rationale**: 现有诊断流程已用 `AskUserQuestion` 习惯（参考 `st-analyze` 步骤 2）。最简即沿用。缓存写到 `./save-token/context.json`，下次复用，符合"CLI 优先、文本协议、落盘 JSON"章程。
- **Alternatives considered**:
  - 自动探测项目类型（读 git/目录结构推断）→ 不可靠，且用户明确要求"询问实际用途"。
  - 记环境变量 → 跨项目不隔离，不合适。
- **结论**: 问「使用目的」与「代码/文档是否同仓」两项；缓存于 `./save-token/context.json`；支持 `--reask`（命令加一句"若想重新回答，删除该文件或加 --reask"）。

### Decision 3: 场景过滤 = 在 SKILL 中用显式规则表，而非让 Agent 自由发挥

- **Rationale**: 用户要"贴切建议"。最简可验证做法：给出一张"use case → 该保留/该降权的条目"规则表，Agent 照表裁剪并按 `scenario` 标注。避免模糊措辞导致每次结果漂移。
- **规则表（草案）**:
  - 用途=代码编写：保留 `disable-skill`(演示/文档类)、`defer-mcp`、`trim-codebuddy-md`；降权文档类工具推荐。
  - 用途=文档写作：高亮知识库/写作辅助 MCP 推荐；降权代码审查 Agent 精简。
  - 用途=通用办公：聚焦 `disable-mcp` / `disable-skill`（无关条目）；不推代码特定优化。
  - 同仓=true：追加"文档冗余上下文读取"专项建议（建索引/限制文档注入）。
  - 同仓=false（文档独立仓）：追加"排除文档仓库出主上下文"建议。

### Decision 4: 落盘契约 = 在现有 AnalysisFile 增加 `context` 字段

- **Rationale**: 现有 `analysis.json`（`AnalysisFile`）下游被 `/stk-optimize` 消费（data-model.md §2）。新增 `context` 字段向后兼容，且让 optimize 阶段也能感知场景，无需重问。
- **结论**: `AnalysisFile` 增加可选 `context: { purpose, sameRepo }`；`AnalysisSuggestion` 增加可选 `scenario` 字段。

## 章程符合性

- 原则 I（CLI 优先）：本期不改 CLI 入口，仅增强 Command/SKILL 文本，符合。
- 原则 II（Token 效率）：提示词保持精简，新增内容为必要规则，符合。
- 原则 III（测试驱动）：纯 Markdown 模板修改，无 TypeScript 逻辑，无需单测；如担心回归，可在 `tests/integration/diagnose` 增加"analyze 命令文件存在且含上下文字段"的轻量断言（可选）。
- 原则 IV（简洁至上）：无新增抽象、无子 Agent，最简。
- 原则 V（文档即产品）：中文命令文案，英文注释（模板无代码）。
