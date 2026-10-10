import { describe, it, expect, afterEach } from 'vitest'
import { runInstall } from '@/commands/install.js'
import { registerToolkit, getToolkit } from '@/toolkits/index.js'
import { loadRules } from '@/rules/loader.js'
import type { DataToolkit } from '@/toolkits/data-registry.js'
import type { InstallResult } from '@/toolkits/types.js'

// A fake toolkit whose install just records the args it received.
function makeFakeToolkit(name: string): DataToolkit & { lastArgs: [boolean, string] | null } {
  const fake: DataToolkit & { lastArgs: [boolean, string] | null } = {
    name,
    description: 'fake',
    type: 'cli',
    installCommand: 'true',
    lastArgs: null,
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

describe('toolkit registry（数据驱动）', () => {
  it('getToolkit finds data-driven toolkits', () => {
    expect(getToolkit('rtk')?.name).toBe('rtk')
    expect(getToolkit('headroom')?.name).toBe('headroom')
  })

  it('headroom config command is agent-agnostic（来自数据）', () => {
    expect(loadRules().toolkits['headroom']?.install?.config?.default).toBe('headroom mcp install')
  })

  it('rtk installCommand 来自数据', () => {
    expect(getToolkit('rtk')?.installCommand).toBe('brew install rtk')
  })
})
