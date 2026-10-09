import { describe, it, expect, afterEach } from 'vitest'
import { runInstall } from '@/commands/install.js'
import { registerToolkit, getToolkit } from '@/toolkits/index.js'
import { rtkToolkit } from '@/toolkits/impl/rtk.js'
import { headroomToolkit } from '@/toolkits/impl/headroom.js'
import type { SaveTokenToolkit, InstallResult } from '@/toolkits/types.js'

// A fake toolkit whose install just records the args it received.
function makeFakeToolkit(name: string): SaveTokenToolkit & { lastArgs: [boolean, string] | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fake: any = {
    name,
    description: 'fake',
    savingEstimate: '0',
    type: 'cli',
    installCommand: 'true',
    verifyCommand: 'true',
    uninstallCommand: '',
    lastArgs: null,
    detect: () => Promise.resolve(true),
    isEnabled: () => Promise.resolve(true),
    buildDetection: () =>
      Promise.resolve({
        name,
        installed: true,
        enabled: true,
        version: null,
        installPath: null,
        codebuddyIntegrated: true,
        recommendedSaving: '0',
      }),
    getConfigCommand: () => '',
    install: async (global: boolean, agent: string): Promise<InstallResult> => {
      fake.lastArgs = [global, agent]
      return { toolkit: name, ok: true, steps: [{ cmd: 'true', ok: true }] }
    },
  }
  return fake
}

describe('stk install', () => {
  afterEach(() => {
    process.exitCode = undefined
  })

  it('exits with error for unknown agent', async () => {
    await runInstall('rtk', { agent: 'nope' })
    expect(process.exitCode).toBe(1)
  })

  it('exits with error for unknown toolkit', async () => {
    await runInstall('does-not-exist', { agent: 'codebuddy' })
    expect(process.exitCode).toBe(1)
  })

  it('passes global=true and agent to the toolkit by default', async () => {
    const fake = makeFakeToolkit('faketoolkit')
    registerToolkit(fake)
    await runInstall('faketoolkit', { agent: 'codebuddy' })
    expect(fake.lastArgs).toEqual([true, 'codebuddy'])
    expect(process.exitCode).toBeUndefined()
  })

  it('passes global=false when --local is set', async () => {
    const fake = makeFakeToolkit('faketoolkit2')
    registerToolkit(fake)
    await runInstall('faketoolkit2', { local: true, agent: 'codebuddy' })
    expect(fake.lastArgs).toEqual([false, 'codebuddy'])
  })
})

describe('toolkit getConfigCommand', () => {
  it('rtk: 所有 agent 均返回 rtk init（codebuddy 的失败回退在 install() 内处理）', () => {
    expect(rtkToolkit.getConfigCommand('codebuddy', true)).toBe('rtk init -g --agent codebuddy')
    expect(rtkToolkit.getConfigCommand('claude', true)).toBe('rtk init -g --agent claude')
  })

  it('headroom config command is agent-agnostic', () => {
    expect(headroomToolkit.getConfigCommand('codebuddy', true)).toBe('headroom mcp install')
  })

  it('getToolkit finds registered toolkits', () => {
    expect(getToolkit('rtk')?.name).toBe('rtk')
    expect(getToolkit('headroom')?.name).toBe('headroom')
  })
})
