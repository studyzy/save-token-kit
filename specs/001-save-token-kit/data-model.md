# 数据模型: Save Token Kit (stk)

**功能**: 001-save-token-kit
**日期**: 2026-07-10

## 1. DiagnosisReport（诊断报告）

`stk diagnose` 输出的 `diagnosis-report.json` 结构。

```typescript
interface DiagnosisReport {
  /** Scan timestamp (ISO 8601) */
  scanTimestamp: string
  /** CodeBuddy CLI version string */
  codebuddyVersion: string
  /** Token usage overview */
  contextOverview: ContextOverview
  /** MCP server list */
  mcpList: McpEntry[]
  /** Skill list */
  skillList: SkillEntry[]
  /** Tool definition breakdown by category */
  toolBreakdown: ToolBreakdown
  /** Warnings detected during scan */
  warnings: string[]
}

interface ContextOverview {
  /** Total estimated tokens */
  totalEstimatedTokens: number
  /** Breakdown by category */
  breakdown: ContextItem[]
}

interface ContextItem {
  /** Category: system-prompt, system-tools, memory-file, skill, mcp-tools, messages */
  type: 'system-prompt' | 'system-tools' | 'memory-file' | 'skill' | 'mcp-tools' | 'messages' | 'rules' | 'hooks'
  /** Human-readable name */
  name: string
  /** Estimated token count */
  estimatedTokens: number
  /** Percentage of total */
  percentage: number
  /** Raw character count (optional) */
  charCount?: number
}

interface McpEntry {
  /** MCP server name (e.g. "playwright", "github") */
  name: string
  /** Status: enabled or disabled */
  status: 'enabled' | 'disabled'
  /** Number of tools defined by this MCP server */
  toolsCount: number
  /** Estimated tokens for tool definitions */
  estimatedTokens: number
  /** Source: user config or project config */
  source: 'user' | 'project'
  /** Whether defer_loading is enabled */
  deferLoading: boolean
  /** Whether a known CLI alternative exists */
  hasCliAlternative: boolean
}

interface SkillEntry {
  /** Skill name */
  name: string
  /** Source: user, project, or plugin-marketplace */
  source: 'user' | 'project' | 'plugin-marketplace'
  /** Estimated tokens consumed by this skill */
  estimatedTokens: number
  /** Whether this is a duplicate skill (already loaded from another source) */
  isDuplicate?: boolean
}

interface ToolBreakdown {
  /** Built-in CodeBuddy tools */
  builtin: ToolCategoryStats
  /** MCP-provided tools */
  mcp: ToolCategoryStats
  /** Deferred-loading tools */
  deferred: ToolCategoryStats
}

interface ToolCategoryStats {
  /** Tool count */
  count: number
  /** Estimated tokens for tool definitions */
  estimatedTokens: number
  /** Tool names */
  names: string[]
}
```

## 2. AnalysisSuggestion（优化建议）— `/stk-analyze` 产出

AI Agent 在 `/stk-analyze` 阶段**必须**将建议以机器可读 JSON 落盘到 `./save-token/analysis.json`，供 `/stk-optimize` 消费。同时可另写人读 Markdown（`analysis.md`）作为展示，但 JSON 是契约主体。

