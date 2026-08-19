import { describe, it, expect } from 'vitest'
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
    expect(parsed.content).toEqual([{ type: 'text', text: 'Hello' }])
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
    expect(resText).toContain('Hello')
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
    expect(parsed.output[0].content[0].text).toBe('Hello')
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
    expect(parsed.choices[0].message.content).toBe('Hello')
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
    expect(resText).toContain('Hello')
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
