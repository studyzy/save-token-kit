import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { gitnexusTool } from '@/tools/impl/gitnexus.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const HOME = join(process.cwd(), 'tests', '.tmp-gitnexus-home')

function writeMcp(json: object | null): void {
  const dir = join(HOME, '.codebuddy')
  mkdirSync(dir, { recursive: true })
  if (json === null) {
    rmSync(join(dir, '.mcp.json'), { force: true })
  } else {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify(json))
  }
}

describe('gitnexusTool', () => {
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
    expect(gitnexusTool.name).toBe('gitnexus')
    expect(gitnexusTool.type).toBe('cli')
    expect(gitnexusTool.installCommand).toContain('GitNexus')
    expect(gitnexusTool.verifyCommand).toContain('gitnexus')
  })

  it('detects not installed when mcp.json missing', async () => {
    expect(await gitnexusTool.detect()).toBe(false)
  })

  it('detects not installed when gitnexus server absent', async () => {
    writeMcp({ mcpServers: { other: { command: 'other' } } })
    expect(await gitnexusTool.detect()).toBe(false)
  })

  it('detects installed when gitnexus server present', async () => {
    writeMcp({ mcpServers: { gitnexus: { command: 'node', args: ['server.js'] } } })
    expect(await gitnexusTool.detect()).toBe(true)
  })

  it('isEnabled false until setMcpEnabled(true)', async () => {
    writeMcp({ mcpServers: { gitnexus: { command: 'node' } } })
    expect(await gitnexusTool.isEnabled()).toBe(false)
    gitnexusTool.setMcpEnabled(true)
    expect(await gitnexusTool.isEnabled()).toBe(true)
  })

  it('markInstalledFromMcp marks installed and integrated', async () => {
    const base = await gitnexusTool.buildDetection()
    const result = await gitnexusTool.markInstalledFromMcp(base)
    expect(result.installed).toBe(true)
    expect(result.codebuddyIntegrated).toBe(true)
  })

  it('buildDetection reflects mcp enabled state', async () => {
    writeMcp({ mcpServers: { gitnexus: { command: 'node' } } })
    gitnexusTool.setMcpEnabled(true)
    const det = await gitnexusTool.buildDetection()
    expect(det.name).toBe('gitnexus')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(gitnexusTool.savingEstimate)
  })
})
