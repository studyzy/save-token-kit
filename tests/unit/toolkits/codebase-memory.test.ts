import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { codebaseMemoryToolkit } from '@/toolkits/impl/codebase-memory.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const HOME = join(process.cwd(), 'tests', '.tmp-codebase-memory-home')

function writeMcp(json: object | null): void {
  const dir = join(HOME, '.codebuddy')
  mkdirSync(dir, { recursive: true })
  if (json === null) {
    rmSync(join(dir, '.mcp.json'), { force: true })
  } else {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify(json))
  }
}

describe('codebaseMemoryToolkit', () => {
  const originalHome = process.env.HOME

  beforeEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    process.env.HOME = HOME
  })

  afterEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    process.env.HOME = originalHome
  })

  it('has correct metadata', () => {
    expect(codebaseMemoryToolkit.name).toBe('codebase-memory')
    expect(codebaseMemoryToolkit.type).toBe('cli')
    expect(codebaseMemoryToolkit.installCommand).toContain('codebase-memory-mcp')
    expect(codebaseMemoryToolkit.verifyCommand).toContain('codebase-memory-mcp')
  })

  it('detects not installed when mcp.json missing', async () => {
    expect(await codebaseMemoryToolkit.detect()).toBe(false)
  })

  it('detects not installed when codebase-memory server absent', async () => {
    writeMcp({ mcpServers: { other: { command: 'other' } } })
    expect(await codebaseMemoryToolkit.detect()).toBe(false)
  })

  it('detects installed when codebase-memory server present', async () => {
    writeMcp({ mcpServers: { 'codebase-memory': { command: 'node', args: ['server.js'] } } })
    expect(await codebaseMemoryToolkit.detect()).toBe(true)
  })

  it('isEnabled false until setMcpEnabled(true)', async () => {
    writeMcp({ mcpServers: { 'codebase-memory': { command: 'node' } } })
    expect(await codebaseMemoryToolkit.isEnabled()).toBe(false)
    codebaseMemoryToolkit.setMcpEnabled(true)
    expect(await codebaseMemoryToolkit.isEnabled()).toBe(true)
  })

  it('markInstalledFromMcp marks installed and integrated', async () => {
    const base = await codebaseMemoryToolkit.buildDetection()
    const result = await codebaseMemoryToolkit.markInstalledFromMcp(base)
    expect(result.installed).toBe(true)
    expect(result.codebuddyIntegrated).toBe(true)
  })

  it('buildDetection reflects mcp enabled state', async () => {
    writeMcp({ mcpServers: { 'codebase-memory': { command: 'node' } } })
    codebaseMemoryToolkit.setMcpEnabled(true)
    const det = await codebaseMemoryToolkit.buildDetection()
    expect(det.name).toBe('codebase-memory')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(codebaseMemoryToolkit.savingEstimate)
  })
})
