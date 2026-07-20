import { parseRequestBody } from './parser.js'
import type {
  DiagnosisReport,
  ContextItem,
  ToolDef,
  ToolDetection,
} from '../types/index.js'
import type { FsCollectResult } from '../collectors/fs-collector.js'

/**
 * Build the structured DiagnosisReport from captured raw request bodies.
 * Uses the main chat body (first one) and enriches with filesystem scan data.
 */
export function buildDiagnosisReport(
  rawBodies: unknown[],
  fs?: FsCollectResult,
  toolDetection?: ToolDetection[],
  codebuddyVersion?: string | null,
): DiagnosisReport {
  if (rawBodies.length === 0 && !fs) {
    return emptyReport()
  }

  const parsed = rawBodies.length > 0 ? parseRequestBody(rawBodies[0]) : null

  // Categorize token usage into context overview breakdown.
  const categories: ContextItem[] = []

  const systemPromptTokens = Math.max(0, parsed.messages.roleTokens['system'] ?? 0)
  categories.push(makeItem('system-prompt', 'system messages', systemPromptTokens))

  if (parsed.rulesTokens > 0) {
    categories.push(makeItem('rules', 'CODEBUDDY.md rules', parsed.rulesTokens))
  }

  if (parsed.memoryTokens > 0) {
    categories.push(makeItem('memory-file', 'memory system', parsed.memoryTokens))
  }

  const messagesTokens = Object.entries(parsed.messages.roleTokens)
    .filter(([role]) => role !== 'system')
    .reduce((sum, [, t]) => sum + t, 0)
  categories.push(makeItem('messages', 'user messages', messagesTokens))

  const builtinTokens = parsed.tools.builtin.reduce((s, t) => s + t.estimatedTokens, 0)
  const builtinCount = parsed.tools.builtin.length
  const mcpToolCount = parsed.tools.mcp.length
  const deferredCount = parsed.tools.deferred.length
  categories.push(
    makeItem(
      'system-tools',
      `Tool definitions (${builtinCount}内置 + ${mcpToolCount}MCP + ${deferredCount}延迟)`,
      builtinTokens,
    ),
  )

  const skillsTokens = parsed.skills.reduce((s, t) => s + t.estimatedTokens, 0)
  if (skillsTokens > 0) {
    categories.push(makeItem('skill', 'Skills', skillsTokens))
  }

  const total = categories.reduce((s, c) => s + c.estimatedTokens, 0) || 1
  for (const c of categories) {
    c.percentage = Math.round((c.estimatedTokens / total) * 1000) / 10
  }

  const allTools: ToolDef[] = [
    ...parsed.tools.builtin.map((t) => ({ ...t, category: 'builtin' as const })),
    ...parsed.tools.mcp.map((t) => ({ ...t, category: 'mcp' as const })),
    ...parsed.tools.deferred.map((t) => ({ ...t, category: 'deferred' as const })),
  ]

  // Build skill list directly from parsed (already SkillEntry[])
  const skillList = parsed.skills

  // MCP list: already built in parser (McpEntry[] with tools included).
  // Fix toolsCount and estimatedTokens from actual tool data.
  const mcpList = parsed.mcpServers.map((mcp) => {
    const toolNames = mcp.tools ?? []
    // tokens from tool definitions matching this server prefix
    const serverPrefix = `mcp__${mcp.name}`
    const defTokens = allTools
      .filter((t) => t.name.startsWith(serverPrefix))
      .reduce((s, t) => s + t.estimatedTokens, 0)
    // If no direct tool definitions, estimate from tool names (deferred loading)
    const estTokens = defTokens || toolNames.reduce((s, n) => s + Math.ceil(n.length / 4), 0)
    return {
      ...mcp,
      toolsCount: toolNames.length,
      estimatedTokens: estTokens || mcp.estimatedTokens,
    }
  })

  return {
    scanTimestamp: new Date().toISOString(),
    codebuddyVersion: codebuddyVersion ?? process.env.CODEBUDDY_VERSION ?? 'unknown',
    contextOverview: { totalEstimatedTokens: total, breakdown: categories },
    mcpList,
    skillList,
    commandList: fs?.commandList ?? [],
    agentList: parsed.agents,
    builtinTools: allTools,
    pluginList: fs?.pluginList ?? [],
    hookList: fs?.hookList ?? [],
    ruleList: fs?.ruleList ?? [],
    configFiles: fs?.configFiles ?? [],
    toolDetection: (toolDetection ?? []).filter((t) => t.installed),
    headlessAvailable: false,
    dataSource: 'proxy',
    proxyDetails: {
      model: parsed.model,
      messageBreakdown: parsed.messages.breakdown,
    },
  }
}

