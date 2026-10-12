import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

    it('native install 步骤失败即终止（ok=false，不执行 rtk init）', async () => {
      const { deps, calls } = recorderDeps('brew install rtk')
      const result = await getRtk(deps).install(true, 'codebuddy')
      expect(result.ok).toBe(false)
      expect(calls).toEqual(['brew install rtk'])
      expect(result.steps).toHaveLength(1)
      expect(result.steps[0]!.ok).toBe(false)
      expect(result.steps[0]!.error).toContain('exitCode=1')
    })

    it('rtk init 成功且产物齐备 → 走 verify 成功路径，无 fallback', async () => {
      // 预置全部产物：settings.json 含 rtk hook、RTK.md、CODEBUDDY.md 含 @RTK.md
      const settingsPath = join(TMP_HOME, '.codebuddy', 'settings.json')
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
        hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> }
      }
      settings.hooks = { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk hook claude' }] }] }
      writeFileSync(settingsPath, JSON.stringify(settings))
      writeFileSync(join(TMP_HOME, '.codebuddy', 'RTK.md'), '# RTK\n')
      writeFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), '# 规则\n@RTK.md\n')

      const { deps, calls } = recorderDeps()
      const result = await getRtk(deps).install(true, 'codebuddy')
      expect(calls).toEqual(['brew install rtk', 'rtk init -g --agent codebuddy'])
      expect(result.ok).toBe(true)
      expect(result.steps.some((s) => s.cmd.startsWith('fallback:'))).toBe(false)
      expect(result.steps.some((s) => s.cmd.startsWith('verify: rtk init 已完成全部配置'))).toBe(true)
    })

    it('fallback 写入失败：只读目录 → RTK.md 写入与 @RTK.md 追加均报错，ok=false', async () => {
      // settings 已含 hook（跳过 settings 写入）；目录只读使后续文件写入失败
      const dir = join(TMP_HOME, '.codebuddy')
      const settingsPath = join(dir, 'settings.json')
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
        hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> }
      }
      settings.hooks = { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk hook claude' }] }] }
      writeFileSync(settingsPath, JSON.stringify(settings))
      // 删除主文件：写入已存在文件无需目录写权限，需走「创建新文件」路径才能触发失败
      rmSync(join(dir, 'CODEBUDDY.md'), { force: true })
      chmodSync(dir, 0o555)

      try {
        const { deps } = recorderDeps('rtk init -g --agent codebuddy')
        const result = await getRtk(deps).install(true, 'codebuddy')
        expect(result.ok).toBe(false)
        expect(result.steps.some((s) => s.cmd.startsWith('RTK.md 写入失败'))).toBe(true)
        expect(result.steps.some((s) => s.cmd.includes('追加 @RTK.md 失败'))).toBe(true)
        expect(result.steps.every((s) => s.ok || (s.error ?? '').length > 0)).toBe(true)
      } finally {
        chmodSync(dir, 0o755)
      }
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
