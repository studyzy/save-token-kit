import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tokenJuiceToolkit } from '@/toolkits/impl/tokenjuice.js'

vi.mock('tinyexec', () => ({
  exec: vi.fn(),
}))

import { exec } from 'tinyexec'

const mockedExec = vi.mocked(exec)

describe('tokenJuiceToolkit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('has correct metadata', () => {
    expect(tokenJuiceToolkit.name).toBe('tokenjuice')
    expect(tokenJuiceToolkit.type).toBe('cli')
    expect(tokenJuiceToolkit.installCommand).toContain('go install')
    expect(tokenJuiceToolkit.installCommand).toContain('tokenjuice')
    expect(tokenJuiceToolkit.verifyCommand).toBe('tokenjuice --help')
    expect(tokenJuiceToolkit.savingEstimate).toBeTruthy()
    expect(tokenJuiceToolkit.description).toBeTruthy()
    expect(tokenJuiceToolkit.uninstallCommand).toBe('')
  })

  it('detects installed when tokenjuice is on PATH', async () => {
    mockedExec.mockResolvedValue({
      exitCode: 0,
      stdout: '/usr/local/bin/tokenjuice',
      stderr: '',
    })

    const result = await tokenJuiceToolkit.detect()
    expect(result).toBe(true)
  })

  it('detects not installed when command not found', async () => {
    mockedExec.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'command not found',
    })

    const result = await tokenJuiceToolkit.detect()
    expect(result).toBe(false)
  })

  it('detects not installed when exec throws', async () => {
    mockedExec.mockRejectedValue(new Error('command not found'))

    const result = await tokenJuiceToolkit.detect()
    expect(result).toBe(false)
  })

  it('isEnabled returns false by default', async () => {
    const result = await tokenJuiceToolkit.isEnabled()
    expect(result).toBe(false)
  })

  it('getConfigCommand returns empty string', () => {
    expect(tokenJuiceToolkit.getConfigCommand()).toBe('')
    expect(tokenJuiceToolkit.getConfigCommand('codebuddy', true)).toBe('')
  })

  it('buildDetection when installed', async () => {
    mockedExec.mockResolvedValue({
      exitCode: 0,
      stdout: '/usr/local/bin/tokenjuice',
      stderr: '',
    })

    const det = await tokenJuiceToolkit.buildDetection()
    expect(det.name).toBe('tokenjuice')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(false)
    expect(det.recommendedSaving).toBe(tokenJuiceToolkit.savingEstimate)
    expect(det.version).toBeNull()
    expect(det.installPath).toBeNull()
    expect(det.codebuddyIntegrated).toBe(true)
  })

  it('buildDetection when not installed', async () => {
    mockedExec.mockRejectedValue(new Error('command not found'))

    const det = await tokenJuiceToolkit.buildDetection()
    expect(det.name).toBe('tokenjuice')
    expect(det.installed).toBe(false)
    expect(det.enabled).toBe(false)
    expect(det.codebuddyIntegrated).toBe(false)
  })
})
