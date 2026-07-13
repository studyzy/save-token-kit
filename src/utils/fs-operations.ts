import type { Stats } from 'node:fs'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'

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
