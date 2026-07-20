---
name: stk:analyze
description: '基于诊断数据与项目上下文，收集场景与仓库，并行派发 8 个子 Agent 多维分析 Token 优化空间，生成 suggestions-*.json 与 tasks.md'
argument-hint: ''
---

# /stk-analyze

基于诊断数据与项目上下文，收集使用场景与仓库代码/文档，并行派发多个专注不同优化点的子 Agent，产出统一 Schema 的 `suggestions-*.json`（中间契约）与 `tasks.md`（人读待办清单）。
详细分析规则由 `stk-analyze` SKILL 驱动，本命令定义执行流程。

## 前置条件

- `./save-token/diagnosis-report.json` 或 `diagnosis-report.md` 存在。
- 如缺失，提示用户先运行 `/stk-diagnose` 或 `stk diagnose`。

## 步骤 0: 收集项目上下文

分析前先了解用户实际用途与仓库规模，使建议更贴切。

1. 检查 `./save-token/context.json`：存在且 `collectedAt` 在 7 天内 → 直接复用，跳过提问。
2. 否则用 `AskUserQuestion` 分轮询问（**不得猜测**）：
   - **第一轮（必问）**：主要使用目的（代码编写 / 文档写作 / 通用办公 / 通用）+ 代码与文档是否同仓。
   - **第二轮（条件触发，codeFileCount >= 5）**：代码知识图谱工具倾向性（Graphify / Codebase-Memory MCP / CodeGraph / GitNexus / 暂不需要），含推荐标记。
3. 将结果写入 `./save-token/context.json`：
   ```json
   {
     "collectedAt": "<ISO8601>",
     "purpose": "code|doc|office|general",
     "sameRepo": "same|separate",
     "graphTool": "<可选>"
   }
   ```
4. **重问机制**：用户删除 `context.json` 或显式声明新上下文时，重新执行提问并覆盖缓存。
5. **回退**：用户拒绝回答 → `purpose=general`、`sameRepo=unknown`，继续通用分析模式，不阻塞。

## 步骤

1. 读取诊断数据（`.json` 取精确数字）。
2. 扫描仓库代码/文档，写入 `./save-token/repo-scan.json`（详见 SKILL 阶段 2）。
3. 检查数据内容，根据 SKILL FR-4 启动条件表决定启动哪些子 Agent（对象为空则跳过对应 Agent）。
4. 委托 `stk-analyze` SKILL 执行分析：在单条消息中**并行**启动满足条件的子 Agent，覆盖 **第三方工具启用(tool-enable)**、**MCP 优化(mcp-opt)**、**插件优化(plugin-opt)**、**子代理工具优化(agent-opt)**、**Skill 优化(skill-opt)**、**知识图谱推荐(knowledge-base)**、**仓库专项(repo-scan)**、**Rules 优化(rules-opt)**、**CODEBUDDY.md 审查(codebuddy-md)**、**Hook 审查(hook-audit)** 10 个维度。每个子 Agent 输出 `./save-token/suggestions-<agent-name>.json`。
5. 汇总子 Agent 结果，按 `category` 分组，写入 `./save-token/tasks.md`：Markdown 待办清单，一个 SKILL 一个 Task、一个工具一个 Task，绝不合并。格式见 `stk-analyze` SKILL 的「tasks.md 输出格式」。
6. 输出分组摘要 + 总计节省 Token（绝对值 + 百分比）+ 场景标注 + 跳过/失败 Agent 列表 + 文件路径。

## 注意

- 建议方案必须可行且明确；无法估算节省量时 `estimatedSavingTokens` 填 0。
- 决策由 AI Agent + SKILL 做出，`stk` CLI 仅提供诊断数据。
- `analysis.json` 作为下游 `/stk-optimize` 契约仍可由汇总阶段生成（兼容旧链路），但其输入源已从单分析改为多 `suggestions-*.json` 合并。
