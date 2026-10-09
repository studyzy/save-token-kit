import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rtkToolkit } from '@/toolkits/impl/rtk.js'
import { commandExists } from '@/utils/platform.js'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TMP_HOME = join(process.cwd(), 'tests', '.tmp-rtk-home')

function writeConfigDir(): void {
  mkdirSync(join(TMP_HOME, '.codebuddy'), { recursive: true })
  writeFileSync(
    join(TMP_HOME, '.codebuddy', 'settings.json'),
    JSON.stringify({ model: 'glm-5' }),
  )
  writeFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), '# 全局规则\n')
}

describe('rtkToolkit', () => {
  const originalHome = process.env.HOME

  afterEach(() => {
    rtkToolkit.setHookEnabled(false)
    process.env.HOME = originalHome
    rmSync(TMP_HOME, { recursive: true, force: true })
  })

  it('has correct metadata', () => {
    expect(rtkToolkit.name).toBe('rtk')
    expect(rtkToolkit.type).toBe('cli')
    expect(rtkToolkit.installCommand).toContain('rtk')
  })

  it('getConfigCommand: claude/codex 透传 rtk init', () => {
    expect(rtkToolkit.getConfigCommand('claude', true)).toContain('--agent claude')
    expect(rtkToolkit.getConfigCommand('codex', false)).toContain('--agent codex')
  })

  it('getConfigCommand: 所有 agent 均透传 rtk init（codebuddy 由 install() 负责失败回退）', () => {
    expect(rtkToolkit.getConfigCommand('codebuddy', true)).toBe('rtk init -g --agent codebuddy')
    expect(rtkToolkit.getConfigCommand('workbuddy', false)).toBe('rtk init --agent workbuddy')
    expect(rtkToolkit.getConfigCommand('claude', true)).toBe('rtk init -g --agent claude')
  })

  it('detect reflects command availability', async () => {
    expect(await rtkToolkit.detect()).toBe(await commandExists('rtk'))
  })

  it('isEnabled false by default, true after setHookEnabled', async () => {
    expect(await rtkToolkit.isEnabled()).toBe(false)
    rtkToolkit.setHookEnabled(true)
    expect(await rtkToolkit.isEnabled()).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    const det = await rtkToolkit.buildDetection()
    expect(det.name).toBe('rtk')
    expect(det.codebuddyIntegrated).toBe(await commandExists('rtk'))
    expect(det.recommendedSaving).toBe(rtkToolkit.savingEstimate)
  })

  describe('configureNative (codebuddy 回退 claude 语义)', () => {
    beforeEach(() => {
      rmSync(TMP_HOME, { recursive: true, force: true })
      process.env.HOME = TMP_HOME
      writeConfigDir()
    })

    it('settings.json 注入 hook / RTK.md 写入 / CODEBUDDY.md 追加引用', () => {
      const steps = rtkToolkit.configureNative(true, 'codebuddy')
      expect(steps.every((s) => s.ok)).toBe(true)

      const settings = JSON.parse(
        readFileSync(join(TMP_HOME, '.codebuddy', 'settings.json'), 'utf8'),
      ) as { hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> } }
      const cmds = (settings.hooks?.PreToolUse ?? []).flatMap((e) =>
        (e.hooks ?? []).map((h) => h.command ?? ''),
      )
      expect(cmds).toContain('rtk hook claude')

      expect(existsSync(join(TMP_HOME, '.codebuddy', 'RTK.md'))).toBe(true)

      const md = readFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), 'utf8')
      expect(md).toContain('@RTK.md')
    })

    it('幂等：重复执行不产生重复 hook / 引用', () => {
      rtkToolkit.configureNative(true, 'codebuddy')
      rtkToolkit.configureNative(true, 'codebuddy')

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
      const steps = rtkToolkit.configureNative(true, 'codebuddy')
      expect(steps.every((s) => s.ok)).toBe(true)
      expect(existsSync(join(TMP_HOME, '.codebuddy', 'settings.json'))).toBe(true)
      const md = readFileSync(join(TMP_HOME, '.codebuddy', 'CODEBUDDY.md'), 'utf8')
      expect(md).toContain('@RTK.md')
    })
  })
})
