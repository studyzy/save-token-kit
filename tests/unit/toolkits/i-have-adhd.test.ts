import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { iHaveAdhdToolkit } from '@/toolkits/impl/i-have-adhd.js'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolkitDetection } from '@/types/index.js'

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

describe('iHaveAdhdToolkit', () => {
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
    expect(iHaveAdhdToolkit.name).toBe('i-have-adhd')
    expect(iHaveAdhdToolkit.type).toBe('plugin')
    expect(iHaveAdhdToolkit.getConfigCommand()).toBe('')
  })

  it('detect false when marketplace dir missing', async () => {
    expect(await iHaveAdhdToolkit.detect()).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    makeMarketplaceDir()
    expect(await iHaveAdhdToolkit.detect()).toBe(true)
  })

  it('isEnabled false when plugin not enabled in settings', async () => {
    makeMarketplaceDir()
    expect(await iHaveAdhdToolkit.isEnabled()).toBe(false)
  })

  it('isEnabled true only when plugin enabled in settings', async () => {
    makeMarketplaceDir()
    writeSettings({ 'i-have-adhd@i-have-adhd': false })
    expect(await iHaveAdhdToolkit.isEnabled()).toBe(false)
    writeSettings({ 'i-have-adhd@i-have-adhd': true })
    expect(await iHaveAdhdToolkit.isEnabled()).toBe(true)
  })

  it('markInstalledFromProxy marks installed when not installed', () => {
    const base: ToolkitDetection = {
      name: 'i-have-adhd',
      installed: false,
      enabled: false,
      version: null,
      installPath: null,
      codebuddyIntegrated: false,
    }
    const result = iHaveAdhdToolkit.markInstalledFromProxy(base)
    expect(result.installed).toBe(true)
    expect(result.codebuddyIntegrated).toBe(true)
  })

  it('markInstalledFromProxy keeps detection when already installed', () => {
    const base: ToolkitDetection = {
      name: 'i-have-adhd',
      installed: true,
      enabled: true,
      version: null,
      installPath: null,
      codebuddyIntegrated: true,
    }
    const result = iHaveAdhdToolkit.markInstalledFromProxy(base)
    expect(result).toBe(base)
  })
})
