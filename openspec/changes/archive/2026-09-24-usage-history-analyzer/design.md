# Design

## Context

CodeBuddy 将会话事件流记录在 `~/.codebuddy/projects/<编码后的项目路径>/*.jsonl`，其中工具调用事件的形态为 `{type: "function_call", name, arguments, timestamp}`（`timestamp` 为毫秒数；`arguments` 为 JSON 字符串或对象）。`/tmp/analyze_codebuddy_usage.py` 已在该格式上验证了 Tool/Skill 排名统计的可行性。本变更将其产品化为 stk 的采集能力。动机参见 proposal.md 的 Why 章节。

现状约束：

- 采集器体系已存在于 `src/collectors/`（`fs-collector.ts` 读磁盘配置、`token-estimator.ts` 估算），诊断主流程在 `src/commands/diagnose.ts`，平台路径由 `PlatformAdapter.getConfigPaths()` 提供（`src/adapters/platform-adapter.ts`）。
- 既有 `PlatformConfigPaths` 无会话目录字段，需要扩展。
- `DiagnosisReport`（`src/types/index.ts`）已允许可选字段渐进扩展（`pluginList?`、`hookList?` 等），`usageStats?` 沿用该模式。
- 项目无运行时依赖负担偏好：CLI 已依赖 Node 内置模块为主，避免为扫描引入 glob 类依赖。

## Goals / Non-Goals

**Goals:**

- 单文件可测的采集器：输入目录路径，输出结构化统计（依赖注入目录路径，不直接耦合 adapter，便于构造样例 JSONL 做单测）。
- 流式低内存：逐行读取 + 行级快筛，支撑大体量历史目录。
- 一份数据两个出口：`stk usage` 独立报告 + `stk diagnose` 自动附带 `usageStats`。
- 对下游 `/stk-analyze` 可直接引用：字段命名与 `AnalysisSuggestion.evidence` 的引用方式兼容。

**Non-Goals:**

- 不解析 Claude / CodeX / WorkBuddy 的会话格式（三者 JSONL 结构不同，`sessionsDir` 字段预留）。
- 不做按项目维度的拆分统计（首版全量合并；目录内文件名已含项目编码路径，后续可加）。
- 不做内容级分析（prompt 长度、响应 token 等），只统计调用事件。
- 不基于使用数据自动给出优化建议——判定逻辑仍在 `/stk-analyze` 工作流中，本变更只供数。

## Decisions

### D1: 流式逐行解析，行级快筛前置

沿用 Python 验证脚本的两级过滤：先 `line.includes('"function_call"')` 粗筛，命中才 `JSON.parse`。用 `node:fs` 的 `createReadStream` + `readline` 逐行处理。

- 备选：整文件 `readFile` 后 split——长会话 JSONL 可达数十 MB，多文件并发时内存峰值不可控；`readFile` + 正则提取虽然更快，但放弃错误行定位能力（`parseErrors` 计数需要行级 parse）。
- 快筛字符串的误判（普通消息文本里恰好含 `"function_call"`）无害：`JSON.parse` 后 `type` 不匹配即跳过。

### D2: 采集器签名与目录来源解耦

`collectUsageStats(options: { sessionsDir: string; now?: number })`：目录路径由调用方传入（diagnose 从 `adapter.getConfigPaths().sessionsDir` 取，CLI 命令同）。`now` 可注入以便测试时间分桶。

- 备选：采集器内部调 `getAdapter(name)`——增加耦合，且无法对"目录不存在"等分支做纯文件系统级单测。
- `PlatformConfigPaths` 增加可选 `sessionsDir?: string`，仅 codebuddy-adapter 填 `${dir}/projects`；其余 adapter 不填，诊断侧以"字段为 undefined → 跳过采集"处理，无需逐平台适配。

### D3: 事件识别规则（对齐验证脚本，适度增强）

