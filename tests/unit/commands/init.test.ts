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

  it('installs 4 SKILL templates to global ~/.codebuddy by default', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    // Point HOME at temp so global install lands inside tmp.
    await runInit({ agent: 'codebuddy', force: true })
    const base = join(tmp, '.codebuddy', 'skills')
    for (const s of ['stk-diagnose', 'stk-analyze', 'stk-optimize', 'stk-report']) {
      expect(existsSync(join(base, s, 'SKILL.md'))).toBe(true)
    }
  })

  it('installs to project .codebuddy when --local is set', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    mkdirSync(join(tmp, 'project'), { recursive: true })
    process.chdir(join(tmp, 'project'))
    await runInit({ agent: 'codebuddy', local: true, force: true })
    const base = join(tmp, 'project', '.codebuddy', 'skills')
    expect(existsSync(join(base, 'stk-diagnose', 'SKILL.md'))).toBe(true)
  })

  it('exits with error for unsupported agents', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const before = process.exitCode
    await runInit({ agent: 'codex', force: true })
    expect(process.exitCode).toBe(1)
    process.exitCode = before
  })

  it('skips existing files unless --force', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const base = join(tmp, '.codebuddy', 'skills', 'stk-diagnose')
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'SKILL.md'), 'OLD')
    await runInit({ agent: 'codebuddy' })
    expect(readFileSync(join(base, 'SKILL.md'), 'utf8')).toBe('OLD')
  })
})
