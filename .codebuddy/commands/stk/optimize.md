---
name: stk:optimize
description: "执行 analysis.json 中的优化建议，修改配置文件/禁用 MCP/Skill，并落盘 tasks.json"
argument-hint: ""
---

# /stk-optimize

根据优化建议执行实际的优化操作。

## 前置条件

- `./save-token/analysis.json` 存在。
- 如缺失，提示用户先运行 `/stk-analyze`。

## 步骤

1. 读取 `analysis.json`，逐条展示修改方案（before / after）。
2. 让用户**逐条确认**或**全部应用**。
3. 执行修改（操作前先备份原文件）：
   - **禁用 Skill**：修改 `settings.json` 的 `enabledPlugins`，将该项设为 `false`；备份原文件。
   - **关闭 MCP**：将 MCP 从 `.mcp.json` 中禁用（而非直接删除）；提示用户安装对应 CLI 工具命令。
   - **精简 CODEBUDDY.md**：生成精简后内容并写入，原文件备份。
   - **安装工具**：提示安装命令（仅提示，不自动安装）。
4. **必须**将执行结果以 JSON 落盘 `./save-token/tasks.json`（结构见 data-model.md §3）。
   - 每条任务记录：suggestionId、description、operationType、status、estimatedSavingTokens、risk、reversible、appliedChange；失败任务标记 `status: "failed"` 并填 `error`。
   - `actualSavingTokens` 本期留空，由 `/stk-report` 计算。
5. 完成后提示用户重新运行：
   ```bash
   stk diagnose >> ./save-token/diagnosis-report2.md
   ```
   以采集优化后的诊断报告，供 `/stk-report` 对比。

## 错误处理

- 任何操作失败（如文件权限问题）→ 停止后续操作，在 `tasks.json` 标记该任务 `failed`，显示清晰错误。
- 本期**不实现自动回滚**，提示用户根据备份手动恢复。
