# Proposal: usage-history-analyzer

## Why

stk-analyze 目前判定"哪些 Skill / MCP / 工具不常用"时只有磁盘扫描数据（装没装）和用户口述（`AnalysisContext.purpose`），`SkillEntry.usageFrequency` 仅是提示字段、没有真实数据来源，导致"已装未用 → 建议禁用"这类高价值建议缺乏证据、容易误伤。

而用户的真实行为数据已经存在于本机：CodeBuddy 把每次会话的工具调用记录在 `~/.codebuddy/projects/**/*.jsonl`（`type: "function_call"` 记录）。参考 `/tmp/analyze_codebuddy_usage.py` 的验证脚本，Tool 调用与 Skill 使用排名可以直接统计出来，SubAgent（Task/Agent 调用的 `subagent_type`）与 MCP 工具（`mcp__server__tool` 命名前缀）同样可统计。将这些统计产品化为 stk 的采集能力，"未使用 / 低频"判定即可从猜测变成有证据的结论。

## What Changes

- **新增**会话历史采集器（`src/collectors/usage-collector.ts`）：流式扫描 `~/.codebuddy/projects/**/*.jsonl`，逐行解析 `function_call` 记录，统计四类使用数据：
  - Tool 调用次数（区分 builtin / mcp）
  - Skill 调用次数（Skill 工具调用，按 `skill` 参数细分）
  - SubAgent 调用次数（Task/Agent 工具调用，按 `subagent_type` 参数细分）
  - MCP 工具调用次数（按 `mcp__<server>__<tool>` 前缀归到 server）
- **新增**时间分桶统计：全部 / 最近 90 天 / 最近 30 天，低频判定看近期窗口。
- **新增**数据契约 `UsageReport`（`usage-report.json`，输出到 `save-token/` 目录），含每类调用的排名、总计与扫描元信息（文件数、解析失败行数）。
- **新增** CLI 命令 `stk usage`：独立产出使用报告（`--json` 输出机器可读格式）。
- **扩展** `DiagnosisReport` 增加可选字段 `usageStats`：`stk diagnose` 在 CodeBuddy 平台自动附带使用统计，供 `/stk-analyze` 各优化 agent（tool-enable / mcp-opt / rules-opt 等）把"装了但从未用过"作为建议 evidence，过滤误判。
- **扩展** `PlatformConfigPaths` 增加可选 `sessionsDir` 字段（CodeBuddy 为 `~/.codebuddy/projects`），首版仅实现 CodeBuddy，字段预留多平台扩展；其他平台无该目录时采集器返回空结果、不报错。

不做的事（明确排除）：

- 不统计会话内容文本（prompt/response），只统计工具调用事件，避免读取敏感对话。
- 不自动修改任何配置——报告只是数据，优化动作仍由 /stk-analyze 工作流驱动。
- 首版不做 Claude / CodeX / WorkBuddy 的会话格式解析（三者 JSONL 结构与 CodeBuddy 不同）。

## Capabilities

### New Capabilities

- `usage-history-analyzer`: 扫描 CodeBuddy 会话历史 JSONL，统计 Tool / Skill / SubAgent / MCP 工具的使用频率（含时间分桶），产出 `usage-report.json` 使用报告，并作为 `stk diagnose` 报告的可选 `usageStats` 字段供优化分析引用。

### Modified Capabilities

（无——项目尚无已注册 specs，本变更为首个能力。）

## Impact

- **新增文件**：`src/collectors/usage-collector.ts`、`src/commands/usage.ts`
- **修改文件**：
  - `src/types/index.ts` — 新增 `UsageReport` 及相关类型；`DiagnosisReport.usageStats?`
  - `src/cli.ts` — 注册 `usage` 命令
  - `src/commands/diagnose.ts` — 集成使用统计采集（仅 CodeBuddy）
  - `src/adapters/platform-adapter.ts` / `src/adapters/codebuddy-adapter.ts` — `PlatformConfigPaths.sessionsDir?`
- **下游受益**：`/stk-analyze` 的建议生成可引用 `usageStats` 作为 evidence（`AnalysisSuggestion.evidence`），降低"误删在用配置"的风险。
- **性能**：JSONL 逐行流式解析，不整文件读入内存；单次扫描为本地磁盘 IO，秒级完成。
- **测试**：新增 `tests/unit/collectors/usage-collector.test.ts`（构造样例 JSONL）与 diagnose 集成断言。
