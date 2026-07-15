import { describe, it, expect } from 'vitest'
import { graphifyTool } from '@/tools/impl/graphify.js'
import { commandExists } from '@/utils/platform.js'

describe('graphifyTool', () => {
  it('has correct metadata', () => {
    expect(graphifyTool.name).toBe('graphify')
    expect(graphifyTool.type).toBe('cli')
    expect(graphifyTool.installCommand).toContain('graphify')
    expect(graphifyTool.getConfigCommand('codebuddy')).toContain('--platform codebuddy')
  })

  it('detect reflects command availability', async () => {
    expect(await graphifyTool.detect()).toBe(await commandExists('graphify'))
  })

  it('isEnabled reflects graphify-out presence', async () => {
    expect(await graphifyTool.isEnabled()).toBe(false)
  })

  it('buildDetection reflects state', async () => {
    const det = await graphifyTool.buildDetection()
    expect(det.name).toBe('graphify')
    expect(det.recommendedSaving).toBe(graphifyTool.savingEstimate)
  })
})
