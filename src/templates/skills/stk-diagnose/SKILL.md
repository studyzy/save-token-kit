---
name: stk-diagnose
description: '采集 CodeBuddy 会话的 Token 占用诊断数据，供后续分析与优化使用'
argument-hint: ''
---

# SKILL: stk-diagnose

本 SKILL 指导 AI Agent 执行 `/stk-diagnose` 命令的逻辑。

## 目标

获取当前会话各部分的 Token 占用基线数据。

## 执行流程

1. 检查 `stk` 命令是否已安装（如 `which stk` 或 `stk --version`）。如未安装，先执行安装：
   ```bash
   npm install -g save-token-kit
   # 或
   pnpm add -g save-token-kit
   ```
2. 运行以下命令采集并保存诊断数据（无条件执行）：
   ```bash
   stk diagnose --report-path=./save-token/diagnosis-report.md
   ```
3. 读取 `./save-token/diagnosis-report.md`，在对话中展示诊断报告。

## 注意

如实展示`diagnosis-report.md`的内容即可，无需点评或者给出建议。
