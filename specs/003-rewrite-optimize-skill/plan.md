# 实施计划: 重写 stk-optimize SKILL 支持分级优化

**分支**: `003-rewrite-optimize-skill` | **日期**: 2026-07-14 | **规范**: [spec.md](./spec.md)
**输入**: 来自 `/specs/003-rewrite-optimize-skill/spec.md` 的功能规范

**注意**: 此模板由 `/speckit.plan` 命令填充. 执行工作流程请参见 `.specify/templates/plan-template.md`.

## 摘要

1. 重写 `stk-optimize` SKILL（及配套 command 模板）：读 `save-token/tasks.md` → 询问等级（初级 / 初级+中级 / 全部）→ 按等级筛选并按序执行；第三方工具启用类任务走 `stk install <名> -g --agent codebuddy`。
2. **新增 `stk install` 子命令**（本次修正计划新增）：消费 `src/tools/` 注册表中的第三方工具定义（`installCommand`/`configCommand`），支持 `-g/--global`（全局 `~/.codebuddy`，默认）与 `--agent <name>`（默认 codebuddy；claude/codex 预留不支持）。

## 技术背景

**语言/版本**: TypeScript strict（Node.js >= 18，tinyexec 执行 shell）
**主要依赖**: tinyexec（现有，用于 shell 命令执行）
**存储**: 文件系统；注册表在 `src/tools/`（rtk/headroom/caveman/graphify/lean-ctx/ponytail）
**测试**: Vitest（新增 `install` 命令单测 + 工具 `install` 逻辑单测）
**目标平台**: Node.js >= 18 CLI
**项目类型**: CLI 工具（命令 + Agent 指令模板）
**性能目标**: N/A（命令流程，秒级）
**约束条件**: 遵循章程 II（Token 效率）/ IV（简洁至上——最小接口扩展）/ V（中文 help）
**规模/范围**: 1 个新命令 `src/commands/install.ts` + `cli.ts` 注册 + `tools/types.ts` 接口扩展 + 2 个模板重写（SKILL.md + optimize.md）

## 章程检查

*门控: 必须在阶段 0 研究前通过. 阶段 1 设计后重新检查. *

| 原则 | 阶段0前 | 阶段1后 | 说明 |
|------|---------|---------|------|
| I. CLI 优先 | ✅ | ✅ | `stk install` 经 CLI 调用 |
| II. Token 效率优先 | ✅ | ✅ | SKILL 文本精简，no-op 跳过省开销 |
| III. 测试驱动质量 | ✅ | ✅ | 提示词无单测；端到端可选集成测试 |
| IV. 简洁至上 | ✅ | ✅ | 不新增源码/解析器，复用现有格式 |
| V. 文档即产品 | ✅ | ✅ | SKILL/command 中文说明符合规范 |

无违规，无需复杂度跟踪表。

## 项目结构

### 文档(此功能)

```
specs/003-rewrite-optimize-skill/
├── plan.md              # 此文件
├── research.md          # 阶段 0 输出
├── data-model.md        # 阶段 1 输出
├── quickstart.md        # 阶段 1 输出
├── contracts/
│   └── skill-contract.md  # 阶段 1 输出
└── tasks.md             # 阶段 2 输出 (/speckit.tasks)
```

### 受影响源码（仓库根目录）

```
src/cli.ts                                 # 注册 install 子命令
src/commands/install.ts                    # 新增：stk install 实现
src/tools/types.ts                         # SaveTokenTool 扩展 install()/getConfigCommand()
src/tools/impl/rtk.ts                     # 覆写 getConfigCommand(agent, global)
src/templates/skills/stk-optimize/SKILL.md   # 重写：分级优化流程
src/templates/commands/optimize.md           # 同步：去掉 analysis.json 旧描述
tests/unit/commands/install.test.ts       # 新增：install 命令单测
tests/unit/tools/install.test.ts          # 新增：工具 install 逻辑单测
```

**结构决策**: 纯模板（提示词）重构 + 一个真实 CLI 子命令。等级筛选与执行由 Agent 运行时完成；`stk install` 落地为真实代码，复用 `src/tools/` 注册表与 tinyexec。这与现有仓库布局一致（SKILL/command 在 `src/templates/` 下由 `stk init` 复制）。

## 复杂度跟踪

> 无章程违规，本节不适用。
