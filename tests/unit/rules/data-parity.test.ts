import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../../src/rules/loader.js'

/**
 * FR-001 guard: the bundled fallback must stay identical to the
 * distributable single rules file — no second source of truth.
 */
describe('fallback parity with the distributable rules file', () => {
  const distPath = fileURLToPath(new URL('../../../rules/stk-rules.json', import.meta.url))
  const distributable = JSON.parse(readFileSync(distPath, 'utf8'))
  const merged = loadRules({
    rulesFile: fileURLToPath(new URL('./fixtures/empty-home/none.json', import.meta.url)),
  })

  it('bundled fallback equals rules/stk-rules.json byte-for-byte', () => {
    const bundled = readFileSync(
      fileURLToPath(new URL('../../../src/rules/fallback.json', import.meta.url)),
      'utf8',
    )
    expect(bundled).toBe(readFileSync(distPath, 'utf8'))
  })

  it('matches migrated LOW_FREQUENCY_PLUGINS entries exactly', () => {
    expect(distributable.data['low-frequency-plugins']).toEqual([
      'pptx@codebuddy-plugins-official',
      'docx@codebuddy-plugins-official',
      'xlsx@codebuddy-plugins-official',
      'agent-browser@codebuddy-plugins-official',
      'playwright-cli@codebuddy-plugins-official',
    ])
    expect(merged.lowFrequencyPlugins.has('pptx@codebuddy-plugins-official')).toBe(true)
  })

  it('matches migrated MCP_CLI_ALTERNATIVES entries exactly', () => {
    expect(distributable.data['mcp-alternatives']).toEqual({
      Playwright: 'playwright',
      playwright: 'playwright',
      github: 'gh',
      'github-mcp': 'gh',
      slack: 'slack-cli',
      filesystem: 'node fs',
      notion: 'notion-cli',
      linear: 'linear-cli',
      jira: 'jira-cli',
      tapd: 'tapd-cli',
      'mcp-server-tapd': 'tapd-cli',
      gongfeng: 'gongfeng',
      'gongfeng-mcp': 'gongfeng',
    })
  })

  it('toolkits carry tokenlint-migrated meta fields', () => {
    const rtk = distributable.data['toolkits'].find((t) => t.id === 'rtk')
    expect(rtk.repo).toBe('https://github.com/rtk-ai/rtk')
    expect(rtk.agents).toEqual({ claude: true, codex: true, codebuddy: false })
    const kits = distributable.data['toolkits'].filter((t) =>
      ['graphify', 'codebase-memory', 'codegraph', 'gitnexus'].includes(t.id),
    )
    expect(
      kits.every((t) => typeof t.repo === 'string' && typeof t.agents === 'object' && t.agents !== null),
    ).toBe(true)
  })

  it('carries zero-hardcode detection/enabled specs for the 13 toolkits (v1.2.0)', () => {
    const toolkits = distributable.data['toolkits'] as Array<Record<string, unknown>>
    expect(toolkits).toHaveLength(13)

    const byId = new Map(toolkits.map((t) => [t.id as string, t]))
    // 13 项均具备 description / saving / detect 建议事实与检测规格
    expect(toolkits.every((t) => typeof t.description === 'string' && t.description.length > 0)).toBe(
      true,
    )
    expect(toolkits.every((t) => typeof t.saving === 'string' && t.saving.length > 0)).toBe(true)
    expect(toolkits.every((t) => typeof t.detect === 'object' && t.detect !== null)).toBe(true)

    // rtk: command 检测 + rtk-native 安装 handler
    const rtk = byId.get('rtk')
    expect((rtk.detect as { kind?: string }).kind).toBe('command')
    expect((rtk.install as { handler?: string }).handler).toBe('rtk-native')

    // caveman: plugin-enabled 启用规格
    const caveman = byId.get('caveman')
    expect((caveman.enabled as { kind?: string }).kind).toBe('plugin-enabled')

    // headroom: 复合启用规格（进程 + MCP）两子项
    const headroom = byId.get('headroom')
    expect((headroom.enabled as { all?: unknown[] }).all).toHaveLength(2)

    // 知识库 4 项归类
    const kbIds = ['graphify', 'codebase-memory', 'codegraph', 'gitnexus']
    for (const id of kbIds) expect((byId.get(id) as { category?: string }).category).toBe('knowledge-base')
  })

  it('carries proxy-plugin markers and MCP prefixes as data (zero-hardcode follow-up)', () => {
    const byId = new Map(
      (distributable.data['toolkits'] as Array<Record<string, unknown>>).map((t) => [
        t.id as string,
        t,
      ]),
    )
    expect(byId.get('caveman')?.proxyMarkers).toEqual(['CAVEMAN MODE ACTIVE'])
    expect(byId.get('ponytail')?.proxyMarkers).toEqual(['PONYTAIL MODE ACTIVE'])
    expect(byId.get('i-have-adhd')?.proxyMarkers).toEqual(['ADHD MODE ACTIVE'])
    expect(byId.get('headroom')?.mcpPrefixes).toEqual(['headroom_'])
  })

  it('packVersion bumped to 1.2.0', () => {
    expect(distributable.packVersion).toBe('1.2.0')
  })

  it('declares consistent version metadata', () => {
    expect(distributable.packVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(distributable.schemaVersion).toBe(1)
    expect(merged.rulesInfo.packVersion).toBe(distributable.packVersion)
  })
})
