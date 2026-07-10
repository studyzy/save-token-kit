import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { exec } from 'tinyexec'
import { bold, green, red, yellow } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'
import { startProxy, stopProxy, findMainChatBody } from '../proxy/server.js'
import { buildDiagnosisReport, renderMarkdown } from '../proxy/report.js'
import { parseRequestBody } from '../proxy/parser.js'
import { scanFilesystem } from '../collectors/fs-collector.js'
import { getAllTools, headroomTool, ponytailTool } from '../tools/index.js'
import { DEFAULT_PROXY_PORT, SAVE_TOKEN_DIR, type ToolDetection, type ProxyDiagnosisData } from '../types/index.js'

export interface DiagnoseOptions {
  agent?: string
  port?: string
}

const CAPTURE_TIMEOUT_MS = 60_000

/**
 * Implement `stk diagnose`: start transparent HTTP proxy, redirect CodeBuddy
 * traffic through it, trigger a single LLM request, capture the POST body,
 * parse it into a structured report, and print a Markdown summary. All
 * diagnosis data comes from the intercepted request body — no extra agent
 * calls, so it finishes in seconds.
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

  // 1. Start transparent proxy that forwards to the real API
  console.log(bold(green(`启动代理 (127.0.0.1:${preferredPort}) 拦截 ${agentName} 的请求...`)))
  const proxy = await startProxy({ port: preferredPort })

  // 2. Point CodeBuddy at the proxy
  const proxyBaseUrl = `http://127.0.0.1:${proxy.port}/v2`
  const originalBaseUrl = process.env.CODEBUDDY_BASE_URL
  process.env.CODEBUDDY_BASE_URL = proxyBaseUrl

  try {
    // 3. Trigger a single LLM request through the proxy
    console.log(green(`  代理已就绪 (端口 ${proxy.port})，触发探测请求...`))
    await exec('codebuddy', ['-p', 'Hello', '-y', '--max-turns', '1'], {
      timeout: CAPTURE_TIMEOUT_MS,
    })
  } catch (err) {
    console.error(yellow(`触发命令异常，仍会分析已捕获的数据: ${(err as Error).message}`))
  } finally {
    // 4. Restore original env
    if (originalBaseUrl !== undefined) {
      process.env.CODEBUDDY_BASE_URL = originalBaseUrl
    } else {
      delete process.env.CODEBUDDY_BASE_URL
    }
  }

  await stopProxy(proxy)

  const capturedBodies = proxy.capturedBodies
  if (capturedBodies.length === 0) {
    console.error(red('未捕获到任何请求，请确认 Agent 已正确指向代理。'))
    process.exitCode = 1
    return
  }

  // 5. Find the main chat request among captures
  const mainBody = findMainChatBody(capturedBodies)
  if (!mainBody) {
    console.error(red(`已捕获 ${capturedBodies.length} 个请求，但未找到主对话请求。`))
    process.exitCode = 1
    return
  }
  console.log(green(`  ✓ 已捕获 ${capturedBodies.length} 个请求，识别出主对话请求`))

  // 6. Build report: proxy body + filesystem scan + third-party tool detection
  const fs = scanFilesystem(adapter)
  const proxyParsed: ProxyDiagnosisData | null = parseRequestBody(mainBody)
  const toolDetection = await detectToolsViaRegistry(fs, proxyParsed)
  const report = buildDiagnosisReport([mainBody], fs, toolDetection)

  const outDir = join(process.cwd(), SAVE_TOKEN_DIR)
  mkdirSync(outDir, { recursive: true })

  writeFileSync(join(outDir, 'proxy-raw-body.json'), JSON.stringify(mainBody, null, 2))
  writeFileSync(join(outDir, 'diagnosis-report.json'), JSON.stringify(report, null, 2))

  // 7. Console Markdown summary
  console.log('')
  console.log(renderMarkdown(report))
  console.log(bold(green(`\n诊断完成：文件已写入 ./${SAVE_TOKEN_DIR}/`)))
}

/**
 * Detect third-party save-token tools via the tool registry, enriching with
 * context from the filesystem scan and the intercepted proxy request.
 */
async function detectToolsViaRegistry(
  fs: ReturnType<typeof scanFilesystem>,
  proxyParsed: ProxyDiagnosisData | null,
): Promise<ToolDetection[]> {
  const detections = await Promise.all(getAllTools().map((t) => t.buildDetection()))

  // RTK enabled detection via hook
  const hasRtkHook = fs.hookList.some((h) => h.event === 'PreToolUse' && h.command?.includes('rtk'))
  if (hasRtkHook) {
    const rtkDet = detections.find((d) => d.name === 'rtk')
    if (rtkDet) rtkDet.enabled = true
  }

  // Headroom enabled detection via MCP
  if (proxyParsed) {
    const mcpEnabled =
      fs.mcpList.some((m) => m.name === 'headroom' && m.status === 'enabled') ||
      (proxyParsed.mcpReferences?.some((r: string) => r === 'mcp__headroom') ?? false)
    if (mcpEnabled) {
      headroomTool.setMcpEnabled(true)
      const hIdx = detections.findIndex((d) => d.name === 'headroom')
      if (hIdx !== -1) detections[hIdx] = await headroomTool.buildDetection()
    }

    // Ponytail proxy marker override
    if (proxyParsed.detectedPlugins?.includes('ponytail')) {
      const pIdx = detections.findIndex((d) => d.name === 'ponytail')
      if (pIdx !== -1) detections[pIdx] = ponytailTool.markInstalledFromProxy(detections[pIdx])
    }
  }

  return detections
}
