import { describe, it, expect } from 'vitest'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getTool() {
  return buildRegistry(loadRules(), {}).find((x) => x.name === 'context-mode')!
}

describe('context-mode（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getTool()
    expect(t.name).toBe('context-mode')
    expect(t.type).toBe('plugin')
    expect(t.installCommand).toContain('context-mode')
    expect(loadRules().toolkits['context-mode']?.install?.verify).toContain('context-mode')
    expect(loadRules().toolkits['context-mode']?.install?.config?.default).toContain('context-mode')
  })

  it('detect reflects command availability', async () => {
    const hit = buildRegistry(loadRules(), { commandExists: async (n) => n === 'context-mode' }).find(
      (x) => x.name === 'context-mode',
    )!
    expect((await hit.buildDetection(baseCtx)).installed).toBe(true)
    const miss = buildRegistry(loadRules(), { commandExists: async () => false }).find(
      (x) => x.name === 'context-mode',
    )!
    expect((await miss.buildDetection(baseCtx)).installed).toBe(false)
  })

  it('enabled false until mcp enabled（原 setMcpEnabled 语义）', async () => {
    expect(
      (
        await getTool().buildDetection({
          ...baseCtx,
          mcpList: [{ name: 'other-tool', status: 'enabled' }],
        })
      ).enabled,
    ).toBe(false)
    expect(
      (
        await getTool().buildDetection({
          ...baseCtx,
          mcpList: [{ name: 'context-mode', status: 'enabled' }],
        })
      ).enabled,
    ).toBe(true)
  })

  it('proxy 回退路径：plugin_context-mode_context-mode 命名空间形态也算 enabled', async () => {
    const det = await getTool().buildDetection({
      ...baseCtx,
      proxyParsed: { mcpServers: [{ name: 'plugin_context-mode_context-mode' }] },
    })
    expect(det.enabled).toBe(true)
  })

  it('buildDetection reflects mcp enabled state', async () => {
    const det = await getTool().buildDetection({
      ...baseCtx,
      mcpList: [{ name: 'context-mode', status: 'enabled' }],
    })
    expect(det.name).toBe('context-mode')
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(loadRules().toolkits['context-mode']?.saving)
  })
})
