import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { exec } from 'tinyexec'
import type { ToolkitSpec } from '../types/rules.js'
import { commandExists as defaultCommandExists, getPlatform } from '../utils/platform.js'

/** Evaluation context injected by the caller (diagnose builds the full one; standalone calls may pass a minimal one). */
export interface SpecContext {
  home: string
  mcpList: Array<{ name: string; status: string }>
  hookList: Array<{ event: string; command?: string }>
  proxyParsed: { mcpServers?: Array<{ name: string }>; detectedPlugins?: string[] } | null
  settingsJson?: { enabledPlugins?: Record<string, boolean> } | null
}

/** Injectable I/O dependencies for testability. */
export interface SpecDeps {
  commandExists?: (name: string) => Promise<boolean>
  /** Return ps output lines matching the given regex pattern. */
  listProcesses?: (pattern: string) => Promise<string[]>
  /** Base directory for relative paths in the `path` primitive (default: process.cwd()). */
  cwd?: string
}

/** Expand a leading `~` to the given home directory. */
function expandHome(p: string, home: string): string {
  if (p === '~') return home
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(home, p.slice(2))
  return p
}

/** Default `ps` line matcher (mirrors the former isHeadroomProxyRunning semantics, generalized). */
async function defaultListProcesses(pattern: string): Promise<string[]> {
  const cmd = getPlatform() === 'windows' ? 'tasklist' : 'ps'
  const args = getPlatform() === 'windows' ? ['/fo', 'csv', '/nh'] : ['-eo', 'pid=,args=']
  try {
    const res = await exec(cmd, args)
    if (res.exitCode !== 0) return []
    const re = new RegExp(pattern)
    return res.stdout.split('\n').filter((line) => re.test(line))
  } catch {
    return []
  }
}

async function evalPrimitive(spec: ToolkitSpec, ctx: SpecContext, deps: SpecDeps): Promise<boolean> {
  switch (spec.kind) {
    case 'command':
      return (deps.commandExists ?? defaultCommandExists)(spec.name ?? '')

    case 'path': {
      try {
        const expanded = expandHome(spec.path ?? '', ctx.home)
        const abs = isAbsolute(expanded)
          ? expanded
          : resolve(deps.cwd ?? process.cwd(), expanded)
        return existsSync(abs)
      } catch {
        return false
      }
    }

    case 'mcp': {
      const names = spec.names ?? []
      const source = spec.source ?? 'any'
      const inFs = ctx.mcpList.some((m) => names.includes(m.name) && m.status === 'enabled')
      const inProxy = ctx.proxyParsed?.mcpServers?.some((m) => names.includes(m.name)) ?? false
      if (source === 'fs') return inFs
      if (source === 'proxy') return inProxy
      return inFs || inProxy
    }

    case 'plugin-enabled':
      return ctx.settingsJson?.enabledPlugins?.[spec.key ?? ''] === true

    case 'proxy-plugin':
      return ctx.proxyParsed?.detectedPlugins?.includes(spec.name ?? '') ?? false

    case 'hook':
      return ctx.hookList.some(
        (h) => h.event === spec.event && (h.command?.includes(spec.match ?? '') ?? false),
      )

    case 'process': {
      try {
        const lines = await (deps.listProcesses ?? defaultListProcesses)(spec.pattern ?? '')
        const re = new RegExp(spec.pattern ?? '')
        return lines.some((line) => re.test(line))
      } catch {
        return false
      }
    }

    default:
      throw new Error(`unknown kind: ${(spec as { kind?: string }).kind ?? JSON.stringify(spec)}`)
  }
}

const KNOWN_KINDS = new Set([
  'command',
  'path',
  'mcp',
  'plugin-enabled',
  'proxy-plugin',
  'hook',
  'process',
])

/**
 * Evaluate a declarative detection/enabled spec against the given context.
 * All I/O failures resolve to false (prefer false negatives over false positives).
 */
export async function evaluateSpec(
  spec: ToolkitSpec,
  ctx: SpecContext,
  deps: SpecDeps = {},
): Promise<boolean> {
  if (spec.all) {
    for (const child of spec.all) {
      if (!(await evaluateSpec(child, ctx, deps))) return false
    }
    return true
  }
  if (spec.any) {
    for (const child of spec.any) {
      if (await evaluateSpec(child, ctx, deps)) return true
    }
    return false
  }
  if (!spec.kind || !KNOWN_KINDS.has(spec.kind)) {
    throw new Error(`unknown kind: ${(spec as { kind?: string }).kind ?? JSON.stringify(spec)}`)
  }
  return evalPrimitive(spec, ctx, deps).catch(() => false)
}
