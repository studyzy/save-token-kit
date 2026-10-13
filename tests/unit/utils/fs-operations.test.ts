import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  exists,
  readFile,
  readDir,
  isDirectory,
  getStats,
  readJsonSafe,
  ensureIgnoredDir,
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

  describe('ensureIgnoredDir', () => {
    it('creates the dir and a self-ignoring .gitignore', () => {
      const target = join(DIR, 'save-token')
      ensureIgnoredDir(target)
      expect(isDirectory(target)).toBe(true)
      expect(readFile(join(target, '.gitignore'))).toBe('*\n')
    })

    it('never overwrites a user-curated .gitignore', () => {
      const target = join(DIR, 'save-token')
      mkdirSync(target, { recursive: true })
      writeFileSync(join(target, '.gitignore'), '!report.md\n')
      ensureIgnoredDir(target)
      expect(readFile(join(target, '.gitignore'))).toBe('!report.md\n')
    })
  })
})
