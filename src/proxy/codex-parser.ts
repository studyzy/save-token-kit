import { estimateTokensOf, truncateIfLarge } from '../collectors/token-estimator.js'
import type { AgentEntry, ProxyDiagnosisData, MessageBreakdown, SkillEntry } from '../types/index.js'
import { extractMcpFromText, extractToolName, classifyTool, type McpServersMap } from './parser-core.js'
import { extractAgentsFromText } from './codebuddy-parser.js'

/**
 * OpenAI CodeX speaks the Responses API. Its request body differs from the
 * Anthropic format used by CodeBuddy / Claude:
 *   - system prompt  -> top-level `instructions` (string)
 *   - messages       -> `input` (array of {type:'message', role, content})
 *   - tools          -> OpenAI format ({type:'function', name, description, parameters})
 *
 * This parser maps the Responses shape onto the shared ProxyDiagnosisData
 * contract so downstream report rendering stays agent-agnostic.
 */

const CODEX_AGENTS_HEADER = 'Available agent types for the Agent tool:'

/** Concatenate a message item's content (string or content blocks) into text. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function messageText(msg: any): string {
  const content = msg?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => (typeof b?.text === 'string' ? b.text : ''))
      .join('\n')
  }
  return ''
}

interface ResponsesCore {
  roleCounts: Record<string, number>
  roleTokens: Record<string, number>
  breakdown: MessageBreakdown[]
  memoryTokens: number
  rulesTokens: number
  mcpServers: McpServersMap
  builtin: { name: string; estimatedTokens: number }[]
  mcp: { name: string; estimatedTokens: number }[]
  /** Normalized messages (with instructions prepended as a system message) */
  messages: unknown[]
  /** Raw tools array from the request body */
  tools: unknown[]
}

/**
 * Parse the shared parts of a Responses-API body: role/message breakdown,
 * memory/rules token detection, MCP references, and tool definitions.
 */
function parseCoreResponses(body: unknown): ResponsesCore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (body ?? {}) as Record<string, any>
  const input = Array.isArray(req.input) ? req.input : []
  const tools = Array.isArray(req.tools) ? req.tools : []

  // Normalize top-level `instructions` into a virtual system message.
  const messages = typeof req.instructions === 'string' && req.instructions
    ? [{ role: 'system', content: req.instructions }, ...input]
    : [...input]

  const roleCounts: Record<string, number> = {}
  const roleTokens: Record<string, number> = {}
  const breakdown: MessageBreakdown[] = []
  let rulesTokens = 0
  let memoryTokens = 0
  const mcpServers: McpServersMap = {}

  for (const m of messages) {
    const role = typeof m?.role === 'string' ? m.role : 'unknown'
    const content = m?.content
    let text = ''
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      text = content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => (typeof b?.text === 'string' ? b.text : ''))
        .join('\n')
    }
    if (!text) continue

    const { content: snippet, truncated } = truncateIfLarge(text)
    const est = estimateTokensOf(snippet)
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
    roleTokens[role] = (roleTokens[role] ?? 0) + est
    breakdown.push({
      role,
      index: breakdown.length,
      contentType: 'text',
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

  // --- Tools (OpenAI Responses format: {type, name, description, parameters}) ---
  const builtin: { name: string; estimatedTokens: number }[] = []
  const mcp: { name: string; estimatedTokens: number }[] = []
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

  return { roleCounts, roleTokens, breakdown, memoryTokens, rulesTokens, mcpServers, builtin, mcp, messages, tools }
}

/** Skill token map keyed by skill name. */
interface CodexSkillTokens {
  description: string
  estimatedTokens: number
  location?: string
}

/**
 * Extract skills from a CodeX request. CodeX lists available skills inside the
 * `input` messages under a `<skills_instructions>...### Available skills...`
 * block (format: `- <name>: <desc> (file: <path>)`), rather than in a Skill tool
 * description like CodeBuddy. Fall back to the Skill-tool path when present.
 */
function extractSkillTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
): Record<string, CodexSkillTokens> {
  const result: Record<string, CodexSkillTokens> = {}

  // Primary path: skills listed under <skills_instructions> in the input messages.
  for (const msg of messages) {
    const text = messageText(msg)
    const blockStart = text.indexOf('<skills_instructions>')
    const blockEnd = text.indexOf('</skills_instructions>')
    if (blockStart === -1 || blockEnd === -1) continue
    const block = text.slice(blockStart, blockEnd)
    const listStart = block.indexOf('### Available skills')
    if (listStart === -1) continue
    const list = block.slice(listStart)
    for (const entry of list.split('\n- ')) {
      const trimmed = entry.trim()
      if (!trimmed) continue
      const nameMatch = trimmed.match(/^-?\s*([^:]+):/)
      if (!nameMatch?.[1]) continue
      const name = nameMatch[1].trim()
      const locMatch = trimmed.match(/\(file:\s*(.+?)\)/)
      const location = locMatch?.[1]?.trim()
      result[name] = {
        description: trimmed,
        estimatedTokens: Math.ceil(trimmed.length / 4),
        location,
      }
    }
    // Skills are listed once; stop after the first matching block.
    break
  }

  // Fallback: a Skill tool whose description carries an <available_skills> block.
  if (Object.keys(result).length === 0) {
    const skillTool = tools.find((t) => extractToolName(t) === 'Skill')
    const desc = skillTool?.function?.description ?? skillTool?.description ?? ''
    const match = desc.match(/<available_skills>\n([\s\S]*?)\n<\/available_skills>/)
    if (match) {
      for (const entry of (match[1] ?? '').split('\n- ')) {
        const trimmed = entry.trim()
        if (!trimmed) continue
        const nameMatch = trimmed.match(/^-?\s*([^:]+):/)
        if (!nameMatch?.[1]) continue
        const name = nameMatch[1].trim()
        const locMatch = trimmed.match(/\(location:\s*(.+?)\)/)
        const location = locMatch?.[1]?.trim()
        if (!location) continue
        result[name] = {
          description: trimmed,
          estimatedTokens: Math.ceil(trimmed.length / 4),
          location: location !== 'bundled' ? location : undefined,
        }
      }
    }
  }

  return result
}