function makeItem(type: ContextItem['type'], name: string, tokens: number): ContextItem {
  return { type, name, estimatedTokens: tokens, percentage: 0 }
}

function emptyReport(): DiagnosisReport {
  return {
    scanTimestamp: new Date().toISOString(),
    codebuddyVersion: 'unknown',
    contextOverview: { totalEstimatedTokens: 0, breakdown: [] },
    mcpList: [],
    skillList: [],
    commandList: [],
    agentList: [],
    builtinTools: [],
  }
}

/** Render a DiagnosisReport as terminal-friendly output matching save-token style. */
export function renderMarkdown(
  report: DiagnosisReport,
): string {
  const lines: string[] = []
  lines.push('CodeBuddy Token 诊断报告')
  lines.push('='.repeat(50))
  lines.push(`扫描时间: ${report.scanTimestamp}`)
  lines.push(`CodeBuddy 版本: ${report.codebuddyVersion}`)
  lines.push(`数据来源: Proxy 拦截 (最精确)`)
  if (report.proxyDetails?.model) lines.push(`模型: ${report.proxyDetails.model}`)
  lines.push('')
  lines.push('上下文总览（估算）')
  lines.push('-'.repeat(40))
  lines.push(`总估算 Token: ${report.contextOverview.totalEstimatedTokens}`)
  lines.push('')
  lines.push('按占用降序:')
  const sorted = [...report.contextOverview.breakdown].sort(
    (a, b) => b.estimatedTokens - a.estimatedTokens,
  )
  for (const item of sorted) {
    const pct = report.contextOverview.totalEstimatedTokens
      ? ((item.estimatedTokens / report.contextOverview.totalEstimatedTokens) * 100).toFixed(1)
      : '0'
    lines.push(`  ${item.name.padEnd(30)} ${String(item.estimatedTokens).padStart(8)}  (${pct}%)`)
  }
  lines.push('')

  // Tool definitions breakdown
  const toolDefs = report.builtinTools
  if (toolDefs && toolDefs.length > 0) {
    lines.push(`工具定义分解 (${toolDefs.length} 个工具)`)
    lines.push('-'.repeat(40))
    const categories: Record<string, typeof toolDefs> = {}
    for (const t of toolDefs) {
      (categories[t.category] ??= []).push(t)
    }
    const catOrder = ['builtin', 'mcp', 'deferred']
    for (const cat of catOrder) {
      const items = categories[cat]
      if (!items || items.length === 0) continue
      const catLabel = cat === 'builtin' ? '内置工具' : cat === 'mcp' ? 'MCP 工具' : '延迟加载工具'
      const catTokens = items.reduce((s, t) => s + t.estimatedTokens, 0)
      lines.push(`  [${catLabel}] ${items.length} 个, ~${catTokens} tok`)
      for (const t of items) {
        lines.push(`    ${t.name.padEnd(22)} ~${String(t.estimatedTokens).padStart(6)} tok`)
      }
      lines.push('')
    }
  }

  lines.push(`MCP 工具 (${report.mcpList.length} 个)`)
  lines.push('-'.repeat(40))
  if (report.mcpList.length === 0) {
    lines.push('  (无)')
  } else {
    for (const mcp of report.mcpList) {
      const mode = mcp.loadingMode === 'deferred' ? ' [延迟加载]' : ''
      lines.push(
        `  ${mcp.name.padEnd(15)} [enabled${mode}] ${mcp.toolsCount} 个工具 ~${mcp.estimatedTokens} tok`,
      )
    }
  }
  lines.push('')

  lines.push(`Skills (${report.skillList.length} 个)`)
  lines.push('-'.repeat(40))
  if (report.skillList.length === 0) {
    lines.push('  (无)')
  } else {
    for (const skill of report.skillList) {
      lines.push(
        `  [${skill.source ?? 'skill'}] ${skill.name.padEnd(20)} ~${skill.estimatedTokens} tok`,
      )
      if (skill.sourcePath) {
        lines.push(`      ↳ ${skill.sourcePath}`)
      }
      if (skill.description) {
        lines.push(`      ${skill.description}`)
      }
    }
  }
  lines.push('')

  // --- Slash commands ---
  const commands = report.commandList ?? []
  lines.push(`命令 (${commands.length} 个)`)
  lines.push('-'.repeat(40))
  if (commands.length === 0) {
    lines.push('  (无)')
  } else {
    for (const cmd of commands) {
      lines.push(
        `  [${cmd.source ?? 'command'}] ${cmd.name.padEnd(20)} ~${cmd.estimatedTokens} tok`,
      )
      if (cmd.sourcePath) {
        lines.push(`      ↳ ${cmd.sourcePath}`)
      }
      if (cmd.description) {
        lines.push(`      ${cmd.description}`)
      }
    }
  }
  lines.push('')

  // --- Agents (subagents) ---
  const agents = report.agentList ?? []
  lines.push(`Agents (${agents.length} 个)`)
  lines.push('-'.repeat(40))
  if (agents.length === 0) {
    lines.push('  (无)')
  } else {
    for (const a of agents) {
      const src = a.source ?? 'bundled'
      lines.push(`  [${src}] ${a.name.padEnd(22)} ~${a.estimatedTokens} tok`)
      if (a.description) {
        lines.push(`      ${a.description}`)
      }
      if (a.tools && a.tools.length > 0) {
        lines.push(`      Tools: ${a.tools.join(', ')}`)
      }
    }
  }
  lines.push('')

  // --- Plugins ---
  const plugins = report.pluginList ?? []
  lines.push(`插件 (${plugins.filter((p) => p.enabled).length} 个启用)`)
  lines.push('-'.repeat(40))
  if (plugins.length === 0) {
    lines.push('  (无)')
  } else {
    for (const p of plugins) {
      const mark = p.enabled ? '✓' : '✗'
      lines.push(`  ${mark} ${p.pluginId}@${p.marketplace}`)
    }
  }
  lines.push('')

  // --- Hooks ---
  const hooks = report.hookList ?? []
  lines.push(`Hooks (${hooks.length} 个)`)
  lines.push('-'.repeat(40))
  if (hooks.length === 0) {
    lines.push('  (无)')
  } else {
    for (const h of hooks) {
      lines.push(`  ${h.event} [${h.matcher}] → ${h.command}`)
    }
  }
  lines.push('')

  // --- Rules ---
  const rules = report.ruleList ?? []
  lines.push(`Rules (${rules.length} 个)`)
  lines.push('-'.repeat(40))
  if (rules.length === 0) {
    lines.push('  (无)')
  } else {
    for (const r of rules) {
      const tag = r.alwaysLoaded ? ' [常驻]' : ''
      lines.push(`  ${r.name}${tag} ~${r.estimatedTokens}tok`)
    }
  }
  lines.push('')

  // --- Config files ---
  const configs = (report.configFiles ?? []).filter((c) => c.exists)
  lines.push('配置文件')
  lines.push('-'.repeat(40))
  if (configs.length === 0) {
    lines.push('  (无)')
  } else {
    for (const c of configs) {
      lines.push(
        `  ${c.path}  ${c.sizeBytes}B ${c.lineCount}行 ~${c.estimatedTokens}tok [${c.impactLevel === 'high' ? '高' : c.impactLevel === 'medium' ? '中' : '低'}]`,
      )
    }
  }
  lines.push('')

  // --- Third-party tool detection ---
  const tools = report.toolDetection ?? []
  lines.push('第三方工具检测')
  lines.push('-'.repeat(40))
  if (tools.length === 0) {
    lines.push('  (无)')
  } else {
    for (const t of tools) {
      const mark = t.installed ? '✓' : '✗'
      const status = t.enabled ? '已启用' : t.installed ? '未启用' : '未安装'
      const saving = t.recommendedSaving ? `  (${t.recommendedSaving})` : ''
      lines.push(`  ${mark} ${t.name.padEnd(10)} ${status}${saving}`)
    }
  }
  lines.push('')

  return lines.join('\n')
}
