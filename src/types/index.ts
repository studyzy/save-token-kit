/**
 * Shared type definitions and JSON contracts for Save Token Kit (stk).
 * Contracts mirror the data-model.md spec:
 *   - DiagnosisReport    (diagnosis-report.json, from `stk diagnose`)
 *   - AnalysisFile       (analysis.json, from `/stk-analyze`)
 *   - SaveTokenReport    (save-token-report.json, from `/stk-report`)
 *   - ProxyDiagnosisData (intermediate parsed capture)
 *   - RepoScan           (repo-scan.json, from `/stk-analyze` repo scan)
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
  /** Transport type */
  type?: 'stdio' | 'sse' | 'http'
  /** Launch command (stdio) */
  command?: string
  /** Endpoint URL (sse/http) */
  url?: string
  /** Number of tools defined by this MCP server */
  toolsCount: number
  /** Function names under this server (e.g. "mcp__context-mode__ctx_search") */
  tools?: string[]
  /** Deferred loading enabled (config-level, from MCP settings) */
  deferLoading?: boolean
  /** Runtime loading mode: 'direct' = tools in request body, 'deferred' = only in available_deferred_tools */
  loadingMode?: 'direct' | 'deferred'
  /** Estimated tokens of tool definitions */
  estimatedTokens: number
  /** Whether a CLI alternative exists */
  hasCliAlternative?: boolean
  /** The CLI alternative command */
  cliAlternative?: string
  /** Source file path */
  source?: string
}

export type SkillSource = 'user' | 'project' | 'plugin' | 'plugin-marketplace' | 'bundled'
export type ToolId =
  | 'rtk'
  | 'caveman'
  | 'headroom'
  | 'lean-ctx'
  | 'graphify'
  | 'ponytail'
  | 'karpathy-skills'
  | 'gitnexus'
  | 'tokenjuice'
  | 'codebase-memory'
  | 'codegraph'
  | 'context-mode'

export interface SkillEntry {
  /** Skill name */
  name: string
  /** Source location */
  source?: SkillSource
  /** Source path on disk */
  sourcePath?: string
  /** Estimated tokens */
  estimatedTokens: number
  /** Whether the skill is loaded into the current context */
  loaded?: boolean | null
  /** Usage frequency hint (optional) */
  usageFrequency?: 'high' | 'medium' | 'low'
  /** Skill description (from Skill tool description block) */
  description?: string
}

export interface AgentEntry {
  /** Agent (subagent) name */
  name: string
  /** Estimated tokens of its description */
  estimatedTokens: number
  /** Source marker, e.g. "project" or "plugin@marketplace" */
  source?: string
}

export interface RuleEntry {
  name: string
  path: string
  /** true when the rule has no `paths:` frontmatter — loaded in every session */
  alwaysLoaded: boolean
  fileSizeBytes: number
  estimatedTokens: number
}

export interface PluginEntry {
  id: string
  pluginId: string
  marketplace: string
  enabled: boolean
  installedPath: string | null
  isLowFrequency: boolean
}

export interface HookEntry {
  event: string
  matcher: string
  command: string
  timeout: number | null
  source: 'settings' | 'local'
}

export interface ConfigFileSummary {
  path: string
  exists: boolean
  sizeBytes: number
  lineCount: number
  estimatedTokens: number
  impactLevel: 'low' | 'medium' | 'high'
}

