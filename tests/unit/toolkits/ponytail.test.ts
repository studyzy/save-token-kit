import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const HOME = join(process.cwd(), 'tests', '.tmp-ponytail-home')

const settingsPath = () => join(HOME, '.codebuddy', 'settings.json')

function writeSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(HOME, '.codebuddy'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify({ enabledPlugins }))
}

function makeCtx(proxyPlugins: string[] = []): SpecContext {
  let settingsJson: SpecContext['settingsJson'] = null
  try {
    settingsJson = JSON.parse(readFileSync(settingsPath(), 'utf8')) as SpecContext['settingsJson']
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

function getPonytail() {
  return buildRegistry(loadRules(), {}).find((t) => t.name === 'ponytail')!
}

function makeMarketplaceDir(): void {
  mkdirSync(join(HOME, '.codebuddy', 'plugins', 'marketplaces', 'ponytail'), {
    recursive: true,
  })
}

describe('ponytail（数据驱动）', () => {
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
    const t = getPonytail()
    expect(t.name).toBe('ponytail')
    expect(t.type).toBe('plugin')
    expect(loadRules().toolkits['ponytail']?.install?.config).toBeUndefined()
  })

  it('detect false when marketplace dir missing', async () => {
    expect((await getPonytail().buildDetection(makeCtx())).installed).toBe(false)
  })

  it('detect true when marketplace dir present', async () => {
    makeMarketplaceDir()
    expect((await getPonytail().buildDetection(makeCtx())).installed).toBe(true)
  })

  it('enabled false when plugin not enabled in settings', async () => {
    makeMarketplaceDir()
    writeSettings({ 'ponytail@ponytail': false })
    expect((await getPonytail().buildDetection(makeCtx())).enabled).toBe(false)
  })

  it('enabled true only when plugin enabled in settings', async () => {
    makeMarketplaceDir()
    writeSettings({ 'ponytail@ponytail': true })
    expect((await getPonytail().buildDetection(makeCtx())).enabled).toBe(true)
  })

  it('proxy marker marks installed when not installed（原 markInstalledFromProxy 语义）', async () => {
    const det = await getPonytail().buildDetection(makeCtx(['ponytail']))
    expect(det.installed).toBe(true)
    expect(det.codebuddyIntegrated).toBe(true)
  })

  it('proxy marker keeps detection true when already installed', async () => {
    makeMarketplaceDir()
    writeSettings({ 'ponytail@ponytail': true })
    const det = await getPonytail().buildDetection(makeCtx(['ponytail']))
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
  })
})
