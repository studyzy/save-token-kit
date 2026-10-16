import { describe, it, expect } from 'vitest'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'
import type { RegistryDeps } from '@/toolkits/data-registry.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getHeadroom(deps: RegistryDeps = {}) {
  return buildRegistry(loadRules(), deps).find((t) => t.name === 'headroom')!
}

describe('headroom（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getHeadroom()
    expect(t.name).toBe('headroom')
    expect(t.type).toBe('cli')
    expect(t.installCommand).toContain('headroom')
    expect(loadRules().toolkits['headroom']?.install?.config?.default).toContain('mcp install')
  })

  it('detect reflects command availability', async () => {
    const det = await getHeadroom({ commandExists: async (n) => n === 'headroom' }).buildDetection(
      baseCtx,
    )
    expect(det.installed).toBe(true)
    const detOff = await getHeadroom({ commandExists: async () => false }).buildDetection(baseCtx)
    expect(detOff.installed).toBe(false)
  })

  it('enabled false when process not running (even with mcp enabled)', async () => {
    const t = getHeadroom({
      commandExists: async () => true,
      listProcesses: async () => [],
    })
    const ctx: SpecContext = {
      ...baseCtx,
      mcpList: [{ name: 'headroom', status: 'enabled' }],
    }
    expect((await t.buildDetection(ctx)).enabled).toBe(false)
  })

  it('enabled false when mcp not enabled (even with process running)', async () => {
    const t = getHeadroom({
      commandExists: async () => true,
      listProcesses: async () => ['headroom proxy --port 8420'],
    })
    expect((await t.buildDetection(baseCtx)).enabled).toBe(false)
  })

  it('enabled true only when process running AND mcp enabled', async () => {
    const t = getHeadroom({
      commandExists: async () => true,
      listProcesses: async () => ['headroom proxy --port 8420'],
    })
    const ctx: SpecContext = {
      ...baseCtx,
      mcpList: [{ name: 'headroom', status: 'enabled' }],
    }
    expect((await t.buildDetection(ctx)).enabled).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    const det = await getHeadroom({ commandExists: async () => true }).buildDetection(baseCtx)
    expect(det.name).toBe('headroom')
    expect(det.recommendedSaving).toBe(loadRules().toolkits['headroom']?.saving)
  })
})
