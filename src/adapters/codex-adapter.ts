import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallPaths, PlatformAdapter, PlatformConfigPaths } from './platform-adapter.js'
import { commandExists, getHomeDir } from '../utils/platform.js'

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * Read the active model provider id from a CodeX config.toml
 * (`model_provider = "..."`). Defaults to "openai" when absent.
 */
function readProviderId(configPath: string): string {
  try {
    const toml = readFileSync(configPath, 'utf8')
    const m = toml.match(/^\s*model_provider\s*=\s*"([^"]+)"/m)
    return m?.[1] ?? 'openai'
  } catch {
    return 'openai'
  }
}

/**
 * Read the base_url of a given provider from a CodeX config.toml
 * (`[model_providers.<id>]` section). Returns null when not found.
 */
function readProviderBaseUrl(configPath: string, providerId: string): string | null {
  try {
    const toml = readFileSync(configPath, 'utf8')
    const sectionRe = new RegExp(
      `\\[\\s*model_providers\\.${escapeRegExp(providerId)}\\s*\\][\\s\\S]*?(?=\\n\\[|$)`,
    )
    const section = toml.match(sectionRe)?.[0]
    const baseUrl = section?.match(/^\s*base_url\s*=\s*"([^"]+)"/m)?.[1]
    return baseUrl ?? null
  } catch {
    return null
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * OpenAI CodeX CLI adapter.
 * Config dir: ~/.codex/ (overridable via CODEX_HOME)
 * Config file: ~/.codex/config.toml
 * Memory: ~/.codex/AGENTS.md + ./AGENTS.md
 * MCP:    ~/.codex/config.toml [mcp_servers]
 *
 * CodeX speaks the OpenAI Responses API, so the proxy targets an OpenAI-compatible
 * endpoint. CodeX routes through `[model_providers.<id>].base_url` in config.toml
 * (it does NOT honor the OPENAI_BASE_URL env var), so the proxy redirect is applied
 * via a `-c model_providers.<id>.base_url="<proxy>"` config override at runtime.
 */
export class CodeXAdapter implements PlatformAdapter {
  readonly name = 'codex'
  readonly supported = true
  readonly statusLabel = '可用'
  readonly proxyEnvVar = 'OPENAI_BASE_URL'
  readonly proxyBasePath = '/v1'
  readonly triggerCommand = ['codex', 'exec', 'Hello', '--skip-git-repo-check', '--sandbox', 'read-only']
  readonly capturePathPrefix = '/v1/'
  readonly defaultApiBase = 'https://api.openai.com'
  // CodeX reads "additional input from stdin" when stdin is a pipe and blocks
  // until it closes, so the trigger must ignore stdin to fire a request.
  readonly triggerNodeOptions = { stdio: ['ignore', 'pipe', 'pipe'] } as Record<string, unknown>

  /** Config file path, honoring CODEX_HOME (falls back to ~/.codex/config.toml). */
  private configFilePath(): string {
    const homeDir = getHomeDir()
    const dir = process.env.CODEX_HOME || `${homeDir}/.codex`
    return `${dir}/config.toml`
  }

  /**
   * CodeX (>= 0.18) routes via config.toml `[model_providers.<id>].base_url`,
   * not an env var like `OPENAI_BASE_URL`. Redirect it to the proxy by
   * appending `-c model_providers.<provider>.base_url="<proxy>"`.
   */
  proxyRedirectArgs(proxyBaseUrl: string): string[] {
    const providerId = readProviderId(this.configFilePath())
    return ['-c', `model_providers.${providerId}.base_url="${proxyBaseUrl}"`]
  }

  /**
   * Resolve the real upstream API base URL from the active provider so the proxy
   * can forward captured requests to the actual backend.
   */
  resolveUpstreamBaseUrl(): string {
    const configPath = this.configFilePath()
    const providerId = readProviderId(configPath)
    return readProviderBaseUrl(configPath, providerId) ?? this.defaultApiBase
  }

  resolveInstallPaths(local: boolean): InstallPaths {
    const base = local ? join(process.cwd(), '.codex') : join(homedir(), '.codex')
    return {
      commandsDir: join(base, 'commands'),
      skillsDir: join(base, 'skills'),
    }
  }

  async detectInstall(): Promise<boolean> {
    return commandExists('codex')
  }

  getConfigPaths(): PlatformConfigPaths {
    const homeDir = getHomeDir()
    const dir = process.env.CODEX_HOME || `${homeDir}/.codex`
    return {
      mcp: `${dir}/config.toml`,
      settings: `${dir}/config.toml`,
      codebuddyMd: `${dir}/AGENTS.md`,
      skillsDir: `${dir}/skills`,
      commandsDir: `${dir}/commands`,
      rulesDir: `${dir}/rules`,
      agentsDir: `${dir}/agents`,
      pluginsMarketplacesDir: '',
      historyFile: `${dir}/sessions/history.jsonl`,
      blobsDir: '',
      cliBinary: 'codex',
      projectCodebuddyMd: `${process.cwd()}/AGENTS.md`,
      projectSkillsDir: `${process.cwd()}/.codex/skills`,
      projectCommandsDir: `${process.cwd()}/.codex/commands`,
      projectRulesDir: `${process.cwd()}/.codex/rules`,
    }
  }

  getHeadlessCommand(prompt: string, schema?: object): string[] {
    const args = ['exec', prompt, '--skip-git-repo-check', '--sandbox', 'read-only']
    if (schema) {
      // CodeX has no JSON-schema flag; describe the shape in the prompt instead.
      args.push(`Respond with JSON matching: ${JSON.stringify(schema)}`)
    }
    return args
  }

  parseHeadlessOutput(raw: string): unknown {
    const text = raw.trim()
    const start = text.search(/[[{]/)
    if (start < 0) return safeParse(text)
    const opener = text[start]
    const closer = opener === '[' ? ']' : '}'
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === opener) depth++
      else if (ch === closer) {
        depth--
        if (depth === 0) return safeParse(text.slice(start, i + 1))
      }
    }
    return safeParse(text.slice(start))
  }
}
