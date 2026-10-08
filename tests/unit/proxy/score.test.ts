import { describe, it, expect } from 'vitest'
import { scoreReport, quickWins } from '@/proxy/score.js'
import type {
  DiagnosisReport,
  McpEntry,
  SkillEntry,
  AgentEntry,
  RuleEntry,
  PluginEntry,
  MemoryFileSummary,
  UsageStats,
} from '@/types/index.js'

/** Minimal base report with all optional fields absent. */
function baseReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return {
    scanTimestamp: '2026-01-01T00:00:00Z',
    agentName: 'codebuddy',
    agentVersion: '1.0.0',
    contextOverview: { totalEstimatedTokens: 0, breakdown: [] },
    mcpList: [],
    skillList: [],
    agentList: [],
    builtinTools: [],
    ...overrides,
  }
}

function mcp(overrides: Partial<McpEntry> = {}): McpEntry {
  return {
    name: 'github',
    status: 'enabled',
    toolsCount: 10,
    estimatedTokens: 0,
    ...overrides,
  }
}

function skill(overrides: Partial<SkillEntry> = {}): SkillEntry {
  return { name: 'commit', estimatedTokens: 0, ...overrides }
}

describe('scoreReport — direct MCP loading', () => {
  it('deducts for direct-loaded MCP at/above 4000 tokens, capped at 15', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 5000, loadingMode: 'direct' })],
    })
    const score = scoreReport(report)
    expect(score.score).toBe(100 - 5)
    expect(score.deductions).toHaveLength(1)
    expect(score.deductions[0].item).toBe('MCP github')
    expect(score.deductions[0].points).toBe(5)
  })

  it('caps a single direct MCP deduction at 15 points', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 30_000, loadingMode: 'direct' })],
    })
    const score = scoreReport(report)
    expect(score.deductions[0].points).toBe(15)
  })

  it('does not deduct for deferred-loaded MCP regardless of size', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 30_000, loadingMode: 'deferred' })],
    })
    const score = scoreReport(report)
    expect(score.deductions).toHaveLength(0)
    expect(score.score).toBe(100)
  })

  it('does not deduct for direct MCP below the 4000 threshold', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 3999, loadingMode: 'direct' })],
    })
    const score = scoreReport(report)
    expect(score.deductions).toHaveLength(0)
  })
})

describe('scoreReport — memory files and always-loaded rules', () => {
  it('deducts 3 for a high-impact existing memory file', () => {
    const file: MemoryFileSummary = {
      path: '/tmp/CODEBUDDY.md',
      exists: true,
      sizeBytes: 500,
      lineCount: 20,
      estimatedTokens: 125,
      impactLevel: 'high',
    }
    const report = baseReport({ memoryFiles: [file] })
    const score = scoreReport(report)
    expect(score.deductions).toHaveLength(1)
    expect(score.deductions[0].points).toBe(3)
    expect(score.deductions[0].item).toBe('记忆文件 /tmp/CODEBUDDY.md')
  })

  it('ignores non-existing or non-high memory files', () => {
    const report = baseReport({
      memoryFiles: [
        {
          path: '/a',
          exists: false,
          sizeBytes: 0,
          lineCount: 0,
          estimatedTokens: 0,
          impactLevel: 'high',
        },
        {
          path: '/b',
          exists: true,
          sizeBytes: 10,
          lineCount: 1,
          estimatedTokens: 3,
          impactLevel: 'low',
        },
        {
          path: '/c',
          exists: true,
          sizeBytes: 10,
          lineCount: 1,
          estimatedTokens: 3,
          impactLevel: 'medium',
        },
      ],
    })
    expect(scoreReport(report).deductions).toHaveLength(0)
  })

  it('deducts 3 for always-loaded rules >= 1000 tokens', () => {
    const rule: RuleEntry = {
      name: 'heavy-rule',
      path: '/r.md',
      alwaysLoaded: true,
      fileSizeBytes: 4000,
      estimatedTokens: 1000,
    }
    const report = baseReport({ ruleList: [rule] })
    const score = scoreReport(report)
    expect(score.deductions).toHaveLength(1)
    expect(score.deductions[0].points).toBe(3)
    expect(score.deductions[0].item).toBe('规则 heavy-rule')
  })

  it('ignores always-loaded rules below threshold or non-always-loaded', () => {
    const report = baseReport({
      ruleList: [
        { name: 'small', path: '/a', alwaysLoaded: true, fileSizeBytes: 100, estimatedTokens: 999 },
        {
          name: 'scoped',
          path: '/b',
          alwaysLoaded: false,
          fileSizeBytes: 99999,
          estimatedTokens: 99999,
        },
      ],
    })
    expect(scoreReport(report).deductions).toHaveLength(0)
  })
})

