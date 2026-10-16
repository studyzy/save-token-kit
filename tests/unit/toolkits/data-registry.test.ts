import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { getAllToolkits, getToolkit, getToolkitIds } from '@/toolkits/index.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import type { MergedRules, ToolkitCatalogEntry } from '@/types/rules.js'
import type { SpecContext } from '@/toolkits/spec.js'
import type { RegistryDeps } from '@/toolkits/data-registry.js'

/** Build a minimal MergedRules from constructed catalog entries. */
function makeMerged(entries: ToolkitCatalogEntry[]): MergedRules {
  return {
    lowFrequencyPlugins: new Set(),
    mcpAlternatives: {},
    toolkits: Object.fromEntries(entries.map((e) => [e.id, e])),
    thresholds: {},
    levels: {},
    prompts: {},
    rulesInfo: { packVersion: 'test', fallbackInUse: true, sources: [] },
  }
}

const baseCtx: SpecContext = {
  home: '/nonexistent-home',
  mcpList: [],
  hookList: [],
  proxyParsed: null,
}

function makeDeps(over: RegistryDeps = {}): RegistryDeps {
  return { ...over }
}

describe('registry (data-driven, real fallback.json)', () => {
  it('getAllToolkits returns all 13 toolkits from data', () => {
    // triggers module-level registry built from loadRules()
    expect(getAllToolkits()).toHaveLength(13)
  })

  it('getToolkit finds rtk from data; unknown id is undefined', () => {
    const rtk = getToolkit('rtk')
    expect(rtk).toBeDefined()
    expect(rtk!.name).toBe('rtk')
    expect(rtk!.installCommand).toBe('brew install rtk')
    expect(getToolkit('nonexistent')).toBeUndefined()
  })

  it('getToolkitIds matches the registry keys', () => {
    const ids = getToolkitIds()
    expect(ids).toHaveLength(13)
    expect(ids).toContain('rtk')
    expect(ids).toContain('context-mode')
  })
})

describe('buildRegistry + buildDetection (constructed data, injected deps)', () => {
  const entries: ToolkitCatalogEntry[] = [
    {
      id: 'cli-tool',
      type: 'cli',
      detect: { kind: 'command', name: 'cli-tool' },
      saving: 'X 输出压缩',
      install: { default: 'brew install cli-tool' },
    },
    {
      id: 'plugin-tool',
      type: 'plugin',
      detect: { kind: 'path', path: '~/pt-dir' },
      install: { default: 'noop' },
    },
  ]

  function makeHome(withDir: boolean): string {
    const home = mkdtempSync(join(tmpdir(), 'stk-reg-'))
    if (withDir) mkdirSync(join(home, 'pt-dir'), { recursive: true })
    return home
  }

  it('detect spec hit → installed true; cli default enabled=false', async () => {
    const deps = makeDeps({ commandExists: async (n) => n === 'cli-tool' })
    const [t] = buildRegistry(makeMerged(entries), deps)
    const cli = t!
    const det = await cli.buildDetection(baseCtx)
    expect(det.name).toBe('cli-tool')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(false) // cli 缺省 enabled = false
    expect(det.version).toBeNull()
    expect(det.installPath).toBeNull()
    expect(det.codebuddyIntegrated).toBe(true) // installed 即 true
    expect(det.recommendedSaving).toBe('X 输出压缩') // 来自数据 saving
  })

  it('detect spec miss → installed false; codebuddyIntegrated false', async () => {
    const deps = makeDeps({ commandExists: async () => false })
    const [t] = buildRegistry(makeMerged(entries), deps)
    const det = await t!.buildDetection(baseCtx)
    expect(det.installed).toBe(false)
    expect(det.enabled).toBe(false)
    expect(det.codebuddyIntegrated).toBe(false)
  })

  it('plugin 默认 enabled = installed（目录在→true，目录缺→false）', async () => {
    const deps = makeDeps({})
    const pt = buildRegistry(makeMerged(entries), deps).find((t) => t.name === 'plugin-tool')

    const homeWith = makeHome(true)
    const detOn = await pt!.buildDetection({ ...baseCtx, home: homeWith })
    expect(detOn.installed).toBe(true)
    expect(detOn.enabled).toBe(true)

    const homeWithout = makeHome(false)
    const detOff = await pt!.buildDetection({ ...baseCtx, home: homeWithout })
    expect(detOff.installed).toBe(false)
    expect(detOff.enabled).toBe(false)

    rmSync(homeWith, { recursive: true, force: true })
    rmSync(homeWithout, { recursive: true, force: true })
  })

  it('enabled spec 命中 → enabled true（hook 原语）', async () => {
    const entry: ToolkitCatalogEntry = {
      id: 'hooked',
      type: 'cli',
      detect: { kind: 'command', name: 'hooked' },
      enabled: { kind: 'hook', event: 'PreToolUse', match: 'hooked' },
      install: { default: 'noop' },
    }
    const [t] = buildRegistry(makeMerged([entry]), makeDeps({ commandExists: async () => true }))
    const ctx: SpecContext = {
      ...baseCtx,
      hookList: [{ event: 'PreToolUse', command: 'hooked hook claude' }],
    }
    expect((await t!.buildDetection(ctx)).enabled).toBe(true)
    expect((await t!.buildDetection(baseCtx)).enabled).toBe(false)
  })

  it('enabled 含 proxy-plugin 且命中 → installed 被覆盖为 true（ponytail 语义）', async () => {
    const entry: ToolkitCatalogEntry = {
      id: 'pp',
      type: 'plugin',
      detect: { kind: 'path', path: '~/pp-dir' },
      enabled: { kind: 'proxy-plugin', name: 'pp' },
      install: { default: 'noop' },
    }
    const [t] = buildRegistry(makeMerged([entry]), makeDeps({}))
    const ctx: SpecContext = { ...baseCtx, proxyParsed: { detectedPlugins: ['pp'] } }
    const det = await t!.buildDetection(ctx)
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
    expect(det.codebuddyIntegrated).toBe(true)
  })

  it('数据缺 detect 的条目不进注册表', () => {
    const merged = makeMerged([
      { id: 'no-detect', type: 'cli', install: { default: 'noop' } },
      { id: 'has-detect', type: 'cli', detect: { kind: 'command', name: 'x' } },
    ])
    const reg = buildRegistry(merged, makeDeps({}))
    expect(reg.map((t) => t.name)).toEqual(['has-detect'])
  })
})

