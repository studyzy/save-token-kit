# Spec Delta

## Purpose

扫描 CodeBuddy 会话历史 JSONL，统计 Tool / Skill / SubAgent / MCP 工具的真实调用频率（按时间分桶），产出 `usage-report.json` 使用报告，并作为 `stk diagnose` 报告的可选字段，让"已装未用 / 低频"类优化建议拥有真实行为证据。

## ADDED Requirements

### Requirement: 会话历史扫描与 Tool 统计

系统 SHALL 扫描指定会话目录（CodeBuddy 为 `~/.codebuddy/projects`）及其子目录下所有 `.jsonl` 文件，逐行解析 `type` 为 `function_call` 的记录，按记录中的工具名（`name`）统计调用次数，并记录扫描元信息（扫描文件数、解析失败行数、无时间戳记录数）。

#### Scenario: 统计工具调用排名

- **WHEN** 会话目录下存在包含 `function_call` 记录的 `.jsonl` 文件
- **THEN** 每个工具名的调用次数被正确统计，且可按次数降序输出排名

#### Scenario: 容忍非法行

- **WHEN** 某一行不是合法 JSON、或其 `type` 不是 `function_call`、或缺少工具名
- **THEN** 跳过该行继续解析，非法 JSON 行计入解析失败计数，扫描不中断

#### Scenario: 会话目录不存在或为空

- **WHEN** 指定的会话目录不存在或没有任何 `.jsonl` 文件
- **THEN** 返回空统计（所有计数为 0），`filesScanned` 为 0，不抛出错误

### Requirement: Skill / SubAgent / MCP 维度细分

除工具总榜外，系统 SHALL 统计三类细分维度：

1. **Skill 使用**：工具名为 `Skill` 的调用，从其 `arguments` 中提取 `skill`（或 `command`）参数作为 skill 名计数；无法提取时计入 `<unknown>`。
2. **SubAgent 使用**：工具名为 `Task` 或 `Agent` 的调用，从其 `arguments` 中提取 `subagent_type`（或 `name`）参数作为 agent 名计数。
3. **MCP 工具使用**：工具名匹配 `mcp__<server>__<tool>` 前缀约定的调用，同时按 server 维度与工具维度计数。

#### Scenario: Skill 名称提取

- **WHEN** 存在 `name` 为 `Skill` 且 `arguments` 中含 `skill` 参数的调用记录
- **THEN** 该调用计入对应 skill 名的使用次数，而非仅计入 `Skill` 工具总次数

#### Scenario: SubAgent 调用计数

- **WHEN** 存在 `name` 为 `Task` 或 `Agent` 且 `arguments` 中含 `subagent_type` 参数的调用记录
- **THEN** 该调用计入对应 agent 名的使用次数

#### Scenario: MCP 调用归并到 server

- **WHEN** 工具名形如 `mcp__playwright__browser_navigate`
- **THEN** 该调用同时计入 `playwright` server 的使用次数与该完整工具名的使用次数

### Requirement: 时间分桶统计

系统 SHALL 以扫描时刻为基准，按三个时间窗口分别统计上述各类数据：全部、最近 90 天、最近 30 天。调用记录的时间戳（`timestamp`，毫秒）早于某窗口起点时不计入该窗口；记录缺少时间戳时仅计入"全部"窗口。

#### Scenario: 近期调用计入所有窗口

- **WHEN** 一条调用记录的时间戳在最近 30 天内
- **THEN** 该调用同时计入"全部"、"最近 90 天"、"最近 30 天"三个窗口的统计

#### Scenario: 久远调用仅计入全部

- **WHEN** 一条调用记录的时间戳早于最近 90 天窗口起点
- **THEN** 该调用仅计入"全部"窗口的统计

### Requirement: 使用报告产出

系统 SHALL 提供独立命令（`stk usage`）产出使用报告：默认在 `save-token/` 目录写出 `usage-report.json` 并在终端以可读文本展示各类排名；`--json` 时将完整报告输出到 stdout。报告 MUST 包含扫描时间、扫描目录、扫描文件数、解析失败行数、三个时间窗口下各维度的排名与总计。

#### Scenario: 报告文件生成

- **WHEN** 用户在项目目录运行 `stk usage`
- **THEN** `save-token/usage-report.json` 被生成，包含全部统计字段，且终端展示各类排名前若干项

#### Scenario: 机器可读输出

- **WHEN** 用户运行 `stk usage --json`
- **THEN** 完整使用报告以 JSON 格式输出到 stdout，不写入额外提示文本

### Requirement: 诊断报告集成

`stk diagnose` 在目标平台存在会话目录时 SHALL 自动执行使用统计，并将结果填入 `DiagnosisReport` 的可选字段 `usageStats`。使用统计采集失败时 MUST NOT 阻断诊断主流程：`usageStats` 缺省，诊断其余部分照常产出。

#### Scenario: 诊断自动附带使用统计

- **WHEN** 用户运行 `stk diagnose --agent codebuddy` 且 `~/.codebuddy/projects` 存在
- **THEN** 产出的 `diagnosis-report.json` 含 `usageStats` 字段

#### Scenario: 采集失败降级

- **WHEN** 使用统计扫描过程中发生读取错误
- **THEN** 诊断流程继续执行，报告不含 `usageStats` 字段（或含错误说明），且不产生命令级失败

### Requirement: 隐私边界

使用统计 MUST 只读取工具调用事件（工具名与参数中的标识字段，如 skill 名、subagent_type），SHALL NOT 将会话正文（用户消息、助手回复文本）写入使用报告或诊断报告。

#### Scenario: 报告不含会话正文

- **WHEN** 会话 JSONL 中包含任意用户或助手消息文本
- **THEN** 产出的使用报告与 `usageStats` 中不出现这些文本内容
