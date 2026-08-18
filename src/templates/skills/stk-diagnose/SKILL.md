---
name: stk-diagnose
description: 'AI Agent体检，采集会话的 Token 占用诊断数据'
disable-model-invocation: true
---

# SKILL: stk-diagnose

本 SKILL 指导 AI Agent 执行 `/stk-diagnose` 命令的逻辑。

## 目标

获取当前会话各部分的 Token 占用基线数据。

## 执行流程

1. 检查 `stk` 命令是否已安装（如 `which stk` 或 `stk --version`）。如未安装，先执行安装：
   ```bash
   npm install -g @studyzy/save-token-kit
   # 或
   pnpm add -g @studyzy/save-token-kit
   ```
2. 检测当前 AI Agent 运行环境，选择对应的 `--agent` 参数。一台机器可能同时安装多个 Agent，且 `CODEBUDDY_BASE_URL` 这类**配置类**环境变量可能被用户全局设置（如指向自定义 API 或本工具代理），在任意 Agent 会话里都存在——因此只能以**当前会话注入的会话级环境变量**判定，不能用"是否安装了某个 Agent"或配置类变量判断：
   ```bash
   # CodeBuddy 会话注入的会话级变量（不是配置类变量 CODEBUDDY_BASE_URL）
   if [ -n "$CODEBUDDY_SESSION_ID" ]; then
     AGENT=codebuddy
   # Claude Code 会话会注入 CLAUDE_CODE_SESSION_ID / CLAUDE_PID 环境变量
   elif [ -n "$CLAUDE_CODE_SESSION_ID" ] || [ -n "$CLAUDE_PID" ]; then
     AGENT=claude
   # CodeX 会话会注入 CODEX_HOME（指向其配置目录，如 ~/.codex）
   elif [ -n "$CODEX_HOME" ]; then
     AGENT=codex
   else
     # 无法判定（如普通终端直接运行、或当前版本未注入上述变量）：不要猜测
     AGENT=
   fi
   ```
   若 `AGENT` 为空，先用 `AskUserQuestion` 询问用户当前运行在哪个 Agent 中，确认后再执行：
   ```bash
   stk diagnose --agent "$AGENT" --report-path=./save-token/diagnosis-report.md
   ```
   > 说明：CodeBuddy 为了兼容也会设置 `CLAUDE_SESSION_ID` / `CLAUDE_PROJECT_DIR` 等变量，
   > 因此不能以这些变量判定为 Claude Code；请以 `CLAUDE_CODE_SESSION_ID` / `CLAUDE_PID`（Claude Code 官方注入）为准。
   > 同理，`CODEBUDDY_BASE_URL` 是配置 API 端点/代理的变量（可能被全局设置），不能作为"当前运行在 CodeBuddy"的依据，故仅用 `CODEBUDDY_SESSION_ID` 判定。
3. 读取 `./save-token/diagnosis-report.md`，在对话中展示诊断报告。
4. 提醒用户下一步运行 `/stk-analyze`，基于本次诊断数据给出节省 Token 的优化建议。

## 注意

如实展示`diagnosis-report.md`的内容即可，无需点评或者给出建议。
