import { describe, it, expect } from 'vitest'
import { buildDiagnosisReport, renderMarkdown } from '@/proxy/report.js'
import type { FsCollectResult } from '@/collectors/fs-collector.js'
import type { DiagnosisReport } from '@/types/index.js'

describe('buildDiagnosisReport skill sources', () => {
  const body = {
    messages: [
      {
        role: 'system',
        content:
          'The following skills are available for use with the Skill tool:\n\n' +
          '- graphify: Use this for codebase questions\n' +
          '- stk-analyze: 分析用户AI使用场景\n' +
          '- fix-bug: Bug 修复流水线\n' +
          '- superpowers:brainstorming: Explores user intent\n' +
          '- speckit.plan: Plans implementation\n' +
          '- somebuiltin: Built-in skill\n',
      },
    ],
    tools: [],
  }

  const fs = {
    mcpList: [],
    skillList: [
      { name: 'graphify', source: 'user' },
      { name: 'stk-analyze', source: 'project' },
      { name: 'fix-bug', source: 'project' },
    ],
    commandList: [],
    pluginList: [],
    hookList: [],
    ruleList: [],
    memoryFiles: [],
    codebuddyMdSize: 0,
    historySize: 0,
  } as unknown as FsCollectResult

  it('resolves skill sources from the fs scan, falling back to bundled', () => {
    const report = buildDiagnosisReport([body], fs, [], null, 'claude')
    const byName = Object.fromEntries(report.skillList.map((s) => [s.name, s.source]))
    expect(byName['graphify']).toBe('user')
    expect(byName['stk-analyze']).toBe('project')
    expect(byName['fix-bug']).toBe('project')
    // Namespaced skills not on disk come from plugins.
    expect(byName['superpowers:brainstorming']).toBe('plugin')
    expect(byName['speckit.plan']).toBe('plugin')
    // Bare-name skills not on disk are built-in (bundled).
    expect(byName['somebuiltin']).toBe('bundled')
  })

  it('keeps parsed skills unchanged when no fs scan is provided', () => {
    const report = buildDiagnosisReport([body], undefined, [], null, 'claude')
    const byName = Object.fromEntries(report.skillList.map((s) => [s.name, s.source]))
    expect(byName['graphify']).toBe('skill')
    expect(byName['superpowers:brainstorming']).toBe('skill')
  })
})

describe('buildDiagnosisReport MCP tool categories', () => {
  it('counts mcp__-prefixed tool definitions in breakdown and total', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        { name: 'Read', description: 'read a file' },
        { name: 'mcp__github__list_repos', description: 'list repos' },
        { name: 'mcp__github__get_repo', description: 'get repo' },
      ],
    }

    const report = buildDiagnosisReport([body], undefined, [], null, 'codebuddy')

    const mcpItem = report.contextOverview.breakdown.find((c) => c.type === 'mcp-tools')
    expect(mcpItem).toBeDefined()
    expect(mcpItem!.estimatedTokens).toBeGreaterThan(0)

    // The mcp-tools category must be counted in the overview total.
    const sum = report.contextOverview.breakdown.reduce((s, c) => s + c.estimatedTokens, 0)
    expect(report.contextOverview.totalEstimatedTokens).toBe(sum)
    expect(report.contextOverview.totalEstimatedTokens).toBeGreaterThanOrEqual(
      mcpItem!.estimatedTokens,
    )
  })

  it('does not emit mcp-tools when no mcp-prefixed tools exist', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'Read', description: 'read a file' }],
    }

    const report = buildDiagnosisReport([body], undefined, [], null, 'codebuddy')

    const mcpItem = report.contextOverview.breakdown.find((c) => c.type === 'mcp-tools')
    expect(mcpItem).toBeUndefined()
  })
})

