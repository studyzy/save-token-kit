import { describe, it, expect } from 'vitest'
import { codegraphTool } from '@/tools/impl/codegraph.js'
import { commandExists } from '@/utils/platform.js'

describe('codegraphTool', () => {
  it('has correct metadata', () => {
    expect(codegraphTool.name).toBe('codegraph')
    expect(codegraphTool.type).toBe('cli')
    expect(codegraphTool.installCommand).toContain('codegraph')
    expect(codegraphTool.getConfigCommand('codebuddy')).toContain('--platform codebuddy')
  })

  it('detect reflects command availability', async () => {
    expect(await codegraphTool.detect()).toBe(await commandExists('codegraph'))
  })

  it('isEnabled reflects .codegraph presence', async () => {
    expect(await codegraphTool.isEnabled()).toBe(false)
  })

  it('buildDetection reflects state', async () => {
    const det = await codegraphTool.buildDetection()
    expect(det.name).toBe('codegraph')
    expect(det.recommendedSaving).toBe(codegraphTool.savingEstimate)
  })
})
