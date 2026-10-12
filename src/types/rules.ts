/** Rule-pack domain contracts (spec 005-stk-rules-pack, see specs/005-stk-rules-pack/data-model.md). */

/** Physical source layers, merged in ascending priority: builtin < library < user < project. */
export type RuleLayer = 'builtin' | 'library' | 'user' | 'project'

/** Per-source load outcome (data-model.md, load state machine). */
export type SourceResult = 'ok' | 'rejected-incompatible' | 'rejected-corrupted' | 'empty'

/** Version manifest shipped as rules/manifest.json inside every rules pack. */
export interface PackManifest {
  schemaVersion: number
  packVersion: string
  releasedAt: string
  engines: { stk: string }
  datasets: string[]
  prompts: string[]
}

/** The single-file rules format (rules/stk-rules.json). */
export interface SingleRulesFile {
  schemaVersion: number
  packVersion: string
  releasedAt: string
  engines: { stk: string }
  data: Partial<PackDatasets>
  prompts?: Record<string, string>
}

/** Optimization level assigned per target in levels.json. */
export type Level = '初级' | '中级' | '高级'

/** 声明式检测/启用规格（检测原语 + all/any 组合子）。 */
export interface ToolkitSpec {
  kind?: 'command' | 'path' | 'mcp' | 'plugin-enabled' | 'proxy-plugin' | 'hook' | 'process'
  name?: string
  names?: string[]
  path?: string
  key?: string
  event?: string
  match?: string
  pattern?: string
  source?: 'fs' | 'proxy' | 'any'
  all?: ToolkitSpec[]
  any?: ToolkitSpec[]
}

/** 安装规格：默认/按 Agent 安装命令、验证与配置路径、自定义处理器。 */
export interface ToolkitInstallSpec {
  default?: string
  verify?: string
  config?: { default?: string; byAgent?: Record<string, string> }
  handler?: string
  byAgent?: Record<string, string>
}

/** Catalog entry for a third-party token-saving toolkit (data-only, registry stays in engine). */
export interface ToolkitCatalogEntry {
  id: string
  type: 'cli' | 'plugin' | 'mcp'
  /** Official GitHub repo URL (toolkit-meta/links rendering). */
  repo?: string
  /** Per-agent official support map; keys constrained to claude/codex/codebuddy. */
  agents?: Partial<Record<'claude' | 'codex' | 'codebuddy', boolean>>
  /** Per-agent note rendered as `✓（note）` in the agents table. */
  agentNotes?: Partial<Record<'claude' | 'codex' | 'codebuddy', string>>
  /** Whole-table note for the agents view (column "依据"). */
  agentNote?: string
  /** 一句话说明（报告/表格展示用）。 */
  description?: string
  /** 人类可读的节省估算文案。 */
  saving?: string
  /** 建议优化等级。 */
  level?: Level
  /** 预估节省 token 数。 */
  estTokens?: number
  /** 建议归类（当前仅 knowledge-base）。 */
  category?: 'knowledge-base'
  /** 安装检测规格。 */
  detect?: ToolkitSpec
  /** 启用状态检测规格。 */
  enabled?: ToolkitSpec
  /** 请求消息中标记该插件激活的字符串（proxy 解析器数据化检测，零写死重构收尾）。 */
  proxyMarkers?: string[]
  /** 该工具 MCP 工具名的额外前缀（'mcp__' 通用语法前缀之外，proxy 解析器分类用）。 */
  mcpPrefixes?: string[]
  /** Install command per default or per agent. */
  install?: ToolkitInstallSpec
}

/** Raw dataset shapes as stored in data/*.json (prompts come from prompts/*.md). */
export interface PackDatasets {
  'low-frequency-plugins': string[]
  'mcp-alternatives': Record<string, string>
  toolkits: ToolkitCatalogEntry[]
  thresholds: Record<string, number>
  levels: Record<string, Level>
  /** Prompt fragments keyed by fragment name (no file extension). */
  prompts: Record<string, string>
}

/** One rule provider with its load outcome (data-model.md, entity 4). */
export interface RuleSource {
  layer: RuleLayer
  path: string
  packVersion?: string
  result: SourceResult
  warnings: string[]
}

/** Snapshot info embedded into every diagnosis report (FR-008). */
export interface RulesInfo {
  packVersion: string
  fallbackInUse: boolean
  sources: Array<Pick<RuleSource, 'layer' | 'result'>>
}

/** Merged view consumed by the engine — built once at process start, reused for the whole run. */
export interface MergedRules {
  lowFrequencyPlugins: Set<string>
  mcpAlternatives: Record<string, string>
  toolkits: Record<string, ToolkitCatalogEntry>
  thresholds: Record<string, number>
  levels: Record<string, Level>
  prompts: Record<string, string>
  rulesInfo: RulesInfo
}

/** Local update bookkeeping at ~/.stk/rules/meta.json. */
export interface UpdateMeta {
  lastCheckAt?: string
  lastUpdatedAt?: string
  installedVersion?: string
  autoCheckDisabled?: boolean
}