```typescript
interface AnalysisSuggestion {
  /** Suggestion ID（顺序号，如 "S1"） */
  id: string
  /** 建议标题（中文，简短） */
  title: string
  /** 详细说明与理由（中文） */
  detail: string
  /** 操作类型 */
  operationType:
    | 'disable-skill'      // 禁用某个 Skill
    | 'disable-mcp'        // 关闭某个 MCP
    | 'defer-mcp'          // 改为延迟加载 MCP
    | 'replace-mcp-with-cli' // 用 CLI 替代 MCP
    | 'trim-codebuddy-md'  // 精简 CODEBUDDY.md
    | 'trim-file'          // 精简/移动某个配置文件
    | 'install-tool'       // 安装省 Token 工具（RTK/Caveman 等）
    | 'other'
  /** 目标标识（skill 名 / mcp 名 / 文件路径），依 operationType 而定 */
  target?: string
  /** 预估可节省 Token（正整数；无法估算填 0） */
  estimatedSavingTokens: number
  /** 风险等级 */
  risk: 'low' | 'medium' | 'high'
  /** 是否可逆（仅作提示；本期不实现 rollback） */
  reversible: boolean
}

/** analysis.json 文件内容 */
interface AnalysisFile {
  /** 生成时间戳（ISO 8601） */
  generatedAt: string
  /** 来源诊断文件 */
  sourceDiagnosis: string
  /** 建议列表（按预估节省量降序） */
  suggestions: AnalysisSuggestion[]
  /** 预估总节省 Token（各建议之和，可能重叠，仅供参考） */
  totalEstimatedSavingTokens: number
}
```

## 3. OptimizationTask（优化执行结果）— `/stk-optimize` 产出

AI Agent 在 `/stk-optimize` 阶段读取 `analysis.json`，逐条执行，并将**执行结果**以机器可读 JSON 落盘到 `./save-token/tasks.json`。`actualSavingTokens` 在此阶段暂不填写（由 `/stk-report` 基于前后诊断 delta 回填或计算）。

```typescript
interface OptimizationTask {
  /** 关联的建议 ID（对应 AnalysisSuggestion.id） */
  suggestionId: string
  /** 任务描述（中文） */
  description: string
  /** 操作类型（同 AnalysisSuggestion.operationType） */
  operationType: string
  /** 目标标识 */
  target?: string
  /** 执行状态 */
  status: 'completed' | 'failed' | 'skipped' | 'partial'
  /** 预估节省 Token（沿用建议值） */
  estimatedSavingTokens: number
  /** 实际节省 Token（本期由 /stk-report 计算填入；optimize 阶段留空） */
  actualSavingTokens?: number
  /** 风险等级 */
  risk: 'low' | 'medium' | 'high'
  /** 是否可逆（仅提示） */
  reversible: boolean
  /** 失败/部分成功时的错误信息 */
  error?: string
  /** 执行的修改摘要（如 "禁用 skill: foo"） */
  appliedChange?: string
}

/** tasks.json 文件内容 */
interface TasksFile {
  /** 生成时间戳（ISO 8601） */
  generatedAt: string
  /** 任务列表 */
  tasks: OptimizationTask[]
  /** 预估总节省 Token */
  totalEstimatedSavingTokens: number
}
```

## 4. SaveTokenReport（优化结果对比报告）— `/stk-report` 产出

AI Agent 在 `/stk-report` 阶段读取 `diagnosis-report.md`（前）、`diagnosis-report2.md`（后）与 `tasks.json`，**必须**将对比结果以机器可读 JSON 落盘到 `./save-token/save-token-report.json`。`actualSavingTokens` 由前后诊断的 Token 差值按任务归因计算。

```typescript
interface SaveTokenReport {
  /** 报告生成时间戳（ISO 8601） */
  generatedAt: string
  /** 优化前诊断来源 */
  beforeSource: string
  /** 优化后诊断来源 */
  afterSource: string
  /** 优化前总 Token */
  beforeTotalTokens: number
  /** 优化后总 Token */
  afterTotalTokens: number
  /** 各分类 Token 变化 */
  changes: TokenChange[]
  /** 任务执行结果（与 tasks.json 对齐） */
  taskResults: TaskResult[]
  /** 总体节省汇总 */
  summary: SavingsSummary
}

interface TokenChange {
  /** 分类（同 ContextItem.type） */
  category: string
  /** 优化前 Token */
  beforeTokens: number
  /** 优化后 Token */
  afterTokens: number
  /** 绝对变化（负为节省） */
  deltaTokens: number
  /** 百分比变化 */
  deltaPercentage: number
}

interface TaskResult {
  /** 关联建议/任务 ID */
  suggestionId: string
  /** 任务描述 */
  description: string
  /** 操作类型 */
  operationType: string
  /** 执行状态 */
  status: 'completed' | 'failed' | 'skipped' | 'partial'
  /** 预估节省 */
  estimatedSavingTokens: number
  /** 实际节省（由前后诊断 delta 归因计算） */
  actualSavingTokens: number
  /** 偏差说明（如 "实际与预估不符：MCP 仍被部分加载"） */
  deviation?: string
  /** 错误信息 */
  error?: string
}

interface SavingsSummary {
  /** 总节省 Token（beforeTotalTokens - afterTotalTokens） */
  totalSavedTokens: number
  /** 节省百分比 */
  savingsPercentage: number
  /** 完成任务数 */
  completedTasks: number
  /** 失败任务数 */
  failedTasks: number
  /** 跳过任务数 */
  skippedTasks: number
  /** 部分成功任务数 */
  partialTasks: number
}
```

