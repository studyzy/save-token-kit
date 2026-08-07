import { estimateTokensOf, truncateIfLarge } from '../collectors/token-estimator.js'
import type {
  AgentEntry,
  McpEntry,
  MessageBreakdown,
  ProxyDiagnosisData,
  SkillEntry,
} from '../types/index.js'

const MCP_PREFIXES = ['mcp__', 'headroom_']

export interface ToolStat {
  name: string
  estimatedTokens: number
}

/** Internal per-server accumulation record during parsing. */
export type McpServersMap = Record<
  string,
  {
    serverName: string
    toolCount: number
    estimatedTokens: number
    tools: string[]
    loadingMode: 'direct' | 'deferred'
  }
>

export type SkillTokensMap = Record<
  string,
  { description: string; estimatedTokens: number; location?: string }
>

/**
 * Classify a request-body tool definition. The body carries no per-tool
 * provenance, so only MCP server tools (prefixed names like `mcp__<server>__`
 * or the `headroom_` special case) are non-builtin. Everything else — including
 * deferred-capable builtins such as CronCreate / EnterWorktree / Workflow and
 * any tool absent from a hardcoded list — is a builtin tool loaded in the
 * current request.
 */
export function classifyTool(name: string): 'builtin' | 'mcp' {
  if (MCP_PREFIXES.some((p) => name.startsWith(p))) return 'mcp'
  return 'builtin'
}

/**
 * Extract tool name from the Anthropic-compatible API tool format:
 *   {"type":"function","function":{"name":"Agent","description":"...","parameters":{...}}}
 * or the native format:
 *   {"name":"Read","description":"...","input_schema":{...}}
 * Falls back to t.name for other formats.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractToolName(t: any): string {
  if (typeof t?.function?.name === 'string') return t.function.name
  if (typeof t?.name === 'string') return t.name
  return 'unknown'
}

/**
 * Extract MCP server references from text by finding mcp__XXX patterns,
 * and merge them into mcpServers.
 */
export function extractMcpFromText(text: string, mcpServers: McpServersMap): void {
  const mcpMatches = text.matchAll(/mcp__([a-zA-Z0-9_-]+)/g)
  for (const match of mcpMatches) {
    const fullName = match[0]
    const server = match[1]?.split('__')[0]
    if (!server) continue
    const entry = (mcpServers[server] ??= {
      serverName: server,
      toolCount: 0,
      estimatedTokens: 0,
      tools: [],
      loadingMode: 'deferred',
    })
    if (!entry.tools.includes(fullName)) {
      entry.tools.push(fullName)
    }
  }
}

/**
 * Extract deferred MCP tools from the ToolSearch tool description's
 * <available_deferred_tools> block. Bare `mcp__XXX` lines are server-level
 * references; `mcp__XXX: ...` lines are concrete tool definitions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractDeferredMcpTools(tools: any[]): {
  tools: { name: string; estimatedTokens: number }[]
  references: string[]
} {
  const toolSearchDef = tools.find((t) => extractToolName(t) === 'ToolSearch')
  if (!toolSearchDef) return { tools: [], references: [] }

  const desc = toolSearchDef.function?.description ?? toolSearchDef.description ?? ''
  const match = desc.match(/<available_deferred_tools>([\s\S]*?)<\/available_deferred_tools>/)
  if (!match) return { tools: [], references: [] }

  const block = match[1] ?? ''
  const lines = block.split('\n')
  const result: { name: string; estimatedTokens: number }[] = []
  const refs: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('mcp__')) {
      if (!trimmed.includes(':')) {
        refs.push(trimmed)
        continue
      }
      result.push({ name: trimmed.split(':')[0], estimatedTokens: Math.ceil(trimmed.length / 4) })
      continue
    }

    const nameMatch = trimmed.match(/^(\S+):/)
    if (!nameMatch?.[1]) continue
    const name = nameMatch[1]
    if (!name.startsWith('mcp__')) continue
    result.push({ name, estimatedTokens: Math.ceil(trimmed.length / 4) })
  }

  return { tools: result, references: refs }
}

export interface ParsedCore {
  roleCounts: Record<string, number>
  roleTokens: Record<string, number>
  breakdown: MessageBreakdown[]
  memoryTokens: number
  rulesTokens: number
  mcpServers: McpServersMap
  builtin: ToolStat[]
  mcp: ToolStat[]
  /** Normalized messages (incl. virtual system message from top-level `system`) */
  messages: unknown[]
  /** Raw tools array from the request body */
  tools: unknown[]
}

