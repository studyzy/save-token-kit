import { homedir } from 'node:os'
import { join } from 'node:path'
import type { MergedRules, ToolkitCatalogEntry } from '../types/rules.js'

const PAIR_RE = /<!-- stk:rules:prompts\/([\w.-]+) -->\n([\s\S]*?)<!-- \/stk:rules:prompts\/\1 -->/g

// 子集过滤语法：<!-- stk:rules:toolkit-meta/links(only=a,b|exclude=a,b|category=c|exclude-category=c) --> ……
// 属性可叠加（空格分隔，only/exclude 二选一 + category/exclude-category 二选一）；
// 正向名字段避免回溯歧义；过滤列表仅 [\w-] 与逗号。
// （TOOLKIT_RE 与 PAIR_RE 中的 `stk:rules` 标记是规则包格式的历史命名，保持不变。）
const TOOLKIT_RE = /<!-- stk:rules:toolkit-meta\/(links|agents|levels|est|names)((?: (?:only|exclude|category|exclude-category)=[\w,-]+)*) -->\n([\s\S]*?)<!-- \/stk:rules:toolkit-meta\/\1(?: (?:only|exclude|category|exclude-category)=[\w,-]+)* -->/g

export type ToolkitView = 'links' | 'agents' | 'levels' | 'est' | 'names'

/** Parsed filter attributes from a toolkit-meta placeholder pair. */
export interface ToolkitFilters {
  mode?: 'only' | 'exclude'
  list?: string
  category?: string
  excludeCategory?: string
}

/** Parse the raw attribute string, e.g. ` only=a,b category=x`. */
function parseToolkitAttrs(attrs: string): ToolkitFilters {
  const f: ToolkitFilters = {}
  for (const m of attrs.matchAll(/(only|exclude|category|exclude-category)=([\w,-]+)/g)) {
    if (m[1] === 'only' || m[1] === 'exclude') {
      f.mode = m[1]
      f.list = m[2]
    } else if (m[1] === 'category') {
      f.category = m[2]
    } else {
      f.excludeCategory = m[2]
    }
  }
  return f
}

/** Apply only/exclude subset filter to the toolkit list (insertion order preserved). */
function filterToolkits(
  toolkits: ToolkitCatalogEntry[],
  mode?: string,
  list?: string,
): ToolkitCatalogEntry[] {
  if (!mode) return toolkits
  const set = new Set((list ?? '').split(','))
  return toolkits.filter((t) => (mode === 'only' ? set.has(t.id) : !set.has(t.id)))
}

/** Apply category / exclude-category filter (orthogonal to only/exclude). */
function filterCategory(toolkits: ToolkitCatalogEntry[], f: ToolkitFilters): ToolkitCatalogEntry[] {
  if (f.category !== undefined) return toolkits.filter((t) => t.category === f.category)
  if (f.excludeCategory !== undefined) return toolkits.filter((t) => t.category !== f.excludeCategory)
  return toolkits
}

/** ✓/✗ cell with optional per-agent note, e.g. `✓（手动 MCP）` / `✗（特例，见过滤规则）`. */
function agentCell(entry: ToolkitCatalogEntry, key: 'claude' | 'codex' | 'codebuddy'): string {
  const v = entry.agents?.[key]
  if (typeof v !== 'boolean') return ''
  const mark = v ? '✓' : '✗'
  const note = entry.agentNotes?.[key]
  return note ? `${mark}（${note}）` : mark
}

/**
 * Build a toolkit table/name-list from merged.toolkits meta fields.
 * Returns '' when no entry carries the field so the caller can fall back to
 * the skeleton's builtin table.
 */
export function renderToolkitTables(
  merged: MergedRules,
  view: ToolkitView,
  filters: ToolkitFilters = {},
): string {
  const entries = filterCategory(filterToolkits(Object.values(merged.toolkits ?? {}), filters.mode, filters.list), filters)
  const inField = (t: ToolkitCatalogEntry): boolean => {
    if (view === 'links') return t.repo !== undefined
    if (view === 'agents') return t.agents !== undefined
    if (view === 'levels') return t.level !== undefined
    if (view === 'est') return t.estTokens !== undefined
    return t.category !== undefined
  }
  const withMeta = entries.filter(inField)
  if (withMeta.length === 0) return ''
  if (view === 'links') {
    const rows = withMeta.map((t) => `| ${t.id} | ${t.repo} |`)
    return ['| 工具 | 官方仓库 |', '| ---- | -------- |', ...rows].join('\n')
  }
  if (view === 'agents') {
    const rows = withMeta.map(
      (t) =>
        `| ${t.id} | ${agentCell(t, 'claude')} | ${agentCell(t, 'codex')} | ${agentCell(t, 'codebuddy')} | ${t.agentNote ?? ''} |`,
    )
    return ['| 工具 | claude | codex | codebuddy | 依据 |', '| ---- | ------ | ----- | --------- | ---- |', ...rows].join('\n')
  }
  if (view === 'levels') {
    const rows = withMeta.map((t) => `| ${t.id} | ${t.level} |`)
    return ['| 工具 | level |', '| ---- | ----- |', ...rows].join('\n')
  }
  if (view === 'est') {
    const rows = withMeta.map((t) => `| ${t.id} | ${t.estTokens} |`)
    return ['| 工具 | 默认估算 (tokens) |', '| ---- | ----------------- |', ...rows].join('\n')
  }
  return withMeta.map((t) => t.id).join(', ')
}

export interface RenderResult {
  content: string
  warnings: string[]
}

/**
 * Render a template skeleton by replacing prompt-fragment placeholders with
 * the highest-priority fragment from the merged rules (project > user >
 * library > builtin). One-shot at `stk init` time; idempotent for the same
 * inputs (contracts/prompt-render.md).
 */
export function renderTemplate(skeleton: string, merged: MergedRules): RenderResult {
  const warnings: string[] = []
  let content = skeleton.replace(
    TOOLKIT_RE,
    (whole, view: ToolkitView, attrs: string, fallback: string) => {
      const table = renderToolkitTables(merged, view, parseToolkitAttrs(attrs))
      if (table) return `${table}\n`
      if (fallback.trim().length === 0) {
        warnings.push(`toolkit-meta ${view} 无可用 meta 数据且骨架无兜底内容`)
        return whole // keep the placeholder pair visible for inspection
      }
      return fallback
    },
  )
  content = content.replace(PAIR_RE, (whole, name: string, fallback: string) => {
    const frag = merged.prompts[name]
    if (typeof frag === 'string' && frag.length > 0) {
      // trailing newline normalization keeps replacements stable
      return frag.endsWith('\n') ? frag : `${frag}\n`
    }
    if (fallback.trim().length === 0) {
      warnings.push(`提示词片段 ${name} 在规则库与骨架中均不存在`)
      return whole // keep the placeholder pair visible for inspection
    }
    return fallback
  })
  return { content, warnings }
}

/** Version header comment inserted at the top of rendered artifacts. */
export function renderHeader(merged: MergedRules): string {
  const fromRules = Object.keys(merged.prompts).length > 0
  const src = fromRules ? 'rules' : 'builtin'
  return `<!-- stk-rules: v${merged.rulesInfo.packVersion} (${src}) -->\n`
}

/** Default dirs for prompt fragments if a pack ships them standalone. */
export function defaultUserPromptsDir(): string {
  return join(homedir(), '.stk', 'rules.d')
}
