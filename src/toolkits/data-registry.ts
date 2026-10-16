import type { ToolkitCatalogEntry } from '../types/rules.js'
import { isSpecCombinator } from '../types/rules.js'
import { homedir } from 'node:os'
import type { ToolkitDetection } from '../../types/index.js'
import { evaluateSpec, type SpecContext, type SpecDeps } from './spec.js'
import { runShell as defaultRunShell } from './shell.js'
import type { InstallResult } from './types.js'
import { rtkNativeInstall } from './handlers/rtk-native.js'

/** Injectable I/O dependencies for the data-driven registry (all optional, real shell by default). */
export interface RegistryDeps extends SpecDeps {
  /** Run one shell step; must report the exit code (tinyexec does NOT throw on non-zero). */
  runShell?: (cmd: string) => Promise<{ exitCode: number; stderr: string }>
}

/** Runtime toolkit built from a data.toolkits catalog entry — minimal interface consumed by stk install / diagnose. */
export interface DataToolkit {
  readonly name: string
  readonly description: string
  readonly type: 'cli' | 'plugin' | 'mcp'
  /** Display/executed install command (install.default; install.byAgent is display-only). */
  readonly installCommand: string
  install(global: boolean, agent: string): Promise<InstallResult>
  buildDetection(ctx?: SpecContext): Promise<ToolkitDetection>
}

/** Named install handler: owns the whole install flow for entries declaring `install.handler`. */
export type ToolkitInstallHandler = (
  entry: ToolkitCatalogEntry,
  opts: { global: boolean; agent: string; deps: RegistryDeps },
) => Promise<InstallResult>

/** Engine-side named handlers — the only toolkit-specific code kept in the engine (was 13 impl files). */
const HANDLERS: Record<string, ToolkitInstallHandler> = {
  'rtk-native': rtkNativeInstall,
}

/** Default context for standalone buildDetection calls (no scan available). */
function defaultCtx(): SpecContext {
  return { home: homedir(), mcpList: [], hookList: [], proxyParsed: null }
}

/** Walk an enabled spec and return all proxy-plugin names declared inside (any depth). */
function collectProxyPluginNames(spec: NonNullable<ToolkitCatalogEntry['enabled']>): string[] {
  const names: string[] = []
  const walk = (s: NonNullable<ToolkitCatalogEntry['enabled']>): void => {
    if (s.kind === 'proxy-plugin' && 'name' in s) names.push(s.name)
    // Nested specs live on all/any combinators (a primitive has neither).
    if (isSpecCombinator(s)) {
      for (const child of (s.all ?? []).concat(s.any ?? [])) walk(child)
    }
  }
  walk(spec)
  return names
}

/**
 * Build the runtime toolkit registry from merged rules data.
 * Entries without a `detect` spec are skipped (they render in suggestions only, never detected).
 */
export function buildRegistry(
  merged: {
    toolkits: Record<string, ToolkitCatalogEntry>
  },
  deps: RegistryDeps = {},
): DataToolkit[] {
  const runShell = deps.runShell ?? defaultRunShell

  const resolveConfigCmd = (
    install: ToolkitCatalogEntry['install'],
    agent: string,
    global: boolean,
  ): string => {
    const template = install?.config?.byAgent?.[agent] ?? install?.config?.default
    if (!template) return ''
    let cmd = template.replaceAll('{agent}', agent)
    if (!global) cmd = cmd.replace(/\s-g(\s|$)/g, '$1').trim()
    return cmd
  }

  const makeGenericInstall =
    (name: string, install: ToolkitCatalogEntry['install']) =>
    async (global: boolean, agent: string): Promise<InstallResult> => {
      const steps: InstallResult['steps'] = []
      const run = async (cmd: string): Promise<boolean> => {
        try {
          const res = await runShell(cmd)
          if (res.exitCode !== 0) {
            steps.push({
              cmd,
              ok: false,
              error: `exitCode=${res.exitCode} ${res.stderr.trim()}`.trim(),
            })
            return false
          }
          steps.push({ cmd, ok: true })
          return true
        } catch (e) {
          steps.push({ cmd, ok: false, error: (e as Error).message })
          return false
        }
      }

      const handlerName = install?.handler
      if (handlerName) {
        const handler = HANDLERS[handlerName]
        if (!handler) {
          return {
            toolkit: name,
            ok: false,
            steps: [
              {
                cmd: `handler ${handlerName}`,
                ok: false,
                error: `未知 install.handler: ${handlerName}`,
              },
            ],
          }
        }
        return handler(entryOf(name)!, { global, agent, deps })
      }

      const installCmd = install?.default
      if (installCmd && !(await run(installCmd))) {
        return { toolkit: name, ok: false, steps }
      }
      const configCmd = resolveConfigCmd(install, agent, global)
      if (configCmd && !(await run(configCmd))) {
        return { toolkit: name, ok: false, steps }
      }
      return { toolkit: name, ok: true, steps }
    }

  // entry lookup for handler delegation (handlers re-read facts from data)
  const byName = new Map<string, ToolkitCatalogEntry>()
  for (const entry of Object.values(merged.toolkits)) {
    if (!entry.detect) continue
    byName.set(entry.id, entry)
  }
  const entryOf = (name: string): ToolkitCatalogEntry | undefined => byName.get(name)

  return Array.from(byName.values()).map((entry) => ({
    name: entry.id,
    description: entry.description ?? '',
    type: entry.type,
    installCommand: entry.install?.default ?? '',
    install: makeGenericInstall(entry.id, entry.install),
    buildDetection: async (ctx: SpecContext = defaultCtx()): Promise<ToolkitDetection> => {
      let installed = await evaluateSpec(entry.detect!, ctx, deps)

      // proxy-plugin markers prove the toolkit is active through the proxy even
      // when the on-disk detect spec misses (former markInstalledFromProxy semantics).
      const proxyNames = entry.enabled ? collectProxyPluginNames(entry.enabled) : []
      const proxyHit =
        proxyNames.length > 0 &&
        proxyNames.some((n) => ctx.proxyParsed?.detectedPlugins?.includes(n) ?? false)
      if (proxyHit) installed = true

      const enabled = entry.enabled
        ? await evaluateSpec(entry.enabled, ctx, deps)
        : entry.type === 'cli'
          ? false
          : installed

      return {
        name: entry.id,
        installed,
        enabled,
        version: null,
        installPath: null,
        codebuddyIntegrated: installed,
        recommendedSaving: entry.saving,
      }
    },
  }))
}
