import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const HOME = join(process.cwd(), 'tests', '.tmp-caveman-home')

const settingsPath = () => join(HOME, '.codebuddy', 'settings.json')

function writeSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(HOME, '.codebuddy'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify({ enabledPlugins }))
}

function readSettingsJson(): SpecContext['settingsJson'] {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8')) as SpecContext['settingsJson']
  } catch {
    return null
  }
}

function makeCtx(): SpecContext {
  return {
    home: HOME,
    mcpList: [],
    hookList: [],
    proxyParsed: null,
    settingsJson: readSettingsJson(),
  }
}

function getCaveman() {
  return buildRegistry(loadRules(), {}).find((t) => t.name === 'caveman')!
}

describe('caveman（数据驱动）', () => {
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
    const t = getCaveman()
    expect(t.name).toBe('caveman')
    expect(t.type).toBe('plugin')
    expect(t.installCommand).toContain('caveman')
    expect(loadRules().toolkits['caveman']?.install?.config).toBeUndefined()
  })

  it('detect false when marketplace dir missing', async () => {
    expect((await getCaveman().buildDetection(makeCtx())).installed).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    expect((await getCaveman().buildDetection(makeCtx())).installed).toBe(true)
  })

  it('enabled false when plugin not enabled in settings', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    writeSettings({ 'caveman@caveman': false })
    expect((await getCaveman().buildDetection(makeCtx())).enabled).toBe(false)
  })

  it('enabled true only when plugin enabled in settings', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    writeSettings({ 'caveman@caveman': true })
    expect((await getCaveman().buildDetection(makeCtx())).enabled).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'caveman'), {
      recursive: true,
    })
    writeSettings({ 'caveman@caveman': true })
    const det = await getCaveman().buildDetection(makeCtx())
    expect(det.name).toBe('caveman')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
    expect(det.codebuddyIntegrated).toBe(true)
    expect(det.recommendedSaving).toBe(loadRules().toolkits['caveman']?.saving)
  })
})
