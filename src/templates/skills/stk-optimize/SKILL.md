---
name: stk-optimize
description: '读取 save-token/tasks.md，按用户选择的优化等级（初级/初级+中级/全部）筛选并逐项执行 Token 优化任务'
argument-hint: ''
---

# SKILL: stk-optimize

本 SKILL 指导 AI Agent 执行 `/stk-optimize`：读取分级待办清单，按用户选定的等级筛选并逐项落地优化。

## 前置条件

- `./save-token/tasks.md` 存在（由 `/stk-analyze` 生成）。
- 若缺失：提示用户先运行 `/stk-analyze`，停止。不要凭空生成任务。

## 执行流程

### 1. 读取并解析 tasks.md

读取 `./save-token/tasks.md`，识别每条任务：
- 复选框：`- [ ]`（未完成）/ `- [x]`（已完成，可跳过）。
- 等级标签：`[初级]` / `[中级]` / `[高级]`，位于复选框之后。
- 动作描述：标签后的文本（如"禁用 skill: ponytail-help"、"启用 Headroom"）。
- 原因：缩进两空格的 `原因：` 行。
- no-op 识别：描述以"保持/保留/当前配置"开头且预估节省为 0 → 标记 `skipped`，不执行任何修改。

### 2. 询问优化等级

使用 AskUserQuestion 向用户呈现三个选项（单选）：
1. **初级**
2. **初级 + 中级**
3. **全部**（初级 + 中级 + 高级）

### 3. 筛选任务

按用户选择保留对应等级的任务集合：
- 初级 → 仅 `[初级]`
- 初级+中级 → `[初级]` + `[中级]`
- 全部 → `[初级]` + `[中级]` + `[高级]`

已勾选（`- [x]`）与 no-op 任务不进入执行队列（no-op 落盘 `skipped`）。

### 4. 按序执行

严格遵循 `tasks.md` 中的出现顺序，逐个执行筛选后的任务。每条任务按 `operationType` 分支处理：

- **第三方工具启用**（`stk install`）：
  - 从动作描述解析工具名（如"启用 Headroom"→`headroom`，"启用 RTK"→`rtk`）。
  - 执行：`stk install <工具名> -g --agent codebuddy`
  - 该命令会运行工具的 install + config 命令完成安装与启用。
- **disable-skill**：备份 `settings.json` 后，将 `enabledPlugins` 对应项设为 `false`。
- **disable-mcp / replace-mcp-with-cli**：备份 `.mcp.json` 后禁用（不删除），并提示对应 CLI 命令。
- **trim-codebuddy-md**：生成精简内容写入，原文件备份。
- **defer-mcp / 其他**：按建议提示或执行对应修改，操作前先备份。

> 所有本地文件修改**前必须备份**原文件到 `~/.codebuddy/` 备份目录或同目录 `.bak`。

### 5. 落盘执行结果

将每条任务结果写入 `./save-token/tasks.json`（结构见 data-model.md §3 `TasksFile`）：
- 成功：`status: "completed"`，填 `appliedChange`。
- 失败：`status: "failed"`，填 `error`。
- no-op：`status: "skipped"`。
- `actualSavingTokens` 本期留空，由 `/stk-report` 计算。

### 6. 收尾

完成后提示用户重新运行采集优化后诊断：
```bash
stk diagnose >> ./save-token/diagnosis-report2.md
```

## 边界

- 单个任务失败：记录 `failed` 并继续下一任务（整体流程可见）；如需遇错即停，执行前与用户确认。
- 本 SKILL 仅指导修改，不自动回滚；回滚依赖用户侧备份手动恢复。
- 仅支持 `codebuddy` 平台（`stk install --agent` 仅 codebuddy 生效，claude/codex 等预留）。
