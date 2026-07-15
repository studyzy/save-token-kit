import { describe, it, expect, afterEach } from 'vitest'
import { rtkTool } from '@/tools/impl/rtk.js'
import { commandExists } from '@/utils/platform.js'

describe('rtkTool', () => {
  afterEach(() => {
    rtkTool.setHookEnabled(false)
  })

  it('has correct metadata', () => {
    expect(rtkTool.name).toBe('rtk')
    expect(rtkTool.type).toBe('cli')
    expect(rtkTool.installCommand).toContain('rtk')
    expect(rtkTool.getConfigCommand('codebuddy', false)).toContain('--agent codebuddy')
  })

  it('detect reflects command availability', async () => {
    expect(await rtkTool.detect()).toBe(await commandExists('rtk'))
  })

  it('isEnabled false by default, true after setHookEnabled', async () => {
    expect(await rtkTool.isEnabled()).toBe(false)
    rtkTool.setHookEnabled(true)
    expect(await rtkTool.isEnabled()).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    const det = await rtkTool.buildDetection()
    expect(det.name).toBe('rtk')
    expect(det.codebuddyIntegrated).toBe(await commandExists('rtk'))
    expect(det.recommendedSaving).toBe(rtkTool.savingEstimate)
  })
})
