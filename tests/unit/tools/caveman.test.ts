import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cavemanTool } from '@/tools/impl/caveman.js'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const HOME = join(process.cwd(), 'tests', '.tmp-caveman-home')

describe('cavemanTool', () => {
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
    expect(cavemanTool.name).toBe('caveman')
    expect(cavemanTool.type).toBe('plugin')
    expect(cavemanTool.getConfigCommand()).toBe('')
  })

  it('detect false when marketplace dir missing', async () => {
    expect(await cavemanTool.detect()).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    expect(await cavemanTool.detect()).toBe(true)
  })

  it('isEnabled mirrors detect', async () => {
    expect(await cavemanTool.isEnabled()).toBe(false)
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    expect(await cavemanTool.isEnabled()).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    const det = await cavemanTool.buildDetection()
    expect(det.name).toBe('caveman')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(cavemanTool.savingEstimate)
  })
})
