import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { satisfiesRange } from './semver.js'
import type {
  Level,
  MergedRules,
  PackDatasets,
  RuleLayer,
  RuleSource,
  SingleRulesFile,
  ToolkitCatalogEntry,
} from '../types/rules.js'
import fallbackPack from './fallback.json'

/** Max schemaVersion this engine understands. */
export const SUPPORTED_SCHEMA_VERSION = 1

/** Install home for the downloaded single rules file (~/.stk/rules). */
export const RULES_HOME = join(homedir(), '.stk', 'rules')
export const RULES_FILE_NAME = 'stk-rules.json'

const req = createRequire(import.meta.url)

function engineVersion(): string {
  // dist/cli.mjs sits one level under the package root; src/ sits two levels deep
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const v = (req(rel) as { version?: string }).version
      if (v) return v
    } catch {
      // try next candidate
    }
  }
  return '0.0.0'
}

const VALID_LEVELS: readonly Level[] = ['初级', '中级', '高级']

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Structural validation of the data section. Returns warning text or null. */
function validateData(data: unknown): string | null {
  if (!isPlainObject(data)) return 'data 必须为对象'
  const lfp = data['low-frequency-plugins']
  if (lfp !== undefined && (!Array.isArray(lfp) || !lfp.every((x) => typeof x === 'string'))) {
    return 'low-frequency-plugins 必须为字符串数组'
  }
  const mcp = data['mcp-alternatives']
  if (mcp !== undefined && (!isPlainObject(mcp) || !Object.values(mcp).every((v) => typeof v === 'string'))) {
    return 'mcp-alternatives 必须为字符串映射'
  }
  const toolkits = data['toolkits']
  if (
    toolkits !== undefined &&
    (!Array.isArray(toolkits) ||
      !toolkits.every((x) => isPlainObject(x) && typeof x.id === 'string' && typeof x.type === 'string'))
  ) {
    return 'toolkits 形态非法'
  }
  const toolkitMetaWarn = validateToolkitMeta(toolkits)
  if (toolkitMetaWarn) return toolkitMetaWarn
  const toolkitSpecWarn = validateToolkitSpec(toolkits)
  if (toolkitSpecWarn) return toolkitSpecWarn
  const thresholds = data['thresholds']
  if (thresholds !== undefined && (!isPlainObject(thresholds) || !Object.values(thresholds).every((v) => typeof v === 'number'))) {
    return 'thresholds 必须为数值映射'
  }
  const levels = data['levels']
  if (levels !== undefined && (!isPlainObject(levels) || !Object.values(levels).every((v) => VALID_LEVELS.includes(v as Level)))) {
    return 'levels 取值必须为 初级/中级/高级'
  }
  const prompts = data['prompts']
  if (prompts !== undefined && (!isPlainObject(prompts) || !Object.values(prompts).every((v) => typeof v === 'string'))) {
    return 'prompts 必须为字符串映射'
  }
  return null
}

/** Valid agent keys for toolkit meta fields (tokenlint 迁移；模板侧做 workbuddy→codebuddy 归一化). */
const TOOLKIT_AGENT_KEYS = ['claude', 'codex', 'codebuddy'] as const

/**
 * Loose validation of optional toolkit meta fields (tokenlint 迁移，非上游行为).
 * 字段在场才校形态；未知字段不拒绝，保证旧格式规则包继续加载。
 */
function validateToolkitMeta(toolkits: unknown): string | null {
  if (!Array.isArray(toolkits)) return null
  for (const t of toolkits as Array<Record<string, unknown>>) {
    const id = t.id as string
    if (t.repo !== undefined && typeof t.repo !== 'string') return `toolkits[${id}].repo 必须为字符串`
    if (t.agentNote !== undefined && typeof t.agentNote !== 'string') return `toolkits[${id}].agentNote 必须为字符串`
    for (const [field, valueOf] of [
      ['agents', (v: unknown) => typeof v === 'boolean'],
      ['agentNotes', (v: unknown) => typeof v === 'string'],
    ] as const) {
      const v = t[field]
      if (v === undefined) continue
      if (!isPlainObject(v) || !Object.keys(v).every((k) => (TOOLKIT_AGENT_KEYS as readonly string[]).includes(k)) || !Object.values(v).every(valueOf)) {
        return `toolkits[${id}].${field} 必须为 ${TOOLKIT_AGENT_KEYS.join('/')} 键的映射（值 ${field === 'agents' ? '布尔' : '字符串'}）`
      }
    }
    if (t.install !== undefined) {
      if (!isPlainObject(t.install)) return `toolkits[${id}].install 必须为对象`
      if (t.install.default !== undefined && typeof t.install.default !== 'string') return `toolkits[${id}].install.default 必须为字符串`
      if (t.install.byAgent !== undefined) {
        if (!isPlainObject(t.install.byAgent) || !Object.values(t.install.byAgent).every((v) => typeof v === 'string')) {
          return `toolkits[${id}].install.byAgent 必须为字符串映射`
        }
      }
    }
  }
  return null
}

