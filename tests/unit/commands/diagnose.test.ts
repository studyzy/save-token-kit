import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectToolkitsViaRegistry, attachUsageStats } from '@/commands/diagnose.js'
import { collectUsageStats } from '@/collectors/usage-collector.js'
import { contextModeToolkit } from '@/toolkits/impl/context-mode.js'
import type { ToolkitDetection } from '@/types/index.js'
import { startProxy } from '@/proxy/server.js'

vi.mock('@/collectors/usage-collector.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/collectors/usage-collector.js')>()
  return { ...actual, collectUsageStats: vi.fn(actual.collectUsageStats) }
})

vi.mock('@/proxy/server.js', () => {
  const capturedBodies: unknown[] = [{ messages: [{ role: 'user', content: 'hello' }], tools: [] }]
  return {
    startProxy: vi.fn(async () => ({
      port: 0,
      server: { close: (cb: () => void) => cb() },
      capturedBodies,
      captured: true,
    })),
    stopProxy: vi.fn(async () => {}),
    findMainChatBody: vi.fn(() => capturedBodies[0]),
  }
})

vi.mock('@/collectors/fs-collector.js', () => ({
  scanFilesystem: vi.fn(() => ({
    mcpList: [],
    skillList: [],
    commandList: [],
    pluginList: [],
    hookList: [],
    ruleList: [],
    memoryFiles: [],
    configFiles: [],
  })),
}))

vi.mock('@/utils/platform.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/platform.js')>()
  return { ...actual, detectCodeBuddyVersion: vi.fn(async () => '1.0.0') }
})

vi.mock('@/rules/loader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/rules/loader.js')>()
  return {
    ...actual,
    loadRules: vi.fn(() => ({
      rulesInfo: { packVersion: '0.0.0', fallbackInUse: false },
      lowFrequencyPlugins: new Set(),
      mcpAlternatives: new Map(),
    })),
  }
})

vi.mock('@/rules/update.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/rules/update.js')>()
  return { ...actual, autoCheckLibraryUpdate: vi.fn(async () => {}) }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    // Probe trigger runs via native spawn; resolve immediately so tests never
    // launch a real agent binary.
    spawn: vi.fn(() => {
      const emitter = new actual.EventEmitter()
      queueMicrotask(() => emitter.emit('close', 0, null))
      return emitter
    }),
  }
})

/**
 * 测试 detectToolkitsViaRegistry 中 context-mode MCP 检测段（diagnose.ts:176-182）。
 *
 * 该段逻辑（位于 if (proxyParsed) 条件块内）：
 * 1. 从 fs.mcpList 中查找 name === 'context-mode' 的 MCP 条目
 * 2. 如果找到，调用 contextModeToolkit.setMcpEnabled(status !== 'disabled')
 * 3. 在 detections 中找到 context-mode 条目，用 buildDetection() 更新
 */

/** 构造一个简化的 FsCollectResult 用于测试 context-mode ���测段 */
function mockFs(mcpEntries: Array<{ name: string; status: string }> = []) {
  return {
    mcpList: mcpEntries.map((e) => ({
      name: e.name,
      command: 'node',
      args: [],
      env: {},
      status: e.status as 'enabled' | 'disabled' | 'unknown',
      configPath: '/fake/.mcp.json',
    })),
    skillList: [],
    pluginList: [],
    hookList: [],
    ruleList: [],
    configFiles: [],
  }
}

/** 最小 proxyParsed，用于触发 context-mode 检测块（该块在 if (proxyParsed) 内部） */
const proxyParsed = {
  systemPrompt: '',
  availableSkills: [],
  deferredTools: [],
  detectedPlugins: [],
  builtinTools: [],
  mcpServers: [],
}

