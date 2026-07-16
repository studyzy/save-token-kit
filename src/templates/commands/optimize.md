---
name: stk:optimize
description: '读取 save-token/tasks.md，按用户选择的优化等级筛选并逐项执行 Token 优化任务'
argument-hint: ''
---

# /stk-optimize

根据分级待办清单执行实际的 Token 优化操作。

## 前置条件

- `./save-token/tasks.md` 存在（由 `/stk-analyze` 生成）。
- 如缺失，提示用户先运行 `/stk-analyze`。

## 步骤

1. 读取 `tasks.md`，按行内 `[初级]`/`[中级]`/`[高级]` 标签与复选框解析任务；"保持现状/节省 0"类标记为 no-op。
2. 询问用户优化等级：**初级** / **初级+中级** / **全部**，据此筛选任务集合。
3. 按 `tasks.md` 出现顺序逐项执行（操作前先备份原文件）：
   - **第三方工具启用**：解析工具名，执行 `stk install <工具名> -g --agent codebuddy`。
   - **禁用 Skill**：修改 `settings.json` 的 `enabledPlugins` 对应项设为 `false`；备份原文件。
   - **关闭 MCP**：将 MCP 从 `.mcp.json` 中禁用（而非删除）；提示对应 CLI 工具命令。
   - **精简 CODEBUDDY.md**：生成精简后内容写入，原文件备份。
   - **no-op**：标记 `skipped`，不做任何修改。
4. 完成后提示用户重新运行：
   ```bash
   stk diagnose >> ./save-token/diagnosis-report2.md
   ```
   以采集优化后的诊断报告，供 `/stk-report` 对比。

## 错误处理

- 单个操作失败（如文件权限问题）→ 记录该任务 `failed` 并继续下一任务；如需遇错即停，执行前与用户确认。
- 本期**不实现自动回滚**，提示用户根据备份手动恢复。
