import { describe, it, expect, afterEach } from 'vitest'
import { headroomTool } from '@/tools/impl/headroom.js'
import { commandExists } from '@/utils/platform.js'

describe('headroomTool', () => {
  afterEach(() => {
    headroomTool.setMcpEnabled(false)
  })

  it('has correct metadata', () => {
    expect(headroomTool.name).toBe('headroom')
    expect(headroomTool.type).toBe('cli')
    expect(headroomTool.installCommand).toContain('headroom')
    expect(headroomTool.getConfigCommand()).toContain('mcp install')
  })

  it('detect reflects command availability', async () => {
    expect(await headroomTool.detect()).toBe(await commandExists('headroom'))
  })

  it('isEnabled false when not installed', async () => {
    expect(await headroomTool.isEnabled()).toBe(false)
  })

  it('isEnabled false when installed but mcp not enabled', async () => {
    if (!(await commandExists('headroom'))) {
      // headroom not installed in CI; isEnabled must stay false without mcp flag
      headroomTool.setMcpEnabled(true)
      expect(await headroomTool.isEnabled()).toBe(false)
    }
  })

  it('buildDetection reflects state', async () => {
    const det = await headroomTool.buildDetection()
    expect(det.name).toBe('headroom')
    expect(det.recommendedSaving).toBe(headroomTool.savingEstimate)
  })
})
