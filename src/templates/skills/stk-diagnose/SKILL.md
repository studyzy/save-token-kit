---
name: stk-diagnose
description: "采集 CodeBuddy 会话的 Token 占用诊断数据，供后续分析与优化使用"
argument-hint: ""
---

# SKILL: stk-diagnose

本 SKILL 指导 AI Agent 执行 `/stk-diagnose` 命令的逻辑。

## 目标

获取当前会话各部分的 Token 占用基线数据。

## 执行流程

1. 检查 `./save-token/diagnosis-report.json` 是否存在。
2. 若不存在，调用：
   ```bash
   stk diagnose >> ./save-token/diagnosis-report.md
   ```
   说明：`diagnosis-report.json` 每次覆盖，`diagnosis-report.md` 为首次基线；优化后需用 `>> diagnosis-report2.md` 保存第二次。
3. 读取 `diagnosis-report.json`，向用户展示：
   - 总 Token 与各分类占比
   - MCP 服务器、Skills 列表
   - warnings 高亮提示
4. 告知用户：后续对比以两个 `.md` 文件为准。

## 边界

- 不修改任何配置文件，仅采集与展示数据。
- 若 `stk` 未安装，提示 `npm install -g save-token-kit`。
