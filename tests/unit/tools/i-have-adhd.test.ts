import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { iHaveAdhdTool } from '@/tools/impl/i-have-adhd.js'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolDetection } from '@/types/index.js'

const HOME = join(process.cwd(), 'tests', '.tmp-i-have-adhd-home')

function writeSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(HOME, '.codebuddy'), { recursive: true })
  writeFileSync(
    join(HOME, '.codebuddy', 'settings.json'),
    JSON.stringify({ enabledPlugins }),
  )
}

function makeMarketplaceDir(): void {
  mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'i-have-adhd'), {
    recursive: true,
  })
}

describe('iHaveAdhdTool', () => {
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
    expect(iHaveAdhdTool.name).toBe('i-have-adhd')
    expect(iHaveAdhdTool.type).toBe('plugin')
    expect(iHaveAdhdTool.getConfigCommand()).toBe('')
  })

  it('detect false when marketplace dir missing', async () => {
    expect(await iHaveAdhdTool.detect()).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    makeMarketplaceDir()
    expect(await iHaveAdhdTool.detect()).toBe(true)
  })

  it('isEnabled false when plugin not enabled in settings', async () => {
    makeMarketplaceDir()
    expect(await iHaveAdhdTool.isEnabled()).toBe(false)
  })

  it('isEnabled true only when plugin enabled in settings', async () => {
    makeMarketplaceDir()
    writeSettings({ 'i-have-adhd@i-have-adhd': false })
    expect(await iHaveAdhdTool.isEnabled()).toBe(false)
    writeSettings({ 'i-have-adhd@i-have-adhd': true })
    expect(await iHaveAdhdTool.isEnabled()).toBe(true)
  })

  it('markInstalledFromProxy marks installed when not installed', () => {
    const base: ToolDetection = {
      name: 'i-have-adhd',
      installed: false,
      enabled: false,
      version: null,
      installPath: null,
      codebuddyIntegrated: false,
    }
    const result = iHaveAdhdTool.markInstalledFromProxy(base)
    expect(result.installed).toBe(true)
    expect(result.codebuddyIntegrated).toBe(true)
  })

  it('markInstalledFromProxy keeps detection when already installed', () => {
    const base: ToolDetection = {
      name: 'i-have-adhd',
      installed: true,
      enabled: true,
      version: null,
      installPath: null,
      codebuddyIntegrated: true,
    }
    const result = iHaveAdhdTool.markInstalledFromProxy(base)
    expect(result).toBe(base)
  })
})