/**
 * Parse the parts of a request body shared by every agent: messages breakdown,
 * memory/rules token detection, MCP server references, and tool definitions.
 * Agent-specific extraction (skills / subagents / plugins) stays in each
 * agent's own parser.
 */
export function parseCore(body: unknown): ParsedCore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (body ?? {}) as Record<string, any>
  let messages = Array.isArray(req.messages) ? req.messages : []
  const tools = Array.isArray(req.tools) ? req.tools : []

  // Normalize Anthropic top-level `system` field into a virtual system message
  if (req.system && !messages.some((m: Record<string, unknown>) => m.role === 'system')) {
    let systemContent = ''
    if (typeof req.system === 'string') {
      systemContent = req.system
    } else if (Array.isArray(req.system)) {
      systemContent = req.system
        .map((b: Record<string, unknown>) =>
          typeof b.text === 'string' ? b.text : JSON.stringify(b),
        )
        .join('\n')
    }
    if (systemContent) {
      messages = [{ role: 'system', content: systemContent }, ...messages]
    }
  }

  // --- Messages ---
  const roleCounts: Record<string, number> = {}
  const roleTokens: Record<string, number> = {}
  const breakdown: MessageBreakdown[] = []

  let rulesTokens = 0
  let memoryTokens = 0
  const mcpServers: McpServersMap = {}

  for (const m of messages) {
    const role = typeof m?.role === 'string' ? m.role : 'unknown'
    const content = m?.content

    if (typeof content === 'string') {
      const { content: snippet, truncated } = truncateIfLarge(content)
      const est = estimateTokensOf(snippet)
      roleCounts[role] = (roleCounts[role] ?? 0) + 1
      roleTokens[role] = (roleTokens[role] ?? 0) + est
      breakdown.push({
        role,
        index: breakdown.length,
        contentType: 'text',
        estimatedTokens: est,
        charLength: Buffer.byteLength(content, 'utf8'),
        snippet: truncated ? snippet : snippet.slice(0, 200),
      })
      // Memory: system-reminder with data-role="memory"
      if (content.includes('<system-reminder') && content.includes('data-role="memory"')) {
        memoryTokens += est
      }
      // Rules: CODEBUDDY.md / <rules> block in system prompt
      if (content.includes('<rules>') || content.includes('codebuddyMd')) {
        rulesTokens += est
      }
      // MCP references appear in mcp__ markers
      extractMcpFromText(content, mcpServers)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        const text = typeof block?.text === 'string' ? block.text : JSON.stringify(block)
        const { content: snippet, truncated } = truncateIfLarge(text)
        const est = estimateTokensOf(snippet)
        roleCounts[role] = (roleCounts[role] ?? 0) + 1
        roleTokens[role] = (roleTokens[role] ?? 0) + est
        breakdown.push({
          role,
          index: breakdown.length,
          contentType: block?.type ?? 'text',
          estimatedTokens: est,
          charLength: Buffer.byteLength(text, 'utf8'),
          snippet: truncated ? snippet : snippet.slice(0, 200),
        })
        if (text.includes('<system-reminder') && text.includes('data-role="memory"')) {
          memoryTokens += est
        }
        if (text.includes('<rules>') || text.includes('codebuddyMd')) {
          rulesTokens += est
        }
        extractMcpFromText(text, mcpServers)
      }
    }
  }

  // --- Tools (top-level definitions) ---
  const builtin: ToolStat[] = []
  const mcp: ToolStat[] = []

  for (const t of tools) {
    const name = extractToolName(t)
    const est = estimateTokensOf(t)

    if (classifyTool(name) === 'mcp') {
      mcp.push({ name, estimatedTokens: est })
      const parts = name.startsWith('mcp__')
        ? name.slice('mcp__'.length).split('__')
        : name.split('__')
      const server = parts[0] ?? name
      const entry = (mcpServers[server] ??= {
        serverName: server,
        toolCount: 0,
        estimatedTokens: 0,
        tools: [],
        loadingMode: 'direct',
      })
      entry.toolCount += 1
      entry.estimatedTokens += est
      entry.tools.push(name)
    } else {
      builtin.push({ name, estimatedTokens: est })
    }
  }

  // --- Deferred MCP tools from ToolSearch description (<available_deferred_tools>) ---
  const deferredMcp = extractDeferredMcpTools(tools)
  for (const dt of deferredMcp.tools) {
    mcp.push({ name: dt.name, estimatedTokens: dt.estimatedTokens })
    const parts = dt.name.startsWith('mcp__')
      ? dt.name.slice('mcp__'.length).split('__')
      : dt.name.split('__')
    const server = parts[0] ?? dt.name
    const entry = (mcpServers[server] ??= {
      serverName: server,
      toolCount: 0,
      estimatedTokens: 0,
      tools: [],
      loadingMode: 'deferred',
    })
    entry.toolCount += 1
    entry.estimatedTokens += dt.estimatedTokens
    entry.tools.push(dt.name)
  }
  for (const ref of deferredMcp.references) {
    const server = ref.startsWith('mcp__') ? ref.slice('mcp__'.length).split('__')[0] : ref
    const entry = (mcpServers[server] ??= {
      serverName: server,
      toolCount: 0,
      estimatedTokens: 0,
      tools: [],
      loadingMode: 'deferred',
    })
    if (!entry.tools.includes(ref)) {
      entry.tools.push(ref)
    }
  }

  return {
    roleCounts,
    roleTokens,
    breakdown,
    memoryTokens,
    rulesTokens,
    mcpServers,
    builtin,
    mcp,
    messages,
    tools,
  }
}

