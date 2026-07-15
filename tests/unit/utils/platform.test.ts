import { describe, it, expect } from 'vitest'
import {
  getPlatform,
  getHomeDir,
  commandExists,
  isProcessRunning,
  detectCodeBuddyVersion,
} from '@/utils/platform.js'

describe('platform utils', () => {
  it('getPlatform returns a known platform', () => {
    expect(['windows', 'macos', 'linux']).toContain(getPlatform())
  })

  it('getHomeDir returns a non-empty path', () => {
    expect(getHomeDir().length).toBeGreaterThan(0)
  })

  it('commandExists true for a core binary', async () => {
    expect(await commandExists('node')).toBe(true)
    expect(await commandExists('definitely-not-a-real-binary-xyz')).toBe(false)
  })

  it('isProcessRunning returns boolean', async () => {
    expect(typeof (await isProcessRunning('node'))).toBe('boolean')
  })

  it('detectCodeBuddyVersion returns string or null', async () => {
    const v = await detectCodeBuddyVersion('definitely-not-a-real-binary-xyz')
    expect(v).toBeNull()
  })
})
