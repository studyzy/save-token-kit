import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallPaths, PlatformAdapter, PlatformConfigPaths } from './platform-adapter.js'
import { commandExists, getHomeDir } from '../utils/platform.js'

/** Read a string env value from a Claude settings.json `env` object, or null. */
function readEnvFromSettings(settingsPath: string, key: string): string | null {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      env?: Record<string, string>
    }
    const value = settings.env?.[key]
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

/**
 * Read all env vars declared in a Claude settings.json `env` object. Returns an
 * empty object when the file is missing/malformed.
 */
function readAllEnvFromSettings(settingsPath: string): Record<string, string> {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      env?: Record<string, string>
    }
    const env = settings.env ?? {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

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
  readonly proxyBasePath = ''
  readonly triggerCommand = ['claude', '-p', 'Hello', '--max-turns', '1']
  readonly capturePathPrefix = '/v1/'
  readonly defaultApiBase = 'https://api.anthropic.com'
  // Claude Code's `~/.claude/settings.json` env overrides the inherited
  // `ANTHROPIC_BASE_URL`, so diagnose must isolate the config dir to redirect.
  readonly needsIsolatedConfigDir = true

  /**
   * Retain all settings.json env vars except `ANTHROPIC_BASE_URL` (which
   * diagnose overrides to point at the proxy). This keeps the auth token and
   * model mappings available to the probe request despite config-dir isolation.
   */
  configDirRetainedEnv(): Record<string, string> {
    const env = readAllEnvFromSettings(this.getConfigPaths().settings)
    delete env[this.proxyEnvVar]
    return env
  }

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

  /**
   * Resolve the real upstream API base URL Claude Code currently targets.
   * Claude Code can point at a custom upstream either via the `ANTHROPIC_BASE_URL`
   * process env var or via the `env.ANTHROPIC_BASE_URL` field of
   * `~/.claude/settings.json`. The process env var is only visible to the spawned
   * `claude` CLI, so we also read the settings file when it is absent.
   * Priority: process env > settings.json env > defaultApiBase.
   */
  resolveUpstreamBaseUrl(): string {
    return (
      process.env[this.proxyEnvVar] ||
      readEnvFromSettings(this.getConfigPaths().settings, this.proxyEnvVar) ||
      this.defaultApiBase
    )
  }

  getConfigPaths(): PlatformConfigPaths {
    const dir = `${getHomeDir()}/.claude`
    return {
      mcp: `${dir}/.mcp.json`,
      settings: `${dir}/settings.json`,
      codebuddyMd: `${dir}/CLAUDE.md`,
      skillsDir: `${dir}/skills`,
      commandsDir: `${dir}/commands`,
      rulesDir: `${dir}/rules`,
      agentsDir: `${dir}/agents`,
      pluginsMarketplacesDir: '',
      historyFile: '',
      blobsDir: '',
      cliBinary: 'claude',
      projectCodebuddyMd: `${process.cwd()}/CLAUDE.md`,
      projectSkillsDir: `${process.cwd()}/.claude/skills`,
      projectCommandsDir: `${process.cwd()}/.claude/commands`,
      projectRulesDir: `${process.cwd()}/.claude/rules`,
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
