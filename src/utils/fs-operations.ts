import type { Stats } from 'node:fs'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

export function exists(path: string): boolean {
  return existsSync(path)
}

export function readFile(path: string, encoding: BufferEncoding = 'utf-8'): string {
  return readFileSync(path, encoding)
}

export function readDir(path: string): string[] {
  return readdirSync(path)
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function getStats(path: string): Stats {
  return statSync(path)
}

export function readJsonSafe<T>(path: string): T | null {
  if (!exists(path)) return null
  try {
    return JSON.parse(readFile(path)) as T
  } catch {
    return null
  }
}

/**
 * Ensure the `save-token/` artifact directory exists and is self-ignoring, so
 * running any command inside a repo never leaves untracked files behind.
 * The `.gitignore` is only created when absent, so a user-curated one (e.g. to
 * deliberately track reports) is never overwritten.
 */
export function ensureIgnoredDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const gitignorePath = `${dir}/.gitignore`
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, '*\n')
  }
}
