import { describe, it, expect } from 'vitest'
import { main } from '@/cli.js'

describe('cli', () => {
  it('registers commands and shows help without throwing', async () => {
    const orig = process.stdout.write
    process.stdout.write = () => true
    await expect(main(['--help'])).resolves.toBeUndefined()
    process.stdout.write = orig
  })

  it('reports unsupported agent for diagnose and sets exit code', async () => {
    const orig = process.exitCode
    const origErr = process.stderr.write
    process.stderr.write = () => true
    await main(['diagnose', '--agent', 'claude'])
    expect(process.exitCode).toBe(1)
    process.exitCode = orig
    process.stderr.write = origErr
  })

  it('errors on rollback (reserved) with exit code 1', async () => {
    const orig = process.exitCode
    const origErr = process.stderr.write
    process.stderr.write = () => true
    await main(['rollback'])
    expect(process.exitCode).toBe(1)
    process.exitCode = orig
    process.stderr.write = origErr
  })
})