> **实际节省计算规则**：`totalSavedTokens = beforeTotalTokens - afterTotalTokens`（直接来自两个 `.md` 报告的总 Token）。`taskResults[].actualSavingTokens` 由 Agent 将总节省按各任务的影响分类归因填写；若无法归因，可统一记为 0 并在 `deviation` 说明。本期不实现自动精确归因。

## 5. ProxyCapture（代理捕获数据）

Proxy 中间层数据结构。

```typescript
interface ProxyCapture {
  /** Raw POST request body */
  rawBody: unknown
  /** Parsed diagnosis data */
  parsed: ProxyDiagnosisData
  /** Timestamp of capture */
  capturedAt: string
}

interface ProxyDiagnosisData {
  /** Message breakdown */
  messages: {
    /** Message count by role */
    roleCounts: Record<string, number>
    /** Token count by role */
    roleTokens: Record<string, number>
    /** Detailed message breakdown */
    breakdown: MessageBreakdown[]
  }
  /** Tool definitions breakdown */
  tools: {
    /** Built-in tools */
    builtin: ToolDef[]
    /** MCP tools */
    mcp: ToolDef[]
    /** Deferred tools */
    deferred: ToolDef[]
  }
  /** Detected skills */
  skills: DetectedSkill[]
  /** Detected MCP servers (from mcp__ prefix) */
  mcpServers: McpServerDetection[]
  /** Total estimated tokens */
  totalEstimatedTokens: number
}

interface MessageBreakdown {
  role: string
  index: number
  contentType: 'text' | 'array'
  estimatedTokens: number
  charLength: number
  snippet: string
}

interface ToolDef {
  name: string
  estimatedTokens: number
}

interface DetectedSkill {
  name: string
  source: string
  estimatedTokens: number
}

interface McpServerDetection {
  serverName: string
  toolCount: number
  estimatedTokens: number
}
```

## 6. 实体关系图

```
DiagnosisReport (diagnosis-report.json)
       └── 重定向保存为 ─── diagnosis-report.md (前) / diagnosis-report2.md (后)

AnalysisSuggestion[] ─── /stk-analyze 产出 ─── analysis.json
       │
       └── 被消费 ─── /stk-optimize

OptimizationTask[] ─── /stk-optimize 产出 ─── tasks.json
       │
       └── referenced by ─── SaveTokenReport.taskResults[]

SaveTokenReport ─── compares ─── diagnosis-report.md (before)
       │                    └── diagnosis-report2.md (after)
       └── references ─── tasks.json (OptimizationTask[])
```

> **落盘约定（契约核心）**：`/stk-analyze`、`/stk-optimize`、`/stk-report` 三个阶段**都必须**生成对应的机器可读 JSON（`analysis.json` / `tasks.json` / `save-token-report.json`）。人读 Markdown 为可选展示，不得作为阶段间数据传递的唯一载体，否则 `/stk-report` 无法程序化计算 Token 差值与任务归因。

> **rollback 已移除**：本期不实现 `stk rollback` 与 `BackupRecord`，`reversible` 字段仅作风险提示，不产生备份动作。