/** Extract subagents from a system message listing. */
function extractCodexAgents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
): AgentEntry[] {
  const agents: AgentEntry[] = []
  const seen = new Set<string>()
  for (const msg of messages) {
    const content = messageText(msg)
    const headerIdx = content.indexOf(CODEX_AGENTS_HEADER)
    if (headerIdx === -1) continue
    const rest = content.slice(headerIdx + CODEX_AGENTS_HEADER.length)
    const end = rest.search(/\n\s*\n/)
    const listText = end === -1 ? rest : rest.slice(0, end)
    extractAgentsFromText(listText, agents, seen)
  }
  return agents
}

/** Detect active plugins via message mode markers (same markers as CodeBuddy). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectPluginsFromMessages(messages: any[]): string[] {
  const markers: Record<string, string> = {
    caveman: 'CAVEMAN MODE ACTIVE',
    ponytail: 'PONYTAIL MODE ACTIVE',
  }
  const detected: string[] = []
  for (const msg of messages) {
    const content = messageText(msg)
    for (const [plugin, marker] of Object.entries(markers)) {
      if (!detected.includes(plugin) && content.includes(marker)) {
        detected.push(plugin)
      }
    }
  }
  return detected
}

/** Assemble a ProxyDiagnosisData fragment from the Responses core. */
function assembleResponsesData(args: {
  body: unknown
  core: ResponsesCore
  skillTokens: Record<string, { description: string; estimatedTokens: number; location?: string }>
  agents: AgentEntry[]
  detectedPlugins: string[]
}): ProxyDiagnosisData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (args.body ?? {}) as Record<string, any>
  const { roleCounts, roleTokens, breakdown, memoryTokens, rulesTokens, mcpServers, builtin, mcp } =
    args.core
  const skills: SkillEntry[] = Object.entries(args.skillTokens).map(([name, info]) => ({
    name,
    source: 'bundled',
    estimatedTokens: info.estimatedTokens,
    sourcePath: info.location,
    description: info.description,
  }))
  const mcpServersList = Object.values(mcpServers).map((s) => ({
    name: s.serverName,
    status: 'enabled' as const,
    toolsCount: s.toolCount,
    estimatedTokens: s.estimatedTokens,
    tools: s.tools,
    loadingMode: s.loadingMode,
  }))
  const total =
    Object.values(roleTokens).reduce((a, b) => a + b, 0) +
    [...builtin, ...mcp].reduce((a, b) => a + b.estimatedTokens, 0) +
    skills.reduce((a, b) => a + b.estimatedTokens, 0)
  return {
    messages: { roleCounts, roleTokens, breakdown },
    tools: { builtin, mcp },
    skills,
    mcpServers: mcpServersList,
    totalEstimatedTokens: total,
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
 * Parse a single captured CodeX POST request body (OpenAI Responses API) into
 * a ProxyDiagnosisData fragment.
 */
export function parseCodexRequestBody(body: unknown): ProxyDiagnosisData {
  const core = parseCoreResponses(body)

  // --- Skills from the input <skills_instructions> block (or Skill tool) ---
  const skillTokens = extractSkillTokens(core.tools, core.messages)

  // --- Subagents from the Agent tool description list ---
  const agents: AgentEntry[] = []
  const agentSeen = new Set<string>()
  for (const t of core.tools) {
    if (extractToolName(t) !== 'Agent') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const desc = (t as any)?.function?.description ?? (t as any)?.description ?? ''
    extractAgentsFromText(desc, agents, agentSeen)
  }
  // Fall back to a system-listing if no Agent tool description carried entries.
  if (agents.length === 0) agents.push(...extractCodexAgents(core.messages))

  // --- Plugins active in the request body ---
  const detectedPlugins = detectPluginsFromMessages(core.messages)

  return assembleResponsesData({ body, core, skillTokens, agents, detectedPlugins })
}
