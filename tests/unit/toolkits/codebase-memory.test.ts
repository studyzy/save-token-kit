import { describe, it, expect } from 'vitest'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getTool(mcpList: SpecContext['mcpList'] = []) {
  const t = buildRegistry(loadRules(), {}).find((x) => x.name === 'codebase-memory')!
  return { t, ctx: { ...baseCtx, mcpList } }
}

describe('codebase-memory（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getTool().t
    expect(t.name).toBe('codebase-memory')
    expect(t.type).toBe('mcp')
    expect(t.installCommand).toContain('codebase-memory-mcp')
    expect(loadRules().toolkits['codebase-memory']?.install?.verify).toContain(
      'codebase-memory-mcp',
    )
  })

  it('detects not installed when mcp list empty', async () => {
    const { t, ctx } = getTool()
    expect((await t.buildDetection(ctx)).installed).toBe(false)
  })

  it('detects not installed when codebase-memory server absent', async () => {
    const { t, ctx } = getTool([{ name: 'other', status: 'enabled' }])
    expect((await t.buildDetection(ctx)).installed).toBe(false)
  })

  it('detects installed when codebase-memory mcp enabled', async () => {
    const { t, ctx } = getTool([{ name: 'codebase-memory', status: 'enabled' }])
    expect((await t.buildDetection(ctx)).installed).toBe(true)
  })

  it('enabled false until mcp enabled（原 setMcpEnabled 语义）', async () => {
    const off = getTool([{ name: 'codebase-memory', status: 'disabled' }])
    expect((await off.t.buildDetection(off.ctx)).enabled).toBe(false)
    const on = getTool([{ name: 'codebase-memory', status: 'enabled' }])
    expect((await on.t.buildDetection(on.ctx)).enabled).toBe(true)
  })

  it('markInstalledFromMcp 语义：mcp enabled → installed 且 integrated', async () => {
    const { t, ctx } = getTool([{ name: 'codebase-memory', status: 'enabled' }])
    const det = await t.buildDetection(ctx)
    expect(det.installed).toBe(true)
    expect(det.codebuddyIntegrated).toBe(true)
    expect(det.recommendedSaving).toBe(loadRules().toolkits['codebase-memory']?.saving)
  })
})
