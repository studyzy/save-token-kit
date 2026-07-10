import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { ProxyCapture } from '../types/index.js'
import { DEFAULT_PROXY_PORT } from '../types/index.js'

export interface ProxyOptions {
  /** Preferred listen port. 0 means pick a random free port. */
  port?: number
  /** Called for every captured POST /v2/* request body. */
  onCapture?: (capture: ProxyCapture) => void
}

export interface RunningProxy {
  /** Resolved listen address. */
  address: { port: number; host: string }
  /** Collected captures so far. */
  captures: ProxyCapture[]
  /** Stop the server and resolve once closed. */
  stop: () => Promise<void>
}

/**
 * Find an available TCP port. If `preferred` is already taken, fall back to a
 * random free port (preferred === 0 also yields a random port).
 */
export function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', () => {
      // Preferred port unavailable -> use port 0 (OS assigns a free one).
      const fallback = createServer()
      fallback.listen(0, () => {
        const p = (fallback.address() as { port: number }).port
        fallback.close(() => resolve(p))
      })
      fallback.once('error', reject)
    })
    srv.listen(preferred, () => {
      const p = (srv.address() as { port: number }).port
      srv.close(() => resolve(p))
    })
  })
}

/**
 * Start the HTTP proxy server that intercepts CodeBuddy's LLM requests.
 * Listens on 127.0.0.1 and captures POST /v2/* bodies.
 */
export function createProxyServer(options: ProxyOptions = {}): Promise<RunningProxy> {
  const captures: ProxyCapture[] = []
  const port = options.port ?? DEFAULT_PROXY_PORT

  return new Promise((resolve, reject) => {
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        // Capture only LLM-bound POST /v2/* requests.
        if (req.method === 'POST' && req.url?.startsWith('/v2/')) {
          let raw: unknown
          try {
            raw = Buffer.concat(chunks).toString('utf8')
            raw = JSON.parse(raw as string)
          } catch {
            raw = Buffer.concat(chunks).toString('utf8')
          }
          const capture: ProxyCapture = {
            rawBody: raw,
            parsed: { messages: { roleCounts: {}, roleTokens: {}, breakdown: [] }, tools: { builtin: [], mcp: [], deferred: [] }, skills: [], mcpServers: [], totalEstimatedTokens: 0 },
            capturedAt: new Date().toISOString(),
          }
          captures.push(capture)
          options.onCapture?.(capture)
        }
        // Respond 200 so the client (CodeBuddy) does not error out.
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })
      req.on('error', () => {
        // Never break the server on a bad request; keep waiting for the next one.
        res.writeHead(400)
        res.end()
      })
    })

    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      const running: RunningProxy = {
        address: { port: addr.port, host: '127.0.0.1' },
        captures,
        stop: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          }),
      }
      resolve(running)
    })
  })
}

/** Best-effort local IP for display (usually 127.0.0.1). */
export function localHost(): string {
  const nets = networkInterfaces()
  for (const list of Object.values(nets)) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address
    }
  }
  return '127.0.0.1'
}
