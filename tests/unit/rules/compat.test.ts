import { describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../../src/rules/loader.js'

const FX = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

/**
 * FR-007: rejection warnings must carry both versions so users can locate
 * the incompatibility without digging through logs.
 */
describe('compat guard warning texts', () => {
  it('engines rejection mentions pack requirement and engine version', () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    loadRules({ rulesFile: FX('incompatible') + '/stk-rules.json' })
    const out = errWrite.mock.calls.map((c) => String(c[0])).join('')
    expect(out).toContain('>=99.0')
    expect(out).toMatch(/当前 \d+\.\d+\.\d+/)
    expect(out).toContain('警告:')
    errWrite.mockRestore()
  })

  it('schema rejection mentions both schema versions', () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    loadRules({ rulesFile: FX('high-schema') + '/stk-rules.json' })
    const out = errWrite.mock.calls.map((c) => String(c[0])).join('')
    expect(out).toContain('2')
    expect(out).toContain('1')
    errWrite.mockRestore()
  })

  it('corruption rejection locates the broken layer', () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    loadRules({ rulesFile: FX('corrupted-data') + '/stk-rules.json' })
    const out = errWrite.mock.calls.map((c) => String(c[0])).join('')
    expect(out).toContain('mcp-alternatives')
    errWrite.mockRestore()
  })
})
