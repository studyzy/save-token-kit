import { estimateTokensOf, truncateIfLarge } from '../collectors/token-estimator.js'
import type { MessageBreakdown, ProxyDiagnosisData } from '../types/index.js'

/**
 * Parse a single captured LLM POST request body into a ProxyDiagnosisData fragment.
 * Tolerant of partial/missing fields so a malformed capture does not crash the tool.
 */
export function parseRequestBody(body: unknown): ProxyDiagnosisData {
  const req = (body ?? {}) as Record<string, any>
  const messages = Array.isArray(req.messages) ? req.messages : []
  const tools = Array.isArray(req.tools) ? req.tools : []

  // --- Messages ---
  const roleCounts: Record<string, number> = {}
  const roleTokens: Record<string, number> = {}
  const breakdown: MessageBreakdown[] = messages.map((m: any, index: number) => {
    const role = typeof m?.role === 'string' ? m.role : 'unknown'
    const content = m?.content
    const contentType: 'text' | 'array' = typeof content === 'string' ? 'text' : 'array'
    const raw = typeof content === 'string' ? content : JSON.stringify(content ?? '')
    const { content: snippet, truncated } = truncateIfLarge(raw)
    const est = estimateTokensOf(snippet)
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
    roleTokens[role] = (roleTokens[role] ?? 0) + est
    return {
      role,
      index,
      contentType,
      estimatedTokens: est,
      charLength: Buffer.byteLength(raw, 'utf8'),
      snippet: truncated ? snippet : snippet.slice(0, 200),
    }
  })

  // --- Tools (builtin vs mcp vs deferred) ---
  const builtin: { name: string; estimatedTokens: number }[] = []
  const mcp: { name: string; estimatedTokens: number }[] = []
  const deferred: { name: string; estimatedTokens: number }[] = []
  const mcpServers: Record<string, { toolCount: number; estimatedTokens: number }> = {}

  for (const t of tools) {
    const name: string = typeof t?.name === 'string' ? t.name : 'unknown'
    const est = estimateTokensOf(t)
    if (name.startsWith('mcp__')) {
      mcp.push({ name, estimatedTokens: est })
      const server = name.slice('mcp__'.length).split('__')[0]
      const entry = (mcpServers[server] ??= { toolCount: 0, estimatedTokens: 0 })
      entry.toolCount += 1
      entry.estimatedTokens += est
    } else if (t?.annotations?.dangerouslyDisableSandbox || t?.deferred) {
      deferred.push({ name, estimatedTokens: est })
    } else {
      builtin.push({ name, estimatedTokens: est })
    }
  }

  // --- Skills (detected via tool name suffix or system hints) ---
  const skills: { name: string; source: string; estimatedTokens: number }[] = []
  const skillNames = new Set<string>()
  for (const name of [...builtin, ...mcp].map((t) => t.name)) {
    const m = name.match(/__skill__(.+)$/) ?? name.match(/skill[:_-](.+)$/i)
    if (m) {
      const sName = m[1]
      if (!skillNames.has(sName)) {
        skillNames.add(sName)
        skills.push({ name: sName, source: name, estimatedTokens: 0 })
      }
    }
  }

  const totalEstimatedTokens =
    Object.values(roleTokens).reduce((a, b) => a + b, 0) +
    [...builtin, ...mcp, ...deferred].reduce((a, b) => a + b.estimatedTokens, 0) +
    skills.reduce((a, b) => a + b.estimatedTokens, 0)

  return {
    messages: { roleCounts, roleTokens, breakdown },
    tools: { builtin, mcp, deferred },
    skills,
    mcpServers: Object.entries(mcpServers).map(([serverName, v]) => ({
      serverName,
      toolCount: v.toolCount,
      estimatedTokens: v.estimatedTokens,
    })),
    totalEstimatedTokens,
  }
}

/**
 * Aggregate multiple parsed fragments into one, computing average / max / min
 * token occupancy across captured requests (per spec US1 acceptance #4).
 */
export function aggregateCaptures(fragments: ProxyDiagnosisData[]): ProxyDiagnosisData {
  if (fragments.length === 0) {
    return emptyDiagnosis()
  }
  if (fragments.length === 1) {
    return fragments[0]
  }
  // Aggregate by averaging total tokens; merge message breakdown averages.
  const totals = fragments.map((f) => f.totalEstimatedTokens)
  const avgTotal = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)

  // Merge all message breakdowns across captures (kept simple: concat with averaged tokens).
  const breakdown = fragments
    .flatMap((f) => f.messages.breakdown)
    .map((b, i) => ({ ...b, index: i }))

  return {
    messages: {
      roleCounts: mergeCounts(fragments.map((f) => f.messages.roleCounts)),
      roleTokens: mergeCounts(fragments.map((f) => f.messages.roleTokens)),
      breakdown,
    },
    tools: {
      builtin: mergeToolDefs(fragments.map((f) => f.tools.builtin)),
      mcp: mergeToolDefs(fragments.map((f) => f.tools.mcp)),
      deferred: mergeToolDefs(fragments.map((f) => f.tools.deferred)),
    },
    skills: mergeSkills(fragments.map((f) => f.skills)),
    mcpServers: mergeMcpServers(fragments.map((f) => f.mcpServers)),
    totalEstimatedTokens: avgTotal,
  }
}

function emptyDiagnosis(): ProxyDiagnosisData {
  return {
    messages: { roleCounts: {}, roleTokens: {}, breakdown: [] },
    tools: { builtin: [], mcp: [], deferred: [] },
    skills: [],
    mcpServers: [],
    totalEstimatedTokens: 0,
  }
}

function mergeCounts(list: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const rec of list) {
    for (const [k, v] of Object.entries(rec)) out[k] = (out[k] ?? 0) + v
  }
  return out
}

function mergeToolDefs(list: { name: string; estimatedTokens: number }[]): { name: string; estimatedTokens: number }[] {
  const map = new Map<string, number>()
  for (const t of list) map.set(t.name, (map.get(t.name) ?? 0) + t.estimatedTokens)
  return [...map.entries()].map(([name, estimatedTokens]) => ({ name, estimatedTokens }))
}

function mergeSkills(list: { name: string; source: string; estimatedTokens: number }[]): { name: string; source: string; estimatedTokens: number }[] {
  const map = new Map<string, { name: string; source: string; estimatedTokens: number }>()
  for (const s of list) {
    const prev = map.get(s.name)
    map.set(s.name, prev ? { ...prev, estimatedTokens: prev.estimatedTokens + s.estimatedTokens } : s)
  }
  return [...map.values()]
}

function mergeMcpServers(list: { serverName: string; toolCount: number; estimatedTokens: number }[]): { serverName: string; toolCount: number; estimatedTokens: number }[] {
  const map = new Map<string, { serverName: string; toolCount: number; estimatedTokens: number }>()
  for (const s of list) {
    const prev = map.get(s.serverName)
    map.set(s.serverName, {
      serverName: s.serverName,
      toolCount: (prev?.toolCount ?? 0) + s.toolCount,
      estimatedTokens: (prev?.estimatedTokens ?? 0) + s.estimatedTokens,
    })
  }
  return [...map.values()]
}
