import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bold, green, red, yellow } from 'ansis'
import { SAVE_TOKEN_DIR, type OperationType, type RiskLevel } from '../types/index.js'

/**
 * `stk verify` — programmatic format validator for the sub-agent suggestion
 * files produced by /stk-analyze.
 *
 * Format validation is deterministic "dead logic", so it belongs in a program,
 * not in a re-read-by-the-LLM self check. Each sub-agent runs
 * `stk verify --file save-token/suggestions-<name>.json` right after writing its
 * own file; on failure it fixes and overwrites the file and retries.
 *
 * Two modes:
 *   - `stk verify --file <path>`   validate a single suggestion file
 *   - `stk verify`                 validate all suggestions-*.json under save-token/ plus repo-analysis.json
 *
 * Exit code 0 on pass, 1 on failure (specific errors printed to stderr).
 */
export interface VerifyOptions {
  file?: string
}

const LEVELS = new Set(['初级', '中级', '高级'])
const RISKS: RiskLevel[] = ['low', 'medium', 'high']

/** Top-level fields required on every suggestion file. */
const TOP_LEVEL_FIELDS = ['agentName', 'category', 'generatedAt', 'skipped', 'suggestions'] as const

/** Required fields on every suggestion entry. */
const SUGGESTION_FIELDS = [
  'id',
  'title',
  'detail',
  'operationType',
  'target',
  'estimatedSavingTokens',
  'risk',
  'reversible',
  'scenario',
  'level',
] as const

/** Map a suggestions-*.json file name to its expected agentName (null if not a suggestion file). */
function agentNameFromFilename(filename: string): string | null {
  const m = /^suggestions-(.+)\.json$/.exec(filename)
  return m ? m[1] : null
}

export interface ValidationError {
  file: string
  line: string
}

