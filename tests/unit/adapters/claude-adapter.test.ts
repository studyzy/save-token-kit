import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeAdapter } from '@/adapters/claude-adapter.js'
import * as platformUtils from '@/utils/platform.js'

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter()

  it('has correct identity fields', () => {
    expect(adapter.name).toBe('claude')
    expect(adapter.supported).toBe(true)
    expect(adapter.statusLabel).toBe('可用')
  })

  it('has correct proxy configuration', () => {
    expect(adapter.proxyEnvVar).toBe('ANTHROPIC_BASE_URL')
    expect(adapter.capturePathPrefix).toBe('/v1/')
    expect(adapter.defaultApiBase).toBe('https://api.anthropic.com')
    // settings.json env overrides process env, so diagnose must isolate config dir.
    expect(adapter.needsIsolatedConfigDir).toBe(true)
  })

  it('has correct trigger command', () => {
    expect(adapter.triggerCommand[0]).toBe('claude')
    expect(adapter.triggerCommand).toContain('-p')
    expect(adapter.triggerCommand).toContain('Hello')
  })

  it('returns correct config paths for Claude directories', () => {
    const paths = adapter.getConfigPaths()
    // Claude-specific paths
    expect(paths.codebuddyMd).toContain('.claude/CLAUDE.md')
    expect(paths.projectCodebuddyMd).toContain('/CLAUDE.md')
    expect(paths.commandsDir).toContain('.claude/commands')
    expect(paths.projectCommandsDir).toContain('.claude/commands')
    expect(paths.agentsDir).toContain('.claude/agents')
    expect(paths.mcp).toContain('.claude/.mcp.json')
    expect(paths.settings).toContain('.claude/settings.json')
    // Claude has no plugins directories, but does have rules directories
    expect(paths.skillsDir).toContain('.claude/skills')
    expect(paths.projectSkillsDir).toContain('.claude/skills')
    expect(paths.rulesDir).toContain('.claude/rules')
    expect(paths.pluginsMarketplacesDir).toBe('')
    expect(paths.projectRulesDir).toContain('.claude/rules')
  })

  it('resolveInstallPaths returns valid directories for init', () => {
    const paths = adapter.resolveInstallPaths(false)
    expect(paths.commandsDir).toContain('.claude/commands')
    expect(paths.skillsDir).toContain('.claude/skills')
  })

  it('formats headless command correctly', () => {
    const args = adapter.getHeadlessCommand('test prompt')
    expect(args).toContain('-p')
    expect(args).toContain('test prompt')
    expect(args).toContain('--max-turns')
    expect(args).toContain('1')
  })

  it('parses headless JSON output', () => {
    expect(adapter.parseHeadlessOutput('{"a":1}')).toEqual({ a: 1 })
    expect(adapter.parseHeadlessOutput('invalid')).toBeNull()
    expect(adapter.parseHeadlessOutput('  [1,2]  ')).toEqual([1, 2])
  })

  describe('resolveUpstreamBaseUrl', () => {
    let tempHome: string
    let originalEnv: string | undefined

    beforeEach(() => {
      originalEnv = process.env.ANTHROPIC_BASE_URL
      delete process.env.ANTHROPIC_BASE_URL
      tempHome = mkdtempSync(join(tmpdir(), 'stk-claude-'))
      // Point getConfigPaths() at a temp home via getHomeDir() so we never read the real ~/.claude.
      vi.spyOn(platformUtils, 'getHomeDir').mockReturnValue(tempHome)
    })

    afterEach(() => {
      vi.restoreAllMocks()
      if (originalEnv === undefined) delete process.env.ANTHROPIC_BASE_URL
      else process.env.ANTHROPIC_BASE_URL = originalEnv
      rmSync(tempHome, { recursive: true, force: true })
    })

    it('reads upstream base url from settings.json env when process env is absent', () => {
      const dir = join(tempHome, '.claude')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'http://9.134.212.96:3456/' } }))
      expect(adapter.resolveUpstreamBaseUrl()).toBe('http://9.134.212.96:3456/')
    })

    it('prefers process env over settings.json env', () => {
      const dir = join(tempHome, '.claude')
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'settings.json'),
        JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'http://from-settings' } }),
      )
      process.env.ANTHROPIC_BASE_URL = 'http://from-env'
      expect(adapter.resolveUpstreamBaseUrl()).toBe('http://from-env')
    })

    it('falls back to defaultApiBase when neither env is set', () => {
      expect(adapter.resolveUpstreamBaseUrl()).toBe('https://api.anthropic.com')
    })

    it('falls back to defaultApiBase when settings.json is missing', () => {
      expect(adapter.resolveUpstreamBaseUrl()).toBe('https://api.anthropic.com')
    })

    it('configDirRetainedEnv returns all settings env except base url', () => {
      const dir = join(tempHome, '.claude')
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'settings.json'),
        JSON.stringify({
          env: {
            ANTHROPIC_AUTH_TOKEN: 'sk-test',
            ANTHROPIC_MODEL: 'my-model',
            ANTHROPIC_BASE_URL: 'http://9.134.212.96:3456/',
          },
        }),
      )
      const retained = adapter.configDirRetainedEnv()
      expect(retained.ANTHROPIC_AUTH_TOKEN).toBe('sk-test')
      expect(retained.ANTHROPIC_MODEL).toBe('my-model')
      // The proxy env var is excluded so diagnose's redirection wins.
      expect(retained.ANTHROPIC_BASE_URL).toBeUndefined()
    })

    it('configDirRetainedEnv returns empty object when settings.json is missing', () => {
      expect(adapter.configDirRetainedEnv()).toEqual({})
    })
  })
})
