import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallPaths, PlatformAdapter, PlatformConfigPaths } from './platform-adapter.js'
import { commandExists, getHomeDir } from '../utils/platform.js'

/**
 * Claude Code adapter.
 * Config dir: ~/.claude/
 * Memory: ~/.claude/CLAUDE.md + ./CLAUDE.md
 * Commands: ~/.claude/commands/
 * Agents: ~/.claude/agents/
 * MCP: ~/.claude/.mcp.json
 */
export class ClaudeAdapter implements PlatformAdapter {
  readonly name = 'claude'
  readonly supported = true
  readonly statusLabel = '可用'
  readonly proxyEnvVar = 'ANTHROPIC_BASE_URL'
  readonly triggerCommand = ['claude', '-p', 'Hello', '--max-turns', '1']
  readonly capturePathPrefix = '/v1/'
  readonly defaultApiBase = 'https://api.anthropic.com'

  resolveInstallPaths(local: boolean): InstallPaths {
    const base = local ? join(process.cwd(), '.claude') : join(homedir(), '.claude')
    return {
      commandsDir: join(base, 'commands'),
      skillsDir: join(base, 'skills'),
    }
  }

  async detectInstall(): Promise<boolean> {
    return commandExists('claude')
  }

  getConfigPaths(): PlatformConfigPaths {
    const dir = `${getHomeDir()}/.claude`
    return {
      mcp: `${dir}/.mcp.json`,
      settings: `${dir}/settings.json`,
      codebuddyMd: `${dir}/CLAUDE.md`,
      skillsDir: `${dir}/skills`,
      commandsDir: `${dir}/commands`,
      rulesDir: '',
      agentsDir: `${dir}/agents`,
      pluginsMarketplacesDir: '',
      historyFile: '',
      blobsDir: '',
      cliBinary: 'claude',
      projectCodebuddyMd: `${process.cwd()}/CLAUDE.md`,
      projectSkillsDir: `${process.cwd()}/.claude/skills`,
      projectCommandsDir: `${process.cwd()}/.claude/commands`,
      projectRulesDir: '',
    }
  }

  getHeadlessCommand(prompt: string): string[] {
    return ['-p', prompt, '--max-turns', '1']
  }

  parseHeadlessOutput(raw: string): unknown {
    try {
      return JSON.parse(raw.trim())
    } catch {
      return null
    }
  }
}
