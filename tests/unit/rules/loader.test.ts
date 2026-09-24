import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../../src/rules/loader.js'
import fallbackPack from '../../../src/rules/fallback.json'

const FX = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

describe('loadRules builtin layer', () => {
  it('loads the bundled single file when no library is installed', () => {
    const merged = loadRules({ rulesFile: FX('empty-home') + '/none.json' })
    expect(merged.rulesInfo.packVersion).toBe((fallbackPack as { packVersion: string }).packVersion)
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
    expect(merged.lowFrequencyPlugins.has('pptx@codebuddy-plugins-official')).toBe(true)
    expect(merged.mcpAlternatives['github-mcp']).toBe('gh')
    expect(merged.thresholds['memoryMdMaxLines']).toBe(150)
    expect(merged.levels['*']).toBe('中级')
    // prompts flow from the bundled single file
    expect(merged.prompts['tool-opt.codebuddy']).toContain('cblite')
  })
})

describe('loadRules library layer (single file)', () => {
  it('adopts a valid installed file and applies its overrides', () => {
    const merged = loadRules({ rulesFile: FX('valid-pack') + '/stk-rules.json' })
    expect(merged.rulesInfo.packVersion).toBe('1.1.0')
    expect(merged.rulesInfo.fallbackInUse).toBe(false)
    expect(merged.mcpAlternatives['github']).toBe('my-cli')
    expect(merged.thresholds['memoryMdMaxLines']).toBe(120)
    expect(merged.levels['headroom']).toBe('初级')
    expect(merged.lowFrequencyPlugins.has('extra-lowfreq-plugin')).toBe(true)
    expect(merged.mcpAlternatives['notion']).toBe('notion-cli')
  })

  it('rejects unknown schemaVersion', () => {
    const merged = loadRules({ rulesFile: FX('high-schema') + '/stk-rules.json' })
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-incompatible')
  })

  it('rejects engines range excluding the engine version', () => {
    const merged = loadRules({ rulesFile: FX('incompatible') + '/stk-rules.json' })
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-incompatible')
  })

  it('rejects corrupted JSON', () => {
    const merged = loadRules({ rulesFile: FX('corrupted-manifest') + '/stk-rules.json' })
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-corrupted')
  })

  it('rejects invalid data shapes entirely (no partial load)', () => {
    const merged = loadRules({ rulesFile: FX('corrupted-data') + '/stk-rules.json' })
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-corrupted')
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
  })
})
