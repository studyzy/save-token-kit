import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { x } from 'tinyexec'
import { bold, green, red, yellow } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'
import { createProxyServer } from '../proxy/server.js'
import { buildDiagnosisReport, renderMarkdown } from '../proxy/report.js'
import { DEFAULT_PROXY_PORT, SAVE_TOKEN_DIR, type ProxyCapture } from '../types/index.js'

export interface DiagnoseOptions {
  agent?: string
  port?: string
}

const CAPTURE_TIMEOUT_MS = 30_000

/**
 * Implement `stk diagnose`: start the HTTP proxy, intercept one CodeBuddy LLM
 * request, write raw + structured diagnosis files, and print a Markdown summary.
 */
export async function runDiagnose(options: DiagnoseOptions): Promise<void> {
  const agentName = options.agent ?? 'codebuddy'
  const adapter = getAdapter(agentName)
  if (!adapter || !adapter.supported) {
    console.error(red(`暂不支持的 Agent: ${agentName}`))
    process.exitCode = 1
    return
  }

  const preferredPort = Number(options.port ?? DEFAULT_PROXY_PORT)
  console.log(bold(green(`启动代理 (127.0.0.1:${preferredPort}) 拦截 ${agentName} 的请求...`)))

  const proxy = await createProxyServer({
    port: preferredPort,
    onCapture: () => console.log(green('  ✓ 已捕获一次 LLM 请求')),
  })
  const actualPort = proxy.address.port
  if (actualPort !== preferredPort) {
    console.log(yellow(`端口 ${preferredPort} 被占用，已回退到 ${actualPort}`))
  }

  // Point the agent at the proxy and trigger a single request.
  const env = { ...process.env, [adapter.proxyEnvVar]: `http://127.0.0.1:${actualPort}/v2` }
  const [cmd, ...args] = adapter.triggerCommand
  try {
    await x(cmd, args, { env, nodeOptions: { stdio: 'ignore' }, timeout: CAPTURE_TIMEOUT_MS })
  } catch (err) {
    console.error(yellow(`触发命令失败，仍会写入已捕获的数据: ${(err as Error).message}`))
  }

  // Wait a short grace period for the trailing request to be captured.
  await new Promise((r) => setTimeout(r, 500))

  const captures: ProxyCapture[] = proxy.captures
  const rawBodies = captures.map((c) => c.rawBody)

  if (rawBodies.length === 0) {
    console.error(red('未捕获到任何请求，请确认 Agent 已正确指向代理。'))
    await proxy.stop()
    process.exitCode = 1
    return
  }

  const report = buildDiagnosisReport(rawBodies)
  const outDir = join(process.cwd(), SAVE_TOKEN_DIR)
  mkdirSync(outDir, { recursive: true })

  writeFileSync(join(outDir, 'proxy-raw-body.json'), JSON.stringify(rawBodies, null, 2))
  writeFileSync(join(outDir, 'diagnosis-report.json'), JSON.stringify(report, null, 2))

  await proxy.stop()

  // Console Markdown summary (user may redirect to diagnosis-report.md).
  console.log('')
  console.log(renderMarkdown(report))
  console.log(bold(green(`\n诊断完成：文件已写入 ./${SAVE_TOKEN_DIR}/`)))
}
