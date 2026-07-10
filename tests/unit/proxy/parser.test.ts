import { describe, it, expect } from 'vitest'
import { parseRequestBody, aggregateCaptures } from '@/proxy/parser.js'
import { MAX_MESSAGE_BYTES } from '@/types/index.js'

describe('parseRequestBody', () => {
  it('parses messages, tools, mcp servers and skills', () => {
    const body = {
      messages: [
        { role: 'system', content: 'you are helpful' },
        { role: 'user', content: 'hello' },
      ],
      tools: [
        { name: 'read_file', description: 'reads a file' },
        { name: 'mcp__playwright__click', description: 'clicks' },
        { name: 'mcp__playwright__type', description: 'types' },
      ],
    }
    const r = parseRequestBody(body)
    expect(r.messages.roleCounts).toEqual({ system: 1, user: 1 })
    expect(r.tools.builtin).toHaveLength(1)
    expect(r.tools.mcp).toHaveLength(2)
    expect(r.mcpServers).toHaveLength(1)
    expect(r.mcpServers[0].serverName).toBe('playwright')
    expect(r.mcpServers[0].toolCount).toBe(2)
    expect(r.totalEstimatedTokens).toBeGreaterThan(0)
  })

  it('tolerates missing fields without crashing', () => {
    const r = parseRequestBody(undefined)
    expect(r.totalEstimatedTokens).toBe(0)
    expect(r.messages.breakdown).toHaveLength(0)
  })

  it('truncates oversized message bodies and tags [TRUNCATED]', () => {
    const big = 'x'.repeat(MAX_MESSAGE_BYTES + 100)
    const r = parseRequestBody({ messages: [{ role: 'user', content: big }] })
    const b = r.messages.breakdown[0]
    expect(b.snippet).toContain('[TRUNCATED')
  })

  it('aggregates multiple captures averaging total tokens', () => {
    const a = parseRequestBody({ messages: [{ role: 'user', content: 'a' }] })
    const b = parseRequestBody({ messages: [{ role: 'user', content: 'bb' }] })
    const agg = aggregateCaptures([a, b])
    expect(agg.totalEstimatedTokens).toBe(Math.round((a.totalEstimatedTokens + b.totalEstimatedTokens) / 2))
  })

  it('returns empty diagnosis when no fragments provided', () => {
    expect(aggregateCaptures([]).totalEstimatedTokens).toBe(0)
  })
})
