import { describe, it, expect, afterEach, vi } from 'vitest'
import { runInstall } from '@/commands/install.js'
import { registerTool, getTool } from '@/tools/index.js'
import { rtkTool } from '@/tools/impl/rtk.js'
import { headroomTool } from '@/tools/impl/headroom.js'
import type { SaveTokenTool, InstallResult } from '@/tools/types.js'

// A fake tool whose install just records the args it received.
function makeFakeTool(name: string): SaveTokenTool & { lastArgs: [boolean, string] | null } {
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
    buildDetection: () => Promise.resolve({ name, installed: true, enabled: true, version: null, installPath: null, codebuddyIntegrated: true, recommendedSaving: '0' }),
    getConfigCommand: () => '',
    install: async (global: boolean, agent: string): Promise<InstallResult> => {
      fake.lastArgs = [global, agent]
      return { tool: name, ok: true, steps: [{ cmd: 'true', ok: true }] }
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

  it('exits with error for reserved unsupported agent (claude)', async () => {
    await runInstall('rtk', { agent: 'claude' })
    expect(process.exitCode).toBe(1)
  })

  it('exits with error for unknown tool', async () => {
    await runInstall('does-not-exist', { agent: 'codebuddy' })
    expect(process.exitCode).toBe(1)
  })

  it('passes global=true and agent to the tool by default', async () => {
    const fake = makeFakeTool('faketool')
    registerTool(fake)
    await runInstall('faketool', { agent: 'codebuddy' })
    expect(fake.lastArgs).toEqual([true, 'codebuddy'])
    expect(process.exitCode).toBeUndefined()
  })

  it('passes global=false when --local is set', async () => {
    const fake = makeFakeTool('faketool2')
    registerTool(fake)
    await runInstall('faketool2', { local: true, agent: 'codebuddy' })
    expect(fake.lastArgs).toEqual([false, 'codebuddy'])
  })
})

describe('tool getConfigCommand', () => {
  it('rtk injects -g and agent', () => {
    expect(rtkTool.getConfigCommand('codebuddy', true)).toBe('rtk init -g --agent codebuddy')
    expect(rtkTool.getConfigCommand('codebuddy', false)).toBe('rtk init --agent codebuddy')
  })

  it('headroom config command is agent-agnostic', () => {
    expect(headroomTool.getConfigCommand('codebuddy', true)).toBe('headroom mcp install')
  })

  it('getTool finds registered tools', () => {
    expect(getTool('rtk')?.name).toBe('rtk')
    expect(getTool('headroom')?.name).toBe('headroom')
  })
})