const SPEC_KINDS = ['command', 'path', 'mcp', 'plugin-enabled', 'proxy-plugin', 'hook', 'process'] as const
const SPEC_SOURCES = ['fs', 'proxy', 'any'] as const
const MAX_SPEC_DEPTH = 3

/**
 * Loose validation of one declarative detect/enabled spec (零写死重构 Task 2).
 * kind 白名单是语法（硬编码在引擎，不算工具写死）；字段在场才校形态，缺 detect/enabled 不报错。
 * Returns error text or null. `path` is the field-scoped prefix, e.g. `toolkits[gh].detect`.
 * `depth` counts combinator nesting only (root leaf = 0); all/any 嵌套不得超过 MAX_SPEC_DEPTH 层.
 */
function validateSpecNode(spec: unknown, path: string, depth: number): string | null {
  if (!isPlainObject(spec)) return `${path} 必须为对象`
  const kind = spec['kind']
  const combinators = ['all', 'any'].filter((c) => spec[c] !== undefined)
  // 组合器节点（含 all/any）不要求 kind；叶子节点必须有合法 kind 与必需参数
  if (combinators.length > 0) return validateSpecChildren(spec, path, depth)
  if (typeof kind !== 'string' || !(SPEC_KINDS as readonly string[]).includes(kind)) {
    return `${path}.kind 必须为 ${SPEC_KINDS.join('/')}`
  }
  const required: string[] =
    kind === 'command' || kind === 'proxy-plugin'
      ? ['name']
      : kind === 'path'
        ? ['path']
        : kind === 'plugin-enabled'
          ? ['key']
          : kind === 'hook'
            ? ['event', 'match']
            : kind === 'process'
              ? ['pattern']
              : []
  for (const key of ['name', 'path', 'key', 'event', 'match', 'pattern'] as const) {
    const v = spec[key]
    if (v !== undefined && typeof v !== 'string') return `${path}.${key} 必须为字符串`
    if (v === undefined && required.includes(key)) return `${path} 缺少 ${kind} 必需参数 ${key}`
  }
  if (kind === 'mcp') {
    const names = spec['names']
    if (names === undefined) return `${path} 缺少 mcp 必需参数 names`
    if (!Array.isArray(names) || !names.every((x) => typeof x === 'string')) return `${path}.names 必须为字符串数组`
  }
  const source = spec['source']
  if (source !== undefined && !(SPEC_SOURCES as readonly string[]).includes(source as string)) {
    return `${path}.source 必须为 ${SPEC_SOURCES.join('/')}`
  }
  return null
}

/** Recurse into all/any combinator children. */
function validateSpecChildren(spec: Record<string, unknown>, path: string, depth: number): string | null {
  for (const combinator of ['all', 'any'] as const) {
    const children = spec[combinator]
    if (children === undefined) continue
    if (!Array.isArray(children)) return `${path}.${combinator} 必须为数组`
    if (depth + 1 > MAX_SPEC_DEPTH) return `${path} 组合器嵌套超过 ${MAX_SPEC_DEPTH} 层`
    for (const [i, child] of children.entries()) {
      const err = validateSpecNode(child, `${path}.${combinator}[${i}]`, depth + 1)
      if (err) return err
    }
  }
  return null
}

/** Loose validation of optional toolkit spec fields (detect/enabled/level/estTokens/install 扩展). */
function validateToolkitSpec(toolkits: unknown): string | null {
  if (!Array.isArray(toolkits)) return null
  for (const t of toolkits as Array<Record<string, unknown>>) {
    const id = t.id as string
    for (const field of ['detect', 'enabled'] as const) {
      if (t[field] === undefined) continue
      const err = validateSpecNode(t[field], `toolkits[${id}].${field}`, 0)
      if (err) return err
    }
    if (t.level !== undefined && !(VALID_LEVELS as readonly string[]).includes(t.level as string)) {
      return `toolkits[${id}].level 取值必须为 ${VALID_LEVELS.join('/')}`
    }
    if (t.estTokens !== undefined && (typeof t.estTokens !== 'number' || !Number.isInteger(t.estTokens) || t.estTokens < 0)) {
      return `toolkits[${id}].estTokens 必须为非负整数`
    }
    if (t.install !== undefined && isPlainObject(t.install)) {
      if (t.install.verify !== undefined && typeof t.install.verify !== 'string') return `toolkits[${id}].install.verify 必须为字符串`
      if (t.install.handler !== undefined && typeof t.install.handler !== 'string') return `toolkits[${id}].install.handler 必须为字符串`
    }
  }
  return null
}

