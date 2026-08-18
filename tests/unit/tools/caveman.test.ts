import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cavemanTool } from '@/tools/impl/caveman.js'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HOME = join(process.cwd(), 'tests', '.tmp-caveman-home')

const settingsPath = () => join(HOME, '.codebuddy', 'settings.json')

function writeSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(HOME, '.codebuddy'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify({ enabledPlugins }))
}

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

  it('isEnabled false when plugin not enabled in settings', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    expect(await cavemanTool.isEnabled()).toBe(false)
  })

  it('isEnabled true only when plugin enabled in settings', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    writeSettings({ 'caveman@caveman': false })
    expect(await cavemanTool.isEnabled()).toBe(false)
    writeSettings({ 'caveman@caveman': true })
    expect(await cavemanTool.isEnabled()).toBe(true)
  })

  it('buildDetection reflects enabled state', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    writeSettings({ 'caveman@caveman': true })
    const det = await cavemanTool.buildDetection()
    expect(det.name).toBe('caveman')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(cavemanTool.savingEstimate)
  })

  it('buildDetection installed but not enabled', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    writeSettings({ 'caveman@caveman': false })
    const det = await cavemanTool.buildDetection()
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(false)
  })
})
