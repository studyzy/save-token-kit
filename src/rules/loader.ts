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
  ToolCatalogEntry,
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
  const tools = data['tools']
  if (
    tools !== undefined &&
    (!Array.isArray(tools) ||
      !tools.every((x) => isPlainObject(x) && typeof x.id === 'string' && typeof x.type === 'string'))
  ) {
    return 'tools 形态非法'
  }
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

/** Normalize a validated single rules file into the merged-dataset shape. */
function toDatasets(pack: SingleRulesFile): PackDatasets {
  const d = (pack.data ?? {}) as Record<string, unknown>
  return {
    'low-frequency-plugins': (d['low-frequency-plugins'] as string[]) ?? [],
    'mcp-alternatives': (d['mcp-alternatives'] as Record<string, string>) ?? {},
    tools: (d['tools'] as ToolCatalogEntry[]) ?? [],
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
  for (const t of pack.datasets.tools) merged.tools[t.id] = t
}

/** Validate a bare custom layer (~/.stk/rules.d or ./stk-rules): flat dataset JSON files. */
function readRawLayer(dir: string, layer: RuleLayer): { source: RuleSource; pack?: LoadedPack } {
  const base: RuleSource = { layer, path: dir, result: 'empty', warnings: [] }
  if (!existsSync(dir)) return { source: base }
  const datasets: PackDatasets = {
    'low-frequency-plugins': [],
    'mcp-alternatives': {},
    tools: [],
    thresholds: {},
    levels: {},
    prompts: {},
  }
  let found = false
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const name = f.slice(0, -'.json'.length)
    const known = ['low-frequency-plugins', 'mcp-alternatives', 'tools', 'thresholds', 'levels']
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
    tools: {},
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
