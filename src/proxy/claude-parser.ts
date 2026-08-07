import { assembleProxyDiagnosisData, parseCore, type SkillTokensMap } from './parser-core.js'
import type { ProxyDiagnosisData } from '../types/index.js'

const CLAUDE_SKILLS_HEADER = 'The following skills are available for use with the Skill tool:'

/**
 * Extract per-skill token breakdown from the Claude-mode skills listing that
 * appears in a system message. Format:
 *
 *   The following skills are available for use with the Skill tool:
 *
 *   - name: description
 *   - name: description spanning
 *     multiple lines
 *   - bare-name
 *
 * The listing starts at the first "- " line after the header and ends when a
 * blank line terminates the paragraph. Names may contain colons (e.g.
 * `superpowers:brainstorming`), so an entry's name is the part before the
 * first ": " (colon + space); entries without a ": " are bare names.
 */
function extractClaudeSkills(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
): SkillTokensMap {
  const result: SkillTokensMap = {}

  for (const msg of messages) {
    const content =
      typeof msg?.content === 'string'
        ? msg.content
        : Array.isArray(msg?.content)
          ? msg.content
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((b: any) => (typeof b?.text === 'string' ? b.text : ''))
              .join('\n')
          : ''
    const headerIdx = content.indexOf(CLAUDE_SKILLS_HEADER)
    if (headerIdx === -1) continue

    const lines = content.slice(headerIdx).split('\n')
    // Skip the header line and any blank lines until the first "- " entry.
    let i = 1
    while (i < lines.length && !/^-\s+\S/.test(lines[i])) i++

    let current: { name: string; description: string } | null = null
    for (; i < lines.length; i++) {
      const entryMatch = lines[i].match(/^-\s+(.+?)\s*$/)
      if (entryMatch) {
        if (current) saveSkill(result, current)
        current = parseClaudeSkillEntry(entryMatch[1])
        continue
      }
      // A blank line ends the paragraph.
      if (!lines[i].trim()) break
      // Continuation line of the current entry's description.
      if (current) current.description += ` ${lines[i].trim()}`
    }
    if (current) saveSkill(result, current)
  }

  return result
}

function parseClaudeSkillEntry(rest: string): { name: string; description: string } {
  const sepIdx = rest.indexOf(': ')
  if (sepIdx === -1) return { name: rest.trim(), description: '' }
  return { name: rest.slice(0, sepIdx).trim(), description: rest.slice(sepIdx + 2).trim() }
}

function saveSkill(result: SkillTokensMap, entry: { name: string; description: string }): void {
  if (!entry.name || result[entry.name]) return
  result[entry.name] = {
    description: entry.description,
    estimatedTokens: Math.ceil((entry.description || entry.name).length / 4),
  }
}

/**
 * Parse a single captured Claude Code POST request body into a
 * ProxyDiagnosisData fragment. Claude-specific: skills come from the system
 * message header listing; CodeBuddy Agent-tool subagents and plugin mode
 * markers do not apply.
 */
export function parseClaudeRequestBody(body: unknown): ProxyDiagnosisData {
  const core = parseCore(body)

  // --- Skills from the Claude-mode system listing ---
  const skillTokens = extractClaudeSkills(core.messages)

  return assembleProxyDiagnosisData({
    body,
    core,
    skillTokens,
    agents: [],
    detectedPlugins: [],
  })
}