export function mcpServersToEntries(mcpServers: McpServersMap): McpEntry[] {
  return Object.values(mcpServers).map((s) => ({
    name: s.serverName,
    status: 'enabled' as const,
    toolsCount: s.toolCount,
    estimatedTokens: s.estimatedTokens,
    tools: s.tools,
    loadingMode: s.loadingMode,
  }))
}

export function skillTokensToEntries(skillTokens: SkillTokensMap): SkillEntry[] {
  return Object.entries(skillTokens).map(([name, info]) => ({
    name,
    source: 'skill' as const,
    estimatedTokens: info.estimatedTokens,
    sourcePath: info.location,
    description: info.description,
  }))
}

export function computeTotal(
  roleTokens: Record<string, number>,
  builtin: ToolStat[],
  mcp: ToolStat[],
  skills: SkillEntry[],
): number {
  return (
    Object.values(roleTokens).reduce((a, b) => a + b, 0) +
    [...builtin, ...mcp].reduce((a, b) => a + b.estimatedTokens, 0) +
    skills.reduce((a, b) => a + b.estimatedTokens, 0)
  )
}

/**
 * Assemble the final ProxyDiagnosisData from the shared parse core plus the
 * agent-specific extractions. `body` is re-read for the `model` field.
 */
export function assembleProxyDiagnosisData(args: {
  body: unknown
  core: ParsedCore
  skillTokens: SkillTokensMap
  agents: AgentEntry[]
  detectedPlugins: string[]
}): ProxyDiagnosisData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (args.body ?? {}) as Record<string, any>
  const { roleCounts, roleTokens, breakdown, memoryTokens, rulesTokens, mcpServers, builtin, mcp } =
    args.core
  const skills = skillTokensToEntries(args.skillTokens)
  return {
    messages: { roleCounts, roleTokens, breakdown },
    tools: { builtin, mcp },
    skills,
    mcpServers: mcpServersToEntries(mcpServers),
    totalEstimatedTokens: computeTotal(roleTokens, builtin, mcp, skills),
    // Extended fields for rich report
    skillTokens: args.skillTokens,
    agents: args.agents,
    detectedPlugins: args.detectedPlugins,
    rulesTokens,
    memoryTokens,
    model: req.model ?? 'unknown',
    toolDescriptions: {} as Record<string, string>,
  }
}

/**
 * Aggregate multiple parsed fragments into one, computing average total tokens
 * and merging breakdowns across captured requests.
 */
export function aggregateCaptures(fragments: ProxyDiagnosisData[]): ProxyDiagnosisData {
  if (fragments.length === 0) {
    return {
      messages: { roleCounts: {}, roleTokens: {}, breakdown: [] },
      tools: { builtin: [], mcp: [] },
      skills: [],
      agents: [],
      mcpServers: [],
      totalEstimatedTokens: 0,
      model: 'unknown',
      skillTokens: {},
      detectedPlugins: [],
      toolDescriptions: {},
    }
  }
  if (fragments.length === 1) return fragments[0]

  const totals = fragments.map((f) => f.totalEstimatedTokens)
  const avgTotal = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)

  return {
    ...fragments[0],
    totalEstimatedTokens: avgTotal,
  }
}