/** 构造一个带 detect 的通用安装测试条目。 */
const entryWith = (install: ToolkitCatalogEntry['install']): ToolkitCatalogEntry => ({
  id: 'g-tool',
  type: 'cli',
  detect: { kind: 'command', name: 'g-tool' },
  install,
})

describe('generic install (mock runShell)', () => {
  function recorderDeps(failOn?: string): { deps: RegistryDeps; calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      deps: makeDeps({
        runShell: async (cmd) => {
          calls.push(cmd)
          if (cmd === failOn) return { exitCode: 1, stderr: 'boom' }
          return { exitCode: 0, stderr: '' }
        },
      }),
    }
  }

  it('按序执行 default → config（config.byAgent 优先于 config.default，{agent} 替换）', async () => {
    const { deps, calls } = recorderDeps()
    const [t] = buildRegistry(
      makeMerged([
        entryWith({
          default: 'install g-tool',
          config: {
            default: 'g setup --agent {agent}',
            byAgent: { codebuddy: 'g config-cb --agent {agent}' },
          },
        }),
      ]),
      deps,
    )
    const result = await t!.install(false, 'codebuddy')
    expect(calls).toEqual(['install g-tool', 'g config-cb --agent codebuddy'])
    expect(result.toolkit).toBe('g-tool')
    expect(result.ok).toBe(true)
    expect(result.steps.map((s) => s.cmd)).toEqual(calls)
    expect(result.steps.every((s) => s.ok)).toBe(true)
  })

  it('无 byAgent 时回退 config.default；global=false 剥离 -g', async () => {
    const { deps, calls } = recorderDeps()
    const [t] = buildRegistry(
      makeMerged([
        entryWith({ default: 'install g-tool', config: { default: 'g init -g --agent {agent}' } }),
      ]),
      deps,
    )
    await t!.install(false, 'claude')
    expect(calls).toEqual(['install g-tool', 'g init --agent claude'])
    await t!.install(true, 'claude')
    expect(calls[3]).toBe('g init -g --agent claude')
  })

  it('步骤失败即终止：ok=false，error 含退出码，后续不执行', async () => {
    const { deps, calls } = recorderDeps('install g-tool')
    const [t] = buildRegistry(
      makeMerged([entryWith({ default: 'install g-tool', config: { default: 'g setup' } })]),
      deps,
    )
    const result = await t!.install(false, 'codebuddy')
    expect(result.ok).toBe(false)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.ok).toBe(false)
    expect(result.steps[0]!.error).toContain('exitCode=1')
    expect(calls).toEqual(['install g-tool'])
  })

  it('runShell 抛异常 → ok=false，error 为异常消息，config 步骤不执行', async () => {
    const calls: string[] = []
    const deps = makeDeps({
      runShell: async (cmd) => {
        calls.push(cmd)
        if (cmd === 'install g-tool') throw new Error('spawn ENOENT')
        return { exitCode: 0, stderr: '' }
      },
    })
    const [t] = buildRegistry(
      makeMerged([entryWith({ default: 'install g-tool', config: { default: 'g setup' } })]),
      deps,
    )
    const result = await t!.install(false, 'codebuddy')
    expect(result.ok).toBe(false)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.ok).toBe(false)
    expect(result.steps[0]!.error).toBe('spawn ENOENT')
    expect(calls).toEqual(['install g-tool'])
  })

  it('config 步骤失败：install 成功后终止，ok=false 且含 config 失败记录', async () => {
    const calls: string[] = []
    const deps = makeDeps({
      runShell: async (cmd) => {
        calls.push(cmd)
        if (cmd === 'g setup') return { exitCode: 3, stderr: 'config boom' }
        return { exitCode: 0, stderr: '' }
      },
    })
    const [t] = buildRegistry(
      makeMerged([entryWith({ default: 'install g-tool', config: { default: 'g setup' } })]),
      deps,
    )
    const result = await t!.install(false, 'codebuddy')
    expect(result.ok).toBe(false)
    expect(calls).toEqual(['install g-tool', 'g setup'])
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]!.ok).toBe(true)
    expect(result.steps[1]!.ok).toBe(false)
    expect(result.steps[1]!.error).toContain('exitCode=3')
  })

  it('无 install.default 时为空步骤成功（byAgent 仅展示不执行）', async () => {
    const { deps, calls } = recorderDeps()
    const [t] = buildRegistry(
      makeMerged([entryWith({ byAgent: { codebuddy: 'prose not a command' } })]),
      deps,
    )
    const result = await t!.install(false, 'codebuddy')
    expect(result.ok).toBe(true)
    expect(result.steps).toEqual([])
    expect(calls).toEqual([])
  })
})

