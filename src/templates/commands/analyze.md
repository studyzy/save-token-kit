---
name: stk:analyze
description: "基于诊断数据与项目上下文，通过 7 个并行子 Agent 多维度分析 Token 优化空间，生成 analysis.json 与 tasks.md"
argument-hint: ""
---

# /stk-analyze

基于诊断数据与项目上下文，通过多维度分析找出 Token 优化空间，产出 `analysis.json`（机器契约）与 `tasks.md`（人读待办清单）。
详细分析规则由 `stk-analyze` SKILL 驱动，本命令定义执行流程。

## 前置条件

- `./save-token/diagnosis-report.json` 或 `diagnosis-report.md` 存在。
- 如缺失，提示用户先运行 `/stk-diagnose` 或 `stk diagnose`。

## 步骤 0: 收集项目上下文

分析前先了解用户实际用途，使建议更贴切。

1. 检查 `./save-token/context.json`：存在且 `collectedAt` 在 7 天内 → 直接复用，跳过提问。
2. 否则用 `AskUserQuestion` 询问两项（**不得猜测**）：
   - **主要使用目的**：代码编写 / 文档写作 / 通用办公 / 通用（跳过）
   - **代码与文档是否在同一仓库**：是（同仓） / 否（文档在独立仓库） / 不适用（纯文档/办公）
3. 将结果写入 `./save-token/context.json`：
   ```json
   { "collectedAt": "<ISO8601>", "purpose": "code|docs|office|general", "sameRepo": "same|separate|n-a|unknown" }
   ```
4. **重问机制**：用户删除 `context.json` 或显式声明新上下文时，重新执行提问并覆盖缓存。
5. **回退**：用户拒绝回答 → `purpose=general`、`sameRepo=unknown`，继续通用分析模式，不阻塞。

## 步骤

1. 读取诊断数据（`.json` 取精确数字）。
2. 委托 `stk-analyze` SKILL 执行分析：通过 7 个并行子 Agent 覆盖 **第三方工具启用**、**SKILL/Plugin/MCP 精简**、**模型优化**、**Agent Tools 明确化**、**知识库推荐**、**MCP 延迟加载**、**同仓专项** 七个维度。
3. 汇总子 Agent 结果，去重，按 `estimatedSavingTokens` 降序排列。
4. **必须**将建议落盘为两份文件：
   - `./save-token/analysis.json`：JSON 契约，供 `/stk-optimize` 消费，含 `context` 字段与每条 `scenario` 归因。
   - `./save-token/tasks.md`：Markdown 待办清单，按 7 个维度分组，一个 SKILL 一个 Task、一个工具一个 Task，绝不合并。格式见 `stk-analyze` SKILL 的「tasks.md 输出格式」。
5. 输出分组摘要 + 总计节省 Token（绝对值 + 百分比）+ 场景标注 + 文件路径。

## 注意

- 建议方案必须可行且明确；无法估算节省量时 `estimatedSavingTokens` 填 0。
- 决策由 AI Agent + SKILL 做出，`stk` CLI 仅提供诊断数据。
