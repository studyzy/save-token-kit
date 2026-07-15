import { estimateTokensOf, truncateIfLarge } from '../collectors/token-estimator.js'
import type {
  MessageBreakdown,
  ProxyDiagnosisData,
  ToolDef,
  DetectedSkill,
  McpServerDetection,
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
 * Extract skills from text by parsing <available_skills> blocks.
 */
function extractSkillsFromText(text: string, skillReferences: string[]): void {
  const skillMatches = text.matchAll(/<available_skills>([\s\S]*?)<\/available_skills>/g)
  for (const match of skillMatches) {
    const skillSection = match[1] ?? ''
    const names = skillSection.matchAll(/- name:\s*(\S+)/g)
    for (const nameMatch of names) {
      const name = nameMatch[1]
      if (name && !skillReferences.includes(name)) {
        skillReferences.push(name)
      }
    }
  }
}

/**
 * Extract MCP server references from text by finding mcp__XXX patterns.
 */
function extractMcpFromText(text: string, mcpReferences: string[]): void {
  const mcpMatches = text.matchAll(/mcp__(\w+)/g)
  for (const match of mcpMatches) {
    const name = match[1]
    if (name && !mcpReferences.includes(name)) {
      mcpReferences.push(name)
    }
  }
}

/**
 * Extract per-skill token breakdown from the Skill tool definition.
 * Parses the <available_skills> block in the Skill tool's description.
 */
function extractSkillTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
): Record<string, { description: string; estimatedTokens: number }> {
  const skillTool = tools.find((t) => extractToolName(t) === 'Skill')
  if (!skillTool) return {}

  const desc = skillTool.function?.description ?? skillTool.description ?? ''
  const match = desc.match(/<available_skills>\n([\s\S]*?)\n<\/available_skills>/)
  if (!match) return {}

  const block = match[1] ?? ''
  const entries = block.split('\n- ')
  const result: Record<string, { description: string; estimatedTokens: number }> = {}

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
  const skillReferences: string[] = []
  const mcpReferences: string[] = []

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
      // Skills + MCP references appear in <available_skills>/mcp__ markers
      extractSkillsFromText(content, skillReferences)
      extractMcpFromText(content, mcpReferences)
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
        extractSkillsFromText(text, skillReferences)
        extractMcpFromText(text, mcpReferences)
      }
    }
  }

  // --- Tools (top-level definitions) ---
  const builtin: ToolDef[] = []
  const mcp: ToolDef[] = []
  const deferred: ToolDef[] = []
  const mcpServers: Record<string, McpServerDetection> = {}

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
      })
      entry.toolCount += 1
      entry.estimatedTokens += est
    } else if (category === 'deferred') {
      deferred.push({ name, estimatedTokens: est })
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
    const entry = (mcpServers[server] ??= { serverName: server, toolCount: 0, estimatedTokens: 0 })
    entry.toolCount += 1
    entry.estimatedTokens += dt.estimatedTokens
  }
  for (const ref of deferredMcp.references) {
    if (!mcpReferences.includes(ref)) mcpReferences.push(ref)
  }

  // --- Plugins active in the request body ---
  const detectedPlugins = detectPluginsFromMessages(messages)

  // --- Skills (from Skill tool description) ---
  const skillTokens = extractSkillTokens(tools)
  const skills: DetectedSkill[] = Object.entries(skillTokens).map(([name, info]) => ({
    name,
    source: 'skill',
    estimatedTokens: info.estimatedTokens,
  }))

  const totalEstimatedTokens =
    Object.values(roleTokens).reduce((a, b) => a + b, 0) +
    [...builtin, ...mcp, ...deferred].reduce((a, b) => a + b.estimatedTokens, 0) +
    skills.reduce((a, b) => a + b.estimatedTokens, 0)

  return {
    messages: { roleCounts, roleTokens, breakdown },
    tools: { builtin, mcp, deferred },
    skills,
    mcpServers: Object.values(mcpServers),
    totalEstimatedTokens,
    // Extended fields for rich report
    skillTokens,
    skillReferences,
    mcpReferences,
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
      mcpServers: [],
      totalEstimatedTokens: 0,
      model: 'unknown',
      skillTokens: {},
      skillReferences: [],
      mcpReferences: [],
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
