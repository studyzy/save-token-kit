import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { bold, green, red, yellow } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'

export interface UninstallOptions {
  local?: boolean
  force?: boolean
  agent?: string
}

/** Same skill directories `stk init` installs — uninstall removes exactly these. */
const SKILLS = ['stk', 'stk-diagnose', 'stk-analyze', 'stk-optimize', 'stk-report'] as const

/**
 * Implement `stk uninstall`: remove the SKILL files installed by `stk init`
 * for a chosen agent. Only the stk-owned skill directories are deleted —
 * never the whole skills directory, so user-installed skills stay intact.
 *
 * Safety: without --force, an interactive session asks for confirmation and
 * a non-interactive session aborts (scripts must pass --force explicitly).
 */
export async function runUninstall(options: UninstallOptions): Promise<void> {
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

  if (!options.force) {
    if (process.stdin.isTTY) {
      const { confirm } = await import('@inquirer/prompts')
      const ok = await confirm({
        message: `确认删除 ${agentName} 的 stk SKILL 文件？此操作不可撤销`,
        default: false,
      })
      if (!ok) {
        console.log(yellow('已取消，未删除任何文件。'))
        return
      }
    } else {
      console.error(red('非交互环境下删除需要显式确认：请加 --force。'))
      process.exitCode = 1
      return
    }
  }

  const paths = adapter.resolveInstallPaths(!!options.local)
  let removed = 0
  let missing = 0

  for (const skill of SKILLS) {
    const dir = join(paths.skillsDir, skill)
    if (!existsSync(dir)) {
      missing += 1
      continue
    }
    rmSync(dir, { recursive: true, force: true })
    removed += 1
    console.log(green(`  已删除: ${dir}`))
  }

  if (removed === 0) {
    console.log(yellow(`未发现已安装的 stk SKILL（${paths.skillsDir}）。`))
    return
  }
  console.log(
    bold(green(`\nstk uninstall 完成：删除 ${removed} 个 SKILL 目录`)) +
      (missing > 0 ? yellow(`（${missing} 个本就不存在）`) : ''),
  )
}
