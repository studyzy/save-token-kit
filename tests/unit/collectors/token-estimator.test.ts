import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateTokensOf, truncateIfLarge } from '@/collectors/token-estimator.js'
import { MAX_MESSAGE_BYTES } from '@/types/index.js'

describe('token-estimator', () => {
  it('estimates tokens from string length', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(40))).toBe(10)
  })

  it('estimates tokens of arbitrary JSON values', () => {
    expect(estimateTokensOf({ a: 1 })).toBeGreaterThan(0)
    expect(estimateTokensOf(null)).toBe(0)
  })

  it('does not truncate bodies under the 10MB limit', () => {
    const body = 'x'.repeat(1000)
    const r = truncateIfLarge(body)
    expect(r.truncated).toBe(false)
    expect(r.content).toBe(body)
  })

  it('truncates and tags bodies over the 10MB limit', () => {
    const body = 'x'.repeat(MAX_MESSAGE_BYTES + 100)
    const r = truncateIfLarge(body)
    expect(r.truncated).toBe(true)
    expect(r.content).toContain('[TRUNCATED')
  })
})
