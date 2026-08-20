import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRequestBody } from '@/proxy/parser.js'
import { findMainChatBody } from '@/proxy/server.js'

/**
 * WorkBuddy speaks OpenAI Chat Completions against /v2/chat/completions with
 * Anthropic-style tool definitions ({"type":"function","function":{...}}), the
 * same shape as CodeBuddy. The fixture is a real captured WorkBuddy request.
 */
describe('WorkBuddy request body parsing', () => {
  const raw = readFileSync(
    join(process.cwd(), 'tests', 'fixtures', 'workbuddy-main-body.json'),
    'utf8',
  )
  const body = JSON.parse(raw)

  it('fixture is an OpenAI chat/completions request with tools', () => {
    expect(body.model).toBe('deepseek-v4-flash-ioa')
    expect(Array.isArray(body.messages)).toBe(true)
    expect(Array.isArray(body.tools)).toBe(true)
    expect(body.tools.length).toBe(20)
  })

  it('is recognized as the main chat body', () => {
    const main = findMainChatBody([body])
    expect(main).toBeTruthy()
  })

  it('parses with the codebuddy parser (shared format)', () => {
    const parsed = parseRequestBody(body, 'workbuddy')
    expect(parsed.totalEstimatedTokens).toBeGreaterThan(0)
    expect(parsed.model).toBe('deepseek-v4-flash-ioa')
    // 20 builtin tools (Agent, Read, Write, Edit, ...) in the fixture.
    expect(parsed.tools.builtin.length).toBe(20)
    // MCP tools surface via ToolSearch's <available_deferred_tools> block.
    expect(parsed.mcpServers.length).toBeGreaterThan(0)
    expect(parsed.messages.roleTokens.system).toBeGreaterThan(0)
    expect(parsed.messages.roleTokens.user).toBeGreaterThan(0)
    // Agents are extracted from the Agent tool description.
    expect(parsed.agents.length).toBeGreaterThan(0)
  })

  it('also parses with the default (codebuddy) parser for the shared path', () => {
    const parsed = parseRequestBody(body, 'codebuddy')
    expect(parsed.model).toBe('deepseek-v4-flash-ioa')
  })
})
