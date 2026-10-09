import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { gitnexusToolkit } from '@/toolkits/impl/gitnexus.js'
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

describe('gitnexusToolkit', () => {
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
    expect(gitnexusToolkit.name).toBe('gitnexus')
    expect(gitnexusToolkit.type).toBe('cli')
    expect(gitnexusToolkit.installCommand).toContain('GitNexus')
    expect(gitnexusToolkit.verifyCommand).toContain('gitnexus')
  })

  it('detects not installed when mcp.json missing', async () => {
    expect(await gitnexusToolkit.detect()).toBe(false)
  })

  it('detects not installed when gitnexus server absent', async () => {
    writeMcp({ mcpServers: { other: { command: 'other' } } })
    expect(await gitnexusToolkit.detect()).toBe(false)
  })

  it('detects installed when gitnexus server present', async () => {
    writeMcp({ mcpServers: { gitnexus: { command: 'node', args: ['server.js'] } } })
    expect(await gitnexusToolkit.detect()).toBe(true)
  })

  it('isEnabled false until setMcpEnabled(true)', async () => {
    writeMcp({ mcpServers: { gitnexus: { command: 'node' } } })
    expect(await gitnexusToolkit.isEnabled()).toBe(false)
    gitnexusToolkit.setMcpEnabled(true)
    expect(await gitnexusToolkit.isEnabled()).toBe(true)
  })

  it('markInstalledFromMcp marks installed and integrated', async () => {
    const base = await gitnexusToolkit.buildDetection()
    const result = await gitnexusToolkit.markInstalledFromMcp(base)
    expect(result.installed).toBe(true)
    expect(result.codebuddyIntegrated).toBe(true)
  })

  it('buildDetection reflects mcp enabled state', async () => {
    writeMcp({ mcpServers: { gitnexus: { command: 'node' } } })
    gitnexusToolkit.setMcpEnabled(true)
    const det = await gitnexusToolkit.buildDetection()
    expect(det.name).toBe('gitnexus')
    expect(det.installed).toBe(true)
    expect(det.enabled).toBe(true)
    expect(det.recommendedSaving).toBe(gitnexusToolkit.savingEstimate)
  })
})
