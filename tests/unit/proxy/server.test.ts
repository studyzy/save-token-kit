import { describe, it, expect } from 'vitest'
import { createProxyServer, findAvailablePort } from '@/proxy/server.js'

describe('proxy server', () => {
  it('falls back to a random port when preferred port is taken', async () => {
    // Occupy the default port with a dummy server.
    const occupied = await findAvailablePort(0)
    const { createServer } = await import('node:http')
    const blocker = createServer().listen(occupied)
    try {
      const port = await findAvailablePort(occupied)
      expect(port).not.toBe(occupied)
    } finally {
      await new Promise<void>((res) => blocker.close(() => res()))
    }
  })

  it('starts, captures a POST /v2 request, then shuts down gracefully', async () => {
    const { address, captures, stop } = await createProxyServer({ port: 0 })
    const port = address.port
    expect(port).toBeGreaterThan(0)

    // Simulate an LLM request hitting the proxy.
    const http = await import('node:http')
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/v2/messages', method: 'POST', headers: { 'content-length': Buffer.byteLength(body) } },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolve())
        },
      )
      req.on('error', reject)
      req.end(body)
    })

    expect(captures.length).toBe(1)
    await stop()
  }, 15000)
})