describe('handler 路由', () => {
  it("install.handler: 'rtk-native' 整体委托 handler（非 native agent 走透传两步）", async () => {
    const calls: string[] = []
    const deps = makeDeps({
      runShell: async (cmd) => {
        calls.push(cmd)
        return { exitCode: 0, stderr: '' }
      },
    })
    const entry: ToolkitCatalogEntry = {
      id: 'rtklike',
      type: 'cli',
      detect: { kind: 'command', name: 'rtklike' },
      install: {
        default: 'brew install rtklike',
        config: { default: 'rtklike init -g --agent {agent}' },
        handler: 'rtk-native',
      },
    }
    const [t] = buildRegistry(makeMerged([entry]), deps)
    const result = await t!.install(true, 'claude')
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['brew install rtklike', 'rtklike init -g --agent claude'])
  })

  it('未知 handler → 失败步骤并报错', async () => {
    const deps = makeDeps({})
    const entry: ToolkitCatalogEntry = {
      id: 'bad',
      type: 'cli',
      detect: { kind: 'command', name: 'bad' },
      install: { default: 'noop', handler: 'no-such-handler' },
    }
    const [t] = buildRegistry(makeMerged([entry]), deps)
    const result = await t!.install(false, 'codebuddy')
    expect(result.ok).toBe(false)
    expect(result.steps[0]!.ok).toBe(false)
    expect(result.steps[0]!.error).toContain('no-such-handler')
  })
})

describe('真实 loadRules 数据冒烟（verify 字段仅存档不执行）', () => {
  it('loadRules 提供 13 工具 merged 数据', () => {
    const merged = loadRules()
    expect(Object.keys(merged.toolkits)).toHaveLength(13)
    expect(merged.toolkits['rtk']!.install?.verify).toBe('rtk gain')
    expect(merged.toolkits['rtk']!.install?.handler).toBe('rtk-native')
  })

  it('generic install 不执行 install.verify（旧行为等价：verify 仅存档）', async () => {
    const calls: string[] = []
    const deps = makeDeps({
      runShell: async (cmd) => {
        calls.push(cmd)
        return { exitCode: 0, stderr: '' }
      },
    })
    const [t] = buildRegistry(
      makeMerged([
        entryWith({
          default: 'install g-tool',
          verify: 'g-tool --version',
          config: { default: 'g setup' },
        }),
      ]),
      deps,
    )
    await t!.install(false, 'codebuddy')
    expect(calls).toEqual(['install g-tool', 'g setup'])
  })
})
