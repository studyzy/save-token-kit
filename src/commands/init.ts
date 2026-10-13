import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
} from 'node:fs'
import { loadRules } from '../rules/loader.js'
import { renderTemplate, renderHeader, insertHeader } from '../rules/render.js'
import type { MergedRules } from '../types/rules.js'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bold, green, red, yellow } from 'ansis'
import { getAdapter, ADAPTERS } from '../adapters/codebuddy-adapter.js'
import type { PlatformAdapter } from '../adapters/platform-adapter.js'

export interface InitOptions {
  local?: boolean
  agent?: string
}

const SKILLS = ['stk', 'stk-diagnose', 'stk-analyze', 'stk-optimize', 'stk-report'] as const

/**
 * Templates base dir. Resolves to `src/templates` at dev time (next to src/)
 * and to the package-root `src/templates` at runtime (templates are shipped
 * under the package root, see package.json "files"). Walks up from this file
 * to the package root so it is independent of how unbuild lays out chunks.
 */
function templatesDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  // Walk up until we find the package root (dir containing package.json).
  while (dir !== dirname(dir) && !existsSync(join(dir, 'package.json'))) {
    dir = dirname(dir)
  }
  const pkgRoot = dir
  const candidates = [join(pkgRoot, 'src', 'templates'), join(pkgRoot, 'templates')]
  return candidates.find((c) => existsSync(join(c, 'skills'))) ?? candidates[0]
}

/**
 * Implement `stk init`.
 *
 * With `--agent <name>`: install the SKILL templates for that agent only.
 * Without it: scan every supported agent's config dir (`~/.codebuddy`,
 * `~/.codex`, `~/.claude`, `~/.workbuddy`, or the project-level equivalents
 * under `--local`) and install into each one that already exists, so a single
 * `stk init` refreshes all agents in use. Existing files are always
 * overwritten so installed SKILLs track the shipped templates.
 */
export async function runInit(options: InitOptions): Promise<void> {
  const tpl = templatesDir()
  const mergedRules = loadRules()
  const local = !!options.local

  if (options.agent) {
    const adapter = getAdapter(options.agent)
    if (!adapter) {
      console.error(red(`未知的 Agent: ${options.agent}`))
      process.exitCode = 1
      return
    }
    if (!adapter.supported) {
      console.error(red(`该 Agent (${options.agent}) 暂不支持，欢迎贡献`))
      process.exitCode = 1
      return
    }
    const written = installForAdapter(adapter, local, tpl, mergedRules)
    reportInstalled([[adapter.name, written]], mergedRules.rulesInfo.packVersion)
    return
  }

  // No --agent: pick up every supported agent whose config dir is present.
  // `skillsDir` is `<configDir>/skills`, so its parent is the agent's config
  // dir — the thing that tells us whether this agent is installed at all.
  const installed: Array<[string, number]> = []
  for (const adapter of Object.values(ADAPTERS)) {
    if (!adapter.supported) continue
    const configDir = dirname(adapter.resolveInstallPaths(local).skillsDir)
    if (!existsSync(configDir)) continue
    installed.push([adapter.name, installForAdapter(adapter, local, tpl, mergedRules)])
  }

  if (installed.length === 0) {
    console.error(yellow('未检测到任何已安装的 AI Agent，未写入任何 SKILL。'))
    console.error(yellow('用 --agent <name> 指定目标（codebuddy/workbuddy/claude/codex）。'))
    return
  }
  reportInstalled(installed, mergedRules.rulesInfo.packVersion)
}

/** Install every SKILL template for one adapter; returns the file count. */
function installForAdapter(
  adapter: PlatformAdapter,
  local: boolean,
  tpl: string,
  rules: MergedRules,
): number {
  const paths = adapter.resolveInstallPaths(local)
  mkdirSync(paths.skillsDir, { recursive: true })
  let written = 0
  for (const skill of SKILLS) {
    written += copySkillDir(join(tpl, 'skills', skill), join(paths.skillsDir, skill), rules)
  }
  return written
}

/** Print one line per installed agent plus a total. */
function reportInstalled(installed: Array<[string, number]>, packVersion: string): void {
  const total = installed.reduce((n, [, c]) => n + c, 0)
  const detail =
    installed.length === 1
      ? `${installed[0][1]} 个 SKILL 文件`
      : `${installed.length} 个 Agent，共 ${total} 个 SKILL 文件`
  console.log(bold(green(`\nstk init 完成：${detail}（规则库 v${packVersion}）`)))
  for (const [name, count] of installed) {
    console.log(green(`  • ${name}: ${count} 个文件`))
  }
}

/** Recursively walk a directory, returning relative file paths (forward slashes). */
function walkFiles(dir: string, base = ''): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walkFiles(join(dir, e.name), rel))
    else out.push(rel)
  }
  return out
}

/**
 * Copy a skill template directory recursively, overwriting existing files so
 * the installed SKILLs always match the shipped templates and rules pack.
 * Markdown files get rules-pack prompt fragments rendered before write; other
 * files are copied verbatim. Returns the number of files written.
 */
function copySkillDir(srcDir: string, destDir: string, rules: MergedRules): number {
  if (!existsSync(srcDir)) {
    console.error(red(`模板缺失: ${srcDir}`))
    return 0
  }
  let written = 0
  for (const rel of walkFiles(srcDir)) {
    const src = join(srcDir, rel)
    const dest = join(destDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    if (rel.endsWith('.md')) {
      const raw = readFileSync(src, 'utf8')
      const { content, warnings } = renderTemplate(raw, rules)
      for (const w of warnings) console.error(yellow(`警告: ${w}`))
      writeFileSync(dest, insertHeader(content, renderHeader(rules)))
    } else {
      copyFileSync(src, dest)
    }
    written += 1
  }
  if (written === 0) {
    console.error(red(`模板目录为空: ${relative(process.cwd(), srcDir) || srcDir}`))
  }
  return written
}
