import { describe, it, expect, afterEach } from 'vitest'
import { main } from '@/cli.js'

describe('cli', () => {
  afterEach(() => {
    process.exitCode = undefined
  })

  it('registers commands and shows help without throwing', async () => {
    const orig = process.stdout.write
    process.stdout.write = () => true
    await expect(main(['--help'])).resolves.toBeUndefined()
    process.stdout.write = orig
  })

  it('reports unsupported agent for diagnose and sets exit code', async () => {
    const origErr = process.stderr.write
    process.stderr.write = () => true
    await main(['diagnose', '--agent', 'cursor'])
    expect(process.exitCode).toBe(1)
    process.stderr.write = origErr
  })
})
