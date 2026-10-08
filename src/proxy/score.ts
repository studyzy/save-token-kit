import type { DiagnosisReport, ReportScore, ScoreDeduction } from '../types/index.js'

/**
 * Mechanical 0-100 score derived from a DiagnosisReport (100 = no detected
 * waste). Every deduction is computed from report fields only — no LLM, no
 * guessing — following the project's "可机械判定、不夸大" philosophy:
 * deductions state the measured numbers, and unknown values cost 0.
 */

/** Direct-loading MCP servers above this many tokens start costing points. */
const DIRECT_MCP_TOKEN_THRESHOLD = 4000
/** Always-loaded rule files above this many tokens start costing points. */
const RULE_TOKEN_THRESHOLD = 1000
/** Total skill-list weight above this many tokens starts costing points. */
const SKILL_TOTAL_TOKEN_THRESHOLD = 8000
/** Skills below this weight are never flagged as idle (noise guard). */
const IDLE_SKILL_TOKEN_THRESHOLD = 500

export function scoreReport(report: DiagnosisReport): ReportScore {
  const deductions: ScoreDeduction[] = []

  // 1. Direct-loading MCP servers with heavyweight tool definitions.
  for (const mcp of report.mcpList) {
    if (mcp.loadingMode === 'deferred') continue
    if (mcp.estimatedTokens < DIRECT_MCP_TOKEN_THRESHOLD) continue
    deductions.push({
      item: `MCP ${mcp.name}`,
      detail: `直接加载 ${mcp.toolsCount} 个工具定义，估算 ~${mcp.estimatedTokens} tok 常驻上下文`,
      points: Math.min(15, Math.ceil(mcp.estimatedTokens / 1000)),
      action: `在 .mcp.json 中为 ${mcp.name} 设置 "defer_loading": true`,
    })
  }

  // 2. High-impact memory files and heavyweight always-loaded rules.
  for (const f of report.memoryFiles ?? []) {
    if (f.exists && f.impactLevel === 'high') {
      deductions.push({
        item: `记忆文件 ${f.path}`,
        detail: `${f.sizeBytes}B / ${f.lineCount} 行，估算 ~${f.estimatedTokens} tok 每轮会话全量注入`,
        points: 3,
        action: `精简 ${f.path}：低频内容拆分为按需读取的规则/文档`,
      })
    }
  }
  for (const r of report.ruleList ?? []) {
    if (r.alwaysLoaded && r.estimatedTokens >= RULE_TOKEN_THRESHOLD) {
      deductions.push({
        item: `规则 ${r.name}`,
        detail: `常驻加载，估算 ~${r.estimatedTokens} tok`,
        points: 3,
        action: `为 ${r.name} 添加 paths: frontmatter 限定生效范围，或精简内容`,
      })
    }
  }

  // 3. Duplicate skills (same name from multiple sources).
  for (const s of report.skillList) {
    if (s.duplicateSource) {
      deductions.push({
        item: `Skill ${s.name}`,
        detail: `与来源 "${s.duplicateSource}" 重复定义`,
        points: 2,
        action: `移除 ${s.name} 的重复副本（保留一处）`,
      })
    }
  }

  // 4. Overall skill-list weight.
  const skillTokens = report.skillList.reduce((sum, s) => sum + s.estimatedTokens, 0)
  if (skillTokens > SKILL_TOTAL_TOKEN_THRESHOLD) {
    deductions.push({
      item: 'Skill 总量',
      detail: `${report.skillList.length} 个 Skill 合计 ~${skillTokens} tok`,
      points: Math.min(10, Math.ceil((skillTokens - SKILL_TOTAL_TOKEN_THRESHOLD) / 2000)),
      action: '清理长期不用的 Skill（可参考 stk usage 的 30 天调用排名）',
    })
  }

  // 5. Usage-derived idle objects. Guard: a missing usage scan or zero scanned
  // files must never count as "unused" evidence.
  const usage = report.usageStats
  if (usage && usage.filesScanned > 0) {
    const last30Names = (bucket: typeof usage.mcpServerUsage): Set<string> =>
      new Set(bucket.last30Days.ranking.map((r) => r.name))
    const idlePoints = (tokens: number): number =>
      Math.min(8, Math.max(1, Math.ceil(tokens / 2000)))

    const last30Mcp = last30Names(usage.mcpServerUsage)
    for (const mcp of report.mcpList) {
      if (!last30Mcp.has(mcp.name)) {
        deductions.push({
          item: `MCP ${mcp.name}`,
          detail: `最近 30 天 0 次调用（扫描 ${usage.filesScanned} 个会话文件）`,
          points: idlePoints(mcp.estimatedTokens),
          action: `评估禁用或 defer_loading ${mcp.name}`,
        })
      }
    }
    const last30Skill = last30Names(usage.skillUsage)
    for (const s of report.skillList) {
      if (s.estimatedTokens >= IDLE_SKILL_TOKEN_THRESHOLD && !last30Skill.has(s.name)) {
        deductions.push({
          item: `Skill ${s.name}`,
          detail: `最近 30 天 0 次调用`,
          points: idlePoints(s.estimatedTokens),
          action: `移除或禁用 Skill ${s.name}`,
        })
      }
    }
    const last30Agent = last30Names(usage.subagentUsage)
    for (const a of report.agentList) {
      // Built-in agents (no disk definition) are not user-removable.
      if (a.source && a.source !== 'bundled' && !last30Agent.has(a.name)) {
        deductions.push({
          item: `SubAgent ${a.name}`,
          detail: `最近 30 天 0 次调用`,
          points: idlePoints(a.estimatedTokens),
          action: `移除磁盘上定义的 SubAgent ${a.name}`,
        })
      }
    }
  }

  // 6. Enabled plugins on the low-frequency list.
  let idlePluginPoints = 0
  for (const p of report.pluginList ?? []) {
    if (p.enabled && p.isLowFrequency && idlePluginPoints < 5) {
      idlePluginPoints += 1
      deductions.push({
        item: `插件 ${p.pluginId}@${p.marketplace}`,
        detail: '低频插件名单中且当前启用',
        points: 1,
        action: `禁用低频插件 ${p.pluginId}`,
      })
    }
  }

  const total = Math.min(100, deductions.reduce((sum, d) => sum + d.points, 0))
  return { score: Math.max(0, 100 - total), deductions }
}

/** Top-N deductions by points — the Quick Wins list. */
export function quickWins(score: ReportScore, top = 5): ScoreDeduction[] {
  return [...score.deductions].sort((a, b) => b.points - a.points).slice(0, top)
}
