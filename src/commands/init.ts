import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs'
import { loadRules } from '../rules/loader.js'
import { renderTemplate, renderHeader } from '../rules/render.js'
import type { MergedRules } from '../types/rules.js'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bold, green, red, yellow } from 'ansis'
import { getAdapter, ADAPTERS } from '../adapters/codebuddy-adapter.js'

export interface InitOptions {
  local?: boolean
  force?: boolean
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
 * Implement `stk init`: install the SKILL templates for a chosen agent.
 * Defaults to global install unless --local is given.
 */
export async function runInit(options: InitOptions): Promise<void> {
  let agentName = options.agent ?? 'codebuddy'

  // Interactive selection (only in a TTY and only when no --agent given).
  // Prompt once and use the choice directly — no recursion.
  if (!options.agent && process.stdin.isTTY) {
    const { select } = await import('@inquirer/prompts')
    agentName = await select({
      message: '选择目标 AI Agent:',
      choices: Object.values(ADAPTERS).map((a) => ({
        name: `${a.name} (${a.statusLabel})`,
        value: a.name,
        disabled: !a.supported,
      })),
    })
  }

  const adapter = getAdapter(agentName)

  if (!adapter) {
    console.error(red(`未知的 Agent: ${agentName}`))
    process.exitCode = 1
    return
  }
  if (!adapter.supported) {
    console.error(red(`该 Agent (${agentName}) 暂不支持，欢迎贡献`))
    process.exitCode = 1
    return
  }

  const paths = adapter.resolveInstallPaths(!!options.local)

  const tpl = templatesDir()
  const mergedRules = loadRules()
  let written = 0

  mkdirSync(paths.skillsDir, { recursive: true })
  for (const skill of SKILLS) {
    const src = join(tpl, 'skills', skill)
    written += copySkillDir(src, join(paths.skillsDir, skill), !!options.force, mergedRules)
  }

  console.log(
    bold(
      green(
        `\nstk init 完成：安装 ${written} 个 SKILL 文件到 ${paths.skillsDir}（规则库 v${mergedRules.rulesInfo.packVersion}）`,
      ),
    ),
  )
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
 * Copy a skill template directory recursively. Markdown files get rules-pack
 * prompt fragments rendered before write; other files are copied verbatim.
 * Returns the number of files written.
 */
function copySkillDir(srcDir: string, destDir: string, force: boolean, rules: MergedRules): number {
  if (!existsSync(srcDir)) {
    console.error(red(`模板缺失: ${srcDir}`))
    return 0
  }
  let written = 0
  for (const rel of walkFiles(srcDir)) {
    const src = join(srcDir, rel)
    const dest = join(destDir, rel)
    if (existsSync(dest) && !force) {
      console.error(yellow(`已存在，跳过（使用 --force 覆盖）: ${dest}`))
      continue
    }
    mkdirSync(dirname(dest), { recursive: true })
    if (rel.endsWith('.md')) {
      const raw = readFileSync(src, 'utf8')
      const { content, warnings } = renderTemplate(raw, rules)
      for (const w of warnings) console.error(yellow(`警告: ${w}`))
      writeFileSync(dest, renderHeader(rules) + content)
    } else {
      copyFileSync(src, dest)
    }
    written += 1
  }
  if (written === 0) {
    console.error(red(`模板目录为空或全部跳过: ${relative(process.cwd(), srcDir) || srcDir}`))
  }
  return written
}