describe('scoreReport — duplicate skills and skill total', () => {
  it('deducts 2 per duplicate skill', () => {
    const report = baseReport({
      skillList: [
        skill({ name: 'commit', estimatedTokens: 100, duplicateSource: 'project' }),
        skill({ name: 'pdf', estimatedTokens: 100 }),
      ],
    })
    const score = scoreReport(report)
    expect(score.deductions).toHaveLength(1)
    expect(score.deductions[0].points).toBe(2)
    expect(score.deductions[0].item).toBe('Skill commit')
  })

  it('deducts for total skill weight above 8000, capped at 10', () => {
    const report = baseReport({
      skillList: [
        skill({ name: 'a', estimatedTokens: 5000 }),
        skill({ name: 'b', estimatedTokens: 5000 }),
      ],
    })
    const score = scoreReport(report)
    const totalDeduction = score.deductions.find((d) => d.item === 'Skill 总量')
    expect(totalDeduction).toBeDefined()
    // (10000 - 8000) / 2000 = 1 → capped to 1 (below the 10 cap)
    expect(totalDeduction!.points).toBe(1)
  })

  it('caps the skill-total deduction at 10 points', () => {
    const report = baseReport({
      skillList: [skill({ name: 'big', estimatedTokens: 60_000 })],
    })
    const score = scoreReport(report)
    const totalDeduction = score.deductions.find((d) => d.item === 'Skill 总量')
    expect(totalDeduction!.points).toBe(10)
  })
})

describe('scoreReport — usage-derived idle deductions', () => {
  function usage(overrides: Partial<UsageStats> = {}): UsageStats {
    return {
      scannedAt: '2026-01-01T00:00:00Z',
      sessionsDir: '/sessions',
      filesScanned: 5,
      parseErrors: 0,
      missingTimestamp: 0,
      toolUsage: {
        all: { total: 0, ranking: [] },
        last90Days: { total: 0, ranking: [] },
        last30Days: { total: 0, ranking: [] },
      },
      skillUsage: {
        all: { total: 0, ranking: [] },
        last90Days: { total: 0, ranking: [] },
        last30Days: { total: 0, ranking: [] },
      },
      subagentUsage: {
        all: { total: 0, ranking: [] },
        last90Days: { total: 0, ranking: [] },
        last30Days: { total: 0, ranking: [] },
      },
      mcpServerUsage: {
        all: { total: 0, ranking: [] },
        last90Days: { total: 0, ranking: [] },
        last30Days: { total: 0, ranking: [] },
      },
      mcpToolUsage: {
        all: { total: 0, ranking: [] },
        last90Days: { total: 0, ranking: [] },
        last30Days: { total: 0, ranking: [] },
      },
      ...overrides,
    }
  }

  it('deducts for MCP with zero 30-day calls when usage exists', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 5000, loadingMode: 'deferred' })],
      usageStats: usage(),
    })
    const score = scoreReport(report)
    const d = score.deductions.find((x) => x.item === 'MCP github')
    expect(d).toBeDefined()
    // idlePoints(5000) = min(8, max(1, ceil(5000/2000))) = 3
    expect(d!.points).toBe(3)
  })

  it('does not deduct idle MCP when it was called in the last 30 days', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 5000, loadingMode: 'deferred' })],
      usageStats: usage({
        mcpServerUsage: {
          all: { total: 1, ranking: [{ name: 'github', count: 1 }] },
          last90Days: { total: 1, ranking: [{ name: 'github', count: 1 }] },
          last30Days: { total: 1, ranking: [{ name: 'github', count: 1 }] },
        },
      }),
    })
    const score = scoreReport(report)
    expect(score.deductions.find((x) => x.item === 'MCP github')).toBeUndefined()
  })

  it('deducts for idle skills >= 500 tokens only', () => {
    const report = baseReport({
      skillList: [
        skill({ name: 'heavy', estimatedTokens: 500 }),
        skill({ name: 'tiny', estimatedTokens: 499 }),
      ],
      usageStats: usage(),
    })
    const score = scoreReport(report)
    expect(score.deductions.find((x) => x.item === 'Skill heavy')).toBeDefined()
    expect(score.deductions.find((x) => x.item === 'Skill tiny')).toBeUndefined()
  })

  it('deducts for non-bundled subagents with zero 30-day calls', () => {
    const agent: AgentEntry = { name: 'custom-agent', estimatedTokens: 4000, source: 'project' }
    const report = baseReport({
      agentList: [agent],
      usageStats: usage(),
    })
    const score = scoreReport(report)
    expect(score.deductions.find((x) => x.item === 'SubAgent custom-agent')).toBeDefined()
  })

  it('skips bundled subagents regardless of usage', () => {
    const agent: AgentEntry = { name: 'Explore', estimatedTokens: 4000, source: 'bundled' }
    const report = baseReport({
      agentList: [agent],
      usageStats: usage(),
    })
    expect(scoreReport(report).deductions).toHaveLength(0)
  })

  it('guard: no idle deductions when usageStats is missing', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 5000 })],
      skillList: [skill({ name: 'heavy', estimatedTokens: 500 })],
      agentList: [{ name: 'a', estimatedTokens: 4000, source: 'project' }],
    })
    const score = scoreReport(report)
    expect(score.deductions.filter((d) => d.detail.includes('30 天'))).toHaveLength(0)
  })

  it('guard: no idle deductions when filesScanned is 0', () => {
    const report = baseReport({
      mcpList: [mcp({ estimatedTokens: 5000 })],
      skillList: [skill({ name: 'heavy', estimatedTokens: 500 })],
      agentList: [{ name: 'a', estimatedTokens: 4000, source: 'project' }],
      usageStats: usage({ filesScanned: 0 }),
    })
    const score = scoreReport(report)
    expect(score.deductions.filter((d) => d.detail.includes('30 天'))).toHaveLength(0)
  })
})

