import { describe, it, expect } from 'vitest'
import { ClaudeAdapter } from '@/adapters/claude-adapter.js'

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
    // Claude has no plugins or rules directories
    expect(paths.skillsDir).toContain('.claude/skills')
    expect(paths.projectSkillsDir).toContain('.claude/skills')
    expect(paths.rulesDir).toBe('')
    expect(paths.pluginsMarketplacesDir).toBe('')
    expect(paths.projectRulesDir).toBe('')
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
})