- `type === 'function_call'` 且 `name` 非空才计数。
- 时间戳：`typeof timestamp === 'number'` 则 `ts = timestamp / 1000` 与 30/90 天 cutoff 比较；缺失时仅计入"全部"桶并计入 `missingTimestamp`。
- Skill 名：`name === 'Skill'` 时解析 `arguments`（字符串则 `JSON.parse`），取 `skill ?? command`，非字符串或缺失 → `<unknown>`。
- SubAgent 名：`name === 'Task' || name === 'Agent'` 时取 `subagent_type ?? name` 参数，缺失 → `<unknown>`。
- MCP：`name.startsWith('mcp__')` 时按 `mcp__<server>__<tool>` 拆出 server 与完整工具名，两个维度分别计数。与 `src/proxy/parser-core.ts` 的 `classifyTool` 语义一致但不在其上扩展——那是请求体 tools 数组的分类入口，此处是历史事件流，强行复用会引入无谓耦合；前缀约定本身是稳定契约。
- `arguments` 解析失败不进 `parseErrors`（记录本体合法，只是参数不可解析），按 `<unknown>` 计入对应维度或不计入细分维度（仍计入工具总次数）。

### D4: 数据契约——独立 `UsageReport` + 诊断内嵌 `usageStats`

`src/types/index.ts` 新增：

```ts
interface UsageRankItem { name: string; count: number }
interface UsageDimension { total: number; ranking: UsageRankItem[] }
interface UsageTimeBucket { all: UsageDimension; last90Days: UsageDimension; last30Days: UsageDimension }
interface UsageStats {
  scannedAt: string
  sessionsDir: string
  filesScanned: number
  parseErrors: number
  missingTimestamp: number
  toolUsage: UsageTimeBucket
  skillUsage: UsageTimeBucket
  subagentUsage: UsageTimeBucket
  mcpServerUsage: UsageTimeBucket   // 仅 server 维度
  mcpToolUsage: UsageTimeBucket     // mcp__ 全名维度
}
```

- 报告文件 `save-token/usage-report.json` 的内容即 `UsageStats`（`stk usage` 直接序列化；`DiagnosisReport.usageStats?: UsageStats` 内嵌同构数据，下游不需要读第二个文件）。
- 备选：诊断报告只存 `usage-report.json` 的文件路径引用——但 `/stk-analyze` 子 agent 在分析时就要多一次文件读取与存在性判断，直接内嵌更符合既有可选字段（如 `proxyDetails`）内嵌数据的先例。

### D5: CLI 与诊断集成点

- `stk usage [--json]`：注册于 `src/cli.ts`，实现在 `src/commands/usage.ts`，复用 `SAVE_TOKEN_DIR` 常量写 `usage-report.json`；文本输出复用现有排名展示风格（rank / name / count / 百分比）。
- `runDiagnose`：在组装报告前，若 `sessionsDir` 存在则 `try { usageStats = collectUsageStats(...) } catch { /* 忽略，留空 */ }`。失败静默降级不阻断，与 specs 的降级场景一致。

## Risks / Trade-offs

- [CodeBuddy 会话 JSONL 是私有格式，版本升级可能变更事件结构] → 解析器对未知行完全容忍（跳过 + 计数），单测锁定当前已验证格式；`parseErrors` 暴露在报告中，格式漂移可被发现。
- [历史目录可能包含大量/超大 JSONL 文件，扫描耗时] → 流式 + 快筛把成本压到单遍磁盘读；不做并发读（复杂度不值当），必要时后续加文件级并行。
- [统计只能证明"用过"，不能证明"没用过"（用户清过历史 / 换机器 / 会话文件被轮转）] → 报告含 `filesScanned` 与 `scannedAt`；在报告元信息中约定：`filesScanned === 0` 时下游不得得出"未使用"结论，避免 /stk-analyze 误建议禁用。
- [Skill 名从 arguments 提取依赖参数形态，不同版本可能用 `command` 或嵌套结构] → 双键兜底（`skill ?? command`）+ `<unknown>` 兜底计数，保证总次数守恒、细分有损但不丢量。

## Migration Plan

纯新增能力，无存量数据迁移。`DiagnosisReport.usageStats` 为可选字段，旧消费方（/stk-analyze 各 agent）不受影响；下游接入（把 usageStats 用进建议 evidence）属于 /stk-analyze 侧的后续变更，不在本变更实现范围内。

## Open Questions

（无——按项目维度过滤、多平台会话格式支持均已明确列为 Non-Goal，留待后续独立变更。）
