import { describe, it, expect } from 'vitest'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getTool(commandExists: (n: string) => Promise<boolean>) {
  return buildRegistry(loadRules(), { commandExists }).find((x) => x.name === 'lean-ctx')!
}

describe('lean-ctx（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getTool(async () => true)
    expect(t.name).toBe('lean-ctx')
    expect(t.type).toBe('cli')
    expect(t.installCommand).toContain('lean-ctx')
    expect(loadRules().toolkits['lean-ctx']?.install?.config?.default).toContain('setup')
  })

  it('detect reflects command availability', async () => {
    expect((await getTool(async (n) => n === 'lean-ctx').buildDetection(baseCtx)).installed).toBe(
      true,
    )
    expect((await getTool(async () => false).buildDetection(baseCtx)).installed).toBe(false)
  })

  it('isEnabled always false（cli 缺省 enabled = false）', async () => {
    expect((await getTool(async () => true).buildDetection(baseCtx)).enabled).toBe(false)
  })

  it('buildDetection reflects state', async () => {
    const det = await getTool(async () => true).buildDetection(baseCtx)
    expect(det.name).toBe('lean-ctx')
    expect(det.enabled).toBe(false)
    expect(det.recommendedSaving).toBe(loadRules().toolkits['lean-ctx']?.saving)
  })
})
