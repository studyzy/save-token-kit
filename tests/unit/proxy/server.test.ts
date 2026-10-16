import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startProxy, stopProxy } from '@/proxy/server.js'

describe('proxy server', () => {
  it('starts, captures a POST /v2 request, then shuts down gracefully', async () => {
    const proxy = await startProxy({ port: 0 })
    expect(proxy.port).toBeGreaterThan(0)

    // Simulate an LLM request hitting the proxy.
    const http = await import('node:http')
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v2/messages',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(body)
    })

    expect(proxy.capturedBodies.length).toBe(1)
    await stopProxy(proxy)
  }, 15000)

  it('captures POST /v1 request with custom capturePathPrefix', async () => {
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/' })
    expect(proxy.port).toBeGreaterThan(0)

    const http = await import('node:http')
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(body)
    })

    expect(proxy.capturedBodies.length).toBe(1)
    await stopProxy(proxy)
  }, 15000)

  it('preserves the upstream base path when forwarding', async () => {
    const http = await import('node:http')

    // Fake upstream that records the received path.
    let receivedPath = ''
    const upstream = http.createServer((req, res) => {
      receivedPath = req.url ?? ''
      res.writeHead(200)
      res.end('{}')
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const upstreamPort = (upstream.address() as { port: number }).port

    // Proxy targets `http://127.0.0.1:<port>/anthropic` (path-prefixed base URL).
    const proxy = await startProxy({
      port: 0,
      capturePathPrefix: '/v1/',
      apiBaseUrl: `http://127.0.0.1:${upstreamPort}/anthropic`,
    })

    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(body)
    })

    expect(receivedPath).toBe('/anthropic/v1/messages')

    await stopProxy(proxy)
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  }, 15000)

  it('responds with a Claude Messages mock on /v1/messages', async () => {
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
    const http = await import('node:http')
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    const resBody = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          let data = ''
          res.on('data', (c: Buffer) => (data += c.toString()))
          res.on('end', () => resolve(data))
        },
      )
      req.on('error', reject)
      req.end(body)
    })
    const parsed = JSON.parse(resBody)
    expect(parsed.type).toBe('message')
    expect(parsed.content).toEqual([{ type: 'text', text: '请求内容已获取，请关闭当前会话。' }])
    expect(proxy.capturedBodies.length).toBe(1)
    await stopProxy(proxy)
  }, 15000)

  it('answers a Claude streaming request with SSE and captures the body', async () => {
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
    const http = await import('node:http')
    const body = JSON.stringify({
      model: 'mock',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    })
    const resText = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            'content-length': Buffer.byteLength(body),
          },
        },
        (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream')
          let data = ''
          res.on('data', (c: Buffer) => (data += c.toString()))
          res.on('end', () => resolve(data))
        },
      )
      req.on('error', reject)
      req.end(body)
    })
    expect(resText).toContain('event: message_start')
    expect(resText).toContain('text_delta')
    expect(resText).toContain('请求内容已获取，请关闭当前会话。')
    expect(resText).toContain('event: message_stop')
    expect(proxy.capturedBodies.length).toBe(1)
    await stopProxy(proxy)
  }, 15000)

  it('responds with a CodeX Responses mock on /v1/responses', async () => {
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
    const http = await import('node:http')
    const body = JSON.stringify({ input: [{ role: 'user', content: 'hi' }] })
    const resBody = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/responses',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          let data = ''
          res.on('data', (c: Buffer) => (data += c.toString()))
          res.on('end', () => resolve(data))
        },
      )
      req.on('error', reject)
      req.end(body)
    })
    const parsed = JSON.parse(resBody)
    expect(parsed.object).toBe('response')
    expect(parsed.output[0].role).toBe('assistant')
    expect(parsed.output[0].content[0].text).toBe('请求内容已获取，请关闭当前会话。')
    await stopProxy(proxy)
  }, 15000)

  it('responds with an OpenAI Chat mock on /v1/chat/completions', async () => {
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
    const http = await import('node:http')
    const body = JSON.stringify({ model: 'mock', messages: [{ role: 'user', content: 'hi' }] })
    const resBody = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          let data = ''
          res.on('data', (c: Buffer) => (data += c.toString()))
          res.on('end', () => resolve(data))
        },
      )
      req.on('error', reject)
      req.end(body)
    })
    const parsed = JSON.parse(resBody)
    expect(parsed.object).toBe('chat.completion')
    expect(parsed.choices[0].message.content).toBe('请求内容已获取，请关闭当前会话。')
    await stopProxy(proxy)
  }, 15000)

  it('answers an OpenAI Chat streaming request with SSE and [DONE]', async () => {
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })
    const http = await import('node:http')
    const body = JSON.stringify({
      model: 'mock',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    })
    const resText = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            'content-length': Buffer.byteLength(body),
          },
        },
        (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream')
          let data = ''
          res.on('data', (c: Buffer) => (data += c.toString()))
          res.on('end', () => resolve(data))
        },
      )
      req.on('error', reject)
      req.end(body)
    })
    expect(resText).toContain('chat.completion.chunk')
    expect(resText).toContain('请求内容已获取，请关闭当前会话。')
    expect(resText).toContain('data: [DONE]')
    await stopProxy(proxy)
  }, 15000)

  it('does not forward to upstream when mocking', async () => {
    const http = await import('node:http')
    let hitUpstream = false
    const upstream = http.createServer((_req, res) => {
      hitUpstream = true
      res.writeHead(200)
      res.end('{}')
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const upstreamPort = (upstream.address() as { port: number }).port

    const proxy = await startProxy({
      port: 0,
      capturePathPrefix: '/v1/',
      apiBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      mock: true,
    })
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    const resBody = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          let data = ''
          res.on('data', (c: Buffer) => (data += c.toString()))
          res.on('end', () => resolve(data))
        },
      )
      req.on('error', reject)
      req.end(body)
    })
    expect(hitUpstream).toBe(false)
    expect(JSON.parse(resBody).object).toBe('chat.completion')
    await stopProxy(proxy)
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  }, 15000)
})

