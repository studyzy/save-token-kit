import { describe, it, expect } from 'vitest'
import { BaseSaveTokenToolkit } from '@/toolkits/types.js'
import type { ToolkitId } from '@/types/index.js'
import type { ToolkitDetection } from '@/types/index.js'

class StubToolkit extends BaseSaveTokenToolkit {
  readonly name: ToolkitId = 'rtk' // reuse a valid id for the type union
  readonly description = 'stub'
  readonly savingEstimate = 'stub'
  readonly type = 'cli' as const
  readonly installCommand: string
  readonly verifyCommand = 'true'
  constructor(installCommand: string) {
    super()
    this.installCommand = installCommand
  }
  detect(): Promise<boolean> {
    return Promise.resolve(true)
  }
  isEnabled(): Promise<boolean> {
    return Promise.resolve(false)
  }
  // expose protected install for testing
  async runInstall(global: boolean, agent: string) {
    return super.install(global, agent)
  }
}

describe('BaseSaveTokenToolkit', () => {
  it('buildDetection aggregates detect/isEnabled', async () => {
    const toolkit = new StubToolkit('true')
    const det = await toolkit.buildDetection()
    expect(det).toMatchObject({
      name: 'rtk',
      installed: true,
      enabled: false,
      version: null,
      installPath: null,
      codebuddyIntegrated: true,
      recommendedSaving: 'stub',
    } satisfies ToolkitDetection)
  })

  it('install succeeds when install command exits 0 and no config', async () => {
    const toolkit = new StubToolkit('true')
    const result = await toolkit.runInstall(false, 'codebuddy')
    expect(result.ok).toBe(true)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].ok).toBe(true)
  })

  it('install runs config command when provided', async () => {
    const toolkit = new StubToolkit('true')
    toolkit.getConfigCommand = () => 'true'
    const result = await toolkit.runInstall(false, 'codebuddy')
    expect(result.ok).toBe(true)
    expect(result.steps).toHaveLength(2)
    expect(result.steps.every((s) => s.ok)).toBe(true)
  })
})
