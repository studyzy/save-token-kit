import { readFileSync, statSync } from 'node:fs'
import {
  assembleProxyDiagnosisData,
  extractToolName,
  parseCore,
  type SkillTokensMap,
} from './parser-core.js'
import type { AgentEntry, ProxyDiagnosisData } from '../types/index.js'

/**
 * Read SKILL.md frontmatter `description` for a skill whose source path is known.
 * `location` is either a SKILL.md file path or the skill directory; a directory is
 * resolved to `<dir>/SKILL.md`. Returns undefined when no frontmatter description
 * can be read (caller keeps the raw description as fallback).
 */
function readSkillFrontmatterDescription(location: string): string | undefined {
  let skillMd = location
  try {
    const stat = statSync(location)
    if (stat.isDirectory()) skillMd = `${location}/SKILL.md`
  } catch {
    return undefined
  }
  let content: string
  try {
    content = readFileSync(skillMd, 'utf8')
  } catch {
    return undefined
  }
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return undefined
  const frontmatter = fm[1] ?? ''
  const lines = frontmatter.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^description:\s*(.*)$/)
    if (!m) continue
    const inline = m[1].trim()
    // Block scalar (folded `>` or literal `|`): collect indented continuation lines.
    if (inline === '>' || inline === '|' || inline === '>-' || inline === '|-') {
      const body: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+\S/.test(lines[j])) body.push(lines[j].trim())
        else break
      }
      // Folded scalars join with spaces; literal scalars keep newlines.
      return inline.startsWith('>') ? body.join(' ') : body.join('\n')
    }
    return inline
  }
  return undefined
}

/**
 * Extract per-skill token breakdown from the Skill tool definition.
 * Parses the <available_skills> block in the Skill tool's description.
 */
function extractSkillTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
): SkillTokensMap {
  const skillTool = tools.find((t) => extractToolName(t) === 'Skill')
  if (!skillTool) return {}

  const desc = skillTool.function?.description ?? skillTool.description ?? ''
  const match = desc.match(/<available_skills>\n([\s\S]*?)\n<\/available_skills>/)
  if (!match) return {}

  const block = match[1] ?? ''
  const entries = block.split('\n- ')
  const result: SkillTokensMap = {}

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
    const resolvedLocation = location !== 'bundled' ? location : undefined
    // Prefer the clean SKILL.md frontmatter description over the raw <available_skills> line.
    const frontmatterDesc = resolvedLocation
      ? readSkillFrontmatterDescription(resolvedLocation)
      : undefined
    result[name] = {
      description: frontmatterDesc ?? trimmed,
      estimatedTokens: Math.ceil((frontmatterDesc ?? trimmed).length / 4),
      location: resolvedLocation,
    }
  }
  return result
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

/** Detect active CodeBuddy plugins via mode markers in message content. */
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
 * Parse a single captured CodeBuddy POST request body into a ProxyDiagnosisData
 * fragment. CodeBuddy-specific: skills come from the Skill tool's
 * <available_skills> block, subagents from the Agent tool description, and
 * plugins from message mode markers.
 */
export function parseCodeBuddyRequestBody(body: unknown): ProxyDiagnosisData {
  const core = parseCore(body)

  // --- Subagents from the Agent tool description list ---
  const agents: AgentEntry[] = []
  const agentSeen = new Set<string>()
  for (const t of core.tools) {
    if (extractToolName(t) !== 'Agent') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const desc = (t as any)?.function?.description ?? (t as any)?.description ?? ''
    extractAgentsFromText(desc, agents, agentSeen)
  }

  // --- Skills from the Skill tool <available_skills> block ---
  const skillTokens = extractSkillTokens(core.tools)

  // --- Plugins active in the request body ---
  const detectedPlugins = detectPluginsFromMessages(core.messages)

  return assembleProxyDiagnosisData({ body, core, skillTokens, agents, detectedPlugins })
}