describe('proxy server error branches', () => {
  it('falls back to a random port when the preferred port is in use', async () => {
    const http = await import('node:http')
    // Occupy a port first.
    const blocker = http.createServer((_req, res) => res.end())
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const busyPort = (blocker.address() as { port: number }).port

    const proxy = await startProxy({ port: busyPort })
    // Bound successfully on a *different* port than the occupied one.
    expect(proxy.port).toBeGreaterThan(0)
    expect(proxy.port).not.toBe(busyPort)

    await stopProxy(proxy)
    await new Promise<void>((resolve) => blocker.close(() => resolve()))
  }, 15000)

  it('returns 502 when the upstream connection fails', async () => {
    const http = await import('node:http')
    // Bind then close to get a definitely-unused port.
    const probe = http.createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const deadPort = (probe.address() as { port: number }).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))

    const proxy = await startProxy({
      port: 0,
      capturePathPrefix: '/v1/',
      apiBaseUrl: `http://127.0.0.1:${deadPort}`,
    })
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': Buffer.byteLength(body) },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve(res.statusCode ?? 0))
        },
      )
      req.on('error', reject)
      req.end(body)
    })
    expect(status).toBe(502)
    await stopProxy(proxy)
  }, 15000)

  it('forwards an empty body without dropping the request', async () => {
    const http = await import('node:http')
    let received = ''
    let hit = false
    const upstream = http.createServer((req, res) => {
      hit = true
      req.on('data', (c: Buffer) => (received += c.toString()))
      req.on('end', () => {
        res.writeHead(200)
        res.end('{}')
      })
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const upstreamPort = (upstream.address() as { port: number }).port

    const proxy = await startProxy({
      port: 0,
      capturePathPrefix: '/v1/',
      apiBaseUrl: `http://127.0.0.1:${upstreamPort}`,
    })
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: proxy.port, path: '/v1/messages', method: 'POST' },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(hit).toBe(true)
    expect(received).toBe('')
    await stopProxy(proxy)
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  }, 15000)
})

