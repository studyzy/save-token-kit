import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const baseCtx: SpecContext = { home: '/nonexistent', mcpList: [], hookList: [], proxyParsed: null }

function getTool(cwd: string) {
  return buildRegistry(loadRules(), { cwd }).find((x) => x.name === 'codegraph')!
}

describe('codegraph（数据驱动）', () => {
  it('has correct metadata', () => {
    const t = getTool(process.cwd())
    expect(t.name).toBe('codegraph')
    expect(t.type).toBe('mcp')
    expect(t.installCommand).toContain('codegraph')
    expect(loadRules().toolkits['codegraph']?.install?.config?.default).toContain('--platform')
  })

  it('detect reflects command availability', async () => {
    // 用注入 mock 明确断言两种取值
    const hit = buildRegistry(loadRules(), { commandExists: async (n) => n === 'codegraph' }).find(
      (x) => x.name === 'codegraph',
    )!
    expect((await hit.buildDetection(baseCtx)).installed).toBe(true)
    const miss = buildRegistry(loadRules(), { commandExists: async () => false }).find(
      (x) => x.name === 'codegraph',
    )!
    expect((await miss.buildDetection(baseCtx)).installed).toBe(false)
  })

  it('enabled reflects .codegraph presence（相对 cwd）', async () => {
    const withDir = mkdtempSync(join(tmpdir(), 'stk-codegraph-'))
    const withoutDir = mkdtempSync(join(tmpdir(), 'stk-codegraph-'))
    mkdirSync(join(withDir, '.codegraph'), { recursive: true })
    expect((await getTool(withDir).buildDetection(baseCtx)).enabled).toBe(true)
    expect((await getTool(withoutDir).buildDetection(baseCtx)).enabled).toBe(false)
    rmSync(withDir, { recursive: true, force: true })
    rmSync(withoutDir, { recursive: true, force: true })
  })

  it('buildDetection reflects state', async () => {
    const det = await getTool(process.cwd()).buildDetection(baseCtx)
    expect(det.name).toBe('codegraph')
    expect(det.recommendedSaving).toBe(loadRules().toolkits['codegraph']?.saving)
  })
})
