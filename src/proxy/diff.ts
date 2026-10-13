import type { DiagnosisReport } from '../types/index.js'

/**
 * Structured diff between two DiagnosisReports (before/after an optimization
 * round). Purely mechanical — reads report fields, never guesses — so the
 * comparison does not depend on an LLM re-reading both Markdown reports.
 */

interface NameDelta {
  name: string
  before: number
  after: number
  delta: number
  note?: string
}

function fmtSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function fmtPct(p: number): string {
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`
}

function collectDeltas(
  entries: Array<{ name: string; tokens: number; note?: string }>,
  before: Map<string, { tokens: number; note?: string }>,
  after: Map<string, { tokens: number; note?: string }>,
): { changed: NameDelta[]; added: string[]; removed: string[] } {
  const changed: NameDelta[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const e of entries) {
    const b = before.get(e.name)
    const a = after.get(e.name)
    if (b && a) {
      const delta = a.tokens - b.tokens
      const note = a.note && b.note && a.note !== b.note ? `${b.note} → ${a.note}` : undefined
      if (delta !== 0 || note) changed.push({ name: e.name, before: b.tokens, after: a.tokens, delta, note })
    } else if (a) {
      added.push(e.name)
    } else if (b) {
      removed.push(e.name)
    }
  }
  return { changed, added, removed }
}

function renderSection(
  lines: string[],
  title: string,
  unit: string,
  deltas: NameDelta[],
  added: string[],
  removed: string[],
): void {
  lines.push(title)
  lines.push('-'.repeat(40))
  if (deltas.length === 0 && added.length === 0 && removed.length === 0) {
    lines.push('  (无变化)')
    lines.push('')
    return
  }
  for (const d of deltas) {
    const pct = d.before > 0 ? ` (${fmtPct((d.delta / d.before) * 100)})` : ''
    const note = d.note ? ` [${d.note}]` : ''
    lines.push(
      `  ${d.name.padEnd(20)} ~${d.before} → ~${d.after} ${unit} (${fmtSigned(d.delta)}${pct})${note}`,
    )
  }
  for (const name of added) lines.push(`  + ${name}（新增）`)
  for (const name of removed) lines.push(`  - ${name}（移除）`)
  lines.push('')
}

/**
 * Build a Markdown diff report. Sections: totals, context categories, MCP
 * servers, skills, memory files and (when present) the 0-100 score.
 */
export function diffReports(before: DiagnosisReport, after: DiagnosisReport): string {
  const lines: string[] = []
  lines.push('诊断对比报告')
  lines.push('='.repeat(50))
  lines.push(`优化前: ${before.scanTimestamp} (${before.agentName})`)
  lines.push(`优化后: ${after.scanTimestamp} (${after.agentName})`)
  lines.push('')

  // --- Totals ---
  const bTotal = before.contextOverview.totalEstimatedTokens
  const aTotal = after.contextOverview.totalEstimatedTokens
  const dTotal = aTotal - bTotal
  const pctTotal = bTotal > 0 ? (dTotal / bTotal) * 100 : 0
  lines.push('上下文总量')
  lines.push('-'.repeat(40))
  lines.push(`  优化前 ~${bTotal} tok`)
  lines.push(`  优化后 ~${aTotal} tok`)
  lines.push(`  变化   ${fmtSigned(dTotal)} tok (${fmtPct(pctTotal)})`)
  lines.push('')

  // --- Context categories (matched by type+name) ---
  const catMap = (r: DiagnosisReport): Map<string, { tokens: number; note?: string }> => {
    const m = new Map<string, { tokens: number; note?: string }>()
    for (const c of r.contextOverview.breakdown) {
      m.set(`${c.type}:${c.name}`, { tokens: c.estimatedTokens })
    }
    return m
  }
  const bCats = catMap(before)
  const aCats = catMap(after)
  const catEntries = [...new Set([...bCats.keys(), ...aCats.keys()])].map((key) => ({
    name: key,
    tokens: aCats.get(key)?.tokens ?? bCats.get(key)?.tokens ?? 0,
  }))
  const catDeltas = collectDeltas(catEntries, bCats, aCats)
  renderSection(lines, '分类变化', 'tok', catDeltas.changed, catDeltas.added, catDeltas.removed)

  // --- MCP servers ---
  const mcpMap = (r: DiagnosisReport): Map<string, { tokens: number; note?: string }> => {
    const m = new Map<string, { tokens: number; note?: string }>()
    for (const s of r.mcpList) {
      m.set(s.name, { tokens: s.estimatedTokens, note: s.loadingMode })
    }
    return m
  }
  const mcpEntries = [...new Set([...before.mcpList, ...after.mcpList].map((s) => s.name))].map(
    (name) => ({ name, tokens: 0 }),
  )
  const mcpDeltas = collectDeltas(mcpEntries, mcpMap(before), mcpMap(after))
  renderSection(lines, 'MCP 变化', 'tok', mcpDeltas.changed, mcpDeltas.added, mcpDeltas.removed)

  // --- Skills ---
  const skillMap = (r: DiagnosisReport): Map<string, { tokens: number; note?: string }> => {
    const m = new Map<string, { tokens: number; note?: string }>()
    for (const s of r.skillList) m.set(s.name, { tokens: s.estimatedTokens })
    return m
  }
  const skillNames = [
    ...new Set([...before.skillList, ...after.skillList].map((s) => s.name)),
  ].map((name) => ({ name, tokens: 0 }))
  const skillDeltas = collectDeltas(skillNames, skillMap(before), skillMap(after))
  renderSection(lines, 'Skill 变化', 'tok', skillDeltas.changed, skillDeltas.added, skillDeltas.removed)

  // --- Memory files ---
  const memMap = (r: DiagnosisReport): Map<string, { tokens: number; note?: string }> => {
    const m = new Map<string, { tokens: number; note?: string }>()
    for (const f of r.memoryFiles ?? []) m.set(f.path, { tokens: f.estimatedTokens })
    return m
  }
  const memNames = [
    ...new Set([...(before.memoryFiles ?? []), ...(after.memoryFiles ?? [])].map((f) => f.path)),
  ].map((name) => ({ name, tokens: 0 }))
  const memDeltas = collectDeltas(memNames, memMap(before), memMap(after))
  renderSection(lines, '记忆文件变化', 'tok', memDeltas.changed, memDeltas.added, memDeltas.removed)

  return lines.join('\n')
}
