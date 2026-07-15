import { describe, it, expect } from 'vitest'
import { BaseSaveTokenTool } from '@/tools/types.js'
import type { ToolId } from '@/types/index.js'
import type { ToolDetection } from '@/types/index.js'

class StubTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'rtk' // reuse a valid id for the type union
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

describe('BaseSaveTokenTool', () => {
  it('buildDetection aggregates detect/isEnabled', async () => {
    const tool = new StubTool('true')
    const det = await tool.buildDetection()
    expect(det).toMatchObject({
      name: 'rtk',
      installed: true,
      enabled: false,
      version: null,
      installPath: null,
      codebuddyIntegrated: true,
      recommendedSaving: 'stub',
    } satisfies ToolDetection)
  })

  it('install succeeds when install command exits 0 and no config', async () => {
    const tool = new StubTool('true')
    const result = await tool.runInstall(false, 'codebuddy')
    expect(result.ok).toBe(true)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].ok).toBe(true)
  })

  it('install runs config command when provided', async () => {
    const tool = new StubTool('true')
    tool.getConfigCommand = () => 'true'
    const result = await tool.runInstall(false, 'codebuddy')
    expect(result.ok).toBe(true)
    expect(result.steps).toHaveLength(2)
    expect(result.steps.every((s) => s.ok)).toBe(true)
  })
})
