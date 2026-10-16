import * as http from 'node:http'
import * as https from 'node:https'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'
import { yellow } from 'ansis'
import { MAX_PROXY_BODY_BYTES } from '../types/index.js'

const DEFAULT_CODEBUDDY_API = 'https://tencent.sso.copilot.tencent.com'

/**
 * Text returned by the mocked LLM API. Diagnosis only needs the intercepted
 * request bodies, so the response tells the agent its request was captured and
 * it should stop, keeping the probe to a single turn.
 */
const MOCK_RESPONSE_TEXT = '请求内容已获取，请关闭当前会话。'

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
   * response instead of forwarding to the real upstream. The response
   * protocol is selected by the request URL path:
   *   - `/chat/completions`      -> OpenAI Chat (CodeBuddy /v1/, WorkBuddy /v2/)
   *   - `/v1/messages`           -> Anthropic Messages (Claude Code)
   *   - `/v1/responses`          -> OpenAI Responses (CodeX)
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

  // Trace files capture full request/response bodies (real conversation
  // content, code, memory files). Drop a warning so a user who shares the
  // directory knows to redact it first.
  if (traceDir) writeTraceWarning(traceDir)

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

        // Decode a *copy* of the body for parsing/capture/trace. The forward
        // path always writes the original bytes, so compression is preserved
        // upstream (dual-track). Unknown encodings (e.g. zstd) yield null and
        // are skipped rather than parsed into garbage.
        //
        // Size guard on the raw (compressed) bytes cheaply rejects an oversized
