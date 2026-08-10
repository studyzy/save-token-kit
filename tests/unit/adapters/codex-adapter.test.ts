import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { CodeXAdapter } from '@/adapters/codex-adapter.js'

describe('CodeXAdapter', () => {
  const adapter = new CodeXAdapter()

  it('has correct identity fields', () => {
    expect(adapter.name).toBe('codex')
    expect(adapter.supported).toBe(true)
    expect(adapter.statusLabel).toBe('可用')
  })

  it('has correct proxy configuration', () => {
    expect(adapter.proxyEnvVar).toBe('OPENAI_BASE_URL')
    expect(adapter.proxyBasePath).toBe('/v1')
    expect(adapter.capturePathPrefix).toBe('/v1/')
    expect(adapter.defaultApiBase).toBe('https://api.openai.com')
  })

  it('ignores stdin in trigger node options to avoid blocking on a pipe', () => {
    expect(adapter.triggerNodeOptions).toEqual({ stdio: ['ignore', 'pipe', 'pipe'] })
  })

  it('has correct trigger command', () => {
    expect(adapter.triggerCommand[0]).toBe('codex')
    expect(adapter.triggerCommand).toContain('exec')
  })

  it('returns correct config paths for CodeX directories', () => {
    const paths = adapter.getConfigPaths()
    // CodeX-specific paths
    expect(paths.codebuddyMd).toContain('.codex/AGENTS.md')
    expect(paths.projectCodebuddyMd).toContain('/AGENTS.md')
    expect(paths.commandsDir).toContain('.codex/commands')
    expect(paths.projectCommandsDir).toContain('.codex/commands')
    expect(paths.mcp).toContain('.codex/config.toml')
    expect(paths.settings).toContain('.codex/config.toml')
    expect(paths.historyFile).toContain('.codex/sessions/')
    expect(paths.cliBinary).toBe('codex')
    expect(paths.pluginsMarketplacesDir).toBe('')
  })

  it('honors CODEX_HOME for config paths', () => {
    const orig = process.env.CODEX_HOME
    process.env.CODEX_HOME = '/custom/codex-home'
    try {
      const paths = adapter.getConfigPaths()
      expect(paths.codebuddyMd).toContain('/custom/codex-home/AGENTS.md')
      expect(paths.settings).toContain('/custom/codex-home/config.toml')
    } finally {
      if (orig === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = orig
    }
  })

  it('resolveInstallPaths returns valid directories for init', () => {
    const paths = adapter.resolveInstallPaths(false)
    expect(paths.commandsDir).toContain('.codex/commands')
    expect(paths.skillsDir).toContain('.codex/skills')
  })

  it('formats headless command correctly', () => {
    const args = adapter.getHeadlessCommand('test prompt')
    expect(args).toContain('exec')
    expect(args).toContain('test prompt')
    expect(args).toContain('--sandbox')
    expect(args).toContain('read-only')
  })

  it('parses headless JSON output', () => {
    expect(adapter.parseHeadlessOutput('{"a":1}')).toEqual({ a: 1 })
    expect(adapter.parseHeadlessOutput('invalid')).toBeNull()
    expect(adapter.parseHeadlessOutput('  [1,2]  ')).toEqual([1, 2])
  })

  it('builds proxy redirect args from config provider', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stk-codex-'))
    writeFileSync(
      join(dir, 'config.toml'),
      'model = "test-model"\nmodel_provider = "testproxy"\n[model_providers.testproxy]\nname = "testproxy"\nbase_url = "https://api.test/v1"\n',
    )
    const orig = process.env.CODEX_HOME
    process.env.CODEX_HOME = dir
    try {
      const args = adapter.proxyRedirectArgs('http://127.0.0.1:54321/v1')
      expect(args[0]).toBe('-c')
      expect(args[1]).toContain('model_providers.testproxy.base_url')
      expect(args[1]).toContain('http://127.0.0.1:54321/v1')
    } finally {
      if (orig === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = orig
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('defaults provider id to openai when config has none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stk-codex-'))
    writeFileSync(join(dir, 'config.toml'), 'model = "test-model"\n')
    const orig = process.env.CODEX_HOME
    process.env.CODEX_HOME = dir
    try {
      const args = adapter.proxyRedirectArgs('http://127.0.0.1:54321/v1')
      expect(args[1]).toContain('model_providers.openai.base_url')
    } finally {
      if (orig === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = orig
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves upstream base url from config provider', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stk-codex-'))
    writeFileSync(
      join(dir, 'config.toml'),
      'model = "test-model"\nmodel_provider = "testproxy"\n[model_providers.testproxy]\nname = "testproxy"\nbase_url = "https://api.test/v1"\n',
    )
    const orig = process.env.CODEX_HOME
    process.env.CODEX_HOME = dir
    try {
      expect(adapter.resolveUpstreamBaseUrl()).toBe('https://api.test/v1')
    } finally {
      if (orig === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = orig
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