/** Normalize a validated single rules file into the merged-dataset shape. */
function toDatasets(pack: SingleRulesFile): PackDatasets {
  const d = (pack.data ?? {}) as Record<string, unknown>
  return {
    'low-frequency-plugins': (d['low-frequency-plugins'] as string[]) ?? [],
    'mcp-alternatives': (d['mcp-alternatives'] as Record<string, string>) ?? {},
    toolkits: (d['toolkits'] as ToolkitCatalogEntry[]) ?? [],
    thresholds: (d['thresholds'] as Record<string, number>) ?? {},
    levels: (d['levels'] as Record<string, Level>) ?? {},
    prompts: (pack.prompts ?? (d['prompts'] as Record<string, string>) ?? {}) as Record<string, string>,
  }
}

interface LoadedPack {
  packVersion: string
  datasets: PackDatasets
}

/**
 * Validate one single rules file (parsed JSON). Follows the compat gate:
 * schemaVersion → engines range → data shape. Returns rejected-* on failure.
 */
export function validateRulesFile(raw: unknown): { source: Omit<RuleSource, 'path' | 'layer'>; pack?: LoadedPack } {
  const base = { result: 'empty' as SourceResult, warnings: [] as string[] }
  if (!isPlainObject(raw)) return { source: { ...base, result: 'rejected-corrupted', warnings: ['不是合法 JSON 对象'] } }
  const { schemaVersion, packVersion, engines, data, prompts } = raw as Partial<SingleRulesFile>
  if (typeof schemaVersion !== 'number' || typeof packVersion !== 'string' || !isPlainObject(engines) || typeof engines.stk !== 'string') {
    return { source: { ...base, result: 'rejected-corrupted', warnings: ['版本清单字段缺失或非法'] } }
  }
  if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    return {
      source: {
        result: 'rejected-incompatible',
        warnings: [`规则包 schemaVersion ${schemaVersion} 高于引擎支持的 ${SUPPORTED_SCHEMA_VERSION}`],
      },
    }
  }
  if (!satisfiesRange(engineVersion(), engines.stk)) {
    return {
      source: {
        result: 'rejected-incompatible',
        warnings: [`规则包 ${packVersion} 要求 stk ${engines.stk}，当前 ${engineVersion()}`],
      },
    }
  }
  const dataWarn = validateData(data)
  if (dataWarn) {
    return { source: { result: 'rejected-corrupted', warnings: [dataWarn] } }
  }
  const pack: SingleRulesFile = { schemaVersion, packVersion, releasedAt: '', engines, data: data ?? {}, prompts: prompts ?? {} }
  return {
    source: { result: 'ok', warnings: [] },
    pack: { packVersion, datasets: toDatasets(pack) },
  }
}

function mergeInto(merged: MergedRules, pack: LoadedPack): void {
  for (const entry of pack.datasets['low-frequency-plugins']) {
    if (entry.startsWith('!')) merged.lowFrequencyPlugins.delete(entry.slice(1))
    else if (entry) merged.lowFrequencyPlugins.add(entry)
  }
  Object.assign(merged.mcpAlternatives, pack.datasets['mcp-alternatives'])
  Object.assign(merged.thresholds, pack.datasets.thresholds)
  Object.assign(merged.levels, pack.datasets.levels)
  Object.assign(merged.prompts, pack.datasets.prompts ?? {})
  for (const t of pack.datasets.toolkits) merged.toolkits[t.id] = t
}

