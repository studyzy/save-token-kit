import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WorkBuddyAdapter } from '@/adapters/workbuddy-adapter.js'

describe('WorkBuddyAdapter', () => {
  const adapter = new WorkBuddyAdapter()

  it('has correct identity fields', () => {
    expect(adapter.name).toBe('workbuddy')
    expect(adapter.supported).toBe(true)
    expect(adapter.statusLabel).toBe('可用')
  })

  it('has correct proxy configuration (captures custom-model /chat/completions)', () => {
    expect(adapter.proxyEnvVar).toBe('CODEBUDDY_BASE_URL')
    expect(adapter.proxyBasePath).toBe('/v2')
    expect(adapter.capturePathPrefix).toBe('/chat/completions')
    expect(adapter.defaultApiBase).toBe('https://copilot.tencent.com')
  })

  it('requires manual trigger (desktop cannot be auto-probed)', () => {
    expect(adapter.requiresManualTrigger).toBe(true)
  })

  it('still exposes a trigger command shape for reference', () => {
    const cmd = adapter.triggerCommand
    expect(cmd.length).toBeGreaterThanOrEqual(1)
    // Last element is the prompt; contains -p and -y for non-interactive use.
    expect(cmd).toContain('-p')
    expect(cmd).toContain('-y')
    expect(cmd).toContain('Hello')
  })

  it('returns config paths under the workbuddy config dir', () => {
    const paths = adapter.getConfigPaths()
    expect(paths.codebuddyMd).toContain('.workbuddy/SOUL.md')
    expect(paths.settings).toContain('.workbuddy/settings.json')
    expect(paths.mcp).toContain('.workbuddy/.mcp.json')
    expect(paths.projectCodebuddyMd).toContain('/SOUL.md')
    expect(paths.projectSkillsDir).toContain('.workbuddy/skills')
    expect(paths.projectRulesDir).toContain('.workbuddy/rules')
  })

  it('resolveInstallPaths returns valid workbuddy dirs for init', () => {
    const paths = adapter.resolveInstallPaths(false)
    expect(paths.commandsDir).toContain('.workbuddy/commands')
    expect(paths.skillsDir).toContain('.workbuddy/skills')
  })

  it('formats headless command and parses JSON output (shared with codebuddy)', () => {
    const args = adapter.getHeadlessCommand('test prompt')
    expect(args).toContain('-p')
    expect(args).toContain('test prompt')
    expect(args).toContain('-y')

    const withSchema = adapter.getHeadlessCommand('test prompt', { type: 'object' })
    expect(withSchema).toContain('--json-schema')
    expect(withSchema).toContain('{"type":"object"}')

    expect(adapter.parseHeadlessOutput('{"a":1}')).toEqual({ a: 1 })
    expect(adapter.parseHeadlessOutput('  [1,2]  ')).toEqual([1, 2])
    expect(adapter.parseHeadlessOutput('invalid')).toBeNull()
  })
})

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STK_DIAGNOSE_MODEL_ID } from '@/adapters/workbuddy-adapter.js'

describe('WorkBuddyAdapter models.json injection', () => {
  let dir: string
  const origConfig = process.env.WORKBUDDY_CONFIG_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stk-wb-'))
    process.env.WORKBUDDY_CONFIG_DIR = dir
  })
  afterEach(() => {
    if (origConfig === undefined) delete process.env.WORKBUDDY_CONFIG_DIR
    else process.env.WORKBUDDY_CONFIG_DIR = origConfig
    rmSync(dir, { recursive: true, force: true })
  })

  it('resolves models.json under the workbuddy config dir', () => {
    const a = new WorkBuddyAdapter()
    expect(a.modelsFilePath()).toBe(`${dir}/models.json`)
  })

  it('injects stk-diagnose model pointing at the proxy, then removes it', () => {
    writeFileSync(
      join(dir, 'models.json'),
      JSON.stringify(
        [{ id: 'existing', name: 'Existing', url: 'https://api.test/chat/completions' }],
        null,
        2,
      ),
    )
    const a = new WorkBuddyAdapter()
    const prev = a.injectDiagnoseModel('http://127.0.0.1:52988')

    const after = JSON.parse(readFileSync(`${dir}/models.json`, 'utf8'))
    expect(after).toHaveLength(2)
    const injected = after.find((m: { id: string }) => m.id === STK_DIAGNOSE_MODEL_ID)
    expect(injected).toBeTruthy()
    expect(injected.url).toBe('http://127.0.0.1:52988/chat/completions')
    expect(prev).toHaveLength(1)

    a.removeDiagnoseModel(prev)
    const restored = JSON.parse(readFileSync(`${dir}/models.json`, 'utf8'))
    expect(restored).toEqual([{ id: 'existing', name: 'Existing', url: 'https://api.test/chat/completions' }])
  })

  it('is idempotent: second inject returns null and does not duplicate', () => {
    const a = new WorkBuddyAdapter()
    a.injectDiagnoseModel('http://127.0.0.1:52988')
    const prev2 = a.injectDiagnoseModel('http://127.0.0.1:52988')
    expect(prev2).toBeNull()
    const after = JSON.parse(readFileSync(`${dir}/models.json`, 'utf8'))
    expect(after.filter((m: { id: string }) => m.id === STK_DIAGNOSE_MODEL_ID)).toHaveLength(1)
  })

  it('creates models.json when missing', () => {
    const a = new WorkBuddyAdapter()
    const prev = a.injectDiagnoseModel('http://127.0.0.1:52988')
    expect(prev).toEqual([])
    expect(readFileSync(`${dir}/models.json`, 'utf8')).toContain(STK_DIAGNOSE_MODEL_ID)
  })
})
