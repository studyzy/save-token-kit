/**
 * Minimal semver range check for rules-pack compat gating.
 * Supports only `>=X.Y.Z`, `<X.Y.Z`, `=X.Y.Z` tokens joined by commas (AND).
 * Deliberately no semver dependency (charter IV); ranges beyond this grammar fail closed.
 */

function parseVersion(v: string, allowPartial = false): number[] | null {
  const re = allowPartial ? /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/ : /^(\d+)\.(\d+)\.(\d+)$/
  const m = re.exec(v.trim())
  if (!m) return null
  return [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}

function cmpVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return 0
}

function satisfiesToken(version: number[], token: string): boolean {
  const t = token.trim()
  const match = /^(>=|<=|=|>|<)?\s*(.*)$/.exec(t)
  if (!match) return false
  const op = match[1] ?? '='
  const target = parseVersion(match[2], true)
  if (!target) return false
  const c = cmpVersions(version, target)
  switch (op) {
    case '>=':
      return c >= 0
    case '<=':
      return c <= 0
    case '>':
      return c > 0
    case '<':
      return c < 0
    default:
      return c === 0
  }
}

/**
 * Whether `version` satisfies a comma-separated range like ">=0.6,<1.0.0".
 * Any unparseable version or token returns false (fail closed).
 */
export function satisfiesRange(version: string, range: string): boolean {
  const v = parseVersion(version)
  if (!v) return false
  const tokens = range.split(',').map((t) => t.trim()).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every((t) => satisfiesToken(v, t))
}
