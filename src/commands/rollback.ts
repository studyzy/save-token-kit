import { existsSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { bold, green, red, yellow } from 'ansis'

/**
 * `stk rollback` (reserved): restore previously backed-up configuration files.
 * Backups are expected under ~/.codebuddy/save-token-kit-backup/.
 *
 * NOTE: This version does not perform automatic backups during optimization,
 * so rollback is a no-op placeholder that explains the limitation.
 */
export async function runRollback(): Promise<void> {
  const backupDir = join(homedir(), '.codebuddy', 'save-token-kit-backup')
  if (!existsSync(backupDir)) {
    console.error(yellow('未找到任何备份（本期优化操作不自动备份）。'))
    console.error(yellow('如需撤销，请手动从优化前的备份或版本控制恢复配置文件。'))
    process.exitCode = 1
    return
  }
  const files = readdirSync(backupDir, { recursive: true }) as string[]
  if (files.length === 0) {
    console.error(red('备份目录为空，无可恢复内容。'))
    process.exitCode = 1
    return
  }
  for (const f of files) {
    const src = join(backupDir, f)
    const dest = join(process.cwd(), f)
    mkdirSync(join(dest, '..'), { recursive: true })
    copyFileSync(src, dest)
  }
  console.log(bold(green(`已从备份恢复 ${files.length} 个文件。`)))
}
