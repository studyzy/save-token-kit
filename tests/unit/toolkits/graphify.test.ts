import { describe, it, expect, vi, afterEach } from 'vitest'
import { graphifyToolkit } from '@/toolkits/impl/graphify.js'
import { commandExists } from '@/utils/platform.js'
import * as fsOps from '@/utils/fs-operations.js'

describe('graphifyToolkit', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has correct metadata', () => {
    expect(graphifyToolkit.name).toBe('graphify')
    expect(graphifyToolkit.type).toBe('cli')
    expect(graphifyToolkit.installCommand).toContain('graphify')
    expect(graphifyToolkit.getConfigCommand('codebuddy')).toContain('--platform codebuddy')
  })

  it('detect reflects command availability', async () => {
    expect(await graphifyToolkit.detect()).toBe(await commandExists('graphify'))
  })

  it('isEnabled is false when graphify-out is absent', async () => {
    vi.spyOn(fsOps, 'exists').mockReturnValue(false)
    expect(await graphifyToolkit.isEnabled()).toBe(false)
  })

  it('isEnabled is true when graphify-out is present', async () => {
    vi.spyOn(fsOps, 'exists').mockReturnValue(true)
    expect(await graphifyToolkit.isEnabled()).toBe(true)
  })

  it('buildDetection reflects state', async () => {
    const det = await graphifyToolkit.buildDetection()
    expect(det.name).toBe('graphify')
    expect(det.recommendedSaving).toBe(graphifyToolkit.savingEstimate)
  })
})
