import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../../src/rules/loader.js'

const FX = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'stk-merge-'))
}

function writeDataset(dir: string, name: string, content: unknown): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(content))
}

describe('multi-source stacking (builtin < library < user < project)', () => {
  const user = tmpDir()
  const project = tmpDir()

  it('project layer wins over user over library over builtin', () => {
    // library: github -> my-cli (from valid-pack fixture)
    writeDataset(user, 'mcp-alternatives', { github: 'user-cli' })
    writeDataset(project, 'mcp-alternatives', { github: 'project-cli' })
    const merged = loadRules({ rulesFile: FX('valid-pack') + '/stk-rules.json', userDir: user, projectDir: project })
    expect(merged.mcpAlternatives['github']).toBe('project-cli')
    expect(merged.mcpAlternatives['mcp-server-tapd']).toBe('my-tapd') // from library
    expect(merged.mcpAlternatives['notion']).toBe('notion-cli') // from builtin
  })

  it('falls back to user layer when project omits the key', () => {
    const project2 = tmpDir()
    writeDataset(project2, 'thresholds', { memoryMdSuggestLines: 180 })
    const merged = loadRules({ rulesFile: FX('valid-pack') + '/stk-rules.json', userDir: user, projectDir: project2 })
    expect(merged.mcpAlternatives['github']).toBe('user-cli')
    expect(merged.thresholds['memoryMdSuggestLines']).toBe(180)
  })

  it('supports "!name" removal entries in upper layers', () => {
    const user3 = tmpDir()
    const project3 = tmpDir()
    writeDataset(user3, 'low-frequency-plugins', ['!github-mcp'])
    const merged = loadRules({ rulesFile: FX('empty-home') + '/stk-rules.json', userDir: user3, projectDir: project3 })
    expect(merged.lowFrequencyPlugins.has('github-mcp')).toBe(false)
    expect(merged.lowFrequencyPlugins.has('pptx@codebuddy-plugins-official')).toBe(true)
  })

  it('treats "*" level key as fallback and allows upper-layer override', () => {
    const project4 = tmpDir()
    writeDataset(project4, 'levels', { '*': '高级' })
    const merged = loadRules({ rulesFile: FX('empty-home') + '/stk-rules.json', userDir: tmpDir(), projectDir: project4 })
    expect(merged.levels['*']).toBe('高级')
    expect(merged.levels['rtk']).toBe('初级') // explicit key from builtin unaffected
  })

  it('skips a corrupted layer but keeps other layers working', () => {
    const user5 = tmpDir()
    const project5 = tmpDir()
    writeFileSync(join(user5, 'thresholds.json'), '{ not json')
    writeDataset(project5, 'mcp-alternatives', { github: 'ok' })
    const merged = loadRules({ rulesFile: FX('empty-home') + '/stk-rules.json', userDir: user5, projectDir: project5 })
    const u = merged.rulesInfo.sources.find((s) => s.layer === 'user')
    const p = merged.rulesInfo.sources.find((s) => s.layer === 'project')
    expect(u?.result).toBe('rejected-corrupted')
    expect(p?.result).toBe('ok')
    expect(merged.mcpAlternatives['github']).toBe('ok')
  })

  it('reports empty for missing user/project dirs', () => {
    const merged = loadRules({
      rulesFile: FX('empty-home') + '/stk-rules.json',
      userDir: join(tmpDir(), 'nope'),
      projectDir: join(tmpDir(), 'nope'),
    })
    const layers = merged.rulesInfo.sources.map((s) => s.layer)
    expect(layers).toContain('user')
    expect(layers).toContain('project')
  })
})
