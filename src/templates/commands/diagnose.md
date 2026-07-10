---
name: stk-diagnose
description: "诊断当前 CodeBuddy 会话的 Token 占用，采集 System Prompt / Tools / Skills / Messages 各部分用量"
argument-hint: ""
---

# /stk-diagnose

诊断当前 AI Agent 环境的 Token 占用情况。

## 步骤

1. 检查 `./save-token/` 目录是否存在诊断数据（`diagnosis-report.json`）。
2. 如不存在，运行以下命令采集数据（首次诊断报告需手动重定向保存）：
   ```bash
   stk diagnose >> ./save-token/diagnosis-report.md
   ```
3. 读取 `./save-token/diagnosis-report.json`（最近一次结构化数据），在对话中展示诊断摘要：
   - Token 总占用与各分类（System Prompt / Tools / Skills / Messages）占比
   - MCP 服务器列表与工具数
   - Skills 列表
4. 如 `warnings` 字段非空，高亮提示用户（如 MCP 工具过多、Skills 占用过高等）。

## 说明

- 对比优化前后的效果以两个 `.md` 文件为准：`diagnosis-report.md`（前）、`diagnosis-report2.md`（后）。
- `diagnosis-report.json` 每次被覆盖，不保留历史，不用于对比。
- 如需重新诊断（优化后），运行 `stk diagnose >> ./save-token/diagnosis-report2.md`。
