import { describe, expect, it } from 'vitest'
import { satisfiesRange } from '../../../src/rules/semver.js'

describe('satisfiesRange', () => {
  it('handles >= lower bounds', () => {
    expect(satisfiesRange('0.6.0', '>=0.6')).toBe(true)
    expect(satisfiesRange('0.6.0', '>=0.6.0')).toBe(true)
    expect(satisfiesRange('0.5.9', '>=0.6')).toBe(false)
  })

  it('handles < upper bounds (exclusive)', () => {
    expect(satisfiesRange('0.6.0', '<1.0.0')).toBe(true)
    expect(satisfiesRange('1.0.0', '<1.0.0')).toBe(false)
  })

  it('handles = exact equality', () => {
    expect(satisfiesRange('1.2.3', '=1.2.3')).toBe(true)
    expect(satisfiesRange('1.2.4', '=1.2.3')).toBe(false)
  })

  it('ANDs comma-separated tokens', () => {
    expect(satisfiesRange('0.7.1', '>=0.6,<1.0.0')).toBe(true)
    expect(satisfiesRange('1.0.0', '>=0.6,<1.0.0')).toBe(false)
    expect(satisfiesRange('0.5.0', '>=0.6,<1.0.0')).toBe(false)
  })

  it('fails closed on malformed input', () => {
    expect(satisfiesRange('abc', '>=0.6')).toBe(false)
    expect(satisfiesRange('0.6.0', 'not-a-range')).toBe(false)
    expect(satisfiesRange('0.6.0', '')).toBe(false)
    expect(satisfiesRange('0.6', '>=0.6')).toBe(false)
  })

  it('supports <= and > operators', () => {
    expect(satisfiesRange('1.0.0', '<=1.0.0')).toBe(true)
    expect(satisfiesRange('1.0.1', '>1.0.0')).toBe(true)
  })
})
