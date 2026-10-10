import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const HOME = join(process.cwd(), 'tests', '.tmp-i-have-adhd-home')

function writeSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(HOME, '.codebuddy'), { recursive: true })
  writeFileSync(
    join(HOME, '.codebuddy', 'settings.json'),
    JSON.stringify({ enabledPlugins }),
  )
}

function makeCtx(proxyPlugins: string[] = []): SpecContext {
  let settingsJson: SpecContext['settingsJson'] = null
  try {
    settingsJson = JSON.parse(
      readFileSync(join(HOME, '.codebuddy', 'settings.json'), 'utf8'),
    ) as SpecContext['settingsJson']
  } catch {
    // 无 settings.json
  }
  return {
    home: HOME,
    mcpList: [],
    hookList: [],
    proxyParsed: proxyPlugins.length > 0 ? { detectedPlugins: proxyPlugins } : null,
    settingsJson,
  }
}

function makeMarketplaceDir(): void {
  mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'i-have-adhd'), {
    recursive: true,
  })
}

function getTool() {
  return buildRegistry(loadRules(), {}).find((t) => t.name === 'i-have-adhd')!
}

describe('i-have-adhd（数据驱动）', () => {
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
    expect(t.name).toBe('i-have-adhd')
    expect(t.type).toBe('plugin')
    expect(loadRules().toolkits['i-have-adhd']?.install?.config).toBeUndefined()
  })

  it('detect false when marketplace dir missing', async () => {
    expect((await getTool().buildDetection(makeCtx())).installed).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    makeMarketplaceDir()
    expect((await getTool().buildDetection(makeCtx())).installed).toBe(true)
  })

  it('enabled false when plugin not enabled in settings', async () => {
    makeMarketplaceDir()
    writeSettings({ 'i-have-adhd@i-have-adhd': false })
    expect((await getTool().buildDetection(makeCtx())).enabled).toBe(false)
  })

  it('enabled true only when plugin enabled in settings', async () => {
    makeMarketplaceDir()
    writeSettings({ 'i-have-adhd@i-have-adhd': true })
    expect((await getTool().buildDetection(makeCtx())).enabled).toBe(true)
  })

  it('proxy marker marks installed when not installed（原 markInstalledFromProxy 语义）', async () => {
    const det = await getTool().buildDetection(makeCtx(['i-have-adhd']))
    expect(det.installed).toBe(true)
    expect(det.codebuddyIntegrated).toBe(true)
  })

  it('proxy marker keeps detection true when already installed', async () => {
    makeMarketplaceDir()
    writeSettings({ 'i-have-adhd@i-have-adhd': true })
    const det = await getTool().buildDetection(makeCtx(['i-have-adhd']))
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
  })
})
