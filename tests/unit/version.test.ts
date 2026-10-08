import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { VERSION } from '@/version.js'

/**
 * Data-parity guard: the CLI version shown by `stk --version` must stay in
 * sync with package.json, following the same pattern as rules/fallback.json.
 */
describe('VERSION parity with package.json', () => {
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
  ) as { version: string }

  it('VERSION equals package.json version', () => {
    expect(VERSION).toBe(packageJson.version)
  })

  it('VERSION is a semver-like triple', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
