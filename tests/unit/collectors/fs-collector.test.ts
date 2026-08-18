import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanFilesystem } from '@/collectors/fs-collector.js'
import type { PlatformAdapter } from '@/adapters/platform-adapter.js'

let root: string
let adapter: PlatformAdapter

const FLAT_SKILL = `---
name: xlsx
description: Spreadsheet skill
---
content`

const SUBDIR_SKILL = `---
name: find-skills
description: Discover skills
---
content`

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'stk-fs-'))
  const base = join(root, '.codebuddy')
  const mpDir = join(base, 'plugins', 'marketplaces', 'codebuddy-plugins-official', 'plugins')

  // Flat layout: SKILL.md sits directly in plugins/<pluginId>/
  mkdirSync(join(mpDir, 'xlsx'), { recursive: true })
  writeFileSync(join(mpDir, 'xlsx', 'SKILL.md'), FLAT_SKILL)

  // Subdir layout: multiple skills under plugins/<pluginId>/skills/
  mkdirSync(join(mpDir, 'find-skills', 'skills', 'find-skills'), { recursive: true })
  writeFileSync(join(mpDir, 'find-skills', 'skills', 'find-skills', 'SKILL.md'), SUBDIR_SKILL)

  // Cache-only plugin: marketplace dir empty, SKILL.md only in plugins/cache/
  // cache/<marketplace>/<pluginId>/<version>/SKILL.md
  const cachePlugin = join(
    base,
    'plugins',
    'cache',
    'codebuddy-plugins-official',
    'content-research-writer',
    'unknown',
  )
  mkdirSync(cachePlugin, { recursive: true })
  writeFileSync(
    join(cachePlugin, 'SKILL.md'),
    `---
name: content-research-writer
description: Writing helper
---
content`,
  )

  // settings.json enables both plugins under the marketplace.
  mkdirSync(join(base, 'plugins', 'marketplaces', 'codebuddy-plugins-official'), {
    recursive: true,
  })
  writeFileSync(
    join(base, 'settings.json'),
    JSON.stringify({
      enabledPlugins: {
        'xlsx@codebuddy-plugins-official': true,
        'find-skills@codebuddy-plugins-official': true,
        'content-research-writer@codebuddy-plugins-official': true,
      },
    }),
  )

  adapter = {
    name: 'codebuddy',
    supported: true,
    statusLabel: 'ok',
    resolveInstallPaths: () => ({ commandsDir: '', skillsDir: '' }),
    proxyEnvVar: '',
    proxyBasePath: '',
    triggerCommand: [],
    detectInstall: async () => true,
    getConfigPaths: () => ({
      mcp: join(base, '.mcp.json'),
      settings: join(base, 'settings.json'),
      codebuddyMd: join(base, 'CODEBUDDY.md'),
      skillsDir: join(base, 'skills'),
      commandsDir: join(base, 'commands'),
      rulesDir: join(base, 'rules'),
      agentsDir: join(base, 'agents'),
      pluginsMarketplacesDir: join(base, 'plugins', 'marketplaces'),
      historyFile: join(base, 'history.jsonl'),
      blobsDir: join(base, 'blobs'),
      cliBinary: 'codebuddy',
      projectCodebuddyMd: join(root, 'CODEBUDDY.md'),
      projectSkillsDir: join(root, '.codebuddy', 'skills'),
      projectCommandsDir: join(root, '.codebuddy', 'commands'),
      projectRulesDir: join(root, '.codebuddy', 'rules'),
    }),
    getHeadlessCommand: () => [],
    parseHeadlessOutput: () => null,
    capturePathPrefix: '/v2/',
    defaultApiBase: 'https://api.example.com',
  } as unknown as PlatformAdapter
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scanFilesystem marketplace skills', () => {
  it('classifies flat-layout plugin skills as plugin-marketplace', () => {
    const result = scanFilesystem(adapter)
    const byName = new Map(result.skillList.map((s) => [s.name, s]))
    const xlsx = byName.get('xlsx')
    expect(xlsx).toBeDefined()
    expect(xlsx?.source).toBe('plugin-marketplace')
    expect(xlsx?.sourcePath).toContain('plugins/xlsx/SKILL.md')
  })

  it('classifies subdir-layout plugin skills as plugin-marketplace', () => {
    const result = scanFilesystem(adapter)
    const byName = new Map(result.skillList.map((s) => [s.name, s]))
    expect(byName.get('find-skills')?.source).toBe('plugin-marketplace')
  })

  it('classifies cache-only plugin skills as plugin-marketplace', () => {
    const result = scanFilesystem(adapter)
    const byName = new Map(result.skillList.map((s) => [s.name, s]))
    const crw = byName.get('content-research-writer')
    expect(crw).toBeDefined()
    expect(crw?.source).toBe('plugin-marketplace')
    expect(crw?.sourcePath).toContain('plugins/cache/')
  })
})
