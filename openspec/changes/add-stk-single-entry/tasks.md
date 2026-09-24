# Tasks

## 1. stages 阶段文档迁移（单一事实源）

- [x] 1.1 创建 `src/templates/skills/stk/stages/diagnose.md`：从 `stk-diagnose/SKILL.md` 迁移执行细节（stk 安装检测、会话级环境变量 agent 判定含 workbuddy 优先规则、报告展示与如实呈现约束），去掉「提醒下一步 /stk-analyze」改为「阶段结束，由调用方决定续跑」。验证：文件存在且三节内容齐全
- [x] 1.2 迁移 `stk-analyze/agents/` 12 个子 Agent 文档至 `src/templates/skills/stk/agents/`，并创建 `stk/stages/analyze.md`（内容取自 `stk-analyze/SKILL.md`，agents 引用路径改为 `../agents/`；第一轮 3 必问合并为一次 AskUserQuestion 调用）。验证：analyze.md 覆盖四阶段流程，agents/ 下 12 文件齐全且引用可达
- [x] 1.3 创建 `stk/stages/optimize.md`：取自 `stk-optimize/SKILL.md`，将「阶段 2 询问优化等级」改造为任务级选择（展示编号清单 + AskUserQuestion「全部（推荐）/仅初级/初级+中级」+ Other 支持编号如 `1.1, 2.3`；无显式选择不执行任何任务）。验证：optimize.md 含任务级选择的完整提示词与回写规则
- [x] 1.4 创建 `stk/stages/report.md`：取自 `stk-report/SKILL.md` 原样迁移（只读闭环、双 Markdown 对比、任务归因规则不变）。验证：与原文档关键规则逐条对齐

## 2. 主入口分发器与旧命令瘦身

- [x] 2.1 创建 `src/templates/skills/stk/SKILL.md`（~2K）：产物→阶段状态推导表（diagnosis-report.md 5 分钟新鲜度 / tasks.md 复选框 / save-token-report.json）、入口状态图输出（`诊断 ✓ → 分析 ✓ → 优化 ● → 报告 ○`）、每阶段停点确认矩阵（默认值驱动、无确认不落地）、意图直达路由（如「只要报告」「重新诊断」）、完结后问询（开新一轮/结束）、按需读取 `stages/*.md` 的路由规则。验证：对照 specs/stk-single-entry/spec.md 六条 Requirement 逐条可追溯
- [x] 2.2 瘦身旧 4 个 `SKILL.md` 至 ~0.5K：frontmatter（name/description 加「高级·单步」前缀/disable-model-invocation）+「本命令 = 流水线单步，完整流程用 /stk」+ 指向对应 `../stk/stages/<stage>.md`（含安装目录相对路径回退说明）+ 各自保留的关键边界（如 optimize 缺 tasks.md 时提示先跑 /stk-analyze）。验证：每个文件 ≤ 30 行且不含执行细节

## 3. CLI 安装机制升级

- [x] 3.1 `src/commands/init.ts`：`SKILLS` 清单加入 `'stk'`；将单文件 `copyTemplate` 升级为递归复制整个 skill 目录（含 stages/、agents/ 子目录，保留 rules-pack `renderTemplate` 渲染逻辑应用于每个 .md），顺带修复存量 `stk-analyze/agents/` 不被安装的问题。验证：对临时目录跑 `stk init --agent codebuddy`，5 个 skill 目录、stages/4 文件、agents/12 文件全部落盘
- [x] 3.2 确认 `package.json` 的 `files` 字段包含模板子目录（templates 随包发布），未被 glob 排除。验证：`npm pack --dry-run` 产物含 `src/templates/skills/stk/stages/*.md` 与 `stk/agents/*.md`

## 4. 测试与回归

- [x] 4.1 更新/新增 `tests/` 中 init 安装相关用例：递归复制完整性（子目录文件计数）、rules 渲染头注入、`--force` 覆盖行为。验证：`pnpm vitest run tests/unit/commands` 通过
- [x] 4.2 更新引用旧 SKILL 模板内容断言的既有用例（路径、文件名、description 前缀）。验证：`pnpm test` 全绿
- [x] 4.3 全量回归：`pnpm build` + `pnpm lint` + `pnpm cover`（覆盖率 ≥ 60%）。验证：三命令均零错误退出
