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
    // Read is a builtin tool
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

  it('classifies unknown tools as builtin', () => {
    const body = {
      tools: [{ type: 'function', function: { name: 'SomeCustomTool', description: 'custom' } }],
    }
    const r = parseRequestBody(body)
    expect(r.tools.builtin).toHaveLength(1)
    expect(r.tools.mcp).toHaveLength(0)
  })

  it('treats deferred-capable builtins (CronCreate etc.) as builtin', () => {
    const body = {
      tools: [
        { type: 'function', function: { name: 'CronCreate', description: 'schedule' } },
        { type: 'function', function: { name: 'ImageGen', description: 'generate' } },
      ],
    }
    const r = parseRequestBody(body)
    expect(r.tools.builtin.map((t) => t.name).sort()).toEqual(['CronCreate', 'ImageGen'])
    expect(r.tools.mcp).toHaveLength(0)
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

  it('extracts skills from Claude-mode system listing', () => {
    const body = {
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'system',
          content: `Some agent usage notes... (Tools: Read, Edit)

The following skills are available for use with the Skill tool:

- stk-analyze: 分析用户AI使用场景，提供Token节省方案
- superpowers:brainstorming: You MUST use this before any creative work. Explores user intent.
- superpowers:test-driven-development
- dataviz: Use this skill for ANY chart or data visualization.
  Read it BEFORE writing chart code.
- init
- security-review

Next unrelated section starts here.`,
        },
      ],
      tools: [],
    }
    const r = parseRequestBody(body, 'claude')
    expect(Object.keys(r.skillTokens).sort()).toEqual([
      'dataviz',
      'init',
      'security-review',
      'stk-analyze',
      'superpowers:brainstorming',
      'superpowers:test-driven-development',
    ])
    // Names with colons: split at first ": ".
    expect(r.skillTokens['superpowers:brainstorming'].description).toContain(
      'You MUST use this before any creative work',
    )
    // Multi-line descriptions are joined onto the current entry.
    expect(r.skillTokens['dataviz'].description).toContain('Read it BEFORE writing chart code')
    // Bare-name entries get an empty description.
    expect(r.skillTokens['init'].description).toBe('')
    // Content after the paragraph is not part of the listing.
    expect(Object.keys(r.skillTokens)).not.toContain('Next')
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

  it('handles Anthropic top-level system field as virtual system message', () => {
    const body = {
      model: 'claude-sonnet-4-20250514',
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'Read', description: 'read file', input_schema: {} }],
    }
    const r = parseRequestBody(body, 'claude')
    expect(r.messages.roleCounts.system).toBe(1)
    expect(r.messages.roleTokens.system).toBeGreaterThan(0)
  })

  it('handles Anthropic system as content blocks array', () => {
    const body = {
      model: 'claude-sonnet-4-20250514',
      system: [{ type: 'text', text: 'You are helpful' }],
      messages: [{ role: 'user', content: 'hello' }],
    }
    const r = parseRequestBody(body, 'claude')
    expect(r.messages.roleCounts.system).toBe(1)
    expect(r.messages.roleTokens.system).toBeGreaterThan(0)
  })

  it('dispatches by agent name, defaulting to codebuddy', () => {
    // A Claude-mode skills header body: only the Claude parser understands it.
    const claudeBody = {
      messages: [
        {
          role: 'system',
          content: 'The following skills are available for use with the Skill tool:\n\n- foo: bar',
        },
      ],
      tools: [],
    }
    expect(Object.keys(parseRequestBody(claudeBody, 'claude').skillTokens)).toContain('foo')
    // Default (and unknown agents) route to the CodeBuddy parser.
    expect(Object.keys(parseRequestBody(claudeBody).skillTokens)).not.toContain('foo')
    expect(Object.keys(parseRequestBody(claudeBody, 'codex').skillTokens)).not.toContain('foo')
  })

  it('classifies Claude agents as bundled vs project from builtin list', () => {
    const body = {
      messages: [
        {
          role: 'system',
          content:
            'Available agent types for the Agent tool:\n' +
            '- Explore: Read-only search agent (Tools: Read, Grep)\n' +
            '- statusline-setup: Configure status line (Tools: Read, Edit)\n' +
            '- lint-check-fix: 检查并修复 lint 错误 (Tools: All tools)\n',
        },
      ],
      tools: [],
    }
    const r = parseRequestBody(body, 'claude')
    const byName = Object.fromEntries((r.agents ?? []).map((a) => [a.name, a.source]))
    expect(byName['Explore']).toBe('bundled')
    expect(byName['statusline-setup']).toBe('bundled')
    expect(byName['lint-check-fix']).toBe('project')
  })

  it('parses CodeX Responses API body (input/instructions/tools)', () => {
    const body = {
      model: 'gpt-5-codex',
      instructions: 'You are a coding agent. <rules>some rules</rules>',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] },
      ],
      tools: [
        { type: 'function', name: 'Read', description: 'reads a file', parameters: {} },
        { type: 'function', name: 'mcp__playwright__click', description: 'clicks', parameters: {} },
        {
          type: 'function',
          name: 'Agent',
          description:
            '- Explore: Read-only search agent (Tools: Read, Grep)\n' +
            '- lint-check-fix: 检查并修复 lint 错误 (Tools: All tools)',
          parameters: {},
        },
      ],
    }
    const r = parseRequestBody(body, 'codex')
    // instructions becomes a virtual system message
    expect(r.messages.roleCounts.system).toBe(1)
    expect(r.messages.roleCounts.user).toBe(1)
    // OpenAI-format tools: Read builtin, playwright MCP
    expect(r.tools.builtin.map((t) => t.name)).toContain('Read')
    expect(r.tools.mcp.map((t) => t.name)).toContain('mcp__playwright__click')
    expect(r.mcpServers).toHaveLength(1)
    expect(r.mcpServers[0].name).toBe('playwright')
    // Subagents extracted from the Agent tool description
    const agentNames = (r.agents ?? []).map((a) => a.name)
    expect(agentNames).toContain('Explore')
    expect(agentNames).toContain('lint-check-fix')
    expect(r.model).toBe('gpt-5-codex')
    expect(r.rulesTokens).toBeGreaterThan(0)
    expect(r.totalEstimatedTokens).toBeGreaterThan(0)
  })

  it('extracts skills from CodeX Skill tool description', () => {
    const body = {
      model: 'gpt-5-codex',
      instructions: 'You are a coding agent',
      input: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          type: 'function',
          name: 'Skill',
          description: `Execute a skill within the main conversation

<available_skills>
- loop: description (location: bundled)
- cavecrew: Decision guide (location: /Users/test/.codex/skills/cavecrew/SKILL.md)
</available_skills>`,
          parameters: {},
        },
      ],
    }
    const r = parseRequestBody(body, 'codex')
    expect(Object.keys(r.skillTokens)).toContain('loop')
    expect(Object.keys(r.skillTokens)).toContain('cavecrew')
  })

  it('extracts skills from CodeX input <skills_instructions> block', () => {
    const body = {
      model: 'gpt-5-codex',
      instructions: 'You are a coding agent',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `<skills_instructions>
## Skills
### Available skills
- imagegen: Generate images. (file: /Users/test/.codex/skills/.system/imagegen/SKILL.md)
- visualize: Create visualizations. (file: /Users/test/.codex/plugins/cache/openai-bundled/visualize/1.0.20/skills/visualize/SKILL.md)
- plugin-creator: Create plugins. (file: /Users/test/.codex/skills/.system/plugin-creator/SKILL.md)
</skills_instructions>`,
            },
          ],
        },
      ],
      tools: [],
    }
    const r = parseRequestBody(body, 'codex')
    const names = Object.keys(r.skillTokens)
    expect(names).toContain('imagegen')
    expect(names).toContain('visualize')
    expect(names).toContain('plugin-creator')
    expect(r.skillTokens.imagegen.location).toContain('imagegen/SKILL.md')
    // skills should be surfaced in the report as bundled entries
    const skillNames = (r.skills ?? []).map((s) => s.name)
    expect(skillNames).toContain('visualize')
  })
})
