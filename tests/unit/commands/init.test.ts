import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit } from '@/commands/init.js'

const ALL_SKILLS = ['stk', 'stk-diagnose', 'stk-analyze', 'stk-optimize', 'stk-report']

describe('stk init', () => {
  let tmp: string
  const origHome = process.env.HOME
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    if (origHome) process.env.HOME = origHome
  })

  it('installs 5 SKILL templates to global ~/.codebuddy by default', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    // Point HOME at temp so global install lands inside tmp.
    await runInit({ agent: 'codebuddy', force: true })
    const base = join(tmp, '.codebuddy', 'skills')
    for (const s of ALL_SKILLS) {
      expect(existsSync(join(base, s, 'SKILL.md'))).toBe(true)
    }
  })

  it('recursively installs subdirectory files (stages/ and agents/)', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy', force: true })
    const base = join(tmp, '.codebuddy', 'skills')
    // stk/ is the orchestrator; the 4 stage skills keep their own agents/ subdirs.
    expect(readdirSync(join(base, 'stk-analyze', 'agents')).length).toBe(12)
    expect(readdirSync(join(base, 'stk-optimize', 'agents')).length).toBe(11)
  })

  it('injects rules-pack header into installed markdown files', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy', force: true })
    const skillMd = readFileSync(
      join(tmp, '.codebuddy', 'skills', 'stk-diagnose', 'SKILL.md'),
      'utf8',
    )
    expect(skillMd).toMatch(/^<!-- stk-rules: v\d+\.\d+\.\d+/)
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
    await runInit({ agent: 'cursor', force: true })
    expect(process.exitCode).toBe(1)
    process.exitCode = before
  })

  it('skips existing files unless --force (including subdirectory files)', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const base = join(tmp, '.codebuddy', 'skills', 'stk-analyze')
    mkdirSync(join(base, 'agents'), { recursive: true })
    writeFileSync(join(base, 'SKILL.md'), 'OLD')
    writeFileSync(join(base, 'agents', 'skill-opt.md'), 'OLD-AGENT')
    await runInit({ agent: 'codebuddy' })
    expect(readFileSync(join(base, 'SKILL.md'), 'utf8')).toBe('OLD')
    expect(readFileSync(join(base, 'agents', 'skill-opt.md'), 'utf8')).toBe('OLD-AGENT')
    // force overwrites
    await runInit({ agent: 'codebuddy', force: true })
    expect(readFileSync(join(base, 'SKILL.md'), 'utf8')).not.toBe('OLD')
    expect(readFileSync(join(base, 'agents', 'skill-opt.md'), 'utf8')).not.toBe('OLD-AGENT')
  })
})
