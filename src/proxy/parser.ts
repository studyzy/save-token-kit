import { estimateTokensOf, truncateIfLarge } from '../collectors/token-estimator.js'
import type {
  MessageBreakdown,
  ProxyDiagnosisData,
  SkillEntry,
  AgentEntry,
} from '../types/index.js'

/**
 * Known builtin CodeBuddy tools. Anything not in this set is classified as MCP/deferred.
 */
const BUILTIN_TOOLS = new Set([
  'Agent',
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'EnterPlanMode',
  'ExitPlanMode',
  'TaskCreate',
  'TaskGet',
  'TaskUpdate',
  'TaskList',
  'WebFetch',
  'WebSearch',
  'TaskStop',
  'TaskOutput',
  'Skill',
  'AskUserQuestion',
  'ToolSearch',
  'DeferExecuteTool',
  'SendMessage',
  'WaitForMcpServers',
])

const MCP_PREFIXES = ['mcp__', 'headroom_']

const DEFERRED_TOOLS = new Set([
  'CronCreate',
  'CronDelete',
  'CronList',
  'EnterWorktree',
  'LeaveWorktree',
  'ImageEdit',
  'ImageGen',
  'VideoGen',
  'NotebookEdit',
  'LSP',
  'TeamCreate',
  'TeamDelete',
  'Workflow',
])

function classifyTool(name: string): 'builtin' | 'mcp' | 'deferred' {
  if (MCP_PREFIXES.some((p) => name.startsWith(p))) return 'mcp'
  if (BUILTIN_TOOLS.has(name)) return 'builtin'
  if (DEFERRED_TOOLS.has(name)) return 'deferred'
  return 'mcp' // unknown → classify as MCP
}

/**
 * Extract tool name from the CodeBuddy API tool format:
 *   {"type":"function","function":{"name":"Agent","description":"...","parameters":{...}}}
 * Falls back to t.name for other formats.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractToolName(t: any): string {
  if (typeof t?.function?.name === 'string') return t.function.name
  if (typeof t?.name === 'string') return t.name
  return 'unknown'
}

/**
 * Extract MCP server references from text by finding mcp__XXX patterns,
 * and merge them into mcpServers.
 */
function extractMcpFromText(
  text: string,
  mcpServers: Record<string, { serverName: string; toolCount: number; estimatedTokens: number; tools: string[]; loadingMode: 'direct' | 'deferred' }>,
): void {
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
 * Extract subagent (Agent) definitions from the Agent tool description text.
 *
 * Format:
 *   - name: description...[\n more description...][ (source)][ (Tools: a,b,c)]
 *
 * Entries start with "- name:" and extend to the terminating "(Tools:...)" or
 * the start of the next agent entry. Descriptions may span multiple lines.
 * Excludes "general-purpose" and usage-note lines.
 */
function extractAgentsFromText(
  text: string,
  agents: AgentEntry[],
  seen: Set<string>,
): void {
  // Match from "- name:" to the next "(Tools:" or next "- name:" (whichever comes first).
  // The "s" flag makes "." match newlines for multi-line descriptions.
  const pat = /^- ([a-zA-Z][a-zA-Z0-9_-]*): (.+?)(?=\(Tools:|\n- [a-zA-Z][a-zA-Z0-9_-]*:)/gms
  let m: RegExpExecArray | null
  while ((m = pat.exec(text)) !== null) {
    const name = m[1]
    const body = m[2].trim()

    if (name === 'general-purpose' || seen.has(name)) continue
    if (isAgentUsageNote(name, body)) continue

    seen.add(name)

    // Merge multi-line description into single line
    let description = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')

    // Parse trailing (source) — "(project)", "(bundled)", "(plugin@...)", etc.
    let source: string | undefined
    const sourceMatch = description.match(/\(([^)]*(?:@[^)]*)?)\)\s*$/)
    if (sourceMatch) {
      const sval = sourceMatch[1]
      if (sval.includes('@')) {
        source = 'plugin'
      } else if (['project', 'bundled', 'user'].includes(sval)) {
        source = sval
      } else {
        source = sval
      }
      description = description.slice(0, sourceMatch.index).trim()
    }

    // Extract tools from the "(Tools: ...)" suffix in the original text.
    // Search forward from this agent's start position.
    const agentStart = text.indexOf(`- ${name}:`)
    let tools: string[] = []
    if (agentStart >= 0) {
      const toolsMatch = text.slice(agentStart).match(/\(Tools:\s*([^)]*)\)/)
      if (toolsMatch) {
        const toolsStr = toolsMatch[1].trim()
        if (toolsStr) {
          tools = toolsStr.split(',').map((t) => t.trim())
        }
      }
    }

    agents.push({
      name,
      estimatedTokens: Math.ceil((name.length + description.length) / 4),
      source,
      description,
      tools,
    })
  }
}

