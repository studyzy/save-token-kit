import { describe, it, expect, vi, afterEach } from 'vitest'
import { graphifyTool } from '@/tools/impl/graphify.js'
import { commandExists } from '@/utils/platform.js'
import * as fsOps from '@/utils/fs-operations.js'

describe('graphifyTool', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has correct metadata', () => {
    expect(graphifyTool.name).toBe('graphify')
    expect(graphifyTool.type).toBe('cli')
    expect(graphifyTool.installCommand).toContain('graphify')
    expect(graphifyTool.getConfigCommand('codebuddy')).toContain('--platform codebuddy')
  })

  it('detect reflects command availability', async () => {
    expect(await graphifyTool.detect()).toBe(await commandExists('graphify'))
  })

  it('isEnabled is false when graphify-out is absent', async () => {
    vi.spyOn(fsOps, 'exists').mockReturnValue(false)
    expect(await graphifyTool.isEnabled()).toBe(false)
  })

  it('isEnabled is true when graphify-out is present', async () => {
    vi.spyOn(fsOps, 'exists').mockReturnValue(true)
    expect(await graphifyTool.isEnabled()).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    const det = await graphifyTool.buildDetection()
    expect(det.name).toBe('graphify')
    expect(det.recommendedSaving).toBe(graphifyTool.savingEstimate)
  })
})
