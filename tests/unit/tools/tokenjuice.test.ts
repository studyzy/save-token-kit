import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tokenJuiceTool } from '@/tools/impl/tokenjuice.js'

vi.mock('tinyexec', () => ({
  exec: vi.fn(),
}))

import { exec } from 'tinyexec'

const mockedExec = vi.mocked(exec)

describe('tokenJuiceTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('has correct metadata', () => {
    expect(tokenJuiceTool.name).toBe('tokenjuice')
    expect(tokenJuiceTool.type).toBe('cli')
    expect(tokenJuiceTool.installCommand).toContain('go install')
    expect(tokenJuiceTool.installCommand).toContain('tokenjuice')
    expect(tokenJuiceTool.verifyCommand).toBe('tokenjuice --help')
    expect(tokenJuiceTool.savingEstimate).toBeTruthy()
    expect(tokenJuiceTool.description).toBeTruthy()
    expect(tokenJuiceTool.uninstallCommand).toBe('')
  })

  it('detects installed when tokenjuice is on PATH', async () => {
    mockedExec.mockResolvedValue({
      exitCode: 0,
      stdout: '/usr/local/bin/tokenjuice',
      stderr: '',
    })

    const result = await tokenJuiceTool.detect()
    expect(result).toBe(true)
  })

  it('detects not installed when command not found', async () => {
    mockedExec.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'command not found',
    })

    const result = await tokenJuiceTool.detect()
    expect(result).toBe(false)
  })

  it('detects not installed when exec throws', async () => {
    mockedExec.mockRejectedValue(new Error('command not found'))

    const result = await tokenJuiceTool.detect()
    expect(result).toBe(false)
  })

  it('isEnabled returns false by default', async () => {
    const result = await tokenJuiceTool.isEnabled()
    expect(result).toBe(false)
  })

  it('getConfigCommand returns empty string', () => {
    expect(tokenJuiceTool.getConfigCommand()).toBe('')
    expect(tokenJuiceTool.getConfigCommand('codebuddy', true)).toBe('')
  })

  it('buildDetection when installed', async () => {
    mockedExec.mockResolvedValue({
      exitCode: 0,
      stdout: '/usr/local/bin/tokenjuice',
      stderr: '',
    })

    const det = await tokenJuiceTool.buildDetection()
    expect(det.name).toBe('tokenjuice')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(false)
    expect(det.recommendedSaving).toBe(tokenJuiceTool.savingEstimate)
    expect(det.version).toBeNull()
    expect(det.installPath).toBeNull()
    expect(det.codebuddyIntegrated).toBe(true)
  })

  it('buildDetection when not installed', async () => {
    mockedExec.mockRejectedValue(new Error('command not found'))

    const det = await tokenJuiceTool.buildDetection()
    expect(det.name).toBe('tokenjuice')
    expect(det.installed).toBe(false)
    expect(det.enabled).toBe(false)
    expect(det.codebuddyIntegrated).toBe(false)
  })
})
