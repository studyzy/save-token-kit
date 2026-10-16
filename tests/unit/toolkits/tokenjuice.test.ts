import { describe, it, expect } from 'vitest'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getTool(commandExists: (n: string) => Promise<boolean>) {
  return buildRegistry(loadRules(), { commandExists }).find((x) => x.name === 'tokenjuice')!
}

describe('tokenjuice（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getTool(async () => true)
    expect(t.name).toBe('tokenjuice')
    expect(t.type).toBe('cli')
    expect(t.installCommand).toContain('go install')
    expect(t.installCommand).toContain('tokenjuice')
    expect(loadRules().toolkits['tokenjuice']?.install?.verify).toBe('tokenjuice --help')
    expect(loadRules().toolkits['tokenjuice']?.saving).toBeTruthy()
    expect(loadRules().toolkits['tokenjuice']?.description).toBeTruthy()
  })

  it('detects installed when tokenjuice is on PATH', async () => {
    expect((await getTool(async (n) => n === 'tokenjuice').buildDetection(baseCtx)).installed).toBe(
      true,
    )
  })

  it('detects not installed when command not found', async () => {
    expect((await getTool(async () => false).buildDetection(baseCtx)).installed).toBe(false)
  })

  it('detects not installed when lookup throws', async () => {
    expect(
      (
        await getTool(async () => {
          throw new Error('command not found')
        }).buildDetection(baseCtx)
      ).installed,
    ).toBe(false)
  })

  it('isEnabled returns false by default（cli 缺省）', async () => {
    expect((await getTool(async () => true).buildDetection(baseCtx)).enabled).toBe(false)
  })

  it('buildDetection when installed', async () => {
    const det = await getTool(async (n) => n === 'tokenjuice').buildDetection(baseCtx)
    expect(det.name).toBe('tokenjuice')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(false)
    expect(det.recommendedSaving).toBe(loadRules().toolkits['tokenjuice']?.saving)
    expect(det.version).toBeNull()
    expect(det.installPath).toBeNull()
    expect(det.codebuddyIntegrated).toBe(true)
  })

  it('buildDetection when not installed', async () => {
    const det = await getTool(async () => false).buildDetection(baseCtx)
    expect(det.name).toBe('tokenjuice')
    expect(det.installed).toBe(false)
    expect(det.enabled).toBe(false)
    expect(det.codebuddyIntegrated).toBe(false)
  })
})
