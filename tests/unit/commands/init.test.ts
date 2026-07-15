import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit } from '@/commands/init.js'

describe('stk init', () => {
  let tmp: string
  const origHome = process.env.HOME
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    if (origHome) process.env.HOME = origHome
  })

  it('installs 4 command templates to global ~/.codebuddy by default', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    // Point HOME at temp so global install lands inside tmp.
    await runInit({ agent: 'codebuddy', force: true })
    const base = join(tmp, '.codebuddy', 'commands', 'stk')
    for (const c of ['diagnose', 'analyze', 'optimize', 'report']) {
      expect(existsSync(join(base, `${c}.md`))).toBe(true)
    }
  })

  it('installs to project .codebuddy when --local is set', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    mkdirSync(join(tmp, 'project'), { recursive: true })
    process.chdir(join(tmp, 'project'))
    await runInit({ agent: 'codebuddy', local: true, force: true })
    const base = join(tmp, 'project', '.codebuddy', 'commands', 'stk')
    expect(existsSync(join(base, 'diagnose.md'))).toBe(true)
  })

  it('also installs SKILL files when --skills is set', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy', force: true, skills: true })
    const skillsBase = join(tmp, '.codebuddy', 'skills')
    for (const s of ['stk-diagnose', 'stk-analyze', 'stk-optimize', 'stk-report']) {
      expect(existsSync(join(skillsBase, s, 'SKILL.md'))).toBe(true)
    }
  })

  it('exits with error for unsupported agents', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const before = process.exitCode
    await runInit({ agent: 'claude', force: true })
    expect(process.exitCode).toBe(1)
    process.exitCode = before
  })

  it('skips existing files unless --force', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const base = join(tmp, '.codebuddy', 'commands', 'stk')
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'diagnose.md'), 'OLD')
    await runInit({ agent: 'codebuddy' })
    expect(readFileSync(join(base, 'diagnose.md'), 'utf8')).toBe('OLD')
  })
})
