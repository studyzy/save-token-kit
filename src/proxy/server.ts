import * as http from 'node:http'
import * as https from 'node:https'
import { mkdirSync, writeFileSync } from 'node:fs'

const DEFAULT_CODEBUDDY_API = 'https://tencent.sso.copilot.tencent.com'

export interface ProxyOptions {
  apiBaseUrl?: string
  port?: number
  /** If set, write every request/response pair as JSON files under this dir. */
  traceDir?: string
}

export interface ProxyInstance {
  port: number
  server: http.Server
  capturedBodies: unknown[]
  captured: boolean
  /** Trace directory (mirrors ProxyOptions.traceDir). */
  traceDir?: string
}

interface TraceContext {
  sessionDir: string
  timestamp: string
  meta: {
    sessionId: string
    timestamp: string
    method: string
    url: string
    requestHeaders: Record<string, string>
  }
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
  const traceDir = options?.traceDir

  const instance: ProxyInstance = {
    port: 0,
    server: null as unknown as http.Server,
    capturedBodies: [],
    captured: false,
    traceDir,
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

        // Prepare trace context if traceDir is set and not filtered out.
        // Skip low-value background purposes (prompt suggestions, memory
        // selection, topic detection) to keep traces focused on real turns.
        const skipPurposes = new Set(['prompt_suggestion', 'memory_selection', 'conversation_topic'])
        const purpose = req.headers['x-agent-purpose']
        const purposeStr = Array.isArray(purpose) ? (purpose[0] ?? '') : (purpose ?? '')
        const skipTrace = purposeStr !== '' && skipPurposes.has(purposeStr)
        const traceContext = traceDir && !skipTrace ? prepareTrace(req, rawBody, traceDir) : null

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
            if (traceContext) {
              const respChunks: Buffer[] = []
              forwardRes.on('data', (c: Buffer) => {
                respChunks.push(c)
                res.write(c)
              })
              forwardRes.on('end', () => {
                res.end()
                finalizeTrace(traceContext, forwardRes, Buffer.concat(respChunks))
              })
            } else {
              forwardRes.pipe(res)
            }
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
 * Write the request side of a trace pair to `<traceDir>/<sessionId>/<timestamp>-request.json`.
 * Returns the context needed to finalize the response side later.
 */
function prepareTrace(
  req: http.IncomingMessage,
  rawBody: Buffer,
  traceDir: string,
): TraceContext {
  const sessionId = extractSessionId(req.headers)
  const timestamp = formatTimestamp(new Date())
  const sessionDir = `${traceDir}/${sessionId}`
  mkdirSync(sessionDir, { recursive: true })

  const requestHeaders = simplifyHeaders(req.headers)
  let parsedBody: unknown = rawBody.toString('utf-8')
  try {
    parsedBody = JSON.parse(parsedBody as string)
  } catch {
    // keep raw string
  }

  const meta = {
    sessionId,
    timestamp,
    method: req.method ?? 'unknown',
    url: req.url ?? '',
    requestHeaders,
  }
  writeJsonFile(`${sessionDir}/${timestamp}-request.json`, { meta, body: parsedBody })

  return { sessionDir, timestamp, meta }
}

/**
 * Write the response side of a trace pair to `<traceDir>/<sessionId>/<timestamp>-response.json`.
 */
function finalizeTrace(
  ctx: TraceContext,
  forwardRes: http.IncomingMessage,
  respBody: Buffer,
): void {
  const responseHeaders = simplifyHeaders(forwardRes.headers)
  const bodyStr = respBody.toString('utf-8')
  let parsedBody: unknown = bodyStr
  try {
    parsedBody = JSON.parse(bodyStr)
  } catch {
    // keep raw string
  }

  writeJsonFile(`${ctx.sessionDir}/${ctx.timestamp}-response.json`, {
    meta: {
      ...ctx.meta,
      responseStatus: forwardRes.statusCode ?? 0,
      responseHeaders,
    },
    body: parsedBody,
  })
}

function extractSessionId(headers: http.IncomingHttpHeaders): string {
  const v = headers['x-conversation-id']
  if (Array.isArray(v) && v.length > 0) return v[0] ?? 'no-session'
  if (typeof v === 'string' && v) return v
  return 'no-session'
}

function simplifyHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (Array.isArray(v)) out[k] = v.join(', ')
    else if (v !== undefined) out[k] = v
  }
  return out
}

function formatTimestamp(d: Date): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  const ms = pad(d.getMilliseconds(), 3)
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}${ms}`
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2))
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
