# Design

## Context

`stk` 的优化工作流由安装到各 Agent 的 SKILL 驱动（CLI 只负责数据采集）。现有 4 个 SKILL 模板位于 `src/templates/skills/`（stk-diagnose 2.7K / stk-analyze 29.6K + 12 个子 Agent 文档 / stk-optimize 5.9K / stk-report 5.1K），经 `stk init` / `stk install --agent` 安装到 `~/.codebuddy/skills/`、`~/.claude/skills/` 等平台目录。动机与问题参见 proposal.md「Why」。

约束：完整设计已在此前 UX 讨论中定稿（`docs/plans/2026-09-24-stk-single-entry-design.md`），本文将其转写为可实现的技术决策。

## Goals / Non-Goals

**Goals:**

- 模板层重组：新增 `stk/` 主入口 + `stages/` 共享阶段文档，旧 4 个 SKILL 瘦身为指向 stage 文档的单步入口
- 状态推导规则、确认点矩阵、任务级选择的提示词落地
- `stk init` / `stk install --agent` 安装清单纳入新 skill

**Non-Goals:**

- 不改 `stk diagnose` / proxy 数据采集逻辑（CLI 核心不动）
- 不动 stk-analyze 的 12 个子 Agent 体系与其状态机
- 不引入新的持久化状态文件或 CLI 编排命令（产物即状态）
- 不做跨平台安装布局重构（沿用现有 per-agent 目录复制机制）

## Decisions

### D1: 编排与执行分离——/stk 只调度，逻辑留原位

`stk/SKILL.md` 保持 ~3K（状态推导 + 状态图 + 停点确认矩阵），四个阶段的完整执行逻辑**原位保留**在各自 SKILL.md（stk-diagnose / stk-analyze / stk-optimize / stk-report），`/stk` 按需读取对应 SKILL.md 调度执行，不复制内容。

> 演进记录：曾实施"stages/ 单一事实源 + 旧 skill 瘦身为指针"方案（eed68a7），用户复盘后否决——逻辑副本造成双份维护心智，改为"逻辑留原位、编排在外"（本方案）。

- 备选 A（4 合 1 巨型 SKILL）：40K+ 常驻风险，上下文成本不可接受。
- 备选 B（CLI 侧 `stk flow` 编排命令）：analyze/optimize 本质是 AI 驱动（AskUserQuestion、子 Agent 派发），CLI 无法承载。
- 选定理由：零逻辑复制；4 个 skill 仍是独立可用的执行单元；UX 改进直接落在对应 SKILL.md。

### D2: 状态推导读产物文件，不新增机制

阶段判定完全基于既有产物（diagnosis-report.md 时间戳 / tasks.md 复选框 / save-token-report.json 存在性），阈值沿用 stk-analyze 现有的 5 分钟诊断新鲜度规则。不加状态文件、不加 CLI 命令——产物即状态，与「Artifact 而非 Conversation」原则一致。

### D3: 确认哲学——每阶段停点，默认值驱动

单入口 ≠ 自动驾驶。`/stk` 的每个阶段结束用一次 AskUserQuestion 询问「继续下一阶段？」并给默认推荐项；优化阶段升级为**任务级选择**：展示 tasks.md 编号清单（编号 + 等级 + 动作 + 预估节省），选项「全部（推荐）/ 仅初级 / 初级 + 中级」，Other 输入编号（如 `1.1, 2.3`）圈定任意子集。无显式确认不落地任何修改；选定集合内顺序执行、逐条回写 tasks.md，执行中不再逐条打断。

### D4: 入口先出状态图再行动

`/stk` 执行任何动作前输出一行状态图（`诊断 ✓ → 分析 ✓ → 优化 ● 进行中 → 报告 ○`）+ 断点说明。附带意图（如「只要报告」）时直达对应阶段，跳过全链推进，但阶段内停点规则不变。

### D5: analyze 场景收集问答合并

第一轮 3 个必问问题（使用目的 / 是否同仓 / 用户角色）合并为一次 AskUserQuestion 调用（上限 4 问），交互从 3 次打断降为 1 次。第二轮图谱倾向性与第三轮澄清的条件触发逻辑不变。

### D6: 安装布局——init 升级为整目录递归复制

现状：`src/commands/init.ts` 对每个 skill 仅复制单文件 `SKILL.md`（`join(tpl,'skills',skill,'SKILL.md')`），子目录不会被安装——存量 `stk-analyze/agents/` 12 个与 `stk-optimize/agents/` 11 个子 Agent 文档在 npm 全局安装场景下已缺失（仓库内因 symlink 开发目录而不可见）。本次将复制逻辑升级为递归复制整个 skill 目录（SKILL.md + agents/ 子目录），5 个 skill 平级安装。`/stk` 对 4 个阶段 skill 的引用按「skills 根目录下平级相对路径」写在提示词里，附路径回退说明。

## Risks / Trade-offs

- [stage 文档相对路径在部分平台解析失败] → 提示词写明回退策略（找不到时按 skill 目录同层级查找），并在 `stk verify` 或测试中校验安装后文件齐全。
- [用户手动改动 save-token/ 产物导致状态误判] → 状态判定以产物为唯一依据，误判后果仅是重复某阶段（幂等：diagnose 覆盖写、optimize 跳过已勾选项），可接受。
- [旧 4 个 SKILL 瘦身后失去独立执行细节] → 瘦身文案强制指向 stage 文档；旧命令与 /stk 共享同一事实源，不会出现行为分叉。
- [存量用户 skills 目录残留旧版模板] → `stk init` 重跑即覆盖更新；SKILL 模板属静态提示词，无数据迁移问题，回滚 = 恢复旧模板文件。

## Migration Plan

1. 重组 `src/templates/skills/`（新增 stk/，瘦身旧 4 个）。
2. 更新 `src/cli.ts` init / install 的模板清单，加入 `stk/`。
3. 同步调整 `tests/` 中模板安装与内容断言。
4. 用户侧升级路径：重跑 `stk init` 即完成；无破坏性数据变更，旧命令保持可用。

## Open Questions

（无——设计已在 UX 讨论中定稿。）
