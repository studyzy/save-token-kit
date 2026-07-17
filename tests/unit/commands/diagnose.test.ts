import { describe, it, expect, afterEach } from 'vitest'
import { detectToolsViaRegistry } from '@/commands/diagnose.js'
import { contextModeTool } from '@/tools/impl/context-mode.js'
import type { ToolDetection } from '@/types/index.js'

/**
 * 测试 detectToolsViaRegistry 中 context-mode MCP 检测段（diagnose.ts:176-182）。
 *
 * 该段逻辑（位于 if (proxyParsed) 条件块内）：
 * 1. 从 fs.mcpList 中查找 name === 'context-mode' 的 MCP 条目
 * 2. 如果找到，调用 contextModeTool.setMcpEnabled(status !== 'disabled')
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
  toolBreakdown: { builtin: { count: 0, tokens: 0 }, mcp: { count: 0, tokens: 0 }, deferred: { count: 0, tokens: 0 } },
}

describe('detectToolsViaRegistry - context-mode MCP detection', () => {
  afterEach(() => {
    contextModeTool.setMcpEnabled(false)
  })

  it('detects context-mode as enabled when MCP entry status is "enabled"', async () => {
    const fs = mockFs([{ name: 'context-mode', status: 'enabled' }])
    const detections = await detectToolsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(true)
  })

  it('detects context-mode as disabled when MCP entry status is "disabled"', async () => {
    const fs = mockFs([{ name: 'context-mode', status: 'disabled' }])
    const detections = await detectToolsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(false)
  })

  it('leaves context-mode disabled when no MCP entry exists', async () => {
    const fs = mockFs([{ name: 'other-tool', status: 'enabled' }])
    const detections = await detectToolsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(false)
  })

  it('does not crash when mcpList is empty', async () => {
    const fs = mockFs([])
    const detections = await detectToolsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.enabled).toBe(false)
  })

  it('includes context-mode with correct metadata in detection list', async () => {
    const fs = mockFs([{ name: 'context-mode', status: 'enabled' }])
    const detections = await detectToolsViaRegistry(fs, proxyParsed)

    const cm = detections.find((d: ToolDetection) => d.name === 'context-mode')
    expect(cm).toBeDefined()
    expect(cm!.name).toBe('context-mode')
    expect(cm!.recommendedSaving).toBe(contextModeTool.savingEstimate)
  })
})
