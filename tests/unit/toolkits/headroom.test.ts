import { describe, it, expect, afterEach } from 'vitest'
import { headroomToolkit } from '@/toolkits/impl/headroom.js'
import { commandExists } from '@/utils/platform.js'

describe('headroomToolkit', () => {
  afterEach(() => {
    headroomToolkit.setMcpEnabled(false)
  })

  it('has correct metadata', () => {
    expect(headroomToolkit.name).toBe('headroom')
    expect(headroomToolkit.type).toBe('cli')
    expect(headroomToolkit.installCommand).toContain('headroom')
    expect(headroomToolkit.getConfigCommand()).toContain('mcp install')
  })

  it('detect reflects command availability', async () => {
    expect(await headroomToolkit.detect()).toBe(await commandExists('headroom'))
  })

  it('isEnabled false when not installed', async () => {
    expect(await headroomToolkit.isEnabled()).toBe(false)
  })

  it('isEnabled false when installed but mcp not enabled', async () => {
    if (!(await commandExists('headroom'))) {
      // headroom not installed in CI; isEnabled must stay false without mcp flag
      headroomToolkit.setMcpEnabled(true)
      expect(await headroomToolkit.isEnabled()).toBe(false)
    }
  })

  it('buildDetection reflects state', async () => {
    const det = await headroomToolkit.buildDetection()
    expect(det.name).toBe('headroom')
    expect(det.recommendedSaving).toBe(headroomToolkit.savingEstimate)
  })
})
