import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exec } from 'tinyexec'
import { bold, cyan, green, red, yellow } from 'ansis'
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

  // Resolve the upstream API base URL: some adapters read it from their own
  // config (e.g. CodeX provider base_url); others use the current env var value
  // or the built-in default.
  const originalBaseUrl =
    adapter.resolveUpstreamBaseUrl?.() ?? process.env[adapter.proxyEnvVar]
  const upstreamBaseUrl = originalBaseUrl || adapter.defaultApiBase

  // 1. Start transparent proxy that forwards to the real API
  console.log(bold(green(`启动代理 (127.0.0.1:${preferredPort}) 拦截 ${agentName} 的请求...`)))
  const proxy = await startProxy({
    port: preferredPort,
    capturePathPrefix: adapter.capturePathPrefix,
    apiBaseUrl: upstreamBaseUrl,
    // Mock the LLM API: diagnosis only needs the intercepted request bodies, so
    // answer with a protocol "Hello" (selected by request URL path) instead of
    // depending on a reachable upstream.
    mock: true,
  })

  // 2. Point agent at the proxy. Most agents append a base path (e.g. /v1) to
  // the base URL; CodeX routes via `-c model_providers.<id>.base_url=` config
  // overrides and ignores env vars, so it returns redirect args instead.
  const proxyBaseUrl = `http://127.0.0.1:${proxy.port}`
  const proxyUrl = `${proxyBaseUrl}${adapter.proxyBasePath}`
  const redirectArgs = adapter.proxyRedirectArgs?.(proxyUrl) ?? []
  const usesEnvRedirect = redirectArgs.length === 0

  // For agents whose own config can override the proxy env var (e.g. Claude
  // Code's `~/.claude/settings.json` env), isolate the config dir to a temp
  // dir so the process-env redirection below actually takes effect.
  const configDirVar = 'CLAUDE_CONFIG_DIR'
  const originalConfigDir = process.env[configDirVar]
  let isolatedConfigDir: string | undefined
  // Track env vars we injected during isolation so we can delete them in finally.
  const injectedEnvKeys = new Set<string>()
  if (usesEnvRedirect && adapter.needsIsolatedConfigDir) {
    isolatedConfigDir = mkdtempSync(join(tmpdir(), 'stk-config-'))
    process.env[configDirVar] = isolatedConfigDir
    // Isolation hides settings.json env (credentials, model mappings). Preserve
    // everything except the proxy env var so the probe can authenticate.
    for (const [k, v] of Object.entries(adapter.configDirRetainedEnv?.() ?? {})) {
      if (process.env[k] === undefined) {
        process.env[k] = v
        injectedEnvKeys.add(k)
      }
    }
  }
  if (usesEnvRedirect) {
    process.env[adapter.proxyEnvVar] = proxyUrl
  }

  try {
    // 3. Trigger a single LLM request through the proxy
    console.log(green(`  代理已就绪 (端口 ${proxy.port})，触发探测请求...`))
    if (usesEnvRedirect) {
      console.error(cyan(`  重定向 ${adapter.proxyEnvVar}=${proxyUrl}${isolatedConfigDir ? ` (隔离配置目录 ${isolatedConfigDir})` : ''}`))
    }
    const [bin, ...args] = adapter.triggerCommand
    await exec(bin!, [...args, ...redirectArgs], {
      timeout: CAPTURE_TIMEOUT_MS,
      nodeOptions: adapter.triggerNodeOptions,
    })
  } catch (err) {
    console.error(yellow(`触发命令异常，仍会分析已捕获的数据: ${(err as Error).message}`))
  } finally {
    // 4. Restore original env (only when env-based redirection was used)
    if (usesEnvRedirect) {
      if (originalBaseUrl !== undefined) {
        process.env[adapter.proxyEnvVar] = originalBaseUrl
      } else {
        delete process.env[adapter.proxyEnvVar]
      }
      // Restore the original config dir and clean up the temp isolation dir.
      if (isolatedConfigDir) {
        if (originalConfigDir !== undefined) {
          process.env[configDirVar] = originalConfigDir
        } else {
          delete process.env[configDirVar]
        }
        rmSync(isolatedConfigDir, { recursive: true, force: true })
      }
      // Restore any retained env vars we injected during isolation.
      for (const k of injectedEnvKeys) {
        delete process.env[k]
      }
    }
  }

  await stopProxy(proxy)

  const capturedBodies = proxy.capturedBodies
  if (capturedBodies.length === 0) {
    console.error(red('未捕获到任何请求，请确认 Agent 已正确指向代理。'))
    if (agentName === 'claude') {
      console.error(
        yellow(
          '排查提示：Claude Code 可能被 shell 别名/函数或 preload 拦截，覆盖了代理重定向。\n' +
            '  1) 请确认 `which claude` 不是被包裹的函数；若 ~/.zshrc 有 claude() 函数定义（如 onesuite-pilot 拦截），会干扰重定向。\n' +
            '  2) 可临时跳过拦截重跑，或用 `stk diagnose --agent codebuddy` 验证代理链路是否正常。',
        ),
      )
    }
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
  const proxyParsed: ProxyDiagnosisData | null = parseRequestBody(mainBody, agentName)
  const toolDetection = await detectToolsViaRegistry(fs, proxyParsed)
  const agentVersion = await detectCodeBuddyVersion(adapter.getConfigPaths().cliBinary)
  const report = buildDiagnosisReport([mainBody], fs, toolDetection, agentVersion, agentName)

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
      ) ??
        false)
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
      .some(
        (line) =>
          /(?:^|\s)(?:python[0-9.\s-]*\s+-m\s+)?headroom(?:\.cli)?(\s|$)/.test(line) &&
          /\bproxy\b/.test(line),
      )
  } catch {
    return false
  }
}
