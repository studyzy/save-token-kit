import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdateMeta } from '../types/rules.js'
import { printWarning, RULES_FILE_NAME } from './loader.js'

export const DEFAULT_RULES_URL =
  process.env.STK_RULES_URL ??
  'https://raw.githubusercontent.com/studyzy/save-token-kit/main/rules/stk-rules.json'
export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
export const FETCH_TIMEOUT_MS = 5000

export type FetchFn = (url: string) => Promise<{ ok: boolean; status?: number; text: string }>

const defaultFetch: FetchFn = async (url) => {
  const res = await fetch(url)
  return { ok: res.ok, status: res.status, text: await res.text() }
}

export function metaPath(rulesHome: string): string {
  return join(rulesHome, 'meta.json')
}

export function rulesFilePath(rulesHome: string): string {
  return join(rulesHome, RULES_FILE_NAME)
}

export function readMeta(path: string): UpdateMeta {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as UpdateMeta
  } catch {
    return {}
  }
}

export function writeMeta(path: string, meta: UpdateMeta): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(meta, null, 2) + '\n')
}

/** packVersion of the locally installed single rules file, or null. */
export function readInstalledVersion(rulesHome: string): string | null {
  const p = rulesFilePath(rulesHome)
  if (!existsSync(p)) return null
  try {
    const m = JSON.parse(readFileSync(p, 'utf8')) as { packVersion?: string }
    return typeof m.packVersion === 'string' ? m.packVersion : null
  } catch {
    return null
  }
}

/** Download and validate the remote single rules file. */
export async function fetchRemotePack(
  fetchFn: FetchFn = defaultFetch,
  url: string = DEFAULT_RULES_URL,
): Promise<{ raw?: string; packVersion?: string; error?: string }> {
  let res: { ok: boolean; status?: number; text: string }
  try {
    res = await withTimeout(fetchFn(url), FETCH_TIMEOUT_MS)
  } catch (e) {
    return { error: (e as Error).message }
  }
  if (!res.ok) return { error: `下载失败 (HTTP ${res.status ?? '?'})` }
  let parsed: unknown
  try {
    parsed = JSON.parse(res.text)
  } catch {
    return { error: '远端文件不是合法 JSON' }
  }
  const obj = parsed as { packVersion?: unknown }
  if (typeof obj?.packVersion !== 'string') return { error: '远端文件缺少 packVersion' }
  return { raw: res.text, packVersion: obj.packVersion }
}

/** Atomically install the downloaded file into rulesHome. */
export function installRaw(raw: string, rulesHome: string): void {
  mkdirSync(rulesHome, { recursive: true })
  const dest = rulesFilePath(rulesHome)
  const tmp = `${dest}.tmp`
  writeFileSync(tmp, raw)
  renameSync(tmp, dest)
}

/** Whether a registry check is due (24h TTL, FR-011 kill switch). */
export function shouldAutoCheck(meta: UpdateMeta, now = Date.now()): boolean {
  if (meta.autoCheckDisabled) return false
  if (!meta.lastCheckAt) return true
  const last = Date.parse(meta.lastCheckAt)
  if (Number.isNaN(last)) return true
  return now - last > AUTO_CHECK_INTERVAL_MS
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`超时 (${ms}ms)`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Fire-and-forget TTL check at diagnose/analyze start: never blocks the main
 * flow, network failures are silent (research R5).
 */
export async function autoCheckLibraryUpdate(
  mPath: string,
  rulesHome: string,
  fetchFn: FetchFn = defaultFetch,
): Promise<void> {
  const meta = readMeta(mPath)
  if (!shouldAutoCheck(meta)) return
  writeMeta(mPath, { ...meta, lastCheckAt: new Date().toISOString() })
  const { packVersion, error } = await fetchRemotePack(fetchFn)
  if (error || !packVersion) return
  const installed = readInstalledVersion(rulesHome)
  if (installed !== packVersion) {
    printWarning(
      `发现新版规则库 ${packVersion}${installed ? ` (当前 ${installed})` : ''}，运行 stk rules update 升级`,
    )
  }
}
