import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from 'node:fs'
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
    await runInit({ agent: 'codebuddy' })
    const base = join(tmp, '.codebuddy', 'skills')
    for (const s of ALL_SKILLS) {
      expect(existsSync(join(base, s, 'SKILL.md'))).toBe(true)
    }
  })

  it('recursively installs subdirectory files (stages/ and agents/)', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy' })
    const base = join(tmp, '.codebuddy', 'skills')
    // stk/ is the orchestrator; the 4 stage skills keep their own agents/ subdirs.
    expect(readdirSync(join(base, 'stk-analyze', 'agents')).length).toBe(12)
    expect(readdirSync(join(base, 'stk-optimize', 'agents')).length).toBe(11)
  })

  it('injects rules-pack header into installed markdown files', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy' })
    const skillMd = readFileSync(
      join(tmp, '.codebuddy', 'skills', 'stk-diagnose', 'SKILL.md'),
      'utf8',
    )
    expect(skillMd).toMatch(/\n---\n<!-- stk-rules: v\d+\.\d+\.\d+/)
  })

  it('keeps SKILL frontmatter on the first line and injects the header after it', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy' })
    const skillMd = readFileSync(join(tmp, '.codebuddy', 'skills', 'stk', 'SKILL.md'), 'utf8')
    // Codex rejects skill files whose opening `---` is not the very first line.
    expect(skillMd.startsWith('---\n')).toBe(true)
    expect(skillMd).toMatch(/\n---\n<!-- stk-rules: v\d+\.\d+\.\d+/)
    expect(skillMd).toContain('name: stk')
  })

  it('installs to project .codebuddy when --local is set', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    mkdirSync(join(tmp, 'project'), { recursive: true })
    process.chdir(join(tmp, 'project'))
    await runInit({ agent: 'codebuddy', local: true })
    const base = join(tmp, 'project', '.codebuddy', 'skills')
    expect(existsSync(join(base, 'stk-diagnose', 'SKILL.md'))).toBe(true)
  })

  it('exits with error for unsupported agents', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const before = process.exitCode
    await runInit({ agent: 'cursor' })
    expect(process.exitCode).toBe(1)
    process.exitCode = before
  })

  it('overwrites existing files by default (including subdirectory files)', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const base = join(tmp, '.codebuddy', 'skills', 'stk-analyze')
    mkdirSync(join(base, 'agents'), { recursive: true })
    writeFileSync(join(base, 'SKILL.md'), 'OLD')
    writeFileSync(join(base, 'agents', 'skill-opt.md'), 'OLD-AGENT')
    await runInit({ agent: 'codebuddy' })
    expect(readFileSync(join(base, 'SKILL.md'), 'utf8')).not.toBe('OLD')
    expect(readFileSync(join(base, 'agents', 'skill-opt.md'), 'utf8')).not.toBe('OLD-AGENT')
  })

  it('re-runs cleanly: installs into an existing target without complaint', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    await runInit({ agent: 'codebuddy' })
    // Second run must rewrite every file and stay silent on the error channel.
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '))
    })
    try {
      await runInit({ agent: 'codebuddy' })
    } finally {
      spy.mockRestore()
    }
    expect(errors.join('\n')).not.toMatch(/已存在|跳过|模板目录为空/)
  })

  it('without --agent, installs into every agent whose config dir exists', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    // Only codebuddy and workbuddy are "installed"; claude/codex are absent.
    mkdirSync(join(tmp, '.codebuddy'), { recursive: true })
    mkdirSync(join(tmp, '.workbuddy'), { recursive: true })
    await runInit({})
    for (const home of ['.codebuddy', '.workbuddy']) {
      for (const s of ALL_SKILLS) {
        expect(existsSync(join(tmp, home, 'skills', s, 'SKILL.md'))).toBe(true)
      }
    }
    // Absent agents must NOT be created — `init` never introduces a new agent.
    expect(existsSync(join(tmp, '.claude'))).toBe(false)
    expect(existsSync(join(tmp, '.codex'))).toBe(false)
  })

  it('with --agent, touches only that agent even when others exist', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    mkdirSync(join(tmp, '.codebuddy'), { recursive: true })
    mkdirSync(join(tmp, '.claude'), { recursive: true })
    await runInit({ agent: 'codebuddy' })
    expect(existsSync(join(tmp, '.codebuddy', 'skills', 'stk', 'SKILL.md'))).toBe(true)
    // The explicitly-unselected agent keeps an untouched (empty) skills tree.
    expect(existsSync(join(tmp, '.claude', 'skills'))).toBe(false)
  })

  it('without --agent and no agent dirs present, writes nothing and stays on the error channel', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-init-'))
    process.env.HOME = tmp
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '))
    })
    const before = process.exitCode
    try {
      await runInit({})
    } finally {
      spy.mockRestore()
      process.exitCode = before
    }
    for (const agent of ['.codebuddy', '.claude', '.codex', '.workbuddy']) {
      expect(existsSync(join(tmp, agent))).toBe(false)
    }
    expect(errors.join('\n')).toMatch(/未检测到任何已安装的 AI Agent/)
  })
})
