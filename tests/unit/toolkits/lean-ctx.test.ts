import { describe, it, expect } from 'vitest'
import { leanCtxToolkit } from '@/toolkits/impl/lean-ctx.js'
import { commandExists } from '@/utils/platform.js'

describe('leanCtxToolkit', () => {
  it('has correct metadata', () => {
    expect(leanCtxToolkit.name).toBe('lean-ctx')
    expect(leanCtxToolkit.type).toBe('cli')
    expect(leanCtxToolkit.installCommand).toContain('lean-ctx')
    expect(leanCtxToolkit.getConfigCommand()).toContain('setup')
  })

  it('detect reflects command availability', async () => {
    expect(await leanCtxToolkit.detect()).toBe(await commandExists('lean-ctx'))
  })

  it('isEnabled always false', async () => {
    expect(await leanCtxToolkit.isEnabled()).toBe(false)
  })

  it('buildDetection reflects state', async () => {
    const det = await leanCtxToolkit.buildDetection()
    expect(det.name).toBe('lean-ctx')
    expect(det.enabled).toBe(false)
    expect(det.recommendedSaving).toBe(leanCtxToolkit.savingEstimate)
  })
})
