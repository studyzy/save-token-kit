import { parseRequestBody, aggregateCaptures } from './parser.js'
import type { DiagnosisReport, ContextItem, ToolBreakdown } from '../types/index.js'

/**
 * Build the structured DiagnosisReport from captured raw request bodies.
 * Aggregates multiple captures and categorizes token usage.
 */
export function buildDiagnosisReport(rawBodies: unknown[]): DiagnosisReport {
  const fragments = rawBodies.map((b) => parseRequestBody(b))
  const agg = aggregateCaptures(fragments)

  // Categorize token usage into context overview breakdown.
  const categories: ContextItem[] = []

  const systemPromptTokens = Math.max(0, (agg.messages.roleTokens['system'] ?? 0))
  categories.push(makeItem('system-prompt', 'System Prompt', systemPromptTokens))

  const messagesTokens = Object.entries(agg.messages.roleTokens)
    .filter(([role]) => role !== 'system')
    .reduce((sum, [, t]) => sum + t, 0)
  categories.push(makeItem('messages', 'Messages', messagesTokens))

  const builtinTokens = agg.tools.builtin.reduce((s, t) => s + t.estimatedTokens, 0)
  categories.push(makeItem('system-tools', 'Built-in Tools', builtinTokens))

  const mcpTokens = agg.tools.mcp.reduce((s, t) => s + t.estimatedTokens, 0)
  const mcpToolCount = agg.tools.mcp.length
  categories.push(makeItem('mcp-tools', 'MCP Tools', mcpTokens))

  const skillsTokens = agg.skills.reduce((s, t) => s + t.estimatedTokens, 0)
  categories.push(makeItem('skill', 'Skills', skillsTokens))

  const total = categories.reduce((s, c) => s + c.estimatedTokens, 0) || 1
  for (const c of categories) {
    c.percentage = Math.round((c.estimatedTokens / total) * 1000) / 10
  }

  const toolBreakdown: ToolBreakdown = {
    builtin: { count: agg.tools.builtin.length, estimatedTokens: builtinTokens, names: agg.tools.builtin.map((t) => t.name) },
    mcp: { count: agg.tools.mcp.length, estimatedTokens: mcpTokens, names: agg.tools.mcp.map((t) => t.name) },
    deferred: { count: agg.tools.deferred.length, estimatedTokens: agg.tools.deferred.reduce((s, t) => s + t.estimatedTokens, 0), names: agg.tools.deferred.map((t) => t.name) },
  }

  const warnings: string[] = []
  if (mcpToolCount > 30) {
    warnings.push(`检测到 ${mcpToolCount} 个 MCP 工具定义，考虑延迟加载或精简。`)
  }
  if (skillsTokens > 500) {
    warnings.push('Skills 占用较高，存在可禁用的低频 Skill。')
  }

  return {
    scanTimestamp: new Date().toISOString(),
    codebuddyVersion: process.env.CODEBUDDY_VERSION ?? 'unknown',
    contextOverview: { totalEstimatedTokens: total, breakdown: categories },
    mcpList: agg.mcpServers.map((s) => ({
      name: s.serverName,
      status: 'enabled',
      toolsCount: s.toolCount,
      estimatedTokens: s.estimatedTokens,
    })),
    skillList: agg.skills.map((s) => ({ name: s.name, source: s.source, estimatedTokens: s.estimatedTokens })),
    toolBreakdown,
    warnings,
  }
}

function makeItem(type: ContextItem['type'], name: string, tokens: number): ContextItem {
  return { type, name, estimatedTokens: tokens, percentage: 0 }
}

/** Render a DiagnosisReport as a Markdown summary for console output. */
export function renderMarkdown(report: DiagnosisReport): string {
  const lines: string[] = []
  lines.push('# Token 诊断报告')
  lines.push('')
  lines.push(`- 扫描时间: ${report.scanTimestamp}`)
  lines.push(`- CodeBuddy 版本: ${report.codebuddyVersion}`)
  lines.push(`- **估算总 Token: ${report.contextOverview.totalEstimatedTokens}**`)
  lines.push('')
  lines.push('## Token 占用分布')
  lines.push('')
  lines.push('| 分类 | 名称 | Token | 占比 |')
  lines.push('| --- | --- | --- | --- |')
  for (const c of report.contextOverview.breakdown) {
    lines.push(`| ${c.type} | ${c.name} | ${c.estimatedTokens} | ${c.percentage}% |`)
  }
  lines.push('')
  if (report.mcpList.length) {
    lines.push('## MCP 服务器')
    lines.push('')
    lines.push('| 名称 | 状态 | 工具数 | Token |')
    lines.push('| --- | --- | --- | --- |')
    for (const m of report.mcpList) {
      lines.push(`| ${m.name} | ${m.status} | ${m.toolsCount} | ${m.estimatedTokens} |`)
    }
    lines.push('')
  }
  if (report.skillList.length) {
    lines.push('## Skills')
    lines.push('')
    lines.push('| 名称 | Token |')
    lines.push('| --- | --- |')
    for (const s of report.skillList) {
      lines.push(`| ${s.name} | ${s.estimatedTokens} |`)
    }
    lines.push('')
  }
  if (report.warnings.length) {
    lines.push('## ⚠️ 警告')
    lines.push('')
    for (const w of report.warnings) lines.push(`- ${w}`)
    lines.push('')
  }
  return lines.join('\n')
}
