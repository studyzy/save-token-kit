import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startProxy, stopProxy } from '@/proxy/server.js'
import { buildDiagnosisReport, renderMarkdown } from '@/proxy/report.js'

describe('stk diagnose pipeline', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('captures a POST /v2 request, builds a report and writes JSON files', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-'))
    const proxy = await startProxy({ port: 0 })

    // Send a synthetic LLM request through the proxy.
    const http = await import('node:http')
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: 'you are a helpful assistant' },
        { role: 'user', content: 'hi' },
      ],
      tools: [
        { type: 'function', function: { name: 'Read' } },
        { type: 'function', function: { name: 'mcp__github__search' } },
      ],
    })
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

    const report = buildDiagnosisReport(proxy.capturedBodies)
    expect(report.contextOverview.totalEstimatedTokens).toBeGreaterThan(0)
    expect(report.toolBreakdown.builtin.count).toBe(1)
    expect(report.toolBreakdown.mcp.count).toBe(1)

    // Write outputs the way runDiagnose does.
    mkdirSync(join(tmp, 'save-token'), { recursive: true })
    writeFileSync(
      join(tmp, 'save-token', 'proxy-raw-body.json'),
      JSON.stringify(proxy.capturedBodies, null, 2),
    )
    writeFileSync(join(tmp, 'save-token', 'diagnosis-report.json'), JSON.stringify(report, null, 2))

    expect(existsSync(join(tmp, 'save-token', 'diagnosis-report.json'))).toBe(true)
    expect(existsSync(join(tmp, 'save-token', 'proxy-raw-body.json'))).toBe(true)

    const md = renderMarkdown(report)
    expect(md).toContain('Token 诊断报告')

    await stopProxy(proxy)
  })
})
