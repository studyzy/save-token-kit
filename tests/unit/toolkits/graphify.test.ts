import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getTool(over: { commandExists?: (n: string) => Promise<boolean>; cwd?: string } = {}) {
  return buildRegistry(loadRules(), over).find((x) => x.name === 'graphify')!
}

describe('graphify（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getTool()
    expect(t.name).toBe('graphify')
    expect(t.type).toBe('cli')
    expect(t.installCommand).toContain('graphify')
    expect(loadRules().toolkits['graphify']?.install?.config?.default).toContain('--platform')
  })

  it('detect reflects command availability', async () => {
    expect(
      (await getTool({ commandExists: async (n) => n === 'graphify' }).buildDetection(baseCtx))
        .installed,
    ).toBe(true)
    expect(
      (await getTool({ commandExists: async () => false }).buildDetection(baseCtx)).installed,
    ).toBe(false)
  })

  it('enabled is false when graphify-out is absent', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'stk-graphify-'))
    expect((await getTool({ cwd }).buildDetection(baseCtx)).enabled).toBe(false)
    rmSync(cwd, { recursive: true, force: true })
  })

  it('enabled is true when graphify-out is present', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'stk-graphify-'))
    mkdirSync(join(cwd, 'graphify-out'), { recursive: true })
    expect((await getTool({ cwd }).buildDetection(baseCtx)).enabled).toBe(true)
    rmSync(cwd, { recursive: true, force: true })
  })

  it('buildDetection reflects state', async () => {
    const det = await getTool().buildDetection(baseCtx)
    expect(det.name).toBe('graphify')
    expect(det.recommendedSaving).toBe(loadRules().toolkits['graphify']?.saving)
  })
})
