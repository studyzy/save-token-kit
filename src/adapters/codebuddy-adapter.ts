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
 * CodeBuddy adapter.
 * Commands: .codebuddy/commands/save-token-kit/{command}.md
 * Skills:   .codebuddy/skills/{skill}/SKILL.md
 */
export class CodeBuddyAdapter implements PlatformAdapter {
  readonly name = 'codebuddy'
  readonly supported = true
  readonly statusLabel = '可用'
  readonly proxyEnvVar = 'CODEBUDDY_BASE_URL'
  readonly triggerCommand = ['codebuddy', '-p', 'Hello', '-y', '--max-turns', '1']

  resolveInstallPaths(local: boolean): InstallPaths {
    const base = local ? join(process.cwd(), '.codebuddy') : join(homedir(), '.codebuddy')
    return {
      commandsDir: join(base, 'commands', 'save-token-kit'),
      skillsDir: join(base, 'skills'),
    }
  }

  async detectInstall(): Promise<boolean> {
    return commandExists('codebuddy')
  }

  getConfigPaths(): PlatformConfigPaths {
    const dir = `${getHomeDir()}/.codebuddy`
    return {
      mcp: `${dir}/.mcp.json`,
      settings: `${dir}/settings.json`,
      codebuddyMd: `${dir}/CODEBUDDY.md`,
      skillsDir: `${dir}/skills`,
      commandsDir: `${dir}/commands`,
      rulesDir: `${dir}/rules`,
      agentsDir: `${dir}/agents`,
      pluginsMarketplacesDir: `${dir}/plugins/marketplaces`,
      historyFile: `${dir}/history.jsonl`,
      blobsDir: `${dir}/blobs`,
      cliBinary: 'codebuddy',
    }
  }

  getHeadlessCommand(prompt: string, schema?: object): string[] {
    // Use plain `-p` output (the model answer itself) so the structured JSON
    // answer is printed directly and can be parsed. The schema is already
    // described inside the prompt templates, so we don't force --output-format.
    const args = ['-p', prompt, '-y', '--max-turns', '6']
    if (schema) {
      args.push('--json-schema', JSON.stringify(schema))
    }
    return args
  }

  parseHeadlessOutput(raw: string): unknown {
    const text = raw.trim()
    // CodeBuddy may prefix/suffix the JSON payload with log lines; extract the
    // first balanced JSON array/object instead of requiring a pure JSON string.
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

/** Map of available adapters keyed by agent name. */
function unsupportedStub(name: string): PlatformAdapter {
  return {
    name,
    supported: false,
    statusLabel: '暂不支持',
    proxyEnvVar: '',
    triggerCommand: [],
    resolveInstallPaths: () => ({ commandsDir: '', skillsDir: '' }),
    detectInstall: async () => false,
    getConfigPaths: () => ({
      mcp: '', settings: '', codebuddyMd: '', skillsDir: '', commandsDir: '', rulesDir: '',
      agentsDir: '', pluginsMarketplacesDir: '', historyFile: '', blobsDir: '', cliBinary: name,
    }),
    getHeadlessCommand: () => [],
    parseHeadlessOutput: () => null,
  }
}

export const ADAPTERS: Record<string, PlatformAdapter> = {
  codebuddy: new CodeBuddyAdapter(),
  // Reserved for future versions; marked unsupported in the installer.
  claude: unsupportedStub('claude'),
  codex: unsupportedStub('codex'),
  cursor: unsupportedStub('cursor'),
}

/** Get an adapter by name, or undefined if unknown. */
export function getAdapter(name: string): PlatformAdapter | undefined {
  return ADAPTERS[name]
}
