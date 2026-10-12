import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyTool,
  detectPluginsFromMessages,
  __setToolkitProxyDataForTest,
} from '../../../src/proxy/parser-core.js'

afterEach(() => {
  __setToolkitProxyDataForTest(undefined)
})

describe('classifyTool', () => {
  it('classifies generic mcp__ prefix as mcp without any toolkit data', () => {
    __setToolkitProxyDataForTest({ mcpPrefixes: [], proxyMarkers: {} })
    expect(classifyTool('mcp__playwright__click')).toBe('mcp')
    expect(classifyTool('Read')).toBe('builtin')
  })

  it('classifies data-driven toolkit prefixes as mcp', () => {
    __setToolkitProxyDataForTest({ mcpPrefixes: ['headroom_'], proxyMarkers: {} })
    expect(classifyTool('headroom_headroom_compress')).toBe('mcp')
    expect(classifyTool('headroomOther')).toBe('builtin')
    expect(classifyTool('Read')).toBe('builtin')
  })
})

describe('detectPluginsFromMessages', () => {
  it('detects plugins from data-driven markers', () => {
    __setToolkitProxyDataForTest({
      mcpPrefixes: [],
      proxyMarkers: { caveman: ['CAVEMAN MODE ACTIVE'] },
    })
    const messages = [
      { role: 'system', content: 'prefix CAVEMAN MODE ACTIVE suffix' },
      { role: 'user', content: 'hello' },
    ]
    expect(detectPluginsFromMessages(messages)).toEqual(['caveman'])
  })

  it('joins content blocks before matching and dedupes hits', () => {
    __setToolkitProxyDataForTest({
      mcpPrefixes: [],
      proxyMarkers: { caveman: ['CAVEMAN MODE ACTIVE'] },
    })
    const messages = [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'CAVEMAN MODE' },
          { type: 'text', text: ' ACTIVE' },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'CAVEMAN MODE ACTIVE' }] },
    ]
    expect(detectPluginsFromMessages(messages)).toEqual(['caveman'])
  })

  it('supports multiple markers per toolkit and returns no match when absent', () => {
    __setToolkitProxyDataForTest({
      mcpPrefixes: [],
      proxyMarkers: { headroom: ['HEADROOM A', 'HEADROOM B'] },
    })
    expect(detectPluginsFromMessages([{ role: 'user', content: 'says HEADROOM B now' }])).toEqual([
      'headroom',
    ])
    expect(detectPluginsFromMessages([{ role: 'user', content: 'nothing here' }])).toEqual([])
  })
})