/**
 * Check if a line that looks like "- name: text" is actually an
 * Agent tool usage note rather than a real agent definition.
 */
function isAgentUsageNote(name: string, rest: string): boolean {
  const notes = ['Trust but verify', 'Foreground vs background', 'Lookups']
  if (notes.includes(name)) return true
  // Parameter description lines — names look like parameter names (snake_case)
  if (/^[a-z]+(_[a-z]+)*$/.test(name)) {
    const paramPrefixes = [
      'Name for the',
      'The type of',
      'Team name for',
      'Permission mode',
      'Maximum number of',
      'Model variant',
    ]
    if (paramPrefixes.some((p) => rest.startsWith(p))) return true
  }
  return false
}

/**
 * Extract per-skill token breakdown from the Skill tool definition.
 * Parses the <available_skills> block in the Skill tool's description.
 */
function extractSkillTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
): Record<string, { description: string; estimatedTokens: number; location?: string }> {
  const skillTool = tools.find((t) => extractToolName(t) === 'Skill')
  if (!skillTool) return {}

  const desc = skillTool.function?.description ?? skillTool.description ?? ''
  const match = desc.match(/<available_skills>\n([\s\S]*?)\n<\/available_skills>/)
  if (!match) return {}

  const block = match[1] ?? ''
  const entries = block.split('\n- ')
  const result: Record<string, { description: string; estimatedTokens: number; location?: string }> = {}

  for (const entry of entries) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    // Only count real skills — location must contain a real path or "bundled" marker.
    // Builtin commands have `(location: )` with just whitespace inside.
    const locMatch = trimmed.match(/\(location:\s*(.+?)\)/)
    const location = locMatch?.[1]?.trim()
    if (!location) continue
    // Skip entries whose "name" still has the "- " prefix from split (first element artifact)
    const nameMatch = trimmed.match(/^-?\s*([^:]+):/)
    if (!nameMatch?.[1]) continue
    const name = nameMatch[1].trim()
    result[name] = {
      description: trimmed,
      estimatedTokens: Math.ceil(trimmed.length / 4),
      location: location !== 'bundled' ? location : undefined,
    }
  }
  return result
}

/**
 * Extract deferred MCP tools from the ToolSearch tool description's
 * <available_deferred_tools> block. Bare `mcp__XXX` lines are server-level
 * references; `mcp__XXX: ...` lines are concrete tool definitions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDeferredMcpTools(tools: any[]): {
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

/** Detect active plugins via mode markers in message content. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectPluginsFromMessages(messages: any[]): string[] {
  const markers: Record<string, string> = {
    caveman: 'CAVEMAN MODE ACTIVE',
    ponytail: 'PONYTAIL MODE ACTIVE',
  }
  const detected: string[] = []
  for (const msg of messages) {
    let content = ''
    if (typeof msg?.content === 'string') {
      content = msg.content
    } else if (Array.isArray(msg?.content)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content = msg.content.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('\n')
    }
    for (const [plugin, marker] of Object.entries(markers)) {
      if (!detected.includes(plugin) && content.includes(marker)) {
        detected.push(plugin)
      }
    }
  }
  return detected
}

/**
 * Parse a single captured LLM POST request body into a ProxyDiagnosisData fragment.
 */
