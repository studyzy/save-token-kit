import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  autoCheckLibraryUpdate,
  fetchRemotePack,
  installRaw,
  metaPath,
  readInstalledVersion,
  readMeta,
  rulesFilePath,
  shouldAutoCheck,
  writeMeta,
} from '../../../src/rules/update.js'

const okRes = (text: string) => Promise.resolve({ ok: true, status: 200, text })
const VALID = JSON.stringify({
  schemaVersion: 1,
  packVersion: '1.3.0',
  releasedAt: '',
  engines: { stk: '>=0.6' },
  data: {},
  prompts: {},
})

describe('fetchRemotePack', () => {
  it('returns packVersion on valid payload', async () => {
    const res = await fetchRemotePack(() => okRes(VALID))
    expect(res.packVersion).toBe('1.3.0')
    expect(res.raw).toContain('1.3.0')
  })

  it('reports HTTP failure', async () => {
    const res = await fetchRemotePack(() => Promise.resolve({ ok: false, status: 404, text: '' }))
    expect(res.error).toContain('404')
  })

  it('reports invalid JSON and missing packVersion', async () => {
    expect((await fetchRemotePack(() => okRes('{broken'))).error).toContain('JSON')
    expect((await fetchRemotePack(() => okRes('{"x":1}'))).error).toContain('packVersion')
  })

  it('times out within budget', async () => {
    const res = await fetchRemotePack(() => new Promise(() => {}))
    expect(res.error).toContain('超时')
  })
})

describe('installRaw + readInstalledVersion', () => {
  it('atomically writes the single file', () => {
    const home = mkdtempSync(join(tmpdir(), 'stk-inst-'))
    installRaw(VALID, home)
    expect(existsSync(rulesFilePath(home))).toBe(true)
    expect(readInstalledVersion(home)).toBe('1.3.0')
    expect(existsSync(rulesFilePath(home) + '.tmp')).toBe(false)
    expect(readInstalledVersion(mkdtempSync(join(tmpdir(), 'stk-none-')))).toBeNull()
  })
})

describe('meta read/write + TTL gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stk-meta-'))
  const mPath = metaPath(dir)

  it('roundtrips meta', () => {
    expect(readMeta(join(dir, 'nope.json'))).toEqual({})
    writeMeta(mPath, { lastCheckAt: '2026-09-24T00:00:00Z', installedVersion: '1.2.0' })
    expect(readMeta(mPath).installedVersion).toBe('1.2.0')
  })

  it('shouldAutoCheck honors 24h TTL and kill switch', () => {
    const now = Date.now()
    expect(shouldAutoCheck({}, now)).toBe(true)
    expect(shouldAutoCheck({ lastCheckAt: new Date(now - 3600_000).toISOString() }, now)).toBe(false)
    expect(shouldAutoCheck({ lastCheckAt: new Date(now - 25 * 3600_000).toISOString() }, now)).toBe(true)
    expect(shouldAutoCheck({ autoCheckDisabled: true }, now)).toBe(false)
  })
})

describe('autoCheckLibraryUpdate', () => {
  it('skips network when TTL is fresh', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stk-auto1-'))
    writeMeta(metaPath(dir), { lastCheckAt: new Date().toISOString() })
    const fetchFn = vi.fn(() => okRes(VALID))
    await autoCheckLibraryUpdate(metaPath(dir), dir, fetchFn)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('warns on newer version and records lastCheckAt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stk-auto2-'))
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await autoCheckLibraryUpdate(metaPath(dir), dir, () => okRes(VALID))
    expect(errWrite).toHaveBeenCalledWith(expect.stringContaining('1.3.0'))
    expect(readMeta(metaPath(dir)).lastCheckAt).toBeDefined()
    errWrite.mockRestore()
  })

  it('is silent on network failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stk-auto3-'))
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await autoCheckLibraryUpdate(metaPath(dir), dir, () => Promise.resolve({ ok: false, status: 500, text: '' }))
    expect(errWrite).not.toHaveBeenCalled()
    errWrite.mockRestore()
  })
})

describe('single-file layout', () => {
  it('keeps library state in one file (no node_modules layout)', () => {
    const home = mkdtempSync(join(tmpdir(), 'stk-single-'))
    mkdirSync(home, { recursive: true })
    installRaw(VALID, home)
    const files = readFileSync(rulesFilePath(home), 'utf8')
    expect(JSON.parse(files).packVersion).toBe('1.3.0')
  })
})