/** Validate a bare custom layer (~/.stk/rules.d or ./stk-rules): flat dataset JSON files. */
function readRawLayer(dir: string, layer: RuleLayer): { source: RuleSource; pack?: LoadedPack } {
  const base: RuleSource = { layer, path: dir, result: 'empty', warnings: [] }
  if (!existsSync(dir)) return { source: base }
  const datasets: PackDatasets = {
    'low-frequency-plugins': [],
    'mcp-alternatives': {},
    toolkits: [],
    thresholds: {},
    levels: {},
    prompts: {},
  }
  let found = false
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const name = f.slice(0, -'.json'.length)
    const known = ['low-frequency-plugins', 'mcp-alternatives', 'toolkits', 'thresholds', 'levels']
    if (!known.includes(name)) {
      base.warnings.push(`忽略未知数据集文件 ${f}`)
      continue
    }
    found = true
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    } catch {
      return { source: { ...base, result: 'rejected-corrupted', warnings: [`${f} 不是合法 JSON`] } }
    }
    const single = { schemaVersion: 1, packVersion: '', releasedAt: '', engines: { stk: '>=0.0.0' }, data: { [name]: raw } }
    const warn = validateData(single.data)
    if (warn) {
      return { source: { ...base, result: 'rejected-corrupted', warnings: [`${f}: ${warn}`] } }
    }
    Object.assign(datasets as Record<string, unknown>, { [name]: raw })
  }
  if (!found) return { source: base }
  return {
    source: { ...base, result: 'ok', warnings: base.warnings },
    pack: { packVersion: '', datasets },
  }
}

export interface LoadRulesOptions {
  /** Override the library file path (defaults to ~/.stk/rules/stk-rules.json). */
  rulesFile?: string
  /** Override the bare user layer dir (defaults to ~/.stk/rules.d). */
  userDir?: string
  /** Override the bare project layer dir (defaults to ./stk-rules). */
  projectDir?: string
}

/**
 * Build the effective MergedRules snapshot: builtin (bundled file) → library
 * (~/.stk/rules/stk-rules.json) → user (~/.stk/rules.d) → project (./stk-rules).
 * Built once at process start; a single diagnosis run reuses this snapshot.
 */
export function loadRules(options: LoadRulesOptions = {}): MergedRules {
  const sources: RuleSource[] = []

  const fallbackValid = validateRulesFile(fallbackPack)
  const builtinPack = fallbackValid.pack ?? {
    packVersion: (fallbackPack as { packVersion?: string }).packVersion ?? '0.0.0',
    datasets: toDatasets(fallbackPack as SingleRulesFile),
  }
  if (!fallbackValid.pack) {
    for (const w of fallbackValid.source.warnings) printWarning(`内置兜底: ${w}`)
  }
  sources.push({ layer: 'builtin', path: 'src/rules/fallback.json (bundled)', packVersion: builtinPack.packVersion, result: 'ok', warnings: [] })

  const merged: MergedRules = {
    lowFrequencyPlugins: new Set<string>(),
    mcpAlternatives: {},
    toolkits: {},
    thresholds: {},
    levels: {},
    prompts: {},
    rulesInfo: { packVersion: '', fallbackInUse: true, sources: [] },
  }
  mergeInto(merged, builtinPack)

  let activeVersion = builtinPack.packVersion
  let fallbackInUse = true

  const libFile = options.rulesFile ?? join(RULES_HOME, RULES_FILE_NAME)
  if (existsSync(libFile)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(libFile, 'utf8'))
    } catch {
      raw = undefined
    }
    const { source, pack } = validateRulesFile(raw)
    sources.push({ layer: 'library', path: libFile, ...source, warnings: source.warnings })
    if (pack) {
      mergeInto(merged, pack)
      activeVersion = pack.packVersion
      fallbackInUse = false
    } else if (source.result !== 'empty') {
      for (const w of source.warnings) printWarning(w)
    }
  } else {
    sources.push({ layer: 'library', path: libFile, result: 'empty', warnings: [] })
  }

  const layers: Array<[RuleLayer, string]> = [
    ['user', options.userDir ?? join(homedir(), '.stk', 'rules.d')],
    ['project', options.projectDir ?? join(process.cwd(), 'stk-rules')],
  ]
  for (const [layer, layerDir] of layers) {
    const { source, pack } = readRawLayer(layerDir, layer)
    sources.push(source)
    if (pack) mergeInto(merged, pack)
    if (source.result === 'rejected-corrupted') {
      for (const w of source.warnings) printWarning(w)
    }
  }

  merged.rulesInfo = {
    packVersion: activeVersion,
    fallbackInUse,
    sources: sources.map((s) => ({ layer: s.layer, result: s.result })),
  }
  return merged
}

/** Non-blocking stderr warning (contracts/cli-rules.md). */
export function printWarning(msg: string): void {
  process.stderr.write(`警告: ${msg}\n`)
}

type SourceResult = RuleSource['result']

/** Bundled fallback pack version — used by update to detect "already latest". */
export function bundledPackVersion(): string {
  return (fallbackPack as { packVersion?: string }).packVersion ?? '0.0.0'
}
