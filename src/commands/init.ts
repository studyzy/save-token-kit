import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bold, green, red, yellow } from 'ansis'
import { getAdapter, ADAPTERS } from '../adapters/codebuddy-adapter.js'

export interface InitOptions {
  local?: boolean
  skills?: boolean
  force?: boolean
  agent?: string
}

const COMMANDS = ['diagnose', 'analyze', 'optimize', 'report'] as const
const SKILLS = ['stk-diagnose', 'stk-analyze', 'stk-optimize', 'stk-report'] as const

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
  return candidates.find((c) => existsSync(join(c, 'commands'))) ?? candidates[0]
}

/**
 * Implement `stk init`: install the 4 Command templates (and optional Skills)
 * for a chosen agent. Defaults to global install unless --local is given.
 */
export async function runInit(options: InitOptions): Promise<void> {
  const agentName = options.agent ?? 'codebuddy'
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

  // Interactive selection (only in a TTY; CI/non-interactive proceeds with given agent).
  if (process.stdin.isTTY) {
    const { select } = await import('@inquirer/prompts')
    const choice = await select({
      message: '选择目标 AI Agent:',
      choices: Object.values(ADAPTERS).map((a) => ({
        name: `${a.name} (${a.statusLabel})`,
        value: a.name,
        disabled: !a.supported,
      })),
    })
    if (choice !== agentName) {
      await runInit({ ...options, agent: choice })
      return
    }
  }

  const paths = adapter.resolveInstallPaths(!!options.local)
  mkdirSync(paths.commandsDir, { recursive: true })

  const tpl = templatesDir()
  let written = 0

  for (const cmd of COMMANDS) {
    const src = join(tpl, 'commands', `${cmd}.md`)
    const dest = join(paths.commandsDir, `${cmd}.md`)
    written += copyTemplate(src, dest, !!options.force)
  }

  if (options.skills) {
    mkdirSync(paths.skillsDir, { recursive: true })
    for (const skill of SKILLS) {
      const src = join(tpl, 'skills', skill, 'SKILL.md')
      const dest = join(paths.skillsDir, skill, 'SKILL.md')
      written += copyTemplate(src, dest, !!options.force)
    }
  }

  console.log(bold(green(`\nstk init 完成：安装 ${written} 个文件到 ${paths.commandsDir}`)))
  if (!options.skills) {
    console.log(yellow('提示：未使用 --skills，未安装 SKILL 文件。需要时用 `stk init --skills`。'))
  }
}

/** Copy a template file, skipping on existing unless force is set. Returns 1 if written. */
function copyTemplate(src: string, dest: string, force: boolean): number {
  if (!existsSync(src)) {
    console.error(red(`模板缺失: ${src}`))
    return 0
  }
  if (existsSync(dest) && !force) {
    console.error(yellow(`已存在，跳过（使用 --force 覆盖）: ${dest}`))
    return 0
  }
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  return 1
}
