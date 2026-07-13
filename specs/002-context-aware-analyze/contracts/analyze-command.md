# 命令契约: /stk:analyze（上下文感知）

**功能**: 002-context-aware-analyze
**类型**: AI Agent 命令契约（Command + SKILL 行为约定）
**基础文件**: `src/templates/commands/analyze.md`、`src/templates/skills/stk-analyze/SKILL.md`

> 此命令为提示词驱动，由 AI Agent 读取并执行，无独立可执行二进制。契约描述 Agent 必须遵循的输入/输出与交互行为。

## 1. 输入

- **前置**: `./save-token/diagnosis-report.json` 或 `.md` 存在（缺失则提示先运行 `/stk-diagnose`）。
- **上下文缓存**: `./save-token/context.json`（可选，存在则复用）。
- **重问信号**: 用户删除 `context.json` 或显式声明新上下文 → 重新收集。

## 2. 交互契约（步骤 1: 收集上下文）

若 `context.json` 不存在或过期（>7 天），Agent **必须**通过 `AskUserQuestion` 询问两项，**不得猜测**：

| 问题 | 选项 |
|--------|--------|
| 主要使用目的 | 代码编写 / 文档写作 / 通用办公 / 通用（跳过） |
| 代码与文档是否在同一仓库 | 是（同仓） / 否（文档在独立仓库） / 不适用（纯文档/办公） |

收集后写入 `./save-token/context.json`（结构见 data-model.md §1）。

## 3. 处理契约（步骤 2: 场景裁剪）

Agent 基于 `purpose` 与 `sameRepo` 对诊断出的原始优化空间应用过滤/重排规则（见 SKILL 规则表）。每条保留建议标注 `scenario`。

## 4. 输出契约

- **必须**落盘 `./save-token/analysis.json`，结构同 001 data-model §2，并含新增 `context` 与 `scenario` 字段。
- 建议按 `estimatedSavingTokens` 降序。
- 可选 `./save-token/analysis.md` 作展示。
- 控制台打印预估总节省（绝对值 + 百分比），并注明采用的使用场景（如 `场景: 代码编写 / 同仓`）。

## 5. 边界契约

- 用户拒绝回答 → `purpose=general` / `sameRepo=unknown`，回退通用模式，不阻塞。
- 诊断缺失 → 提示先 `/stk-diagnose`，不产出建议。
- **不修改任何文件**（仅产出建议），与现有行为一致。
