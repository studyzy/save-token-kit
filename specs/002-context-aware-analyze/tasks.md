# 任务: 上下文感知的 /stk:analyze 优化分析

**输入**: 来自 `/specs/002-context-aware-analyze/` 的设计文档
**前置条件**: plan.md(必需), spec.md(用户故事必需), research.md, data-model.md, contracts/
**测试**: 本期为纯 Markdown 模板修改，规范未要求测试；仅保留可选验证任务（不写单测）。

**组织结构**: 任务按用户故事分组（US1 上下文收集 / US2 场景裁剪 / US3 同仓专项）。改动集中在 2 个模板文件，无 TypeScript 代码。

## 格式: `[ID] [P?] [Story] 描述`
- **[P]**: 可并行（不同文件、无依赖）
- **[Story]**: US1 / US2 / US3
- 描述含确切文件路径

## 路径约定
- 模板源: `src/templates/commands/analyze.md`、`src/templates/skills/stk-analyze/SKILL.md`
- 安装产物: `~/.codebuddy/`（经 `stk init --skills`）
- 缓存: `./save-token/context.json`

---

## 阶段 1: 设置（共享准备）

**目的**: 确认基线模板内容，便于最小改动。

- [X] T001 读取 `src/templates/commands/analyze.md` 与 `src/templates/skills/stk-analyze/SKILL.md`，确认当前结构与落盘契约（analysis.json 字段）。

---

## 阶段 2: 基础（阻塞前置）

**目的**: 定义上下文契约，供 US1~US3 复用。

- [X] T002 在 `specs/002-context-aware-analyze/data-model.md` 确立 `ProjectContext`（purpose/sameRepo 枚举）与 `AnalysisFile.context` / `AnalysisSuggestion.scenario` 增量契约——本阶段已写入，作为后续模板编辑的依据。

**检查点**: 契约确定，可开始编辑模板。

---

## 阶段 3: 用户故事 1 - 分析时收集项目上下文（P1）🎯 MVP

**目标**: `/stk:analyze` 启动先问使用目的与同仓情况，缓存复用，不阻塞。

**独立测试**: 首次运行先问两问并写 `./save-token/context.json`；二次运行复用不重问；删除该文件重跑会重问。

### 实施

- [X] T003 [P] [US1] 在 `src/templates/commands/analyze.md` 的「前置条件」后新增「步骤 0: 收集项目上下文」：若 `./save-token/context.json` 不存在或 `collectedAt` 过期(>7天)，用 `AskUserQuestion` 问「主要使用目的」(代码编写/文档写作/通用办公/通用) 与「代码与文档是否同仓」(是/否/不适用)，结果写入 `context.json`。
- [X] T004 [P] [US1] 在 `src/templates/commands/analyze.md` 增加重问机制说明：用户删除 `context.json` 或显式声明新上下文即重新收集；拒绝回答则 `purpose=general`/`sameRepo=unknown` 回退通用模式。
- [X] T005 [P] [US1] 在 `src/templates/skills/stk-analyze/SKILL.md` 新增「上下文收集」小节，内容与 T003/T004 对齐（同一两问 + 缓存 + 重问 + 回退）。

**检查点**: US1 完成——收集与缓存可用，分析报告可带 `context`。

---

## 阶段 4: 用户故事 2 - 按使用目的裁剪优化建议（P2）

**目标**: 基于 purpose 过滤/重排诊断出的建议，每条标 `scenario`。

**独立测试**: 同份诊断数据分别声明 code/docs/office，产出建议集合差异明显，且高亮建议符合用途。

### 实施

- [X] T006 [US2] 在 `src/templates/skills/stk-analyze/SKILL.md` 新增「场景过滤规则表」：code→保留禁用演示/文档类 skill、defer-mcp、trim-codebuddy-md，降权文档工具推荐；docs→高亮知识库/写作辅助 MCP，降权代码审查 Agent 精简；office→聚焦 disable-mcp/disable-skill 无关条目，不推代码特定。
- [X] T007 [US2] 在 `src/templates/skills/stk-analyze/SKILL.md` 的「产出」小节要求每条建议写 `scenario` 字段，且 `analysis.json` 写入 `context`（引用 data-model §2/§3）。
- [X] T008 [US2] 在 `src/templates/commands/analyze.md` 步骤 2 增加一句：分析时结合 `context.json` 的 purpose 应用场景过滤，按 `estimatedSavingTokens` 降序但受场景权重影响。

