import { MAX_MESSAGE_BYTES } from '../types/index.js'

/** Approximate tokens per character for English/code-mixed content. */
const CHARS_PER_TOKEN = 4

/** Rough per-tool token estimate for MCP tool definitions. */
export const TOKENS_PER_MCP_TOOL = 200

/**
 * Estimate the token count of a string.
 * Uses a simple characters/4 heuristic; accurate enough for relative comparison.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code >= 0x4e00 && code <= 0x9fff
}

/** Token estimate that mixes ASCII (chars/4) and CJK (1 char/token). */
export function estimate(content: string): number {
  if (!content) return 0
  if (!/[\u0080-\uFFFF]/.test(content)) {
    return Math.max(1, Math.ceil(content.length / CHARS_PER_TOKEN))
  }
  let cjk = 0
  for (const ch of content) {
    if (isCJK(ch)) cjk++
  }
  const other = content.length - cjk
  return Math.max(1, Math.ceil(other / CHARS_PER_TOKEN) + cjk)
}

/** Estimate MCP server token contribution from toolsCount or config size. */
export function estimateMcpTokens(toolsCount: number | null, configSizeBytes: number): number {
  if (toolsCount !== null && toolsCount > 0) {
    return toolsCount * TOKENS_PER_MCP_TOOL
  }
  return Math.ceil(configSizeBytes / CHARS_PER_TOKEN)
}

/** Classify config impact level by file size. */
export function impactLevel(sizeBytes: number): 'low' | 'medium' | 'high' {
  if (sizeBytes >= 5120) return 'high'
  if (sizeBytes >= 1024) return 'medium'
  return 'low'
}

/**
 * Estimate tokens for an arbitrary JSON-serializable value.
 */
export function estimateTokensOf(value: unknown): number {
  if (value === null || value === undefined) return 0
  let str: string
  if (typeof value === 'string') {
    str = value
  } else {
    try {
      str = JSON.stringify(value)
    } catch {
      str = String(value)
    }
  }
  return estimateTokens(str)
}

/**
 * Truncate a message body if it exceeds the 10MB limit, tagging it as [TRUNCATED]
 * so the diagnosis report itself does not become unreasonably large.
 * @returns the (possibly truncated) string and whether truncation happened
 */
export function truncateIfLarge(body: string): { content: string; truncated: boolean } {
  const bytes = Buffer.byteLength(body, 'utf8')
  if (bytes <= MAX_MESSAGE_BYTES) {
    return { content: body, truncated: false }
  }
  const allowedChars = Math.floor(MAX_MESSAGE_BYTES / 2) // keep head + tail within budget
  const head = body.slice(0, allowedChars)
  const tail = body.slice(body.length - allowedChars)
  return {
    content: `${head}\n...[TRUNCATED ${bytes} bytes]...\n${tail}`,
    truncated: true,
  }
}
