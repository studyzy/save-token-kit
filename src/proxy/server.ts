import * as http from 'node:http'
import * as https from 'node:https'
import { mkdirSync, writeFileSync } from 'node:fs'

const DEFAULT_CODEBUDDY_API = 'https://tencent.sso.copilot.tencent.com'

export interface ProxyOptions {
  apiBaseUrl?: string
  port?: number
  /** If set, write every request/response pair as JSON files under this dir. */
  traceDir?: string
  /** URL path prefix to capture (e.g. "/v1/" for CodeBuddy/Claude/CodeX) */
  capturePathPrefix?: string
  /** Default upstream API base URL when apiBaseUrl is not set */
  defaultApiBase?: string
  /**
   * When true, respond to captured requests with a protocol-appropriate mock
   * "Hello" response instead of forwarding to the real upstream. The response
   * protocol is selected by the request URL path:
   *   - `/v1/chat/completions` -> OpenAI Chat (CodeBuddy)
   *   - `/v1/messages`         -> Anthropic Messages (Claude Code)
   *   - `/v1/responses`        -> OpenAI Responses (CodeX)
   * Used by `stk diagnose`, which only needs the intercepted request bodies for
   * its report and so avoids depending on a reachable upstream.
   */
  mock?: boolean
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
 * Captures POST requests under the configured `capturePathPrefix` (default
 * `/v2/`; `stk diagnose` passes `/v1/` for Claude/CodeX and `/v1/chat/completions`,
 * `/v1/messages`, `/v1/responses` for the three mock protocols), captures request
 * bodies, and forwards everything to the real LLM API backend (unless mocking).
 */
export function startProxy(options?: ProxyOptions): Promise<ProxyInstance> {
  const capturePrefix = options?.capturePathPrefix ?? '/v2/'
  const defaultApi = options?.defaultApiBase ?? DEFAULT_CODEBUDDY_API
  const apiBaseUrl = options?.apiBaseUrl ?? process.env.CODEBUDDY_API_BASE ?? defaultApi
  const port = options?.port ?? 54321
  const traceDir = options?.traceDir
  const mock = options?.mock ?? false
  const target = mock ? undefined : new URL(apiBaseUrl)

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

        // Capture all POST requests matching the capture path prefix
        if (req.method === 'POST' && req.url?.startsWith(capturePrefix) && bodyStr) {
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
        const skipPurposes = new Set([
          'prompt_suggestion',
          'memory_selection',
          'conversation_topic',
        ])
        const purpose = req.headers['x-agent-purpose']
        const purposeStr = Array.isArray(purpose) ? (purpose[0] ?? '') : (purpose ?? '')
        const skipTrace = purposeStr !== '' && skipPurposes.has(purposeStr)
        const traceContext = traceDir && !skipTrace ? prepareTrace(req, rawBody, traceDir) : null

        // Mock mode: answer with a protocol-appropriate "Hello" response so the
        // agent's probe request completes without a real upstream. The protocol
        // is chosen by the request URL path (see detectProtocol). Diagnosis only
        // reads captured request bodies, so no response content matters.
        // (Mock mode is used by `stk diagnose`, which does not set traceDir.)
        if (mock) {
          const protocol = detectProtocol(req.url ?? '')
          const wantsStream = isStreamingRequest(bodyStr)
          if (wantsStream) {
            writeMockStream(res, protocol)
          } else {
            const mockBody = JSON.stringify(buildMockResponse(protocol))
            res.writeHead(200, {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(mockBody),
            })
            res.end(mockBody)
          }
          return
        }

        // Forward to real API. Preserve the upstream base path so a base URL
        // with a path prefix (e.g. ANTHROPIC_BASE_URL=https://host/anthropic)
        // still reaches the correct endpoint.
        const isHttps = target!.protocol === 'https:'
        const forwarder = isHttps ? https : http
        const forward = forwarder.request(
          {
            hostname: target!.hostname,
            port: target!.port || (isHttps ? 443 : 80),
            path: joinForwardPath(target!.pathname, req.url ?? '/'),
            method: req.method,
            headers: { ...req.headers, host: target!.hostname },
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
function prepareTrace(req: http.IncomingMessage, rawBody: Buffer, traceDir: string): TraceContext {
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
 * Join an upstream base path with the client's request URL, preserving any
 * path prefix from the target base URL.
 *   joinForwardPath('/', '/v1/messages')          -> '/v1/messages'
 *   joinForwardPath('/anthropic', '/v1/messages') -> '/anthropic/v1/messages'
 */
function joinForwardPath(basePathname: string, requestUrl: string): string {
  const base = basePathname === '' || basePathname === '/' ? '' : basePathname.replace(/\/+$/, '')
  const rel = requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`
  return `${base}${rel}`
}

/**
 * Determine whether a captured request body asks for a streaming response
 * (Anthropic Messages `"stream": true`, OpenAI Chat `"stream": true`,
 * OpenAI Responses `"stream": true`).
 */
function isStreamingRequest(bodyStr: string): boolean {
  try {
    const parsed = JSON.parse(bodyStr) as { stream?: unknown }
    return parsed.stream === true
  } catch {
    return false
  }
}

/** Supported mock LLM protocols, selected by request URL path. */
type MockProtocol = 'anthropic' | 'openai-chat' | 'openai-responses'

/**
 * Map a request URL path to the mock protocol it speaks.
 *   - `/v1/chat/completions` -> OpenAI Chat (CodeBuddy)
 *   - `/v1/responses`        -> OpenAI Responses (CodeX)
 *   - everything else        -> Anthropic Messages (Claude Code, default)
 */
function detectProtocol(url: string): MockProtocol {
  if (url.includes('/v1/chat/completions')) return 'openai-chat'
  if (url.includes('/v1/responses')) return 'openai-responses'
  return 'anthropic'
}

/**
 * Write an SSE "Hello" stream for the given protocol, satisfying each agent's
 * streaming probe request.
 */
function writeMockStream(res: http.ServerResponse, protocol: MockProtocol): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })

  if (protocol === 'openai-chat') {
    writeOpenaiChatStream(res)
  } else if (protocol === 'openai-responses') {
    writeOpenaiResponsesStream(res)
  } else {
    writeAnthropicStream(res)
  }
}

/**
 * Anthropic Messages streaming format (`/v1/messages`). Claude Code speaks this.
 */
function writeAnthropicStream(res: http.ServerResponse): void {
  const emit = (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const startMsg = {
    id: 'msg_stk_mock',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'mock',
    stop_reason: null,
    usage: { input_tokens: 1, output_tokens: 0 },
  }
  emit('message_start', { type: 'message_start', message: startMsg })
  emit('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })
  emit('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Hello' },
  })
  emit('content_block_stop', { type: 'content_block_stop', index: 0 })
  emit('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  })
  emit('message_stop', { type: 'message_stop' })
  res.end()
}

/**
 * OpenAI Chat Completions streaming format (`/v1/chat/completions`). CodeBuddy
 * speaks this. Emits `data:`-only SSE chunks, terminating with `data: [DONE]`.
 */
function writeOpenaiChatStream(res: http.ServerResponse): void {
  const id = 'chatcmpl_stk_mock'
  const created = Math.floor(Date.now() / 1000)
  const chunk = (delta: Record<string, unknown>, finish_reason: string | null): void => {
    const payload = {
      id,
      object: 'chat.completion.chunk',
      created,
      model: 'mock',
      choices: [{ index: 0, delta, finish_reason }],
    }
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  chunk({ role: 'assistant', content: '' }, null)
  chunk({ content: 'Hello' }, null)
  chunk({}, 'stop')
  res.write('data: [DONE]\n\n')
  res.end()
}

/**
 * OpenAI Responses streaming format (`/v1/responses`). CodeX speaks this.
 * Uses the `event:` + `data:` SSE shape of the Responses API.
 */
function writeOpenaiResponsesStream(res: http.ServerResponse): void {
  const emit = (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  const base = {
    id: 'resp_stk_mock',
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model: 'mock',
  }

  emit('response.created', {
    type: 'response.created',
    response: { ...base, status: 'in_progress', output: [] },
  })
  emit('response.output_item.added', {
    type: 'response.output_item.added',
    output_index: 0,
    item: { id: 'msg_stk_mock', type: 'message', role: 'assistant', status: 'in_progress', content: [] },
  })
  emit('response.content_part.added', {
    type: 'response.content_part.added',
    item_id: 'msg_stk_mock',
    output_index: 0,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] },
  })
  emit('response.output_text.delta', {
    type: 'response.output_text.delta',
    item_id: 'msg_stk_mock',
    output_index: 0,
    content_index: 0,
    delta: 'Hello',
  })
  emit('response.completed', {
    type: 'response.completed',
    response: {
      ...base,
      status: 'completed',
      output: [
        {
          id: 'msg_stk_mock',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
  })
  res.end()
}

/**
 * Build a minimal, protocol-appropriate "Hello" response for a mocked LLM API.
 * The response is only used to let the agent's probe request complete; content
 * carries no diagnostic value.
 */
function buildMockResponse(protocol: MockProtocol): Record<string, unknown> {
  if (protocol === 'openai-chat') {
    return {
      id: 'chatcmpl_stk_mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'mock',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }
  }
  if (protocol === 'openai-responses') {
    return {
      id: 'resp_stk_mock',
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      status: 'completed',
      model: 'mock',
      output: [
        {
          type: 'message',
          id: 'msg_stk_mock',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }
  }
  // anthropic: Anthropic Messages response.
  return {
    id: 'msg_stk_mock',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello' }],
    model: 'mock',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }
}

/**
 * Find the main chat/completions request from all captured bodies.
 * Heuristic: the body with messages (or Responses `input`) array that contains
 * at least one user message and has tools definitions (or many messages).
 */
export function findMainChatBody(bodies: unknown[]): Record<string, unknown> | null {
  for (const body of bodies) {
    if (typeof body !== 'object' || body === null) continue
    const b = body as Record<string, unknown>
    // CodeBuddy / Claude use `messages`; CodeX (Responses API) uses `input`.
    const messages = (b['messages'] ?? b['input']) as Array<Record<string, unknown>> | undefined
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
    const messages = (b['messages'] ?? b['input']) as Array<unknown> | undefined
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
