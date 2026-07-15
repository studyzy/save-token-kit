import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { karpathySkillsTool } from '@/tools/impl/karpathy-skills.js'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const HOME = join(process.cwd(), 'tests', '.tmp-karpathy-home')

describe('karpathySkillsTool', () => {
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
    expect(karpathySkillsTool.name).toBe('karpathy-skills')
    expect(karpathySkillsTool.type).toBe('plugin')
    expect(karpathySkillsTool.getConfigCommand()).toBe('')
  })

  it('detect false when marketplace dir missing', async () => {
    expect(await karpathySkillsTool.detect()).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    mkdirSync(
      join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'andrej-karpathy-skills'),
      { recursive: true },
    )
    expect(await karpathySkillsTool.detect()).toBe(true)
  })

  it('isEnabled mirrors detect', async () => {
    expect(await karpathySkillsTool.isEnabled()).toBe(false)
    mkdirSync(
      join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'andrej-karpathy-skills'),
      { recursive: true },
    )
    expect(await karpathySkillsTool.isEnabled()).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    mkdirSync(
      join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'andrej-karpathy-skills'),
      { recursive: true },
    )
    const det = await karpathySkillsTool.buildDetection()
    expect(det.name).toBe('karpathy-skills')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
  })
})
