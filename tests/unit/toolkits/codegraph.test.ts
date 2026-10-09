import { describe, it, expect } from 'vitest'
import { codegraphToolkit } from '@/toolkits/impl/codegraph.js'
import { commandExists } from '@/utils/platform.js'

describe('codegraphToolkit', () => {
  it('has correct metadata', () => {
    expect(codegraphToolkit.name).toBe('codegraph')
    expect(codegraphToolkit.type).toBe('cli')
    expect(codegraphToolkit.installCommand).toContain('codegraph')
    expect(codegraphToolkit.getConfigCommand('codebuddy')).toContain('--platform codebuddy')
  })

  it('detect reflects command availability', async () => {
    expect(await codegraphToolkit.detect()).toBe(await commandExists('codegraph'))
  })

  it('isEnabled reflects .codegraph presence', async () => {
    expect(await codegraphToolkit.isEnabled()).toBe(false)
  })

  it('buildDetection reflects state', async () => {
    const det = await codegraphToolkit.buildDetection()
    expect(det.name).toBe('codegraph')
    expect(det.recommendedSaving).toBe(codegraphToolkit.savingEstimate)
  })
})