export function parseRequestBody(body: unknown): ProxyDiagnosisData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (body ?? {}) as Record<string, any>
  const messages = Array.isArray(req.messages) ? req.messages : []
  const tools = Array.isArray(req.tools) ? req.tools : []

  // --- Messages ---
  const roleCounts: Record<string, number> = {}
  const roleTokens: Record<string, number> = {}
  const breakdown: MessageBreakdown[] = []

  let rulesTokens = 0
  let memoryTokens = 0
  const agents: AgentEntry[] = []
  const agentSeen = new Set<string>()
  const mcpServers: Record<string, { serverName: string; toolCount: number; estimatedTokens: number; tools: string[]; loadingMode: 'direct' | 'deferred' }> = {}

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
  const builtin: { name: string; estimatedTokens: number }[] = []
  const mcp: { name: string; estimatedTokens: number }[] = []
  const deferred: { name: string; estimatedTokens: number }[] = []

  for (const t of tools) {
    const name = extractToolName(t)
    const est = estimateTokensOf(t)
    const category = classifyTool(name)

    if (category === 'mcp') {
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
    } else if (category === 'deferred') {
      deferred.push({ name, estimatedTokens: est })
    } else {
      builtin.push({ name, estimatedTokens: est })
    }
  }

  // --- Subagents from the Agent tool description list ---
  for (const t of tools) {
    if (extractToolName(t) !== 'Agent') continue
    const desc = t?.function?.description ?? t?.description ?? ''
    extractAgentsFromText(desc, agents, agentSeen)
  }

  // --- Deferred MCP tools from ToolSearch description (<available_deferred_tools>) ---
  const deferredMcp = extractDeferredMcpTools(tools)
  for (const dt of deferredMcp.tools) {
    mcp.push({ name: dt.name, estimatedTokens: dt.estimatedTokens })
    const parts = dt.name.startsWith('mcp__')
      ? dt.name.slice('mcp__'.length).split('__')
      : dt.name.split('__')
    const server = parts[0] ?? dt.name
    const entry = (mcpServers[server] ??= { serverName: server, toolCount: 0, estimatedTokens: 0, tools: [], loadingMode: 'deferred' })
    entry.toolCount += 1
    entry.estimatedTokens += dt.estimatedTokens
    entry.tools.push(dt.name)
  }
  for (const ref of deferredMcp.references) {
    const server = ref.startsWith('mcp__') ? ref.slice('mcp__'.length).split('__')[0] : ref
    const entry = (mcpServers[server] ??= { serverName: server, toolCount: 0, estimatedTokens: 0, tools: [], loadingMode: 'deferred' })
    if (!entry.tools.includes(ref)) {
      entry.tools.push(ref)
    }
  }

  // --- Plugins active in the request body ---
  const detectedPlugins = detectPluginsFromMessages(messages)

  // --- Skills (from Skill tool description) ---
  const skillTokens = extractSkillTokens(tools)
  const skills: SkillEntry[] = Object.entries(skillTokens).map(([name, info]) => ({
    name,
    source: 'skill' as const,
    estimatedTokens: info.estimatedTokens,
    sourcePath: info.location,
    description: info.description,
  }))

  const totalEstimatedTokens =
    Object.values(roleTokens).reduce((a, b) => a + b, 0) +
    [...builtin, ...mcp, ...deferred].reduce((a, b) => a + b.estimatedTokens, 0) +
    skills.reduce((a, b) => a + b.estimatedTokens, 0)

  return {
    messages: { roleCounts, roleTokens, breakdown },
    tools: { builtin, mcp, deferred },
    skills,
    mcpServers: Object.values(mcpServers).map((s) => ({
      name: s.serverName,
      status: 'enabled' as const,
      toolsCount: s.toolCount,
      estimatedTokens: s.estimatedTokens,
      tools: s.tools,
      loadingMode: s.loadingMode,
    })),
    totalEstimatedTokens,
    // Extended fields for rich report
    skillTokens,
    agents,
    detectedPlugins,
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
      tools: { builtin: [], mcp: [], deferred: [] },
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
