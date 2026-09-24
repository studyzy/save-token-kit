import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../../../src/rules/loader.js', () => ({
  RULES_HOME: mkdtempSync(join(tmpdir(), 'stk-cmd-')),
  printWarning: (m: string) => process.stderr.write(`警告: ${m}\n`),
}))

import { runRulesUpdate } from '../../../src/commands/rules.js'
import {
  fetchRemotePack,
  installRaw,
  readInstalledVersion,
} from '../../../src/rules/update.js'

vi.mock('../../../src/rules/update.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/rules/update.js')>()
  return {
    ...actual,
    fetchRemotePack: vi.fn(),
    installRaw: vi.fn(),
    readInstalledVersion: vi.fn(),
  }
})

const mockedFetch = vi.mocked(fetchRemotePack)
const mockedInstall = vi.mocked(installRaw)
const mockedInstalled = vi.mocked(readInstalledVersion)

function capture(): { logs: string[]; errs: string[] } {
  const logs: string[] = []
  const errs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)))
  vi.spyOn(console, 'error').mockImplementation((m) => errs.push(String(m)))
  return { logs, errs }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.exitCode = undefined
})

describe('runRulesUpdate output contract', () => {
  it('emits updated with from -> to (text + json)', async () => {
    mockedFetch.mockResolvedValue({ raw: '{"packVersion":"1.3.0"}', packVersion: '1.3.0' })
    mockedInstall.mockResolvedValue({ ok: true })
    mockedInstalled.mockReturnValue('1.2.0')
    const { logs } = capture()
    await runRulesUpdate({})
    expect(logs[0]).toBe('规则库已更新: 1.2.0 -> 1.3.0')
    logs.length = 0
    await runRulesUpdate({ json: true })
    expect(JSON.parse(logs[0])).toMatchObject({ action: 'updated', from: '1.2.0', to: '1.3.0' })
  })

  it('emits up-to-date when installed equals latest', async () => {
    mockedFetch.mockResolvedValue({ raw: '{"packVersion":"1.0.0"}', packVersion: '1.0.0' })
    mockedInstalled.mockReturnValue('1.0.0')
    const { logs } = capture()
    await runRulesUpdate({})
    expect(logs[0]).toBe('规则库已是最新: 1.0.0')
    expect(process.exitCode).toBeUndefined()
  })

  it('emits checked without installing on --check', async () => {
    mockedFetch.mockResolvedValue({ raw: '{"packVersion":"2.0.0"}', packVersion: '2.0.0' })
    mockedInstalled.mockReturnValue('1.0.0')
    const { logs } = capture()
    await runRulesUpdate({ check: true })
    expect(logs[0]).toContain('发现新版本: 2.0.0')
    expect(mockedInstall).not.toHaveBeenCalled()
  })

  it('fails with exit code 1 on network error', async () => {
    mockedFetch.mockResolvedValue({ error: 'npm view 失败' })
    const { errs } = capture()
    await runRulesUpdate({ json: true })
    expect(process.exitCode).toBe(1)
    expect(errs).toHaveLength(0)
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
      action: 'checked',
      error: 'npm view 失败',
    })
  })

  it('fails when payload has no raw content', async () => {
    mockedFetch.mockResolvedValue({ packVersion: '2.0.0' })
    mockedInstalled.mockReturnValue('1.0.0')
    const { errs } = capture()
    await runRulesUpdate({})
    expect(process.exitCode).toBe(1)
    expect(errs[0]).toContain('下载内容为空')
  })
})
