import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const HOME = join(process.cwd(), 'tests', '.tmp-karpathy-home')

function makeCtx(): SpecContext {
  return { home: HOME, mcpList: [], hookList: [], proxyParsed: null }
}

function getTool() {
  return buildRegistry(loadRules(), {}).find((x) => x.name === 'karpathy-skills')!
}

describe('karpathy-skills（数据驱动）', () => {
  const originalHome = process.env.HOME

  beforeEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    process.env.HOME = HOME
  })

  afterEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    process.env.HOME = originalHome
  })

  it('has correct metadata', () => {
    const t = getTool()
    expect(t.name).toBe('karpathy-skills')
    expect(t.type).toBe('plugin')
    expect(loadRules().toolkits['karpathy-skills']?.install?.config).toBeUndefined()
  })

  it('detect false when marketplace dir missing', async () => {
    expect((await getTool().buildDetection(makeCtx())).installed).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'andrej-karpathy-skills'), {
      recursive: true,
    })
    expect((await getTool().buildDetection(makeCtx())).installed).toBe(true)
  })

  it('isEnabled mirrors detect（plugin 缺省 enabled = installed）', async () => {
    expect((await getTool().buildDetection(makeCtx())).enabled).toBe(false)
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'andrej-karpathy-skills'), {
      recursive: true,
    })
    expect((await getTool().buildDetection(makeCtx())).enabled).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'andrej-karpathy-skills'), {
      recursive: true,
    })
    const det = await getTool().buildDetection(makeCtx())
    expect(det.name).toBe('karpathy-skills')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
  })
})
