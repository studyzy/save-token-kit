import * as http from 'node:http'
import * as https from 'node:https'

const DEFAULT_CODEBUDDY_API = 'https://tencent.sso.copilot.tencent.com'

export interface ProxyOptions {
  apiBaseUrl?: string
  port?: number
}

export interface ProxyInstance {
  port: number
  server: http.Server
  capturedBodies: unknown[]
  captured: boolean
}

/**
 * Start a transparent HTTP proxy on 127.0.0.1.
 * Intercepts POST /v2/* requests, captures request bodies,
 * and forwards everything to the real CodeBuddy API backend.
 */
export function startProxy(options?: ProxyOptions): Promise<ProxyInstance> {
  const apiBaseUrl = options?.apiBaseUrl ?? process.env.CODEBUDDY_API_BASE ?? DEFAULT_CODEBUDDY_API
  const target = new URL(apiBaseUrl)
  const port = options?.port ?? 54321

  const instance: ProxyInstance = {
    port: 0,
    server: null as unknown as http.Server,
    capturedBodies: [],
    captured: false,
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = []

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      req.on('end', () => {
        const rawBody = Buffer.concat(chunks)
        const bodyStr = rawBody.toString('utf-8')

        // Capture all POST /v2/* request bodies
        if (req.method === 'POST' && req.url?.startsWith('/v2/') && bodyStr) {
          try {
            const parsed: unknown = JSON.parse(bodyStr)
            instance.capturedBodies.push(parsed)
            instance.captured = true
          } catch {
            instance.capturedBodies.push(bodyStr)
            instance.captured = true
          }
        }

        // Forward to real API
        const isHttps = target.protocol === 'https:'
        const forwarder = isHttps ? https : http
        const forward = forwarder.request(
          {
            hostname: target.hostname,
            port: target.port || (isHttps ? 443 : 80),
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: target.hostname },
          },
          (forwardRes) => {
            res.writeHead(forwardRes.statusCode ?? 200, forwardRes.headers)
            forwardRes.pipe(res)
          },
        )

        forward.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502)
            res.end(`Proxy error: ${err.message}`)
          }
        })

        if (bodyStr) {
          forward.write(rawBody)
        }
        forward.end()
      })
    })

    server.on('error', reject)

    const tryListen = (p: number): void => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          server.listen(0, '127.0.0.1')
        } else {
          reject(err)
        }
      })
      server.listen(p, '127.0.0.1', () => {
        server.removeAllListeners('error')
        const addr = server.address()
        if (!addr || typeof addr === 'string') {
          reject(new Error('Failed to get server address'))
          return
        }
        instance.port = addr.port
        instance.server = server
        resolve(instance)
      })
    }
    tryListen(port)
  })
}

/**
 * Find the main chat/completions request from all captured bodies.
 * Heuristic: the body with messages array that contains at least one user
 * message and has tools definitions (or many messages).
 */
export function findMainChatBody(bodies: unknown[]): Record<string, unknown> | null {
  for (const body of bodies) {
    if (typeof body !== 'object' || body === null) continue
    const b = body as Record<string, unknown>
    const messages = b['messages'] as Array<Record<string, unknown>> | undefined
    if (!messages || !Array.isArray(messages)) continue
    const hasUser = messages.some((m) => m['role'] === 'user')
    const hasTools = Array.isArray(b['tools']) && (b['tools'] as unknown[]).length > 0
    const hasManyMessages = messages.length > 2
    if (hasUser && (hasTools || hasManyMessages)) {
      return b
    }
  }
  // Fallback: return the body with the most messages
  let best: Record<string, unknown> | null = null
  let bestCount = 0
  for (const body of bodies) {
    if (typeof body !== 'object' || body === null) continue
    const b = body as Record<string, unknown>
    const messages = b['messages'] as Array<unknown> | undefined
    if (messages && messages.length > bestCount) {
      bestCount = messages.length
      best = b
    }
  }
  return best
}

/**
 * Stop the proxy server.
 */
export function stopProxy(instance: ProxyInstance): Promise<void> {
  return new Promise((resolve) => {
    instance.server.close(() => {
      resolve()
    })
  })
}
