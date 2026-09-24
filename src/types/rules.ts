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

/** Catalog entry for a third-party token-saving tool (data-only, registry stays in engine). */
export interface ToolCatalogEntry {
  id: string
  type: 'cli' | 'plugin' | 'mcp'
}

/** Raw dataset shapes as stored in data/*.json (prompts come from prompts/*.md). */
export interface PackDatasets {
  'low-frequency-plugins': string[]
  'mcp-alternatives': Record<string, string>
  tools: ToolCatalogEntry[]
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
  tools: Record<string, ToolCatalogEntry>
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