// upload before decompression; `decodeBody` additionally bounds the decoded
// output, so a small gzip bomb cannot inflate past the limit to JSON.parse.
        const bodyTooLarge = rawBody.length > MAX_PROXY_BODY_BYTES
        const decoded = bodyTooLarge
          ? null
          : decodeBody(rawBody, req.headers['content-encoding'], MAX_PROXY_BODY_BYTES)
        const bodyStr = decoded?.toString('utf-8') ?? ''
        if (bodyTooLarge) {
          console.error(
            yellow(`  ⚠️ 请求体超过 ${MAX_PROXY_BODY_BYTES} 字节上限，已跳过解析（原样转发）`),
          )
        }

        // Capture all POST requests matching the capture path prefix
        if (
          req.method === 'POST' &&
          req.url?.startsWith(capturePrefix) &&
          rawBody.length > 0 &&
          !bodyTooLarge &&
          bodyStr
        ) {
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
        const traceContext = traceDir && !skipTrace ? prepareTrace(req, bodyStr, traceDir) : null

        // Mock mode: answer with a protocol-appropriate response so the
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
            headers: forwardHeaders(req.headers, target!.hostname),
          },
          (forwardRes) => {
            res.writeHead(forwardRes.statusCode ?? 200, forwardRes.headers)
            if (traceContext) {
              const respChunks: Buffer[] = []
              forwardRes.on('data', (c: Buffer) => {
                respChunks.push(c)
                // Respect backpressure: pause the upstream until the client
                // drains, so a large response cannot balloon memory unboundedly.
                if (!res.write(c)) forwardRes.pause()
              })
              res.on('drain', () => forwardRes.resume())
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

        // Forward the original bytes (never the decoded copy) so upstream
        // compression/encoding is preserved. Guard on byte length, not the
        // decoded string: an empty-decoded but non-empty body must still be
        // forwarded (previously `if (bodyStr)` silently dropped it).
        if (rawBody.length > 0) {
          forward.write(rawBody)
        }
        forward.end()
      })
    })

    // Errors during the bind attempt are handled inside tryListen; a later
    // runtime error (e.g. accept failure) must not surface as an unhandled
    // 'error' event, so log it instead of rejecting an already-resolved promise.
    // EADDRINUSE is the expected bind-retry signal and is handled there.
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') return
      console.error(yellow(`代理运行时错误: ${err.message}`))
    })

    const tryListen = (p: number, isFallback = false): void => {
      const onError = (err: NodeJS.ErrnoException): void => {
        if (err.code === 'EADDRINUSE' && !isFallback) {
          // Fall back to a random free port, but say so: callers depending on a
          // fixed port would otherwise silently connect to the wrong service.
          console.error(yellow(`  端口 ${p} 被占用，已改用随机端口`))
          tryListen(0, true)
        } else {
          reject(err)
        }
      }
      server.once('error', onError)
      server.listen(p, '127.0.0.1', () => {
        server.removeListener('error', onError)
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
 * `bodyStr` is the already-decoded UTF-8 body (empty when the encoding was
 * unknown/unparseable), so trace files never contain compressed garbage.
 * Returns the context needed to finalize the response side later.
 */
function prepareTrace(req: http.IncomingMessage, bodyStr: string, traceDir: string): TraceContext {
  const sessionId = extractSessionId(req.headers)
  const timestamp = formatTimestamp(new Date())
  const sessionDir = `${traceDir}/${sessionId}`
  mkdirSync(sessionDir, { recursive: true })

  const requestHeaders = simplifyHeaders(req.headers)
  let parsedBody: unknown = bodyStr
  try {
    parsedBody = JSON.parse(bodyStr)
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
 * The response body is decoded using its `content-encoding` header first, so a
 * compressed upstream response lands as parseable JSON instead of garbage.
 */
function finalizeTrace(
  ctx: TraceContext,
  forwardRes: http.IncomingMessage,
  respBody: Buffer,
): void {
  const responseHeaders = simplifyHeaders(forwardRes.headers)
  const decoded = decodeBody(respBody, forwardRes.headers['content-encoding'])
  const bodyStr = decoded?.toString('utf-8') ?? ''
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

/**
 * Decode a request/response body according to its `content-encoding`.
 * Returns the decoded bytes for gzip/deflate/br (Node built-in zlib), the
 * original bytes when no encoding is declared, or null for an unsupported
 * encoding (e.g. zstd) or a decode failure — callers then skip parsing rather
 * than feeding compressed garbage into JSON.parse.
 *
 * Handles comma-joined encoding chains (`gzip, deflate`) by decoding in reverse
 * declaration order, and bounds output via `maxOutputLength` so a small
 * compressed payload (gzip bomb) cannot inflate past `maxBytes` — exceeding it
 * throws and resolves to null (skip), never a partial/garbage body.
 */
function decodeBody(
  raw: Buffer,
  encoding: http.IncomingHttpHeaders[string],
  maxBytes = MAX_PROXY_BODY_BYTES,
): Buffer | null {
  const encStr = (Array.isArray(encoding) ? (encoding[0] ?? '') : (encoding ?? ''))
    .trim()
    .toLowerCase()
  if (encStr === '' || encStr === 'identity') return raw

  const layers = encStr
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e !== '' && e !== 'identity')
  if (layers.length === 0) return raw

  // Content-Encoding lists layers in applied order (outermost first), so
  // decoding walks the list front-to-back, undoing the last-applied layer first.
  let buf = raw
  try {
    for (const enc of layers) {
      if (enc === 'gzip' || enc === 'x-gzip') buf = gunzipSync(buf, { maxOutputLength: maxBytes })
      else if (enc === 'deflate') buf = inflateSync(buf, { maxOutputLength: maxBytes })
      else if (enc === 'br') buf = brotliDecompressSync(buf, { maxOutputLength: maxBytes })
      else return null // unknown layer (zstd, …): skip rather than guess
      if (buf.length > maxBytes) return null
    }
  } catch {
    // Includes Z_BUF_ERROR from an over-limit expansion — treat as "too large
    // to parse", not a decodable body.
    return null
  }
  return buf
}

/**
 * Headers that must not be forwarded verbatim: hop-by-hop headers apply only
 * to a single transport hop and are re-derived by the next connection.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Build the outbound headers for the upstream request: strip hop-by-hop headers
 * (plus any header named in `connection`), and point `host` at the upstream.
 */
function forwardHeaders(headers: http.IncomingHttpHeaders, host: string): http.OutgoingHttpHeaders {
  const drop = new Set(HOP_BY_HOP)
  const conn = headers['connection']
  const connStr = Array.isArray(conn) ? conn.join(',') : (conn ?? '')
  for (const token of connStr.split(',')) {
    const t = token.trim().toLowerCase()
    if (t) drop.add(t)
  }

  const out: http.OutgoingHttpHeaders = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || drop.has(k.toLowerCase())) continue
    out[k] = v
  }
  out['host'] = host
  return out
}

function extractSessionId(headers: http.IncomingHttpHeaders): string {
  const v = headers['x-conversation-id']
  if (Array.isArray(v) && v.length > 0) return v[0] ?? 'no-session'
  if (typeof v === 'string' && v) return v
  return 'no-session'
}

/** Headers whose values must never be written to trace files. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
])

function simplifyHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const val = Array.isArray(v) ? v.join(', ') : v
    if (val === undefined) continue
    // Trace files may be shared or committed; never persist credentials.
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '[REDACTED]' : val
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
 * Write a SENSITIVE warning file into the trace directory (once). Trace files
 * contain full request/response bodies — real conversation content, source
 * code and memory files — so anyone sharing the directory must redact it first.
 * Only written when absent, so a user-edited file is never overwritten.
 */
function writeTraceWarning(traceDir: string): void {
  const path = `${traceDir}/SENSITIVE.md`
  try {
    mkdirSync(traceDir, { recursive: true })
    if (existsSync(path)) return
    writeFileSync(
      path,
      [
        '# ⚠️ 本目录含敏感内容',
        '',
        'trace/ 下的请求与响应文件保存了**完整的对话正文**（含你的提示词、代码、',
        'memory 文件等）。请求头中的凭据（authorization/api-key/cookie）已脱敏，',
        '但正文内容未做任何脱敏。',
        '',
        '**分享、上传或提交本目录前，请先手动脱敏或删除。**',
        '',
      ].join('\n'),
    )
  } catch {
    // best-effort: a missing warning file must never break tracing
  }
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
 *   - `<prefix>/chat/completions` -> OpenAI Chat (CodeBuddy /v1/, WorkBuddy /v2/)
 *   - `/v1/responses`             -> OpenAI Responses (CodeX)
 *   - everything else             -> Anthropic Messages (Claude Code, default)
 */
function detectProtocol(url: string): MockProtocol {
  if (url.includes('/chat/completions')) return 'openai-chat'
  if (url.includes('/v1/responses')) return 'openai-responses'
  return 'anthropic'
}

/**
 * Write an SSE stream for the given protocol, satisfying each agent's
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
    delta: { type: 'text_delta', text: MOCK_RESPONSE_TEXT },
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
  chunk({ content: MOCK_RESPONSE_TEXT }, null)
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
    item: {
      id: 'msg_stk_mock',
      type: 'message',
      role: 'assistant',
      status: 'in_progress',
      content: [],
    },
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
    delta: MOCK_RESPONSE_TEXT,
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
          content: [{ type: 'output_text', text: MOCK_RESPONSE_TEXT, annotations: [] }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
  })
  res.end()
}

/**
 * Build a minimal, protocol-appropriate response for a mocked LLM API. The
 * response only lets the agent's probe request complete and signals that the
 * request content was captured; it carries no diagnostic value itself.
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
          message: { role: 'assistant', content: MOCK_RESPONSE_TEXT },
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
          content: [{ type: 'output_text', text: MOCK_RESPONSE_TEXT }],
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
    content: [{ type: 'text', text: MOCK_RESPONSE_TEXT }],
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
 * `pick: 'largest'` (live mode) selects the matching body with the most
 * messages — later requests in a real session carry the accumulated context.
 */
export function findMainChatBody(
  bodies: unknown[],
  pick: 'first' | 'largest' = 'first',
): Record<string, unknown> | null {
  let firstMatch: Record<string, unknown> | null = null
  let largest: Record<string, unknown> | null = null
  let largestCount = 0
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
      if (!firstMatch) firstMatch = b
      if (messages.length > largestCount) {
        largestCount = messages.length
        largest = b
      }
    }
  }
  if (pick === 'largest') return largest ?? firstMatch
  if (firstMatch) return firstMatch
  // Fallback: return the body with the most messages
  return largest
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
