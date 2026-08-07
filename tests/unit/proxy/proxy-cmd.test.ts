import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as http from 'node:http'
import { startProxy, stopProxy } from '@/proxy/server.js'

/**
 * trace 功能测试：验证 proxy 在 traceDir 模式下能把请求/响应成对写入磁盘，
 * 且 x-agent-purpose 命中 skipPurposes 的请求不被记录。
 */
describe('proxy trace', () => {
  let traceDir: string
  let upstream: http.Server
  let upstreamPort: number

  beforeEach(async () => {
    traceDir = mkdtempSync(join(tmpdir(), 'stk-trace-'))
    // 本地 upstream，避免依赖真实 CodeBuddy API
    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, echo: Buffer.concat(chunks).toString('utf-8') }))
      })
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    upstreamPort = (upstream.address() as http.AddressInfo).port
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
    rmSync(traceDir, { recursive: true, force: true })
  })

  async function post(
    port: number,
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<void> {
    const payload = JSON.stringify(body)
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: { 'content-length': String(Buffer.byteLength(payload)), ...headers },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(payload)
    })
  }

  it('writes paired request/response JSON files under traceDir/<sessionId>', async () => {
    const proxy = await startProxy({
      port: 0,
      apiBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      traceDir,
    })

    await post(
      proxy.port,
      '/v2/messages',
      { messages: [{ role: 'user', content: 'hi' }] },
      {
        'x-conversation-id': 'sess-123',
      },
    )

    // 给 finalizeTrace 一点刷盘时间
    await new Promise((r) => setTimeout(r, 50))
    await stopProxy(proxy)

    const sessionDir = join(traceDir, 'sess-123')
    const files = readdirSync(sessionDir).sort()
    expect(files.length).toBe(2)
    expect(files.some((f) => f.endsWith('-request.json'))).toBe(true)
    expect(files.some((f) => f.endsWith('-response.json'))).toBe(true)

    const reqFile = JSON.parse(readFileSync(join(sessionDir, files[0]), 'utf-8'))
    expect(reqFile.meta.method).toBe('POST')
    expect(reqFile.meta.url).toBe('/v2/messages')
    expect(reqFile.body.messages[0].content).toBe('hi')

    const resFile = JSON.parse(readFileSync(join(sessionDir, files[1]), 'utf-8'))
    expect(resFile.meta.responseStatus).toBe(200)
    expect(resFile.body.ok).toBe(true)
  }, 15000)

  it('skips tracing requests whose x-agent-purpose is in skipPurposes', async () => {
    const proxy = await startProxy({
      port: 0,
      apiBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      traceDir,
    })

    await post(
      proxy.port,
      '/v2/messages',
      { messages: [{ role: 'user', content: 'suggest' }] },
      { 'x-agent-purpose': 'prompt_suggestion' },
    )

    await new Promise((r) => setTimeout(r, 50))
    await stopProxy(proxy)

    // traceDir 下不应有任何 session 目录被创建
    const entries = readdirSync(traceDir)
    expect(entries.length).toBe(0)
  }, 15000)

  it('still captures bodies for skipped-purpose requests (capturedBodies unaffected)', async () => {
    const proxy = await startProxy({
      port: 0,
      apiBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      traceDir,
    })

    await post(
      proxy.port,
      '/v2/messages',
      { messages: [{ role: 'user', content: 'suggest' }] },
      { 'x-agent-purpose': 'memory_selection' },
    )

    await new Promise((r) => setTimeout(r, 50))
    await stopProxy(proxy)

    expect(proxy.capturedBodies.length).toBe(1)
    expect(readdirSync(traceDir).length).toBe(0)
  }, 15000)
})
