import { describe, it, expect } from 'vitest'
import { leanCtxTool } from '@/tools/impl/lean-ctx.js'
import { commandExists } from '@/utils/platform.js'

describe('leanCtxTool', () => {
  it('has correct metadata', () => {
    expect(leanCtxTool.name).toBe('lean-ctx')
    expect(leanCtxTool.type).toBe('cli')
    expect(leanCtxTool.installCommand).toContain('lean-ctx')
    expect(leanCtxTool.getConfigCommand()).toContain('setup')
  })

  it('detect reflects command availability', async () => {
    expect(await leanCtxTool.detect()).toBe(await commandExists('lean-ctx'))
  })

  it('isEnabled always false', async () => {
    expect(await leanCtxTool.isEnabled()).toBe(false)
  })

  it('buildDetection reflects state', async () => {
    const det = await leanCtxTool.buildDetection()
    expect(det.name).toBe('lean-ctx')
    expect(det.enabled).toBe(false)
    expect(det.recommendedSaving).toBe(leanCtxTool.savingEstimate)
  })
})