export interface ToolDetection {
  name: ToolId
  installed: boolean
  enabled: boolean
  version: string | null
  installPath: string | null
  codebuddyIntegrated: boolean
  /** Human-readable saving estimate shown in the report */
  recommendedSaving?: string
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

export interface ToolDef {
  /** Tool function name */
  name: string
  /** Estimated token count for this tool definition */
  estimatedTokens: number
  /** Classification category */
  category: 'builtin' | 'mcp' | 'deferred'
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
  /** Subagent (Agent) list */
  agentList: AgentEntry[]
  /** Tool definitions with per-tool token breakdown (builtin + mcp + deferred merged) */
  builtinTools: ToolDef[]
  /** Plugin list discovered on the filesystem */
  pluginList?: PluginEntry[]
  /** Hook list from settings */
  hookList?: HookEntry[]
  /** Rules discovered in rules/ directories */
  ruleList?: RuleEntry[]
  /** Config file summaries (CODEBUDDY.md, project CODEBUDDY.md, rules dir) */
  configFiles?: ConfigFileSummary[]
  /** Third-party tool detection (rtk/caveman/headroom/graphify/ponytail/...) */
  toolDetection?: ToolDetection[]
  /** Whether headless probing of the agent was available */
  headlessAvailable?: boolean
  /** Where the diagnosis data came from */
  dataSource?: 'proxy' | 'headless' | 'fs-only'
  /** Extra details captured from the intercepted proxy request */
  proxyDetails?: ProxyDetails
}

/** Plugins known to be low-frequency / rarely used. */
export const LOW_FREQUENCY_PLUGINS = new Set<string>([
  'pptx@codebuddy-plugins-official',
  'docx@codebuddy-plugins-official',
  'xlsx@codebuddy-plugins-official',
  'agent-browser@codebuddy-plugins-official',
  'playwright-cli@codebuddy-plugins-official',
])

/** CLI alternatives for common MCP servers. */
export const MCP_CLI_ALTERNATIVES: Record<string, string> = {
  Playwright: 'playwright',
  playwright: 'playwright',
  github: 'gh',
  'github-mcp': 'gh',
  slack: 'slack-cli',
  filesystem: 'node fs',
  notion: 'notion-cli',
  linear: 'linear-cli',
  jira: 'jira-cli',
}

/** Extra details captured from the intercepted proxy request body. */
export interface ProxyDetails {
  model: string
  /** Per-message role/type/token breakdown */
  messageBreakdown: MessageBreakdown[]
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
  // Extensions for stk-analyze rebuild (002): parallel sub-agent optimization
  | 'defer-tools' // Explicitly declare minimal necessary tools for a Plugin/Hook
  | 'knowledge-base' // Enable a code knowledge-graph tool (Graphify/Codebase-Memory MCP/CodeGraph/GitNexus)

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
  /** Scenario attribution (e.g. "code" / "doc" / "office" / "general") */
  scenario?: string
  /** Optional supporting data/evidence for the suggestion (e.g. diagnostic field values) */
  evidence?: string
}

// ---------------------------------------------------------------------------
// 1b. RepoScan (repo-scan.json, from /stk-analyze repo scan)
// ---------------------------------------------------------------------------

/** Result of scanning the current repository's code/docs for knowledge-graph recommendations. */
export interface RepoScan {
  /** Scan timestamp (ISO 8601) */
  scannedAt: string
  /** Number of code files (by extension) */
  codeFileCount: number
  /** Number of documentation files (.md/.mdx/.rst/.txt) */
  docFileCount: number
  /** Approximate total code line count */
  codeLineCount: number
  /** Approximate total documentation line count */
  docLineCount: number
  /** Top 3 languages by file count (descending) */
  topLanguages: string[]
  /** Whether a docs/ dir or README* entry exists */
  hasDocsDir: boolean
  /** Whether a project-level CODEBUDDY.md exists */
  hasCodebuddyMd: boolean
  /** Whether the repo is a monorepo (multiple package.json/Cargo.toml/go.mod) */
  isMonorepo: boolean
  /** Error message if scan failed; null on success */
  scanError?: string | null
}

/** User scenario context collected by /stk-analyze (persisted to save-token/context.json). */
export interface AnalysisContext {
  /** Collection timestamp (ISO 8601) */
  collectedAt: string
  /** Primary usage purpose */
  purpose: 'code' | 'doc' | 'office' | 'general'
  /** Whether code and docs live in the same repo */
  sameRepo: 'same' | 'separate'
  /** Selected code knowledge-graph tool (storage value, lower-kebab; undefined if not asked) */
  graphTool?: 'graphify' | 'codebase-memory-mcp' | 'codegraph' | 'gitnexus' | 'none' | string
}

export interface AnalysisFile {
  /** Generation timestamp (ISO 8601) */
  generatedAt: string
  /** Source diagnosis file */
  sourceDiagnosis: string
  /** User scenario context */
  context: AnalysisContext
  /** Suggestions sorted by estimated saving (descending) */
  suggestions: AnalysisSuggestion[]
  /** Total estimated saving tokens (sum, may overlap — reference only) */
  totalEstimatedSavingTokens: number
}

// ---------------------------------------------------------------------------
// 3. SaveTokenReport (save-token-report.json, from /stk-report)
// ---------------------------------------------------------------------------

export type TaskStatus = 'completed' | 'failed' | 'skipped' | 'partial'

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
  /** Task execution results */
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
    builtin: { name: string; estimatedTokens: number }[]
    /** MCP tools */
    mcp: { name: string; estimatedTokens: number }[]
    /** Deferred tools */
    deferred: { name: string; estimatedTokens: number }[]
  }
  /** Detected skills */
  skills: SkillEntry[]
  /** Detected subagents (from Agent tool description list) */
  agents: AgentEntry[]
  /** Detected MCP servers (from mcp__ prefix) */
  mcpServers: McpEntry[]
  /** Total estimated tokens */
  totalEstimatedTokens: number
  /** Model name from request */
  model: string
  /** Per-skill token breakdown from Skill tool description */
  skillTokens: Record<string, { description: string; estimatedTokens: number; location?: string }>
  /** Plugins detected via message content markers */
  detectedPlugins: string[]
  /** Estimated tokens consumed by the system rules block (CODEBUDDY.md) */
  rulesTokens: number
  /** Estimated tokens consumed by the memory system-reminder block */
  memoryTokens: number
  /** Tool descriptions keyed by tool name */
  toolDescriptions: Record<string, string>
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