describe('renderMarkdown', () => {
  function reportWithWaste(): DiagnosisReport {
    return {
      scanTimestamp: '2026-01-01T00:00:00Z',
      agentName: 'codebuddy',
      agentVersion: '1.0.0',
      contextOverview: { totalEstimatedTokens: 1000, breakdown: [] },
      mcpList: [
        {
          name: 'github',
          status: 'enabled',
          toolsCount: 2,
          estimatedTokens: 5000,
          loadingMode: 'direct',
        },
      ],
      skillList: [
        {
          name: 'commit',
          estimatedTokens: 100,
          source: 'user',
          description: 'A commit helper skill',
        },
      ],
      agentList: [],
      builtinTools: [{ name: 'Read', estimatedTokens: 50, category: 'builtin' }],
    }
  }

  it('default mode reports objective facts only, hides per-tool lines and skill description', () => {
    const md = renderMarkdown(reportWithWaste())
    expect(md).not.toContain('综合评分')
    expect(md).not.toContain('Quick Wins')
    // Per-tool lines only appear in detail mode.
    expect(md).not.toContain('Read') // 内置工具名不应出现在默认模式
    // Skill description only in detail mode.
    expect(md).not.toContain('A commit helper skill')
  })

  it('default mode hides per-tool breakdown by not listing builtin tool names', () => {
    const md = renderMarkdown(reportWithWaste())
    // The builtin tool "Read" must not appear as a per-tool line.
    expect(md).not.toMatch(/Read\s+~50/)
  })

  it('detail mode includes per-tool lines', () => {
    const md = renderMarkdown(reportWithWaste(), { detail: true })
    expect(md).toContain('Read')
    expect(md).toContain('A commit helper skill')
  })
})

describe('renderMarkdown Hooks section', () => {
  function reportWithHooks(hookList: DiagnosisReport['hookList']): DiagnosisReport {
    return {
      scanTimestamp: '2026-01-01T00:00:00Z',
      agentName: 'codebuddy',
      agentVersion: '1.0.0',
      contextOverview: { totalEstimatedTokens: 1000, breakdown: [] },
      mcpList: [],
      skillList: [],
      agentList: [],
      builtinTools: [],
      hookList,
    }
  }

  it('shows only the first line of a multi-line hook command', () => {
    const md = renderMarkdown(
      reportWithHooks([
        {
          event: 'SessionStart',
          matcher: '*',
          command: 'echo start\n  second line\n  third line',
          timeout: null,
          source: 'settings',
        },
      ]),
    )
    expect(md).toContain('SessionStart [*] → echo start')
    expect(md).not.toContain('second line')
    expect(md).not.toContain('third line')
  })

  it('collapses identical hooks into one entry with a count', () => {
    const md = renderMarkdown(
      reportWithHooks(
        Array.from({ length: 7 }, () => ({
          event: 'SessionStart',
          matcher: '*',
          command: 'rtk hook',
          timeout: null,
          source: 'settings' as const,
        })),
      ),
    )
    expect(md).toContain('Hooks (7 个)')
    expect(md).toContain('SessionStart [*] → rtk hook  (×7 重复)')
    // The collapsed line appears exactly once, not seven times.
    expect(md.match(/→ rtk hook/g)).toHaveLength(1)
  })

  it('keeps distinct hooks separate', () => {
    const md = renderMarkdown(
      reportWithHooks([
        { event: 'SessionStart', matcher: '*', command: 'a', timeout: null, source: 'settings' },
        { event: 'PreToolUse', matcher: 'Bash', command: 'b', timeout: null, source: 'settings' },
      ]),
    )
    expect(md).toContain('SessionStart [*] → a')
    expect(md).toContain('PreToolUse [Bash] → b')
    expect(md).not.toContain('重复')
  })

  it('renders (无) when there are no hooks', () => {
    expect(renderMarkdown(reportWithHooks([]))).toContain('Hooks (0 个)')
    expect(renderMarkdown(reportWithHooks([]))).toContain('(无)')
  })
})
