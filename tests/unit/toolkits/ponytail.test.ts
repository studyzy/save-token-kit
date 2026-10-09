import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ponytailToolkit } from '@/toolkits/impl/ponytail.js'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolkitDetection } from '@/types/index.js'

const HOME = join(process.cwd(), 'tests', '.tmp-ponytail-home')

const settingsPath = () => join(HOME, '.codebuddy', 'settings.json')

function writeSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(HOME, '.codebuddy'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify({ enabledPlugins }))
}

describe('ponytailToolkit', () => {
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
    expect(ponytailToolkit.name).toBe('ponytail')
    expect(ponytailToolkit.type).toBe('plugin')
    expect(ponytailToolkit.getConfigCommand()).toBe('')
  })

  it('detect false when marketplace dir missing', async () => {
    expect(await ponytailToolkit.detect()).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'ponytail'), {
      recursive: true,
    })
    expect(await ponytailToolkit.detect()).toBe(true)
  })

  it('isEnabled false when plugin not enabled in settings', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'ponytail'), {
      recursive: true,
    })
    expect(await ponytailToolkit.isEnabled()).toBe(false)
  })

  it('isEnabled true only when plugin enabled in settings', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'ponytail'), {
      recursive: true,
    })
    writeSettings({ 'ponytail@ponytail': false })
    expect(await ponytailToolkit.isEnabled()).toBe(false)
    writeSettings({ 'ponytail@ponytail': true })
    expect(await ponytailToolkit.isEnabled()).toBe(true)
  })

  it('markInstalledFromProxy marks installed when not installed', () => {
    const base: ToolkitDetection = {
      name: 'ponytail',
      installed: false,
      enabled: false,
      version: null,
      installPath: null,
      codebuddyIntegrated: false,
    }
    const result = ponytailToolkit.markInstalledFromProxy(base)
    expect(result.installed).toBe(true)
    expect(result.codebuddyIntegrated).toBe(true)
  })

  it('markInstalledFromProxy keeps detection when already installed', () => {
    const base: ToolkitDetection = {
      name: 'ponytail',
      installed: true,
      enabled: true,
      version: null,
      installPath: null,
      codebuddyIntegrated: true,
    }
    const result = ponytailToolkit.markInstalledFromProxy(base)
    expect(result).toBe(base)
  })
})
