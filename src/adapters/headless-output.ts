/**
 * Shared helpers for parsing headless-probe stdout. Both CodeBuddy and
 * WorkBuddy are the same CLI kernel and emit the same shape, so the extraction
 * logic lives here rather than being duplicated per adapter.
 */

/** JSON.parse that returns null instead of throwing. */
export function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * Extract the first balanced JSON array/object from a string that may be
 * prefixed/suffixed with log lines. Uses a string-aware depth scan so braces
 * inside JSON strings do not terminate the match early. Falls back to
 * `safeParse` when no opener is found (or the payload is unbalanced).
 */
export function extractBalancedJson(raw: string): unknown {
  const text = raw.trim()
  const start = text.search(/[[{]/)
  if (start < 0) return safeParse(text)
  const opener = text[start]
  const closer = opener === '[' ? ']' : '}'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === opener) depth++
    else if (ch === closer) {
      depth--
      if (depth === 0) return safeParse(text.slice(start, i + 1))
    }
  }
  return safeParse(text.slice(start))
}
