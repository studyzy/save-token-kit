import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallPaths, PlatformAdapter, PlatformConfigPaths } from './platform-adapter.js'
import { commandExists, getHomeDir } from '../utils/platform.js'

/** Model id injected into ~/.workbuddy/models.json by `stk diagnose`. */
export const STK_DIAGNOSE_MODEL_ID = 'stk-diagnose'

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * WorkBuddy desktop's embedded CodeBuddy CLI path. The desktop app ships the
 * full `@genie/agent-cli` under its Resources. On macOS the app lives at
 * /Applications/WorkBuddy.app; the probe resolves the real app path in case it
 * is relocated (e.g. ~/Applications).
 */
function appResourcesCliBin(): string {
  const candidates = [
    '/Applications/WorkBuddy.app',
    join(homedir(), 'Applications', 'WorkBuddy.app'),
  ]
  for (const app of candidates) {
    const bin = join(app, 'Contents', 'Resources', 'app.asar.unpacked', 'cli', 'bin', 'codebuddy')
    if (existsSync(bin)) return bin
  }
  return join(candidates[0], 'Contents', 'Resources', 'app.asar.unpacked', 'cli', 'bin', 'codebuddy')
}

/**
 * WorkBuddy adapter.
 * WorkBuddy is the desktop app built on the same CodeBuddy CLI kernel
 * (@genie/agent-cli). It speaks the OpenAI Chat Completions protocol against
 * https://copilot.tencent.com/v2/chat/completions and honours the same
 * `CODEBUDDY_BASE_URL` env var as CodeBuddy, so the proxy redirect and
 * request-body parser are shared with the CodeBuddy adapter.
 *
 * Config lives under the WorkBuddy config dir (`WORKBUDDY_CONFIG_DIR`, default
 * `~/.workbuddy`), which the desktop app injects for its CLI host.
 */
export class WorkBuddyAdapter implements PlatformAdapter {
  readonly name = 'workbuddy'
  readonly supported = true
  readonly statusLabel = '可用'
  readonly proxyEnvVar = 'CODEBUDDY_BASE_URL'
  readonly proxyBasePath = '/v2'
  // WorkBuddy custom models (from ~/.workbuddy/models.json) point their `url` at
  // an OpenAI-compatible endpoint like `.../chat/completions`. diagnose injects a
  // stk-diagnose model whose url targets the proxy, so we capture those requests.
  readonly capturePathPrefix = '/chat/completions'
  readonly defaultApiBase = 'https://copilot.tencent.com'
  readonly triggerNodeOptions = { stdio: ['ignore', 'pipe', 'pipe'] } as Record<string, unknown>
  // WorkBuddy's real prompt comes from its desktop templates (workbuddy-*.tpl)
  // + SOUL/USER/IDENTITY, produced by its GUI+sidecar session. A `codebuddy -p`
  // probe would return the stock CodeBuddy prompt instead. WorkBuddy also blocks
  // CODEBUDDY_BASE_URL env redirection (ENV_BLOCKED_PREFIXES includes "CODEBUDDY_"),
  // so the only way to capture its real requests is to inject a custom model in
  // ~/.workbuddy/models.json whose url points at the stk proxy, then have the user
  // select that model and send a message. diagnose therefore waits for the user.
  readonly requiresManualTrigger = true

  /** Embedded CLI binary; falls back to a PATH `codebuddy` if the app is absent. */
  private cliBin(): string {
    const embedded = appResourcesCliBin()
    return existsSync(embedded) ? embedded : 'codebuddy'
  }

  get triggerCommand(): string[] {
    return [this.cliBin(), '-p', 'Hello', '-y', '--max-turns', '1']
  }

  private configDir(): string {
    // WorkBuddy injects WORKBUDDY_CONFIG_DIR (e.g. ~/.workbuddy) for its CLI.
    return process.env.WORKBUDDY_CONFIG_DIR || `${getHomeDir()}/.workbuddy`
  }

