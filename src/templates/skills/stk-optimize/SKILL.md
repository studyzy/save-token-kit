---
name: stk-optimize
description: '执行 analysis.json 中的优化建议，落盘 tasks.json，操作前备份'
argument-hint: ''
---

# SKILL: stk-optimize

本 SKILL 指导 AI Agent 执行 `/stk-optimize` 的实际修改。

## 目标

将分析建议落地为真实配置修改，记录执行结果。

## 执行流程

1. 读取 `analysis.json`，逐条展示 before/after 修改方案。
2. 让用户逐条确认或全部应用。
3. 每项操作**前先备份**原文件到 `~/.codebuddy/` 备份目录或同目录 `.bak`。
4. 按 operationType 执行：
   - `disable-skill`：修改 `settings.json` 的 `enabledPlugins` 设为 false。
   - `disable-mcp` / `replace-mcp-with-cli`：在 `.mcp.json` 中禁用（不删除），并提示安装对应 CLI 命令。
   - `trim-codebuddy-md`：生成精简内容写入，原文件备份。
   - `install-tool`：仅提示安装命令，不自动安装。
   - `defer-mcp`：提示在 MCP 配置中启延迟加载。
5. **必须**写入 `./save-token/tasks.json`（结构见 data-model.md §3）：
   - 成功 `status: "completed"`，失败 `status: "failed"` 且填 `error`。
   - `actualSavingTokens` 留空。
6. 提示用户运行 `stk diagnose >> ./save-token/diagnosis-report2.md`。

## 边界

- 操作失败立即停下，标记失败任务，提示用户按备份手动恢复。本期无 `stk rollback`。
