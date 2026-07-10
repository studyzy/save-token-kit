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
})
