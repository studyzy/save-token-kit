import { describe, it, expect } from 'vitest'
import { contextModeToolkit } from '@/toolkits/impl/context-mode.js'
import { commandExists } from '@/utils/platform.js'

describe('contextModeToolkit', () => {
  it('has correct metadata', () => {
    expect(contextModeToolkit.name).toBe('context-mode')
    expect(contextModeToolkit.type).toBe('plugin')
    expect(contextModeToolkit.installCommand).toContain('context-mode')
    expect(contextModeToolkit.verifyCommand).toContain('context-mode')
    expect(contextModeToolkit.getConfigCommand()).toContain('context-mode')
  })

  it('detect reflects command availability', async () => {
    expect(await contextModeToolkit.detect()).toBe(await commandExists('context-mode'))
  })

  it('isEnabled false until setMcpEnabled(true)', async () => {
    expect(await contextModeToolkit.isEnabled()).toBe(false)
    contextModeToolkit.setMcpEnabled(true)
    expect(await contextModeToolkit.isEnabled()).toBe(true)
  })

  it('buildDetection reflects mcp enabled state', async () => {
    contextModeToolkit.setMcpEnabled(true)
    const det = await contextModeToolkit.buildDetection()
    expect(det.name).toBe('context-mode')
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(contextModeToolkit.savingEstimate)
  })
})