  resolveInstallPaths(local: boolean): InstallPaths {
    const base = local ? join(process.cwd(), '.workbuddy') : join(homedir(), '.workbuddy')
    return {
      commandsDir: join(base, 'commands', 'stk'),
      skillsDir: join(base, 'skills'),
    }
  }

  async detectInstall(): Promise<boolean> {
    // Prefer the embedded CLI (desktop app installed); fall back to a PATH binary.
    if (existsSync(appResourcesCliBin())) return true
    return commandExists('codebuddy')
  }

  getConfigPaths(): PlatformConfigPaths {
    const dir = this.configDir()
    return {
      mcp: `${dir}/.mcp.json`,
      settings: `${dir}/settings.json`,
      // WorkBuddy's main identity file (Agent Identity system: SOUL/USER/IDENTITY).
      codebuddyMd: `${dir}/SOUL.md`,
      skillsDir: `${dir}/skills`,
      commandsDir: `${dir}/commands`,
      rulesDir: `${dir}/rules`,
      agentsDir: `${dir}/agents`,
      pluginsMarketplacesDir: `${dir}/plugins/marketplaces`,
      historyFile: `${dir}/history.jsonl`,
      blobsDir: `${dir}/blobs`,
      cliBinary: this.cliBin(),
      projectCodebuddyMd: `${process.cwd()}/SOUL.md`,
      projectSkillsDir: `${process.cwd()}/.workbuddy/skills`,
      projectCommandsDir: `${process.cwd()}/.workbuddy/commands`,
      projectRulesDir: `${process.cwd()}/.workbuddy/rules`,
    }
  }

  /** Path to WorkBuddy's custom-model config (~/.workbuddy/models.json). */
  modelsFilePath(): string {
    return `${this.configDir()}/models.json`
  }

  /**
   * Read the models.json array (WorkBuddy "top-level array" format). Returns an
   * empty array when the file is missing or malformed (never throws).
   */
  private readModels(): Array<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(readFileSync(this.modelsFilePath(), 'utf8'))
      if (Array.isArray(parsed)) return parsed
      // WorkBuddy also accepts `{ models: [...] }`; normalize to the array form.
      if (parsed && Array.isArray((parsed as { models?: unknown }).models)) {
        return (parsed as { models: Array<Record<string, unknown>> }).models
      }
    } catch {
      // fall through
    }
    return []
  }

  /**
   * Inject the `stk-diagnose` custom model so WorkBuddy's real requests are sent
   * to the proxy. WorkBuddy watches models.json and syncs automatically. Returns
   * the previous models array (to restore) or null when no change was needed.
   */
  injectDiagnoseModel(proxyUrl: string): Array<Record<string, unknown>> | null {
    const models = this.readModels()
    const existing = models.find((m) => m.id === STK_DIAGNOSE_MODEL_ID)
    if (existing) return null // already injected

    const newModel: Record<string, unknown> = {
      id: STK_DIAGNOSE_MODEL_ID,
      name: 'stk-diagnose (token check)',
      vendor: 'stk',
      url: `${proxyUrl.replace(/\/$/, '')}/chat/completions`,
      apiKey: 'stk-diagnose',
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: false,
    }
    writeFileSync(this.modelsFilePath(), JSON.stringify([...models, newModel], null, 2))
    return models // previous state to restore on cleanup
  }

  /** Remove the `stk-diagnose` model, restoring `prevModels` if given. */
  removeDiagnoseModel(prevModels: Array<Record<string, unknown>> | null): void {
    try {
      const models = this.readModels()
      const next = models.filter((m) => m.id !== STK_DIAGNOSE_MODEL_ID)
      // If we injected it (prevModels provided) restore the exact prior content.
      if (prevModels !== null) {
        writeFileSync(this.modelsFilePath(), JSON.stringify(prevModels, null, 2))
        return
      }
      writeFileSync(this.modelsFilePath(), JSON.stringify(next, null, 2))
    } catch {
      // best-effort cleanup; never throw in finally
    }
  }

  getHeadlessCommand(prompt: string, schema?: object): string[] {
    const args = ['-p', prompt, '-y', '--max-turns', '6']
    if (schema) {
      args.push('--json-schema', JSON.stringify(schema))
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
