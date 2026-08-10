---
name: stk-optimize
description: '执行Token优化任务'
argument-hint: ''
---

# SKILL: stk-optimize

本 SKILL 指导 AI Agent 执行 `/stk-optimize`：读取分级待办清单，按用户选定的等级筛选，按 operationType 路由到对应子 Agent 逐项落地优化。

## 前置条件

- `./save-token/tasks.md` 存在（由 `/stk-analyze` 生成）。
- 若缺失：提示用户先运行 `/stk-analyze`，停止。不要凭空生成任务。

## 执行流程

### 阶段 1: 读取并解析 tasks.md

读取 `./save-token/tasks.md`，识别每条任务：
- 复选框：`- [ ]`（未完成）/ `- [x]`（已完成，可跳过）。
- 等级标签：`[初级]` / `[中级]` / `[高级]`，位于复选框之后。
- 动作描述：标签后的文本（如"禁用 skill: ponytail-help"、"启用 Headroom"）。
- 原因：缩进两空格的 `原因：` 行。
- no-op 识别：描述以"保持/保留/当前配置"开头且预估节省为 0 → 标记 `skipped`，不执行任何修改。

### 阶段 2: 询问优化等级

使用 AskUserQuestion 向用户呈现三个选项（单选）：
1. **初级**
2. **初级 + 中级**
3. **全部**（初级 + 中级 + 高级）

### 阶段 3: 筛选任务

按用户选择保留对应等级的任务集合：
- 初级 → 仅 `[初级]`
- 初级+中级 → `[初级]` + `[中级]`
- 全部 → `[初级]` + `[中级]` + `[高级]`

已勾选（`- [x]`）与 no-op 任务不进入执行队列（no-op 落盘 `skipped`）。

### 阶段 4: 按序路由派发

严格遵循 `tasks.md` 中的出现顺序，逐条派发到对应子 Agent。每条任务完成后，主 SKILL 等待子 Agent 回报结果，立即回写 `tasks.md` 状态，再处理下一条。

**路由规则**：按 `operationType` + `target` 匹配：

| operationType | target 匹配 | 子 Agent | 说明 |
|---|---|---|---|
| `install-tool` | — | `@agents/install-tool.md` | 执行 `stk install` 安装工具 |
| `disable-skill` | — | `@agents/skill-opt.md` | 修改 settings.json 禁用 Skill |
| `migrate-skill` | — | `@agents/skill-opt.md` | 修改 settings.json 迁移 Skill 作用域 |
| `disable-mcp` | — | `@agents/mcp-opt.md` | 修改 .mcp.json 禁用 MCP |
| `defer-mcp` | — | `@agents/mcp-opt.md` | 修改 .mcp.json 设置 defer_loading |
| `replace-mcp-with-cli` | `tapd` / `mcp-server-tapd` | `@agents/cli-replace-tapd.md` | 安装 tapd-ai-cli + 禁用 TAPD MCP |
| `replace-mcp-with-cli` | `gongfeng` / `gongfeng-mcp` | `@agents/cli-replace-gongfeng.md` | 安装 gongfeng-cli + 禁用工蜂 MCP |
| `replace-mcp-with-cli` | `github` / `github-mcp` | `@agents/cli-replace-gh.md` | 安装 gh CLI + 禁用 GitHub MCP |
| `disable-plugin` | — | `@agents/plugin-opt.md` | 修改 settings.json 禁用 Plugin |
| `migrate-plugin` | — | `@agents/plugin-opt.md` | 修改 settings.json 迁移 Plugin 作用域 |
| `memory-md-review` | — | `@agents/memory-md.md` | 精简/优化指令主文件（CODEBUDDY.md / CLAUDE.md / AGENTS.md） |
| `rules-opt` | — | `@agents/rules-opt.md` | 修改 rules 配置 |
| 其他 | — | `@agents/generic.md` | 兜底，按 detail 描述执行 |

> **CLI 替代 Agent 说明**：`replace-mcp-with-cli` 按 `target` 名匹配到对应 CLI 安装 Agent。这些 Agent 会先安装 CLI 工具、引导用户认证、再禁用对应 MCP。安装与禁用解耦：安装失败不影响禁用操作。

### 阶段 5: 回写任务状态

每条任务完成后**立即**回写 `tasks.md`，将该任务对应行的复选框置为已完成：

- 成功 / 已落地修改 → `- [x]`（保留原有等级标签与描述）。
- 失败 → `- [x]` 外加注（如原因），或在原因行追加 `状态: 失败`。
- no-op / 跳过 → 保持 `- [ ]` 不变，或改为 `- [x]` 并在原因行标注 `skipped`。

**每完成一条就改一条，不要等全部结束再批量更新。**

### 阶段 6: 输出执行摘要

所有任务完成后，向用户输出执行摘要：
- 全部成功：`共 N 条任务全部完成，预计节省 ~XXXXX Token`
- 部分失败：`成功 X 条 / 失败 Y 条 / 共 N 条`，列出失败任务 ID 和原因

## 子 Agent 派发规范

每个子 Agent 接收单条任务上下文：
```
operationType: "<type>"
target: "<target>"
title: "<title>"
detail: "<detail>"
id: "<task id>"
```

子 Agent 直接执行系统修改，回报结果给主 SKILL。不产出中间 JSON 文件。

> 本 SKILL 操作对象均为当前 Git 仓库内的受版本管理文件，**无需手动备份，直接修改即可**——误改可由 `git checkout` / `git restore` 还原。仅当任务明确指向仓库外用户配置（如 `~/.codebuddy/settings.json`、`.mcp.json` 等脱离 Git 跟踪的文件）时才先备份再改。

## 边界

- 单个任务失败：记录 `failed` 并继续下一任务（整体流程可见）；如需遇错即停，执行前与用户确认。
- 本 SKILL 仅指导修改，不自动回滚；回滚依赖用户侧备份手动恢复。
- 支持 `codebuddy`/`claude`/`codex` 平台（`stk init`/`stk install --agent` 均生效）；`memory-md` 任务按当前平台实际指令主文件（CODEBUDDY.md / CLAUDE.md / AGENTS.md）处理。
- 子 Agent 详细规则见 `agents/` 目录下对应文件，按需读取。
