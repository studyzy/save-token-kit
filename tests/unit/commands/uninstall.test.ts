import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit } from '@/commands/init.js'
import { runUninstall } from '@/commands/uninstall.js'

const ALL_SKILLS = ['stk', 'stk-diagnose', 'stk-analyze', 'stk-optimize', 'stk-report']

describe('stk uninstall', () => {
  let tmp: string
  const origHome = process.env.HOME
  const origCwd = process.cwd()
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    if (origHome) process.env.HOME = origHome
    process.chdir(origCwd)
  })

  it('removes all 5 stk SKILL dirs installed by init', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-uninstall-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy' })
    await runUninstall({ agent: 'codebuddy', force: true })
    const base = join(tmp, '.codebuddy', 'skills')
    for (const s of ALL_SKILLS) {
      expect(existsSync(join(base, s))).toBe(false)
    }
  })

  it('keeps non-stk skills in the same skills directory', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-uninstall-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy' })
    const base = join(tmp, '.codebuddy', 'skills')
    mkdirSync(join(base, 'my-own-skill'), { recursive: true })
    writeFileSync(join(base, 'my-own-skill', 'SKILL.md'), 'MINE')
    await runUninstall({ agent: 'codebuddy', force: true })
    expect(existsSync(join(base, 'my-own-skill', 'SKILL.md'))).toBe(true)
  })

  it('removes from project .codebuddy when --local is set', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-uninstall-'))
    mkdirSync(join(tmp, 'project'), { recursive: true })
    process.chdir(join(tmp, 'project'))
    await runInit({ agent: 'codebuddy', local: true })
    await runUninstall({ agent: 'codebuddy', local: true, force: true })
    const base = join(tmp, 'project', '.codebuddy', 'skills')
    expect(existsSync(join(base, 'stk-diagnose'))).toBe(false)
  })

  it('aborts in non-interactive mode without --force', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-uninstall-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy' })
    const before = process.exitCode
    await runUninstall({ agent: 'codebuddy' })
    expect(process.exitCode).toBe(1)
    process.exitCode = before
    // Nothing was deleted.
    expect(existsSync(join(tmp, '.codebuddy', 'skills', 'stk'))).toBe(true)
  })

  it('exits with error for unsupported agents', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-uninstall-'))
    process.env.HOME = tmp
    const before = process.exitCode
    await runUninstall({ agent: 'cursor', force: true })
    expect(process.exitCode).toBe(1)
    process.exitCode = before
  })

  it('reports gracefully when nothing is installed', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-uninstall-'))
    process.env.HOME = tmp
    const before = process.exitCode
    await runUninstall({ agent: 'codebuddy', force: true })
    expect(process.exitCode).not.toBe(1)
    process.exitCode = before
  })
})
