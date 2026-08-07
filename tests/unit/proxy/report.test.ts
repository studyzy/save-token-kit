import { describe, it, expect } from 'vitest'
import { buildDiagnosisReport } from '@/proxy/report.js'
import type { FsCollectResult } from '@/collectors/fs-collector.js'

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
