import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { exec } from 'tinyexec'
import { bold, green, red, yellow } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'
import { detectCodeBuddyVersion } from '../utils/platform.js'
import { startProxy, stopProxy, findMainChatBody } from '../proxy/server.js'
import { buildDiagnosisReport, renderMarkdown } from '../proxy/report.js'
import { parseRequestBody } from '../proxy/parser.js'
import { scanFilesystem } from '../collectors/fs-collector.js'
import {
  getAllTools,
  headroomTool,
  ponytailTool,
  gitnexusTool,
  codebaseMemoryTool,
  contextModeTool,
} from '../tools/index.js'
import {
  DEFAULT_PROXY_PORT,
  SAVE_TOKEN_DIR,
  type ToolDetection,
  type ProxyDiagnosisData,
} from '../types/index.js'

export interface DiagnoseOptions {
  agent?: string
  port?: string
  reportPath?: string
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
  console.error(green(`  ✓ 已捕获 ${capturedBodies.length} 个请求，识别出主对话请求`))

  // 6. Build report: proxy body + filesystem scan + third-party tool detection
  const fs = scanFilesystem(adapter)
  const proxyParsed: ProxyDiagnosisData | null = parseRequestBody(mainBody)
  const toolDetection = await detectToolsViaRegistry(fs, proxyParsed)
  const codebuddyVersion = await detectCodeBuddyVersion()
  const report = buildDiagnosisReport([mainBody], fs, toolDetection, codebuddyVersion)

  const outDir = join(process.cwd(), SAVE_TOKEN_DIR)
  mkdirSync(outDir, { recursive: true })

  writeFileSync(join(outDir, 'proxy-raw-body.json'), JSON.stringify(mainBody, null, 2))
  writeFileSync(join(outDir, 'diagnosis-report.json'), JSON.stringify(report, null, 2))

  const markdown = renderMarkdown(report)

  if (options.reportPath) {
    // 指定 --report-path：写入该路径（覆盖），状态信息输出到 stderr 以免污染文件
    writeFileSync(options.reportPath, markdown)
    console.error(bold(green(`诊断完成：Markdown 报告已写入 ${options.reportPath}`)))
  } else {
    // 默认：将摘要写入 ./save-token/diagnosis-report.md（供 LLM 读取与重定向）。
    // 注意：不将 markdown 打印到 stdout，否则 `stk diagnose > file` 会与文件内容重复。
    writeFileSync(join(outDir, 'diagnosis-report.md'), markdown)
    console.error(bold(green(`\n诊断完成：文件已写入 ./${SAVE_TOKEN_DIR}/`)))
  }
}

/**
 * Detect third-party save-token tools via the tool registry, enriching with
 * context from the filesystem scan and the intercepted proxy request.
 */
export async function detectToolsViaRegistry(
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

  // Headroom enabled detection: requires BOTH a running `headroom`/`headroom.cli`
  // proxy process AND the headroom MCP server to be active.
  if (proxyParsed) {
    const headroomProxyRunning = await isHeadroomProxyRunning()
    const mcpEnabled =
      fs.mcpList.some((m) => m.name === 'headroom' && m.status === 'enabled') ||
      (proxyParsed.mcpServers?.some((m: { name: string }) => m.name === 'headroom') ?? false)
    if (headroomProxyRunning && mcpEnabled) {
      headroomTool.setMcpEnabled(true)
      const hIdx = detections.findIndex((d) => d.name === 'headroom')
      if (hIdx !== -1) detections[hIdx] = await headroomTool.buildDetection()
    }

    // Ponytail proxy marker override
    if (proxyParsed.detectedPlugins?.includes('ponytail')) {
      const pIdx = detections.findIndex((d) => d.name === 'ponytail')
      if (pIdx !== -1) detections[pIdx] = ponytailTool.markInstalledFromProxy(detections[pIdx])
    }

    // GitNexus enabled detection via MCP
    const gitnexusEnabled = fs.mcpList.some((m) => m.name === 'gitnexus' && m.status === 'enabled')
    if (gitnexusEnabled) {
      gitnexusTool.setMcpEnabled(true)
      const gIdx = detections.findIndex((d) => d.name === 'gitnexus')
      if (gIdx !== -1) detections[gIdx] = await gitnexusTool.markInstalledFromMcp(detections[gIdx])
    }

    // Codebase Memory MCP enabled detection via MCP
    const codebaseMemoryEnabled = fs.mcpList.some(
      (m) => m.name === 'codebase-memory' && m.status === 'enabled',
    )
    if (codebaseMemoryEnabled) {
      codebaseMemoryTool.setMcpEnabled(true)
      const cIdx = detections.findIndex((d) => d.name === 'codebase-memory')
      if (cIdx !== -1)
        detections[cIdx] = await codebaseMemoryTool.markInstalledFromMcp(detections[cIdx])
    }

    // Context Mode enabled detection via MCP.
    // context-mode is enabled through the CodeBuddy plugin mechanism, so it
    // may not appear in the on-disk .mcp.json — fall back to the proxy-parsed
    // MCP list (both the `context-mode` and `plugin_context-mode_context-mode`
    // namespace forms count as enabled).
    const contextModeEnabled =
      fs.mcpList.some((m) => m.name === 'context-mode' && m.status === 'enabled') ||
      (proxyParsed.mcpServers?.some(
        (m: { name: string }) =>
          m.name === 'context-mode' || m.name === 'plugin_context-mode_context-mode',
      ) ?? false)
    if (contextModeEnabled) {
      contextModeTool.setMcpEnabled(true)
      const cmIdx = detections.findIndex((d) => d.name === 'context-mode')
      if (cmIdx !== -1) detections[cmIdx] = await contextModeTool.buildDetection()
    }
  }

  return detections
}

/**
 * Headroom is considered enabled when a `headroom` or `headroom.cli` process is
 * running with the `proxy` subcommand.
 */
async function isHeadroomProxyRunning(): Promise<boolean> {
  try {
    // `pgrep -af` may omit the command line on macOS, so list full command
    // lines via `ps` and match both the binary name and the `proxy` subcommand.
    const res = await exec('ps', ['-eo', 'pid=,args='])
    if (res.exitCode !== 0) return false
    return res.stdout
      .split('\n')
      .some((line) => /(?:^|\s)(?:python[0-9.\s-]*\s+-m\s+)?headroom(?:\.cli)?(\s|$)/.test(line) && /\bproxy\b/.test(line))
  } catch {
    return false
  }
}
