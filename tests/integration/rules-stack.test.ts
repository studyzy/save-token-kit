import { describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../src/rules/loader.js'

const FX = (name: string) => fileURLToPath(new URL(`../unit/rules/fixtures/${name}`, import.meta.url))

/**
 * Integration: real filesystem + real bundled pack, full loadRules pipeline.
 */
describe('rules stack integration', () => {
  it('exposes all four sources with builtin fallback by default', () => {
    const merged = loadRules({ rulesFile: FX('empty-home') + '/stk-rules.json' })
    const layers = merged.rulesInfo.sources.map((s) => s.layer)
    expect(layers).toEqual(['builtin', 'library', 'user', 'project'])
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
    // consolidated view is consumable by the engine
    expect(merged.lowFrequencyPlugins.size).toBeGreaterThan(0)
    expect(Object.keys(merged.mcpAlternatives).length).toBeGreaterThan(0)
  })

  it('uses an installed library pack end to end', () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const merged = loadRules({ rulesFile: FX('valid-pack') + '/stk-rules.json' })
    expect(merged.rulesInfo.packVersion).toBe('1.1.0')
    expect(merged.rulesInfo.fallbackInUse).toBe(false)
    errWrite.mockRestore()
  })
})
