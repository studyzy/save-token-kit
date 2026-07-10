/**
 * Shared type definitions and JSON contracts for Save Token Kit (stk).
 * Contracts mirror the data-model.md spec:
 *   - DiagnosisReport    (diagnosis-report.json, from `stk diagnose`)
 *   - AnalysisFile       (analysis.json, from `/stk-analyze`)
 *   - TasksFile          (tasks.json, from `/stk-optimize`)
 *   - SaveTokenReport    (save-token-report.json, from `/stk-report`)
 *   - ProxyDiagnosisData (intermediate parsed capture)
 */

// ---------------------------------------------------------------------------
// 1. DiagnosisReport (diagnosis-report.json)
// ---------------------------------------------------------------------------

export type ContextItemType =
  | 'system-prompt'
  | 'system-tools'
  | 'memory-file'
  | 'skill'
  | 'mcp-tools'
  | 'messages'
  | 'rules'
  | 'hooks'

export interface ContextItem {
  /** Category of the context item */
  type: ContextItemType
  /** Human-readable name */
  name: string
  /** Estimated token count */
  estimatedTokens: number
  /** Percentage of total */
  percentage: number
  /** Raw character count (optional) */
  charCount?: number
}

export interface ContextOverview {
  /** Total estimated tokens */
  totalEstimatedTokens: number
  /** Breakdown by category */
  breakdown: ContextItem[]
}

export interface McpEntry {
  /** MCP server name (e.g. "playwright", "github") */
  name: string
  /** Status: enabled | disabled */
  status: 'enabled' | 'disabled'
  /** Number of tools defined by this MCP server */
  toolsCount: number
  /** Estimated tokens of tool definitions */
  estimatedTokens: number
  /** Source file path */
  source?: string
}

export interface SkillEntry {
  /** Skill name */
  name: string
  /** Source location */
  source?: string
  /** Estimated tokens */
  estimatedTokens: number
  /** Usage frequency hint (optional) */
  usageFrequency?: 'high' | 'medium' | 'low'
}

export interface ToolCategoryStats {
  /** Tool count */
  count: number
  /** Estimated tokens of tool definitions */
  estimatedTokens: number
  /** Tool names */
  names: string[]
}

export interface ToolBreakdown {
  /** Built-in (always-loaded) tools */
  builtin: ToolCategoryStats
  /** MCP-provided tools */
  mcp: ToolCategoryStats
  /** Deferred-loading tools */
  deferred: ToolCategoryStats
}