describe('detectToolkitsViaRegistry - context-mode MCP detection', () => {
  afterEach(() => {
    contextModeToolkit.setMcpEnabled(false)
  })

  it('detects context-mode as enabled when MCP entry status is "enabled"', async () => {
    const fs = mockFs([{ name: 'context-mode', status: 'enabled' }])
    const detections = await detectToolkitsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(true)
  })

  it('detects context-mode as disabled when MCP entry status is "disabled"', async () => {
    const fs = mockFs([{ name: 'context-mode', status: 'disabled' }])
    const detections = await detectToolkitsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(false)
  })

  it('leaves context-mode disabled when no MCP entry exists', async () => {
    const fs = mockFs([{ name: 'other-tool', status: 'enabled' }])
    const detections = await detectToolkitsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(false)
  })

  it('does not crash when mcpList is empty', async () => {
    const fs = mockFs([])
    const detections = await detectToolkitsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(false)
  })

  it('includes context-mode with correct metadata in detection list', async () => {
    const fs = mockFs([{ name: 'context-mode', status: 'enabled' }])
    const detections = await detectToolkitsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.name).toBe('context-mode')
    expect(cm!.recommendedSaving).toBe(contextModeToolkit.savingEstimate)
  })

  // --- proxyParsed.mcpServers 回退路径 ---
  // context-mode 作为 CodeBuddy Plugin 启用时，不会在磁盘 .mcp.json 中出现，
  // 但会出现在拦截的请求体 mcpServers 列表中（name 为 'context-mode' 或
  // 'plugin_context-mode_context-mode'）。

  it('detects context-mode via proxyParsed.mcpServers with name "context-mode"', async () => {
    const fs = mockFs([]) // 磁盘无 context-mode MCP 记录
    const pp = {
      ...proxyParsed,
      mcpServers: [{ name: 'context-mode' }],
    }
    const detections = await detectToolkitsViaRegistry(fs, pp)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(true)
  })

  it('detects context-mode via proxyParsed.mcpServers with name "plugin_context-mode_context-mode"', async () => {
    const fs = mockFs([])
    const pp = {
      ...proxyParsed,
      mcpServers: [{ name: 'plugin_context-mode_context-mode' }],
    }
    const detections = await detectToolkitsViaRegistry(fs, pp)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(true)
  })

  it('detects context-mode as disabled when neither fs.mcpList nor proxyParsed.mcpServers has it', async () => {
    const fs = mockFs([{ name: 'other-tool', status: 'enabled' }])
    const pp = {
      ...proxyParsed,
      mcpServers: [{ name: 'some-other-mcp' }],
    }
    const detections = await detectToolkitsViaRegistry(fs, pp)

    const cm = detections.find((d: ToolkitDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(false)
  })
})

import { waitForCapture } from '@/commands/diagnose.js'

describe('waitForCapture (manual-trigger agents)', () => {
  it('resolves immediately once a request is captured', async () => {
    const bodies = [{ model: 'x' }]
    const start = Date.now()
    await waitForCapture(bodies, 10_000)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('resolves after timeout when nothing is captured', async () => {
    const bodies: unknown[] = []
    const start = Date.now()
    await waitForCapture(bodies, 1200) // 1200ms > 500ms poll interval
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000)
  })
})

describe('attachUsageStats (diagnosis integration)', () => {
  let tmp: string
  afterEach(() => {
    vi.mocked(collectUsageStats).mockClear()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('attaches usageStats when the agent has a sessions dir with history', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-attach-'))
    writeFileSync(
      join(tmp, 's.jsonl'),
      JSON.stringify({
        type: 'function_call',
        name: 'Read',
        arguments: '{}',
        timestamp: Date.now(),
      }),
    )
    const report: { usageStats?: unknown } = {}

    await attachUsageStats(report, tmp)

    const stats = report.usageStats as {
      filesScanned: number
      toolUsage: { all: { total: number } }
    }
    expect(stats).toBeDefined()
    expect(stats.filesScanned).toBe(1)
    expect(stats.toolUsage.all.total).toBe(1)
  })

  it('skips collection when the agent has no sessions dir', async () => {
    const report: { usageStats?: unknown } = {}

    await attachUsageStats(report, undefined)

    expect(report.usageStats).toBeUndefined()
    expect(vi.mocked(collectUsageStats)).not.toHaveBeenCalled()
  })

  it('degrades silently when the scan throws (diagnosis unaffected)', async () => {
    vi.mocked(collectUsageStats).mockRejectedValueOnce(new Error('scan boom'))
    const report: { usageStats?: unknown } = {}

    await expect(attachUsageStats(report, '/some/dir')).resolves.toBeUndefined()

    expect(report.usageStats).toBeUndefined()
  })
})

import { runDiagnose, waitLiveCapture } from '@/commands/diagnose.js'

describe('runDiagnose live mode', () => {
  let cwd: string
  let originalCwd: string

  beforeEach(() => {
    vi.mocked(collectUsageStats).mockResolvedValue(undefined as never)
    vi.mocked(startProxy).mockClear()
    originalCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'stk-live-'))
    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (cwd) rmSync(cwd, { recursive: true, force: true })
    vi.mocked(collectUsageStats).mockClear()
  })

  it('routes live mode through the non-mock branch (startProxy receives mock:false and traceDir)', async () => {
    await runDiagnose({ live: true, duration: '0.01' })

    expect(startProxy).toHaveBeenCalledTimes(1)
    const call = vi.mocked(startProxy).mock.calls[0][0]
    expect(call.mock).toBe(false)
    expect(call.traceDir).toBeDefined()
    expect(String(call.traceDir)).toContain('trace')
  })

  it('does not spawn the probe trigger in live mode', async () => {
    const { spawn } = await import('node:child_process')
    vi.mocked(spawn).mockClear()

    await runDiagnose({ live: true, duration: '0.01' })

    // The probe trigger (spawn of the agent binary) must never run in live mode.
    const probeCalls = vi.mocked(spawn).mock.calls.filter((c) => c[0] === 'codebuddy')
    expect(probeCalls).toHaveLength(0)
  })

  it('still produces a report file in live mode', async () => {
    await runDiagnose({ live: true, duration: '0.01' })

    expect(existsSync(join(cwd, 'save-token', 'diagnosis-report.md'))).toBe(true)
    expect(existsSync(join(cwd, 'save-token', 'diagnosis-report.json'))).toBe(true)
  })
})

describe('waitLiveCapture', () => {
  it('resolves immediately for a tiny timeout', async () => {
    const start = Date.now()
    await waitLiveCapture(1)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})

describe('runDiagnose .gitignore write-once', () => {
  let cwd: string
  let originalCwd: string

  afterEach(() => {
    process.chdir(originalCwd)
    vi.mocked(collectUsageStats).mockClear()
  })

  it('creates save-token/.gitignore with content "*" when absent', async () => {
    // Avoid scanning the real ~/.codebuddy/projects sessions dir.
    vi.mocked(collectUsageStats).mockResolvedValue(undefined as never)
    originalCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'stk-diag-'))
    process.chdir(cwd)

    await runDiagnose({})

    const gitignore = join(cwd, 'save-token', '.gitignore')
    expect(existsSync(gitignore)).toBe(true)
    expect(readFileSync(gitignore, 'utf8')).toBe('*\n')

    rmSync(cwd, { recursive: true, force: true })
  })

  it('does not overwrite an existing .gitignore', async () => {
    vi.mocked(collectUsageStats).mockResolvedValue(undefined as never)
    originalCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'stk-diag-'))
    process.chdir(cwd)

    // Pre-create the directory and a user-curated .gitignore.
    const saveTokenDir = join(cwd, 'save-token')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(saveTokenDir, { recursive: true })
    writeFileSync(join(saveTokenDir, '.gitignore'), 'reports/\n')

    await runDiagnose({})

    expect(readFileSync(join(saveTokenDir, '.gitignore'), 'utf8')).toBe('reports/\n')

    rmSync(cwd, { recursive: true, force: true })
  })
})