**检查点**: US1+US2 完成——建议按用途贴切。

---

## 阶段 5: 用户故事 3 - 识别代码/文档同仓并给专项建议（P3）

**目标**: 同仓时推文档冗余上下文专项建议；分离时推排除文档仓库建议。

**独立测试**: 声明同仓→报告含"文档冗余上下文读取"专项建议；声明分离→含"排除文档仓库出主上下文"建议；非代码仓→不推代码建议。

### 实施

- [X] T009 [US3] 在 `src/templates/skills/stk-analyze/SKILL.md` 规则表追加同仓分支：`sameRepo=same`→追加"文档冗余上下文读取"专项建议(建文档索引/限制文档自动注入)；`sameRepo=separate`→追加"排除文档仓库出主代码对话上下文"建议；`n-a`→仅围绕文档/办公场景，不推代码特定。
- [X] T010 [US3] 在 `src/templates/skills/stk-analyze/SKILL.md` 规则 5 之后插入该同仓专项条目，保持规则优先级从高到低可读。

**检查点**: 全部用户故事完成。

---

## 阶段 6: 完善与验证

**目的**: 同步安装产物并验证行为，不引入代码。

- [X] T011 [P] 运行 `make build`（如需）并通过 `stk init --skills --force` 将更新后的 `analyze.md` / `stk-analyze/SKILL.md` 推到 `~/.codebuddy/`。
- [X] T012 在任一仓库运行 `/stk:analyze`，按 `contracts/analyze-command.md` 验证：先问两问、二次复用、删除后重问、按用途裁剪、同仓/分离专项建议、`analysis.json` 含 `context` 与 `scenario`、不修改任何用户文件。

---

## 依赖关系与执行顺序

### 阶段依赖关系
- **阶段 1 设置**: 无依赖，立即开始。
- **阶段 2 基础**: 依赖 T001 读取基线；定义契约，阻塞 US1~US3。
- **阶段 3 US1**: 依赖阶段 2 → 编辑两文件的上下文收集段。
- **阶段 4 US2**: 依赖 US1（需先有 context 供裁剪）。
- **阶段 5 US3**: 依赖 US1/US2（同仓分支挂在场景规则表后）。
- **阶段 6 完善**: 依赖全部 US 完成。

### 用户故事依赖关系
- **US1 (P1)**: 阶段 2 后开始，无其它故事依赖（MVP 核心）。
- **US2 (P2)**: 依赖 US1 产出的 context。
- **US3 (P3)**: 依赖 US2 的场景规则表。

### 并行机会
- T003/T004/T005 分属不同文件/小节，可在 US1 内并行起草。
- T011 与 T012 串行（先装后验）。
- US2/US3 因依赖串行；但 T006/T007 可并行编辑 SKILL 不同小节。

---

## 并行示例: 用户故事 1

```bash
# US1 内可并行起草：
任务 T003: 在 src/templates/commands/analyze.md 加「步骤 0: 收集上下文」
任务 T004: 在 src/templates/commands/analyze.md 加「重问机制」
任务 T005: 在 src/templates/skills/stk-analyze/SKILL.md 加「上下文收集」小节
```

---

## 实施策略

### 仅 MVP（仅用户故事 1）
1. 完成 T001/T002（基线 + 契约）
2. 完成 T003~T005（上下文收集）
3. **停止验证**：运行 `/stk:analyze` 确认先问两问、缓存复用、回退通用。

### 增量交付
1. US1 → 验证收集可用（MVP）
2. US2 → 验证按用途裁剪
3. US3 → 验证同仓/分离专项
4. 每步独立可验证，不破坏前序。

### 并行团队策略
单人即可（仅改 2 文件）。若多人：US1 收集段（命令+SKILL）与 US2/US3 规则表可由不同人分别改不同文件。

---

## 注意事项
- [P] 任务 = 不同文件/小节，无依赖冲突。
- [Story] 标签映射 US1~US3 便于追溯。
- 纯 Markdown，无单测；验证靠 T012 人工跑命令。
- 每次逻辑改动后提交。
- 不使用子 Agent、不写 TypeScript（符合最简实践与章程 IV）。
