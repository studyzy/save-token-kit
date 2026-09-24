/**
 * Implement `stk usage`: scan the CodeBuddy session history directory, rank
 * Tool / Skill / SubAgent / MCP invocation counts per time bucket, and write
 * `save-token/usage-report.json`. Pure local-disk analysis — no network, no
 * agent invocation, no session message content.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bold, green, red } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'
import { collectUsageStats } from '../collectors/usage-collector.js'
import { SAVE_TOKEN_DIR, type UsageDimension, type UsageStats, type UsageTimeBucket } from '../types/index.js'

export interface UsageOptions {
  /** Print the full JSON report to stdout instead of the human-readable summary */
  json?: boolean
}

const TOP_N = 10

export async function runUsage(options: UsageOptions = {}): Promise<void> {
  const sessionsDir = getAdapter('codebuddy')?.getConfigPaths().sessionsDir
  if (!sessionsDir) {
    console.error(red('当前平台无会话历史目录，无法统计使用情况。'))
    process.exitCode = 1
    return
  }

  const stats = await collectUsageStats({ sessionsDir })

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  printReport(stats)

  const outDir = join(process.cwd(), SAVE_TOKEN_DIR)
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'usage-report.json')
  writeFileSync(outPath, JSON.stringify(stats, null, 2))
  console.error(bold(green(`\n使用报告已写入 ${outPath}`)))
}

function printRanking(label: string, dim: UsageDimension, windowLabel: string): void {
  console.log(`\n=== ${label} — ${windowLabel} (总数 ${dim.total}) ===`)
  if (dim.ranking.length === 0) {
    console.log('  （无记录）')
    return
  }
  dim.ranking.slice(0, TOP_N).forEach((item, i) => {
    const pct = dim.total > 0 ? ((item.count / dim.total) * 100).toFixed(1) : '0.0'
    console.log(
      `${String(i + 1).padStart(3)}. ${item.name.padEnd(40)} ${String(item.count).padStart(7)}  (${pct}%)`,
    )
  })
  if (dim.ranking.length > TOP_N) {
    console.log(`  ... 共 ${dim.ranking.length} 项`)
  }
}

function printReport(stats: UsageStats): void {
  console.log(
    bold(`会话历史使用统计（${stats.sessionsDir}）`) +
      `\n扫描文件 ${stats.filesScanned} 个，解析失败行 ${stats.parseErrors}，无时间戳记录 ${stats.missingTimestamp}` +
      `\n统计截止: ${stats.scannedAt}` +
      `\n说明: filesScanned 为 0 时不能得出"未使用"结论（可能无历史文件）`,
  )
  const dimensions: Array<[string, UsageTimeBucket]> = [
    ['Tool 调用排名', stats.toolUsage],
    ['Skill 使用排名', stats.skillUsage],
    ['SubAgent 使用排名', stats.subagentUsage],
    ['MCP Server 调用排名', stats.mcpServerUsage],
    ['MCP 工具调用排名', stats.mcpToolUsage],
  ]
  for (const [label, bucket] of dimensions) {
    printRanking(label, bucket.all, '全部')
    printRanking(label, bucket.last30Days, '最近30天')
  }
}
