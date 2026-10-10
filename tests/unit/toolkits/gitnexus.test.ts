import { describe, it, expect } from 'vitest'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getTool(mcpList: SpecContext['mcpList'] = []) {
  const t = buildRegistry(loadRules(), {}).find((x) => x.name === 'gitnexus')!
  return { t, ctx: { ...baseCtx, mcpList } }
}

describe('gitnexus（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getTool().t
    expect(t.name).toBe('gitnexus')
    expect(t.type).toBe('plugin')
    expect(t.installCommand).toContain('GitNexus')
    expect(loadRules().toolkits['gitnexus']?.install?.verify).toContain('gitnexus')
  })

  it('detects not installed when mcp list empty', async () => {
    const { t, ctx } = getTool()
    expect((await t.buildDetection(ctx)).installed).toBe(false)
  })

  it('detects not installed when gitnexus server absent', async () => {
    const { t, ctx } = getTool([{ name: 'other', status: 'enabled' }])
    expect((await t.buildDetection(ctx)).installed).toBe(false)
  })

  it('detects installed when gitnexus mcp enabled', async () => {
    const { t, ctx } = getTool([{ name: 'gitnexus', status: 'enabled' }])
    expect((await t.buildDetection(ctx)).installed).toBe(true)
  })

  it('enabled false until mcp enabled（原 setMcpEnabled 语义）', async () => {
    const off = getTool([{ name: 'gitnexus', status: 'disabled' }])
    expect((await off.t.buildDetection(off.ctx)).enabled).toBe(false)
    const on = getTool([{ name: 'gitnexus', status: 'enabled' }])
    expect((await on.t.buildDetection(on.ctx)).enabled).toBe(true)
  })

  it('markInstalledFromMcp 语义：mcp enabled → installed 且 integrated', async () => {
    const { t, ctx } = getTool([{ name: 'gitnexus', status: 'enabled' }])
    const det = await t.buildDetection(ctx)
    expect(det.installed).toBe(true)
    expect(det.codebuddyIntegrated).toBe(true)
    expect(det.recommendedSaving).toBe(loadRules().toolkits['gitnexus']?.saving)
  })
})
