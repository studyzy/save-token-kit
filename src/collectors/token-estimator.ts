import { MAX_MESSAGE_BYTES } from '../types/index.js'

/** Approximate tokens per character for English/code-mixed content. */
const CHARS_PER_TOKEN = 4

/**
 * Estimate the token count of a string.
 * Uses a simple characters/4 heuristic; accurate enough for relative comparison.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
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