describe('proxy server content-encoding handling', () => {
  it('decodes a gzip-encoded request body for capture', async () => {
    const http = await import('node:http')
    const zlib = await import('node:zlib')
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })

    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    const gz = zlib.gzipSync(Buffer.from(body))
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': gz.length, 'content-encoding': 'gzip' },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(gz)
    })

    // Decoded JSON is captured (not a binary string).
    expect(proxy.capturedBodies.length).toBe(1)
    expect(proxy.capturedBodies[0]).toEqual({ messages: [{ role: 'user', content: 'hi' }] })
    await stopProxy(proxy)
  }, 15000)

  it('skips capture for an unknown content-encoding (zstd) instead of storing garbage', async () => {
    const http = await import('node:http')
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })

    // Arbitrary non-JSON bytes under an encoding we cannot decode.
    const raw = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x01, 0x02, 0x03])
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': raw.length, 'content-encoding': 'zstd' },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(raw)
    })

    expect(proxy.capturedBodies.length).toBe(0)
    await stopProxy(proxy)
  }, 15000)

  it('handles a comma-joined encoding chain (gzip, deflate)', async () => {
    const http = await import('node:http')
    const zlib = await import('node:zlib')
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })

    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    // Applied outermost-first: gzip(deflate(body)); decode reverses both.
    const encoded = zlib.gzipSync(zlib.deflateSync(Buffer.from(body)))
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': encoded.length, 'content-encoding': 'gzip, deflate' },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(encoded)
    })

    expect(proxy.capturedBodies.length).toBe(1)
    expect(proxy.capturedBodies[0]).toEqual({ messages: [{ role: 'user', content: 'hi' }] })
    await stopProxy(proxy)
  }, 15000)

  it('does not inflate a gzip bomb past the size limit', async () => {
    const http = await import('node:http')
    const zlib = await import('node:zlib')
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true })

    // 60MB of zeros compresses to ~60KB — well under the raw-byte limit, so
    // only the decode-time maxOutputLength guard can stop it.
    const bomb = zlib.gzipSync(Buffer.alloc(60 * 1024 * 1024))
    expect(bomb.length).toBeLessThan(1024 * 1024)
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: { 'content-length': bomb.length, 'content-encoding': 'gzip' },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(bomb)
    })

    // Over-limit expansion → skipped, nothing captured, no crash.
    expect(proxy.capturedBodies.length).toBe(0)
    await stopProxy(proxy)
  }, 20000)
})

describe('proxy server trace redaction', () => {
  let traceDir: string

  afterEach(() => {
    if (traceDir) rmSync(traceDir, { recursive: true, force: true })
  })

  it('redacts sensitive request headers in trace request.json', async () => {
    traceDir = mkdtempSync(join(tmpdir(), 'stk-trace-'))
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true, traceDir })

    const http = await import('node:http')
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: proxy.port,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'content-length': Buffer.byteLength(body),
            authorization: 'Bearer secret-token',
            'x-api-key': 'sk-secret-key',
            cookie: 'session=abc123',
            'x-conversation-id': 'conv-42',
          },
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(body)
    })

    await stopProxy(proxy)

    // Find the written request.json under traceDir/<sessionId>/<timestamp>-request.json
    // (traceDir root also holds a SENSITIVE.md warning file — skip it).
    const sessionDirs = readdirSync(traceDir).filter((n) => !n.endsWith('.md'))
    expect(sessionDirs.length).toBeGreaterThan(0)
    const sessionDir = join(traceDir, sessionDirs[0])
    const files = readdirSync(sessionDir).filter((f) => f.endsWith('-request.json'))
    expect(files.length).toBe(1)

    const trace = JSON.parse(readFileSync(join(sessionDir, files[0]), 'utf8'))
    const headers = trace.meta.requestHeaders as Record<string, string>
    expect(headers['authorization']).toBe('[REDACTED]')
    expect(headers['x-api-key']).toBe('[REDACTED]')
    expect(headers['cookie']).toBe('[REDACTED]')
    // Non-sensitive headers are preserved.
    expect(headers['x-conversation-id']).toBe('conv-42')
  }, 15000)

  it('writes a SENSITIVE.md warning into the trace dir', async () => {
    traceDir = mkdtempSync(join(tmpdir(), 'stk-trace-'))
    const proxy = await startProxy({ port: 0, capturePathPrefix: '/v1/', mock: true, traceDir })
    await stopProxy(proxy)

    const warnPath = join(traceDir, 'SENSITIVE.md')
    expect(existsSync(warnPath)).toBe(true)
    expect(readFileSync(warnPath, 'utf8')).toContain('敏感')
  }, 15000)
})
