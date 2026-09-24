# Tasks

## 1. 类型契约与平台路径

- [x] 1.1 在 `src/types/index.ts` 新增 `UsageRankItem` / `UsageDimension` / `UsageTimeBucket` / `UsageStats` 类型，并为 `DiagnosisReport` 增加可选字段 `usageStats?: UsageStats`；验证 `pnpm build` 通过（design D4）
- [x] 1.2 在 `src/adapters/platform-adapter.ts` 的 `PlatformConfigPaths` 增加可选 `sessionsDir?: string`，在 `src/adapters/codebuddy-adapter.ts` 填 `${dir}/projects`（其余 adapter 不填）；验证 `pnpm build` 通过且 `stk diagnose` 现有行为不变（`pnpm test`）

## 2. 使用统计采集器

- [x] 2.1 实现 `src/collectors/usage-collector.ts`：`collectUsageStats({ sessionsDir, now? })`，流式逐行扫描 `.jsonl`、行级快筛 `"function_call"`、解析 Tool 调用并按 全部/90天/30天 分桶计数，记录 `filesScanned` / `parseErrors` / `missingTimestamp`（design D1、D3）；验证目录不存在时返回全零统计不抛错
- [x] 2.2 实现细分维度：Skill（`skill ?? command`，兜底 `<unknown>`）、SubAgent（`Task`/`Agent` 的 `subagent_type ?? name`）、MCP（`mcp__<server>__<tool>` 拆 server 与全名两维度）；验证 `arguments` 为字符串/对象/不可解析三种形态均被正确处理
- [x] 2.3 编写 `tests/unit/collectors/usage-collector.test.ts`：构造样例 JSONL 覆盖 specs 全部场景（排名统计、非法行容忍、目录为空、Skill/SubAgent/MCP 提取、时间分桶、缺时间戳归"全部"）；验证 `pnpm vitest run tests/unit/collectors/usage-collector.test.ts` 通过

## 3. CLI 命令与诊断集成

- [x] 3.1 实现 `src/commands/usage.ts`（`runUsage({ json })`）：调用采集器，默认写 `save-token/usage-report.json` 并终端展示各类排名（rank/name/count/百分比），`--json` 时完整报告输出到 stdout；验证真实 `~/.codebuddy/projects` 上运行 `stk usage` 与 `stk usage --json` 输出符合 specs
- [x] 3.2 在 `src/cli.ts` 注册 `usage` 命令；验证 `stk usage --help` 生效
- [x] 3.3 在 `src/commands/diagnose.ts` 集成：`sessionsDir` 存在时采集并填入 `DiagnosisReport.usageStats`，try/catch 降级（失败不留字段、不阻断主流程）（design D5）；验证 `tests/integration/` 诊断用例新增断言：含会话目录时报告带 `usageStats`、扫描抛错时报告仍正常产出

## 4. 全量验证

- [x] 4.1 运行 `pnpm lint && pnpm cover`：lint 无错误、测试全过且覆盖率 ≥ 60%
- [x] 4.2 端到端冒烟：对本机真实历史运行 `stk usage`，抽查排名与 `/tmp/analyze_codebuddy_usage.py` 的输出量级一致（同口径抽样对比）
