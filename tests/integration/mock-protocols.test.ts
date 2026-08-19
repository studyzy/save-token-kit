import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as http from 'node:http'
import { startProxy, stopProxy } from '@/proxy/server.js'
import { parseRequestBody } from '@/proxy/parser.js'

/**
 * 三种 LLM 协议的 mock 集成测试。
 *
 * mock server 按请求 URL 路径路由协议：
 *   - /v1/chat/completions -> OpenAI Chat (CodeBuddy)
 *   - /v1/messages         -> Anthropic Messages (Claude Code)
 *   - /v1/responses        -> OpenAI Responses (CodeX)
 *
 * 每个协议验证：
 *   1. 非流式请求 -> 返回对应协议的 JSON 响应格式
 *   2. 流式请求   -> 返回对应协议的 SSE 响应格式
 *   3. 请求体被捕获，且能被对应协议解析器 parseRequestBody 解析
 */
describe('mock server 三种协议集成', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  /** 通过 proxy 发送一个 POST 请求，返回 (响应头, 响应体) */
  async function post(
    port: number,
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; contentType: string; text: string }> {
    const payload = JSON.stringify(body)
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: { 'content-length': String(Buffer.byteLength(payload)), ...headers },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              contentType: (res.headers['content-type'] ?? '') as string,
              text: Buffer.concat(chunks).toString('utf-8'),
            }),
          )
        },
      )
      req.on('error', reject)
      req.end(payload)
    })
  }

  describe('OpenAI Chat (/v1/chat/completions, CodeBuddy)', () => {
    it('非流式请求返回 OpenAI Chat JSON 响应', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      const res = await post(proxy.port, '/v1/chat/completions', {
        model: 'mock',
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(res.status).toBe(200)
      expect(res.contentType).toContain('application/json')
      const parsed = JSON.parse(res.text)
      expect(parsed.object).toBe('chat.completion')
      expect(parsed.choices[0].message.content).toBe('Hello')
      expect(parsed.usage.total_tokens).toBe(2)
      await stopProxy(proxy)
    }, 15000)

    it('流式请求返回 SSE 并以 [DONE] 结束', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      const res = await post(
        proxy.port,
        '/v1/chat/completions',
        { model: 'mock', messages: [{ role: 'user', content: 'hi' }], stream: true },
        { accept: 'text/event-stream' },
      )
      expect(res.status).toBe(200)
      expect(res.contentType).toContain('text/event-stream')
      expect(res.text).toContain('"object":"chat.completion.chunk"')
      expect(res.text).toContain('Hello')
      expect(res.text).toContain('data: [DONE]')
      await stopProxy(proxy)
    }, 15000)

    it('捕获的请求体可被 CodeBuddy 解析器解析', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      await post(proxy.port, '/v1/chat/completions', {
        model: 'mock',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ type: 'function', function: { name: 'Read' } }],
      })
      expect(proxy.capturedBodies.length).toBe(1)
      const parsed = parseRequestBody(proxy.capturedBodies[0], 'codebuddy')
      expect(parsed.model).toBe('mock')
      expect(parsed.messages.roleCounts.user).toBe(1)
      expect(parsed.tools.builtin.some((t) => t.name === 'Read')).toBe(true)
      await stopProxy(proxy)
    }, 15000)
  })

  describe('Anthropic Messages (/v1/messages, Claude Code)', () => {
    it('非流式请求返回 Anthropic Messages JSON 响应', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      const res = await post(proxy.port, '/v1/messages', {
        model: 'mock',
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(res.status).toBe(200)
      expect(res.contentType).toContain('application/json')
      const parsed = JSON.parse(res.text)
      expect(parsed.type).toBe('message')
      expect(parsed.content).toEqual([{ type: 'text', text: 'Hello' }])
      expect(parsed.stop_reason).toBe('end_turn')
      await stopProxy(proxy)
    }, 15000)

    it('流式请求返回 Anthropic SSE 事件', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      const res = await post(
        proxy.port,
        '/v1/messages',
        { model: 'mock', messages: [{ role: 'user', content: 'hi' }], stream: true },
        { accept: 'text/event-stream' },
      )
      expect(res.status).toBe(200)
      expect(res.contentType).toContain('text/event-stream')
      expect(res.text).toContain('event: message_start')
      expect(res.text).toContain('event: content_block_delta')
      expect(res.text).toContain('event: message_stop')
      expect(res.text).toContain('Hello')
      await stopProxy(proxy)
    }, 15000)

    it('捕获的请求体可被 Claude 解析器解析', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      await post(proxy.port, '/v1/messages', {
        model: 'mock',
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(proxy.capturedBodies.length).toBe(1)
      const parsed = parseRequestBody(proxy.capturedBodies[0], 'claude')
      expect(parsed.model).toBe('mock')
      expect(parsed.messages.roleCounts.user).toBe(1)
      await stopProxy(proxy)
    }, 15000)
  })

  describe('OpenAI Responses (/v1/responses, CodeX)', () => {
    it('非流式请求返回 OpenAI Responses JSON 响应', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      const res = await post(proxy.port, '/v1/responses', {
        model: 'mock',
        input: [{ role: 'user', content: 'hi' }],
      })
      expect(res.status).toBe(200)
      expect(res.contentType).toContain('application/json')
      const parsed = JSON.parse(res.text)
      expect(parsed.object).toBe('response')
      expect(parsed.output[0].role).toBe('assistant')
      expect(parsed.output[0].content[0].text).toBe('Hello')
      await stopProxy(proxy)
    }, 15000)

    it('流式请求返回 OpenAI Responses SSE 事件', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      const res = await post(
        proxy.port,
        '/v1/responses',
        { model: 'mock', input: [{ role: 'user', content: 'hi' }], stream: true },
        { accept: 'text/event-stream' },
      )
      expect(res.status).toBe(200)
      expect(res.contentType).toContain('text/event-stream')
      expect(res.text).toContain('event: response.created')
      expect(res.text).toContain('event: response.output_text.delta')
      expect(res.text).toContain('event: response.completed')
      expect(res.text).toContain('Hello')
      await stopProxy(proxy)
    }, 15000)

    it('捕获的请求体可被 CodeX 解析器解析', async () => {
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      await post(proxy.port, '/v1/responses', {
        model: 'mock',
        input: [{ role: 'user', content: 'hi' }],
      })
      expect(proxy.capturedBodies.length).toBe(1)
      const parsed = parseRequestBody(proxy.capturedBodies[0], 'codex')
      expect(parsed.model).toBe('mock')
      expect(parsed.messages.roleCounts.user).toBe(1)
      await stopProxy(proxy)
    }, 15000)
  })

  describe('诊断报告落盘（模拟 runDiagnose 写文件）', () => {
    it('捕获 OpenAI Chat 请求并生成诊断 JSON 报告', async () => {
      tmp = mkdtempSync(join(tmpdir(), 'stk-mock-'))
      const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
      await post(proxy.port, '/v1/chat/completions', {
        model: 'mock',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ type: 'function', function: { name: 'Read' } }],
      })
      const parsed = parseRequestBody(proxy.capturedBodies[0], 'codebuddy')

      const outDir = join(tmp, 'save-token')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'proxy-raw-body.json'), JSON.stringify(proxy.capturedBodies, null, 2))
      writeFileSync(join(outDir, 'diagnosis-report.json'), JSON.stringify(parsed, null, 2))

      expect(existsSync(join(outDir, 'diagnosis-report.json'))).toBe(true)
      expect(existsSync(join(outDir, 'proxy-raw-body.json'))).toBe(true)
      await stopProxy(proxy)
    }, 15000)
  })
})
