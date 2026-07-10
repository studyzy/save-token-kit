import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallPaths, PlatformAdapter } from './platform-adapter.js'

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
}

/** Map of available adapters keyed by agent name. */
export const ADAPTERS: Record<string, PlatformAdapter> = {
  codebuddy: new CodeBuddyAdapter(),
  // Reserved for future versions; marked unsupported in the installer.
  claude: { name: 'claude', supported: false, statusLabel: '暂不支持', proxyEnvVar: '', triggerCommand: [], resolveInstallPaths: () => ({ commandsDir: '', skillsDir: '' }) },
  codex: { name: 'codex', supported: false, statusLabel: '暂不支持', proxyEnvVar: '', triggerCommand: [], resolveInstallPaths: () => ({ commandsDir: '', skillsDir: '' }) },
  cursor: { name: 'cursor', supported: false, statusLabel: '暂不支持', proxyEnvVar: '', triggerCommand: [], resolveInstallPaths: () => ({ commandsDir: '', skillsDir: '' }) },
}

/** Get an adapter by name, or undefined if unknown. */
export function getAdapter(name: string): PlatformAdapter | undefined {
  return ADAPTERS[name]
}