export interface ValidationResult {
  file: string
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validate a single parsed suggestion file object against the format contract.
 * Pure (no I/O) so it is directly unit-testable.
 *
 * @param content parsed JSON value of the suggestion file
 * @param filename the file's base name (used to cross-check agentName), or null to skip the cross-check
 */
export function validateSuggestionObject(
  content: unknown,
  filename: string | null,
): { errors: string[] } {
  const errors: string[] = []

  if (typeof content !== 'object' || content === null) {
    return { errors: ['顶层必须是 JSON 对象'] }
  }
  const doc = content as Record<string, unknown>

  // 1. Top-level fields
  for (const f of TOP_LEVEL_FIELDS) {
    if (!(f in doc)) errors.push(`缺少顶层字段: ${f}`)
  }

  // 2. agentName cross-check against file name
  const expected = filename ? agentNameFromFilename(filename) : null
  if (expected && doc.agentName !== expected) {
    errors.push(`agentName="${String(doc.agentName)}" 与文件名 ${filename} 不匹配，应为 "${expected}"`)
  }

  // 3. suggestions array + per-entry validation
  const suggestions = doc.suggestions
  if (!Array.isArray(suggestions)) {
    errors.push('suggestions 必须是数组')
    return { errors }
  }
  suggestions.forEach((s, i) => {
    const prefix = `suggestions[${i}]`
    if (typeof s !== 'object' || s === null) {
      errors.push(`${prefix}: 必须是对象`)
      return
    }
    const item = s as Record<string, unknown>
    for (const f of SUGGESTION_FIELDS) {
      if (!(f in item)) errors.push(`${prefix}.${f}: 缺少必填字段`)
    }
    // operationType must be a known OperationType
    const op = item.operationType as string
    if (op !== undefined && !isOperationType(op)) {
      errors.push(`${prefix}.operationType: 非法值 "${op}"，不在 OperationType 联合类型内`)
    }
    // risk must be low|medium|high
    const risk = item.risk as string
    if (risk !== undefined && !RISKS.includes(risk as RiskLevel)) {
      errors.push(`${prefix}.risk: 非法值 "${risk}"，应为 low|medium|high`)
    }
    // level must be 初级|中级|高级
    const level = item.level as string
    if (level !== undefined && !LEVELS.has(level)) {
      errors.push(`${prefix}.level: 非法值 "${level}"，应为 初级|中级|高级`)
    }
    // estimatedSavingTokens must be a non-negative number
    const est = item.estimatedSavingTokens as number
    if (est !== undefined && (typeof est !== 'number' || !Number.isFinite(est) || est < 0)) {
      errors.push(`${prefix}.estimatedSavingTokens: 非法值 ${String(est)}，应为非负整数`)
    }
    // target must be a non-empty string
    const target = item.target as string
    if (target !== undefined && (typeof target !== 'string' || target.trim() === '')) {
      errors.push(`${prefix}.target: 必须是非空字符串`)
    }
    // reversible must be boolean
    const reversible = item.reversible as boolean
    if (reversible !== undefined && typeof reversible !== 'boolean') {
      errors.push(`${prefix}.reversible: 必须是布尔值`)
    }
  })

  return { errors }
}

/** Loose check: is the string one of the OperationType union values (kept in sync with src/types/index.ts). */
function isOperationType(value: string): boolean {
  const ops: OperationType[] = [
    'disable-skill',
    'disable-mcp',
    'defer-mcp',
    'replace-mcp-with-cli',
    'trim-memory-md',
    'trim-file',
    'install-tool',
    'other',
    'agent-opt',
    'knowledge-base',
    'plugin-opt',
    'disable-plugin',
    'migrate-plugin',
    'migrate-skill',
    'disable-model-invocation',
    'skill-model-downgrade',
    'tool-opt',
  ]
  return (ops as string[]).includes(value)
}

/** Validate a JSON file on disk, returning a structured result. */
export function validateSuggestionFile(filePath: string, filename: string): ValidationResult {
  const errors: ValidationError[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch (err) {
    return { file: filePath, valid: false, errors: [{ file: filePath, line: `JSON 解析失败: ${(err as Error).message}` }] }
  }
  const { errors: msgErrors } = validateSuggestionObject(parsed, filename)
  for (const line of msgErrors) {
    errors.push({ file: filePath, line })
  }
  return { file: filePath, valid: errors.length === 0, errors }
}

/** Validate all suggestion/repo-analysis files under save-token/. */
export function validateAllSaveToken(): ValidationResult[] {
  const outDir = join(process.cwd(), SAVE_TOKEN_DIR)
  if (!existsSync(outDir)) {
    return [{ file: outDir, valid: false, errors: [{ file: outDir, line: `目录不存在: ${outDir}` }] }]
  }
  const results: ValidationResult[] = []
  const names = readdirSync(outDir)
  for (const name of names) {
    const isSuggestion = agentNameFromFilename(name) !== null
    const isRepoAnalysis = name === 'repo-analysis.json'
    if (isSuggestion || isRepoAnalysis) {
      results.push(validateSuggestionFile(join(outDir, name), name))
    }
  }
  if (results.length === 0) {
    results.push({
      file: outDir,
      valid: false,
      errors: [{ file: outDir, line: '未找到 suggestions-*.json 或 repo-analysis.json 文件' }],
    })
  }
  return results
}

/** Implement `stk verify`. */
export async function runVerify(options: VerifyOptions): Promise<void> {
  let results: ValidationResult[]

  if (options.file) {
    const name = options.file.split(/[\\/]/).pop() ?? options.file
    if (!existsSync(options.file)) {
      console.error(red(`文件不存在: ${options.file}`))
      process.exitCode = 1
      return
    }
    results = [validateSuggestionFile(options.file, name)]
  } else {
    results = validateAllSaveToken()
  }

  const allValid = results.every((r) => r.valid)
  let totalErrors = 0
  for (const r of results) {
    if (r.valid) {
      console.log(green(`  ✓ 通过: ${r.file}`))
    } else {
      console.error(red(`  ✗ 失败: ${r.file}`))
      for (const e of r.errors) {
        totalErrors++
        console.error(yellow(`      - ${e.line}`))
      }
    }
  }

  if (allValid) {
    console.log(bold(green(`\n校验通过：${results.length} 个文件格式正确。`)))
  } else {
    console.error(bold(red(`\n校验失败：${results.length} 个文件，共 ${totalErrors} 处错误。`)))
    process.exitCode = 1
  }
}
