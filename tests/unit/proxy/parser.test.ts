import { describe, it, expect } from 'vitest'
import { parseRequestBody, aggregateCaptures } from '@/proxy/parser.js'
import { MAX_MESSAGE_BYTES } from '@/types/index.js'

describe('parseRequestBody', () => {
  it('parses messages, tools, mcp servers and skills from real API format', () => {
    const body = {
      model: 'deepseek-v4',
      messages: [
        { role: 'system', content: 'you are helpful' },
        { role: 'user', content: 'hello' },
      ],
      tools: [
        { type: 'function', function: { name: 'Read', description: 'reads a file' } },
        { type: 'function', function: { name: 'mcp__playwright__click', description: 'clicks' } },
        { type: 'function', function: { name: 'mcp__playwright__type', description: 'types' } },
      ],
    }
    const r = parseRequestBody(body)
    expect(r.messages.roleCounts).toEqual({ system: 1, user: 1 })
    // Read is in BUILTIN_TOOLS
    expect(r.tools.builtin).toHaveLength(1)
    expect(r.tools.builtin[0].name).toBe('Read')
    expect(r.tools.mcp).toHaveLength(2)
    expect(r.tools.mcp[0].name).toBe('mcp__playwright__click')
    expect(r.mcpServers).toHaveLength(1)
    expect(r.mcpServers[0].name).toBe('playwright')
    expect(r.mcpServers[0].toolsCount).toBe(2)
    expect(r.totalEstimatedTokens).toBeGreaterThan(0)
    expect(r.model).toBe('deepseek-v4')
  })

  it('classifies unknown tools as mcp', () => {
    const body = {
      tools: [{ type: 'function', function: { name: 'SomeCustomTool', description: 'custom' } }],
    }
    const r = parseRequestBody(body)
    expect(r.tools.mcp).toHaveLength(1)
    expect(r.tools.builtin).toHaveLength(0)
  })

  it('classifies deferred tools', () => {
    const body = {
      tools: [
        { type: 'function', function: { name: 'CronCreate', description: 'schedule' } },
        { type: 'function', function: { name: 'ImageGen', description: 'generate' } },
      ],
    }
    const r = parseRequestBody(body)
    expect(r.tools.deferred).toHaveLength(2)
  })

  it('extracts skills from Skill tool description', () => {
    const body = {
      tools: [
        {
          type: 'function',
          function: {
            name: 'Skill',
            description: `Execute a skill within the main conversation

<available_skills>
- loop: description (location: bundled)
- cavecrew: Decision guide (location: /Users/test/.codebuddy/plugins/skills/cavecrew/SKILL.md)
- clear: Start fresh (location: )
</available_skills>`,
          },
        },
      ],
    }
    const r = parseRequestBody(body)
    // Only real skills with non-empty location should be extracted
    // "clear" has empty location → skipped
    expect(r.skillTokens).toBeDefined()
    const names = Object.keys(r.skillTokens)
    expect(names).toContain('loop')
    expect(names).toContain('cavecrew')
    // clear has (location: ) with just whitespace → filtered out
    expect(names).not.toContain('clear')
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
    expect(agg.totalEstimatedTokens).toBe(
      Math.round((a.totalEstimatedTokens + b.totalEstimatedTokens) / 2),
    )
  })

  it('returns empty diagnosis when no fragments provided', () => {
    expect(aggregateCaptures([]).totalEstimatedTokens).toBe(0)
  })
})
