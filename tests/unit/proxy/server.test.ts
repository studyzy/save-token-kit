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
})
