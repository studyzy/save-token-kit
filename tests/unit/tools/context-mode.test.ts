import { describe, it, expect } from 'vitest'
import { contextModeTool } from '@/tools/impl/context-mode.js'
import { commandExists } from '@/utils/platform.js'

describe('contextModeTool', () => {
  it('has correct metadata', () => {
    expect(contextModeTool.name).toBe('context-mode')
    expect(contextModeTool.type).toBe('plugin')
    expect(contextModeTool.installCommand).toContain('context-mode')
    expect(contextModeTool.verifyCommand).toContain('context-mode')
    expect(contextModeTool.getConfigCommand()).toContain('context-mode')
  })

  it('detect reflects command availability', async () => {
    expect(await contextModeTool.detect()).toBe(await commandExists('context-mode'))
  })

  it('isEnabled false until setMcpEnabled(true)', async () => {
    expect(await contextModeTool.isEnabled()).toBe(false)
    contextModeTool.setMcpEnabled(true)
    expect(await contextModeTool.isEnabled()).toBe(true)
  })

  it('buildDetection reflects mcp enabled state', async () => {
    contextModeTool.setMcpEnabled(true)
    const det = await contextModeTool.buildDetection()
    expect(det.name).toBe('context-mode')
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(contextModeTool.savingEstimate)
  })
})
