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

  it('declares consistent version metadata', () => {
    expect(distributable.packVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(distributable.schemaVersion).toBe(1)
    expect(merged.rulesInfo.packVersion).toBe(distributable.packVersion)
  })
})
