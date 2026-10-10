import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadRules } from '@/rules/loader.js'
import { getToolkit } from '@/toolkits/index.js'
import { buildRegistry } from '@/toolkits/data-registry.js'
import { configureNative } from '@/toolkits/handlers/rtk-native.js'
import type { RegistryDeps } from '@/toolkits/data-registry.js'
import type { SpecContext } from '@/toolkits/spec.js'

const TMP_HOME = join(process.cwd(), 'tests', '.tmp-rtk-home')

function writeConfigDir(): void {
  mkdirSync(join(TMP_HOME, '.codebuddy'), { recursive: true })
  writeFileSync(
    join(TMP_HOME, '.codebuddy', 'settings.json'),
    JSON.stringify({ model: 'glm-5' }),
  )
  writeFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), '# 全局规则\n')
}

/** 构造 rtk-native handler 的可注入 deps（默认 shell 记录器）。 */
function recorderDeps(failOn?: string): { deps: RegistryDeps; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    deps: {
      runShell: async (cmd) => {
        calls.push(cmd)
        if (cmd === failOn) return { exitCode: 1, stderr: 'boom' }
        return { exitCode: 0, stderr: '' }
      },
    },
  }
}

function getRtk(deps: RegistryDeps = {}) {
  return buildRegistry(loadRules(), deps).find((t) => t.name === 'rtk')!
}

describe('rtk（数据驱动 + rtk-native handler）', () => {
  const originalHome = process.env.HOME

  afterEach(() => {
    process.env.HOME = originalHome
    rmSync(TMP_HOME, { recursive: true, force: true })
  })

  it('has correct metadata（来自 fallback.json 数据）', () => {
    const t = getToolkit('rtk')!
    expect(t.name).toBe('rtk')
    expect(t.type).toBe('cli')
    expect(t.installCommand).toBe('brew install rtk')
    expect(loadRules().toolkits['rtk']?.install?.verify).toBe('rtk gain')
    expect(loadRules().toolkits['rtk']?.install?.handler).toBe('rtk-native')
  })

  it('detect reflects command availability（注入 mock）', async () => {
    const ctx: SpecContext = { home: TMP_HOME, mcpList: [], hookList: [], proxyParsed: null }
    expect((await getRtk({ commandExists: async (n) => n === 'rtk' }).buildDetection(ctx)).installed).toBe(true)
    expect((await getRtk({ commandExists: async () => false }).buildDetection(ctx)).installed).toBe(false)
  })

  it('enabled follows hook spec', async () => {
    const ctx: SpecContext = {
      home: TMP_HOME,
      mcpList: [],
      hookList: [{ event: 'PreToolUse', command: 'rtk hook claude' }],
      proxyParsed: null,
    }
    expect((await getRtk().buildDetection(ctx)).enabled).toBe(true)
    const emptyCtx: SpecContext = { home: TMP_HOME, mcpList: [], hookList: [], proxyParsed: null }
    expect((await getRtk().buildDetection(emptyCtx)).enabled).toBe(false)
  })

  it('buildDetection reflects state', async () => {
    const ctx: SpecContext = { home: TMP_HOME, mcpList: [], hookList: [], proxyParsed: null }
    const det = await getRtk({ commandExists: async (n) => n === 'rtk' }).buildDetection(ctx)
    expect(det.name).toBe('rtk')
    expect(det.codebuddyIntegrated).toBe(true)
    expect(det.recommendedSaving).toBe(loadRules().toolkits['rtk']?.saving)
  })

  it('claude 系 agent 透传：install → rtk init（-g 随 global 拼接）', async () => {
    const { deps, calls } = recorderDeps()
    const result = await getRtk(deps).install(true, 'claude')
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['brew install rtk', 'rtk init -g --agent claude'])
  })

  it('非 global 时剥离 -g', async () => {
    const { deps, calls } = recorderDeps()
    await getRtk(deps).install(false, 'claude')
    expect(calls).toEqual(['brew install rtk', 'rtk init --agent claude'])
  })

  it('install 步骤失败即终止', async () => {
    const { deps, calls } = recorderDeps('brew install rtk')
    const result = await getRtk(deps).install(true, 'claude')
    expect(result.ok).toBe(false)
    expect(calls).toEqual(['brew install rtk'])
    expect(result.steps[0]!.error).toContain('exitCode=1')
  })

  describe('codebuddy 原生回退（rtk init 失败 → configureNative 三件套）', () => {
    beforeEach(() => {
      rmSync(TMP_HOME, { recursive: true, force: true })
      process.env.HOME = TMP_HOME
      writeConfigDir()
    })

    it('完整流：install ok → rtk init 失败 → fallback 写入 settings/RTK.md/CODEBUDDY.md', async () => {
      const { deps, calls } = recorderDeps('rtk init -g --agent codebuddy')
      const result = await getRtk(deps).install(true, 'codebuddy')
      expect(calls[0]).toBe('brew install rtk')
      expect(result.steps.some((s) => s.cmd.startsWith('fallback:'))).toBe(true)
      expect(result.ok).toBe(true)

      const settings = JSON.parse(
        readFileSync(join(TMP_HOME, '.codebuddy', 'settings.json'), 'utf8'),
      ) as { hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> } }
      const cmds = (settings.hooks?.PreToolUse ?? []).flatMap((e) =>
        (e.hooks ?? []).map((h) => h.command ?? ''),
      )
      expect(cmds).toContain('rtk hook claude')
      expect(existsSync(join(TMP_HOME, '.codebuddy', 'RTK.md'))).toBe(true)
      expect(readFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), 'utf8')).toContain('@RTK.md')
    })

    it('configureNative：settings.json 注入 hook / RTK.md 写入 / CODEBUDDY.md 追加引用', () => {
      const steps = configureNative(true, 'codebuddy')
      expect(steps.every((s) => s.ok)).toBe(true)

      const settings = JSON.parse(
        readFileSync(join(TMP_HOME, '.codebuddy', 'settings.json'), 'utf8'),
      ) as { hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> } }
      const cmds = (settings.hooks?.PreToolUse ?? []).flatMap((e) =>
        (e.hooks ?? []).map((h) => h.command ?? ''),
      )
      expect(cmds).toContain('rtk hook claude')
      expect(existsSync(join(TMP_HOME, '.codebuddy', 'RTK.md'))).toBe(true)
      expect(readFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), 'utf8')).toContain('@RTK.md')
    })

    it('幂等：重复执行不产生重复 hook / 引用', () => {
      configureNative(true, 'codebuddy')
      configureNative(true, 'codebuddy')

      const settings = JSON.parse(
        readFileSync(join(TMP_HOME, '.codebuddy', 'settings.json'), 'utf8'),
      ) as { hooks?: { PreToolUse?: unknown[] } }
      expect(settings.hooks?.PreToolUse).toHaveLength(1)

      const md = readFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), 'utf8')
      expect(md.match(/@RTK.md/g)).toHaveLength(1)
    })

    it('配置文件缺失时自动创建', () => {
      rmSync(join(TMP_HOME, '.codebuddy', 'settings.json'), { force: true })
      rmSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), { force: true })
      const steps = configureNative(true, 'codebuddy')
      expect(steps.every((s) => s.ok)).toBe(true)
      expect(existsSync(join(TMP_HOME, '.codebuddy', 'settings.json'))).toBe(true)
      const md = readFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), 'utf8')
      expect(md).toContain('@RTK.md')
    })
  })
})
