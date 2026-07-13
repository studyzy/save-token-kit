---
name: stk:diagnose
description: '诊断当前 CodeBuddy 会话的 Token 占用，采集 System Prompt / Tools / Skills / Messages 各部分用量'
argument-hint: ''
---

# /stk-diagnose

诊断当前 AI Agent 环境的 Token 占用情况。

## 步骤

1. 检查 `stk` 命令是否已安装（如 `which stk` 或 `stk --version`）。如未安装，先执行安装：
   ```bash
   npm install -g save-token-kit
   # 或
   pnpm add -g save-token-kit
   ```
2. 运行以下命令采集并保存诊断数据（无条件执行）：
   ```bash
   stk diagnose >> ./save-token/diagnosis-report.md
   ```
3. 读取 `./save-token/diagnosis-report.md`，在对话中展示诊断报告。
4. 如 `warnings` 字段非空，高亮提示用户（如 MCP 工具过多、Skills 占用过高等）。

## 注意

如实展示`diagnosis-report.md`的内容即可，无需点评或者给出建议。