export interface DiagnosisReport {
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

// ---------------------------------------------------------------------------
// 2. AnalysisSuggestion (analysis.json, from /stk-analyze)
// ---------------------------------------------------------------------------

export type OperationType =
  | 'disable-skill'
  | 'disable-mcp'
  | 'defer-mcp'
  | 'replace-mcp-with-cli'
  | 'trim-codebuddy-md'
  | 'trim-file'
  | 'install-tool'
  | 'other'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface AnalysisSuggestion {
  /** Suggestion ID (sequential, e.g. "S1") */
  id: string
  /** Short title (Chinese) */
  title: string
  /** Detailed explanation and rationale (Chinese) */
  detail: string
  /** Type of operation */
  operationType: OperationType
  /** Target identifier (skill name / mcp name / file path) */
  target?: string
  /** Estimated tokens that can be saved (positive integer; 0 if unknown) */
  estimatedSavingTokens: number
  /** Risk level */
  risk: RiskLevel
  /** Whether the change is reversible (hint only; rollback not implemented) */
  reversible: boolean
}

export interface AnalysisFile {
  /** Generation timestamp (ISO 8601) */
  generatedAt: string
  /** Source diagnosis file */
  sourceDiagnosis: string
  /** Suggestions sorted by estimated saving (descending) */
  suggestions: AnalysisSuggestion[]
  /** Total estimated saving tokens (sum, may overlap — reference only) */
  totalEstimatedSavingTokens: number
}

// ---------------------------------------------------------------------------
// 3. OptimizationTask (tasks.json, from /stk-optimize)
// ---------------------------------------------------------------------------

export type TaskStatus = 'completed' | 'failed' | 'skipped' | 'partial'

export interface OptimizationTask {
  /** Related suggestion ID (matches AnalysisSuggestion.id) */
  suggestionId: string
  /** Task description (Chinese) */
  description: string
  /** Operation type (same as AnalysisSuggestion.operationType) */
  operationType: string
  /** Target identifier */
  target?: string
  /** Execution status */
  status: TaskStatus
  /** Estimated saving tokens (carried from suggestion) */
  estimatedSavingTokens: number
  /** Actual saving tokens (filled by /stk-report; empty during optimize) */
  actualSavingTokens?: number
  /** Risk level */
  risk: RiskLevel
  /** Whether reversible (hint only) */
  reversible: boolean
  /** Error message on failure/partial */
  error?: string
  /** Summary of applied change (e.g. "disabled skill: foo") */
  appliedChange?: string
}

export interface TasksFile {
  /** Generation timestamp (ISO 8601) */
  generatedAt: string
  /** Task list */
  tasks: OptimizationTask[]
  /** Total estimated saving tokens */
  totalEstimatedSavingTokens: number
}

// ---------------------------------------------------------------------------
// 4. SaveTokenReport (save-token-report.json, from /stk-report)
// ---------------------------------------------------------------------------

export interface TokenChange {
  /** Category (same as ContextItem.type) */
  category: string
  /** Tokens before optimization */
  beforeTokens: number
  /** Tokens after optimization */
  afterTokens: number
  /** Absolute change (negative = saving) */
  deltaTokens: number
  /** Percentage change */
  deltaPercentage: number
}

export interface TaskResult {
  /** Related suggestion/task ID */
  suggestionId: string
  /** Task description */
  description: string
  /** Operation type */
  operationType: string
  /** Execution status */
  status: TaskStatus
  /** Estimated saving */
  estimatedSavingTokens: number
  /** Actual saving (attributed from before/after delta) */
  actualSavingTokens: number
  /** Deviation note when actual differs from estimate */
  deviation?: string
  /** Error message */
  error?: string
}

export interface SavingsSummary {
  /** Total saved tokens (before - after) */
  totalSavedTokens: number
  /** Savings percentage */
  savingsPercentage: number
  /** Completed task count */
  completedTasks: number
  /** Failed task count */
  failedTasks: number
  /** Skipped task count */
  skippedTasks: number
  /** Partially completed task count */
  partialTasks: number
}

export interface SaveTokenReport {
  /** Report generation timestamp (ISO 8601) */
  generatedAt: string
  /** Before-optimization diagnosis source */
  beforeSource: string
  /** After-optimization diagnosis source */
  afterSource: string
  /** Total tokens before optimization */
  beforeTotalTokens: number
  /** Total tokens after optimization */
  afterTotalTokens: number
  /** Token changes per category */
  changes: TokenChange[]
  /** Task execution results (aligned with tasks.json) */
  taskResults: TaskResult[]
  /** Overall savings summary */
  summary: SavingsSummary
}

// ---------------------------------------------------------------------------
// 5. ProxyCapture (intermediate parsed capture)
// ---------------------------------------------------------------------------

export interface MessageBreakdown {
  role: string
  index: number
  contentType: 'text' | 'array'
  estimatedTokens: number
  charLength: number
  snippet: string
}

export interface ToolDef {
  name: string
  estimatedTokens: number
}

export interface DetectedSkill {
  name: string
  source: string
  estimatedTokens: number
}

export interface McpServerDetection {
  serverName: string
  toolCount: number
  estimatedTokens: number
}

export interface ProxyDiagnosisData {
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

export interface ProxyCapture {
  /** Raw POST request body */
  rawBody: unknown
  /** Parsed diagnosis data */
  parsed: ProxyDiagnosisData
  /** Timestamp of capture */
  capturedAt: string
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Maximum raw message size (bytes) before truncation. */
export const MAX_MESSAGE_BYTES = 10 * 1024 * 1024

/** Default proxy listen port. */
export const DEFAULT_PROXY_PORT = 8899

/** Output directory name (relative to project root). */
export const SAVE_TOKEN_DIR = 'save-token'
