import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  exists,
  readFile,
  readDir,
  isDirectory,
  getStats,
  readJsonSafe,
} from '@/utils/fs-operations.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'tests', '.tmp-fsops')

describe('fs-operations', () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
  })
  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true })
  })

  it('exists reflects filesystem', () => {
    expect(exists(DIR)).toBe(true)
    expect(exists(join(DIR, 'nope'))).toBe(false)
  })

  it('readFile and readDir work', () => {
    writeFileSync(join(DIR, 'a.txt'), 'hello')
    expect(readFile(join(DIR, 'a.txt'))).toBe('hello')
    expect(readDir(DIR)).toContain('a.txt')
  })

  it('isDirectory distinguishes files and dirs', () => {
    expect(isDirectory(DIR)).toBe(true)
    expect(isDirectory(join(DIR, 'a.txt'))).toBe(false)
    expect(isDirectory(join(DIR, 'missing'))).toBe(false)
  })

  it('getStats returns fs stats', () => {
    writeFileSync(join(DIR, 'b.txt'), 'x')
    expect(getStats(join(DIR, 'b.txt')).isFile()).toBe(true)
  })

  it('readJsonSafe parses valid json', () => {
    writeFileSync(join(DIR, 'c.json'), '{"k":1}')
    expect(readJsonSafe<{ k: number }>(join(DIR, 'c.json'))).toEqual({ k: 1 })
  })

  it('readJsonSafe returns null for missing or invalid json', () => {
    expect(readJsonSafe(join(DIR, 'missing.json'))).toBeNull()
    writeFileSync(join(DIR, 'bad.json'), 'not json')
    expect(readJsonSafe(join(DIR, 'bad.json'))).toBeNull()
  })
})
