import { describe, it, expect } from 'vitest'
import { diffReports } from '@/proxy/diff.js'
import type { DiagnosisReport } from '@/types/index.js'

function report(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return {
    scanTimestamp: '2026-01-01T00:00:00Z',
    agentName: 'codebuddy',
    agentVersion: '1.0.0',
    contextOverview: { totalEstimatedTokens: 1000, breakdown: [] },
    mcpList: [],
    skillList: [],
    agentList: [],
    builtinTools: [],
    ...overrides,
  }
}

describe('diffReports — totals', () => {
  it('reports the total token change line', () => {
    const before = report({ contextOverview: { totalEstimatedTokens: 1000, breakdown: [] } })
    const after = report({ contextOverview: { totalEstimatedTokens: 800, breakdown: [] } })
    const diff = diffReports(before, after)
    expect(diff).toContain('上下文总量')
    expect(diff).toContain('优化前 ~1000 tok')
    expect(diff).toContain('优化后 ~800 tok')
    expect(diff).toContain('-200 tok')
  })
})

describe('diffReports — category/MCP/skill deltas', () => {
  it('reports category delta with added/removed', () => {
    const before = report({
      contextOverview: {
        totalEstimatedTokens: 1000,
        breakdown: [
          { type: 'messages', name: 'user messages', estimatedTokens: 500, percentage: 50 },
          { type: 'system-prompt', name: 'system messages', estimatedTokens: 500, percentage: 50 },
        ],
      },
    })
    const after = report({
      contextOverview: {
        totalEstimatedTokens: 1000,
        breakdown: [
          { type: 'messages', name: 'user messages', estimatedTokens: 400, percentage: 40 },
          { type: 'rules', name: 'CODEBUDDY.md rules', estimatedTokens: 600, percentage: 60 },
        ],
      },
    })
    const diff = diffReports(before, after)
    expect(diff).toContain('分类变化')
    // messages 变化
    expect(diff).toContain('messages:user messages')
    // system-prompt 移除
    expect(diff).toContain('system-prompt:system messages（移除）')
    // rules 新增
    expect(diff).toContain('rules:CODEBUDDY.md rules（新增）')
  })

  it('reports MCP delta and loadingMode note on change', () => {
    const before = report({
      mcpList: [
        {
          name: 'github',
          status: 'enabled',
          toolsCount: 5,
          estimatedTokens: 1000,
          loadingMode: 'direct',
        },
      ],
    })
    const after = report({
      mcpList: [
        {
          name: 'github',
          status: 'enabled',
          toolsCount: 5,
          estimatedTokens: 100,
          loadingMode: 'deferred',
        },
      ],
    })
    const diff = diffReports(before, after)
    expect(diff).toContain('MCP 变化')
    expect(diff).toContain('github')
    // loadingMode 变化 note: direct → deferred
    expect(diff).toContain('direct → deferred')
  })

  it('reports MCP added/removed', () => {
    const before = report({
      mcpList: [
        {
          name: 'old-mcp',
          status: 'enabled',
          toolsCount: 1,
          estimatedTokens: 100,
          loadingMode: 'direct',
        },
      ],
    })
    const after = report({
      mcpList: [
        {
          name: 'new-mcp',
          status: 'enabled',
          toolsCount: 1,
          estimatedTokens: 100,
          loadingMode: 'direct',
        },
      ],
    })
    const diff = diffReports(before, after)
    expect(diff).toContain('new-mcp（新增）')
    expect(diff).toContain('old-mcp（移除）')
  })

  it('reports skill delta and added/removed', () => {
    const before = report({
      skillList: [
        { name: 'keep', estimatedTokens: 500 },
        { name: 'dropped', estimatedTokens: 300 },
      ],
    })
    const after = report({
      skillList: [
        { name: 'keep', estimatedTokens: 400 },
        { name: 'added', estimatedTokens: 200 },
      ],
    })
    const diff = diffReports(before, after)
    expect(diff).toContain('Skill 变化')
    expect(diff).toContain('keep')
    expect(diff).toContain('added（新增）')
    expect(diff).toContain('dropped（移除）')
  })
})

describe('diffReports — score change', () => {
  it('reports score change when either side has a score', () => {
    const before = report({ score: { score: 72, deductions: [] } })
    const after = report({ score: { score: 90, deductions: [] } })
    const diff = diffReports(before, after)
    expect(diff).toContain('综合评分')
    expect(diff).toContain('72 → 90 /100')
  })

  it('omits the score section when neither side has a score', () => {
    const diff = diffReports(report(), report())
    expect(diff).not.toContain('综合评分')
  })
})

describe('diffReports — no change', () => {
  it('emits "(无变化)" for empty sections', () => {
    const diff = diffReports(report(), report())
    expect(diff).toContain('(无变化)')
    expect(diff).toContain('分类变化')
    expect(diff).toContain('MCP 变化')
    expect(diff).toContain('Skill 变化')
  })
})