describe('scoreReport — low-frequency plugins', () => {
  it('deducts 1 per enabled low-frequency plugin, capped at 5 total', () => {
    const plugins: PluginEntry[] = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      pluginId: `p${i}`,
      marketplace: 'official',
      enabled: true,
      installedPath: null,
      isLowFrequency: true,
    }))
    const report = baseReport({ pluginList: plugins })
    const score = scoreReport(report)
    const pluginDeductions = score.deductions.filter((d) => d.item.startsWith('插件 '))
    expect(pluginDeductions).toHaveLength(5)
    expect(pluginDeductions.reduce((s, d) => s + d.points, 0)).toBe(5)
  })

  it('ignores disabled or non-low-frequency plugins', () => {
    const report = baseReport({
      pluginList: [
        {
          id: 'a',
          pluginId: 'a',
          marketplace: 'x',
          enabled: true,
          installedPath: null,
          isLowFrequency: false,
        },
        {
          id: 'b',
          pluginId: 'b',
          marketplace: 'x',
          enabled: false,
          installedPath: null,
          isLowFrequency: true,
        },
      ],
    })
    expect(scoreReport(report).deductions).toHaveLength(0)
  })
})

describe('scoreReport — total bounds', () => {
  it('never drops the score below 0', () => {
    const report = baseReport({
      mcpList: Array.from({ length: 20 }, (_, i) =>
        mcp({ name: `mcp${i}`, estimatedTokens: 30_000, loadingMode: 'direct' }),
      ),
    })
    expect(scoreReport(report).score).toBe(0)
  })

  it('returns 100 for an empty report', () => {
    expect(scoreReport(baseReport()).score).toBe(100)
  })
})

describe('quickWins', () => {
  it('returns top-5 deductions sorted by points descending', () => {
    const score = {
      score: 50,
      deductions: [
        { item: 'a', detail: '', points: 1, action: '' },
        { item: 'b', detail: '', points: 10, action: '' },
        { item: 'c', detail: '', points: 5, action: '' },
        { item: 'd', detail: '', points: 15, action: '' },
        { item: 'e', detail: '', points: 3, action: '' },
        { item: 'f', detail: '', points: 7, action: '' },
      ],
    }
    const wins = quickWins(score)
    expect(wins).toHaveLength(5)
    expect(wins.map((w) => w.points)).toEqual([15, 10, 7, 5, 3])
  })

  it('returns fewer items when there are not enough deductions', () => {
    const score = {
      score: 97,
      deductions: [{ item: 'a', detail: '', points: 3, action: '' }],
    }
    expect(quickWins(score)).toHaveLength(1)
  })
})
