import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, type SpawnOptions } from 'node:child_process'
import { bold, cyan, green, red, yellow } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'
import type { PlatformAdapter } from '../adapters/platform-adapter.js'
import { WorkBuddyAdapter } from '../adapters/workbuddy-adapter.js'
import { detectCodeBuddyVersion, getHomeDir } from '../utils/platform.js'
import { ensureIgnoredDir } from '../utils/fs-operations.js'
import { startProxy, stopProxy, findMainChatBody } from '../proxy/server.js'
import { buildDiagnosisReport, renderMarkdown } from '../proxy/report.js'
import { parseRequestBody } from '../proxy/parser.js'
import { scanFilesystem } from '../collectors/fs-collector.js'
import { collectUsageStats } from '../collectors/usage-collector.js'
import { loadRules, RULES_HOME } from '../rules/loader.js'
import { autoCheckLibraryUpdate, metaPath } from '../rules/update.js'
import { getAllToolkits, type SpecContext } from '../toolkits/index.js'
import {
  DEFAULT_PROXY_PORT,
  SAVE_TOKEN_DIR,
  type ToolkitDetection,
  type ProxyDiagnosisData,
  type UsageStats,
} from '../types/index.js'

export interface DiagnoseOptions {
  agent?: string
  port?: string
  reportPath?: string
  /**
   * Live mode: forward to the real API (no mock), record traces, and wait for
   * the user's real session instead of firing a mock probe. Captures the
   * accumulated context of actual work — the biggest cost — rather than a
   * cold-start snapshot.
   */
  live?: boolean
  /** Live-mode capture window in minutes (default DEFAULT_LIVE_DURATION_MINUTES). */
  duration?: string
  /** Render the full-detail report instead of the slim summary. */
  detail?: boolean
}

const CAPTURE_TIMEOUT_MS = 60_000
const DEFAULT_LIVE_DURATION_MINUTES = 10

/**
 * Implement `stk diagnose`: start transparent HTTP proxy, redirect CodeBuddy
 * traffic through it, trigger a single LLM request, capture the POST body,
 * parse it into a structured report, and print a Markdown summary. All
 * diagnosis data comes from the intercepted request body — no extra agent
 * calls, so it finishes in seconds.
 */
export async function runDiagnose(options: DiagnoseOptions): Promise<void> {
  // Fire-and-forget rules-pack freshness check (24h TTL, never blocks; R5)
  void autoCheckLibraryUpdate(metaPath(RULES_HOME), RULES_HOME)

  const agentName = options.agent ?? 'codebuddy'
  const adapter = getAdapter(agentName)
  if (!adapter || !adapter.supported) {
    console.error(red(`暂不支持的 Agent: ${agentName}`))
    process.exitCode = 1
    return
  }

  const preferredPort = Number(options.port ?? DEFAULT_PROXY_PORT)
  const live = options.live === true

  // Resolve the upstream API base URL: some adapters read it from their own
  // config (e.g. CodeX provider base_url); others use the current env var value
  // or the built-in default.
  const originalBaseUrl = adapter.resolveUpstreamBaseUrl?.() ?? process.env[adapter.proxyEnvVar]
  const upstreamBaseUrl = originalBaseUrl || adapter.defaultApiBase

  // 1. Start transparent proxy. Live mode forwards to the real API and records
  // request/response traces; mock mode (default) answers with a protocol mock
  // so the probe completes without a reachable upstream.
  // The log is printed after binding so it reports the real port: when the
  // preferred port is taken, startProxy falls back to a random one.
  const proxy = await startProxy({
    port: preferredPort,
    capturePathPrefix: adapter.capturePathPrefix,
    apiBaseUrl: upstreamBaseUrl,
    mock: !live,
    traceDir: live ? join(process.cwd(), SAVE_TOKEN_DIR, 'trace') : undefined,
  })
  console.log(bold(green(`启动代理 (127.0.0.1:${proxy.port}) 拦截 ${agentName} 的请求...`)))

  // 2. Point agent at the proxy and capture requests.
  const proxyBaseUrl = `http://127.0.0.1:${proxy.port}`
  const proxyUrl = `${proxyBaseUrl}${adapter.proxyBasePath}`
  // Prior models.json state when we inject the stk-diagnose custom model.
  let prevModels: Array<Record<string, unknown>> | null = null

  if (live) {
    // Live: the user points their own agent at the proxy and works normally —
    // stk neither mutates its own process env (meaningless for another
    // terminal) nor auto-triggers a probe (the value is real accumulated
    // sessions). WorkBuddy still uses the models.json injection, which works
    // across processes.
    if (adapter instanceof WorkBuddyAdapter) {
      prevModels = adapter.injectDiagnoseModel(proxyBaseUrl)
      console.error(green(`  代理已就绪 (端口 ${proxy.port})，等待 WorkBuddy 桌面发起真实会话...`))
      console.error(cyan(`  已注入自定义模型 "stk-diagnose" → ${proxyBaseUrl}/chat/completions`))
      console.error(
        yellow(
          `  请点击左侧「新建任务」，在模型列表中选择 "stk-diagnose (token check)" 并正常工作；\n` +
            `  捕获完成后按 Ctrl+C 结束（诊断完成后自动移除该模型）`,
        ),
      )
    } else {
      console.error(cyan(`请将 ${agentName} 的请求指向代理后正常使用（将捕获真实会话）：`))
      const redirectArgs = adapter.proxyRedirectArgs?.(proxyUrl) ?? []
      if (redirectArgs.length > 0) {
        console.error(cyan(`  ${[adapter.triggerCommand[0] ?? '', ...redirectArgs].join(' ')}`))
      } else {
        console.error(cyan(`  export ${adapter.proxyEnvVar}=${proxyUrl}`))
      }
    }
    const durationMin = Number(options.duration ?? DEFAULT_LIVE_DURATION_MINUTES)
    console.error(yellow(`  等待捕获（${durationMin} 分钟；提前结束按 Ctrl+C）...`))
    try {
      await waitLiveCapture(durationMin * 60_000)
    } finally {
      if (adapter instanceof WorkBuddyAdapter && prevModels !== null) {
        adapter.removeDiagnoseModel(prevModels)
        console.error(green(`  已移除诊断用自定义模型 "stk-diagnose"`))
      }
    }
  } else {
    // Probe mode (default): most agents append a base path (e.g. /v1) to the
    // base URL; CodeX routes via `-c model_providers.<id>.base_url=` config
    // overrides and ignores env vars, so it returns redirect args instead.
    const redirectArgs = adapter.proxyRedirectArgs?.(proxyUrl) ?? []
    // Manual-trigger agents (WorkBuddy desktop) must be redirected by the user
    // restarting the app with an env var; stk setting its own process env is
    // meaningless, so skip the env-based redirection path for them.
    const usesEnvRedirect = !adapter.requiresManualTrigger && redirectArgs.length === 0

    // For agents whose own config can override the proxy env var (e.g. Claude
    // Code's `~/.claude/settings.json` env), isolate the config dir to a temp
    // dir so the process-env redirection below actually takes effect. Isolation
    // is skipped when the agent reports it is unnecessary (`shouldIsolateConfigDir`),
    // since it hides the user's skills/rules/memory from the probe and would make
    // the report show only built-in assets.
    const configDirVar = 'CLAUDE_CONFIG_DIR'
    const originalConfigDir = process.env[configDirVar]
    let isolatedConfigDir: string | undefined
    // Track env vars we injected during isolation so we can delete them in finally.
    const injectedEnvKeys = new Set<string>()
    const isolate =
      usesEnvRedirect &&
      adapter.needsIsolatedConfigDir === true &&
      (adapter.shouldIsolateConfigDir?.() ?? true)
    if (isolate) {
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
      // OAuth logins keep their credential in the config dir, not in settings.json
      // env, so isolation leaves the probe unauthenticated. Inject a placeholder
      // (the mock proxy does not validate keys) so claude still sends a request.
      const placeholder = adapter.isolatedProbeCredential?.()
      if (placeholder && process.env[placeholder.key] === undefined) {
        process.env[placeholder.key] = placeholder.value
        injectedEnvKeys.add(placeholder.key)
      }
    }
    if (usesEnvRedirect) {
      process.env[adapter.proxyEnvVar] = proxyUrl
    }

    try {
      // 3. Trigger a single LLM request through the proxy.
      if (adapter.requiresManualTrigger) {
        // WorkBuddy cannot be auto-triggered: its real prompt comes from its own
        // desktop templates + SOUL/USER/IDENTITY, produced by the GUI+sidecar
        // session, and it blocks CODEBUDDY_BASE_URL env redirection. The only way
        // to capture its real requests is to inject a custom model whose url
        // points at the proxy (WorkBuddy watches ~/.workbuddy/models.json), then
        // have the user select it and send a message.
        if (adapter instanceof WorkBuddyAdapter) {
          // Custom-model url targets the proxy's /chat/completions path directly.
          const customModelUrl = proxyBaseUrl
          prevModels = adapter.injectDiagnoseModel(customModelUrl)
          console.error(green(`  代理已就绪 (端口 ${proxy.port})，等待 WorkBuddy 桌面发起请求...`))
          console.error(
            cyan(`  已注入自定义模型 "stk-diagnose" → ${customModelUrl}/chat/completions`),
          )
          console.error(
            yellow(
              `  请点击左侧「新建任务」，然后在模型列表中选择 "stk-diagnose (token check)"，发送消息「Hi」：\n` +
                `    1) 点击左侧「新建任务」\n` +
                `    2) 在模型列表中选择 "stk-diagnose (token check)"\n` +
                `    3) 发送消息「Hi」（stk 将自动捕获请求体）\n` +
                `    4) 诊断完成后自动移除该模型`,
            ),
          )
        }
        await waitForCapture(proxy.capturedBodies, CAPTURE_TIMEOUT_MS)
        if (proxy.capturedBodies.length > 0) {
          console.error(green(`  ✓ 已捕获请求，继续分析...`))
        }
      } else {
        console.log(green(`  代理已就绪 (端口 ${proxy.port})，触发探测请求...`))
        if (usesEnvRedirect) {
          console.error(
            cyan(
              `  重定向 ${adapter.proxyEnvVar}=${proxyUrl}${isolatedConfigDir ? ` (隔离配置目录 ${isolatedConfigDir})` : ''}`,
            ),
          )
        }
        await runTriggerCommand(adapter, adapter.triggerCommand, redirectArgs, CAPTURE_TIMEOUT_MS)
      }
    } catch (err) {
      console.error(yellow(`触发命令异常，仍会分析已捕获的数据: ${(err as Error).message}`))
    } finally {
      // Remove the injected stk-diagnose model (if any) so WorkBuddy config is restored.
      if (adapter instanceof WorkBuddyAdapter && prevModels !== null) {
        adapter.removeDiagnoseModel(prevModels)
        console.error(green(`  已移除诊断用自定义模型 "stk-diagnose"`))
      }
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
  }

  await stopProxy(proxy)

  const capturedBodies = proxy.capturedBodies
  if (capturedBodies.length === 0) {
    console.error(red('未捕获到任何请求，请确认 Agent 已正确指向代理。'))
    if (agentName === 'claude') {
      console.error(
        yellow(
          '排查提示：Claude Code 可能被 shell 别名/函数或 preload 拦截，覆盖了代理重定向；\n' +
            '也可能因配置目录隔离后失去登录态（OAuth 凭据在配置目录内，不在 settings.json env）。\n' +
            '  1) 请确认 `which claude` 不是被包裹的函数；若 ~/.zshrc 有 claude() 函数定义（如 onesuite-pilot 拦截），会干扰重定向。\n' +
            '  2) 若为 OAuth 登录，可先设置 ANTHROPIC_API_KEY=<任意值> 再重跑（代理不校验 key）。\n' +
            '  3) 可临时跳过拦截重跑，或用 `stk diagnose --agent codebuddy` 验证代理链路是否正常。',
        ),
      )
    }
    process.exitCode = 1
    return
  }

  // 5. Find the main chat request among captures. Live sessions accumulate:
  // the largest matching body best represents the real context cost.
  const mainBody = findMainChatBody(capturedBodies, live ? 'largest' : 'first')
  if (!mainBody) {
    console.error(red(`已捕获 ${capturedBodies.length} 个请求，但未找到主对话请求。`))
    process.exitCode = 1
    return
  }
  console.error(green(`  ✓ 已捕获 ${capturedBodies.length} 个请求，识别出主对话请求`))

  // 6. Build report: proxy body + filesystem scan + third-party toolkit detection
  const fs = scanFilesystem(adapter)
  const proxyParsed: ProxyDiagnosisData | null = parseRequestBody(mainBody, agentName)
  const toolkitDetection = await detectToolkitsViaRegistry(fs, proxyParsed)
  const agentVersion = await detectCodeBuddyVersion(adapter.getConfigPaths().cliBinary)
  const report = buildDiagnosisReport(
    [mainBody],
    fs,
    toolkitDetection,
    agentVersion,
    agentName,
    loadRules().rulesInfo,
  )
  await attachUsageStats(report, adapter.getConfigPaths().sessionsDir)

  const outDir = join(process.cwd(), SAVE_TOKEN_DIR)
  // Artifacts here include the full request-body snapshot (proxy-raw-body.json),
  // which embeds code and memory-file content — keep them out of version control.
  ensureIgnoredDir(outDir)

  writeFileSync(join(outDir, 'proxy-raw-body.json'), JSON.stringify(mainBody, null, 2))
  writeFileSync(join(outDir, 'diagnosis-report.json'), JSON.stringify(report, null, 2))

  const markdown = renderMarkdown(report, { detail: options.detail === true })

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
 * Spawn options for the probe child process. When the adapter declares
 * `probeEnvKeys`, spawn with a minimal env (allowlist + the proxy redirect
 * var) instead of the full inherited environment — a full interactive-shell
 * env (JetBrains/Fig markers) without a TTY makes the CodeBuddy headless
 * probe hang silently before sending any request. Native spawn is used for
 * this because tinyexec always merges `process.env` under `nodeOptions.env`,
 * so a clean env can never be expressed through it.
 */
function buildTriggerSpawnOptions(adapter: PlatformAdapter): SpawnOptions {
  let env: NodeJS.ProcessEnv | undefined
  if (adapter.probeEnvKeys) {
    env = {}
    for (const key of [...adapter.probeEnvKeys, ...Object.keys(adapter.probeEnv ?? {})]) {
      const value = process.env[key]
      if (value !== undefined) env[key] = value
    }
    Object.assign(env, adapter.probeEnv)
    const proxyValue = process.env[adapter.proxyEnvVar]
    if (proxyValue !== undefined) env[adapter.proxyEnvVar] = proxyValue
  }
  return { ...(adapter.triggerNodeOptions as SpawnOptions | undefined), env }
}

/**
 * Run the adapter's probe trigger command via native spawn. The probe's
 * stdout/stderr carry no diagnostic value (all data comes from the proxy
 * capture), so output is ignored; the promise rejects on spawn errors or the
 * timeout signal, matching the previous tinyexec semantics.
 */
function runTriggerCommand(
  adapter: PlatformAdapter,
  triggerCommand: readonly string[],
  redirectArgs: string[],
  timeoutMs: number,
): Promise<void> {
  const [bin, ...args] = triggerCommand
  return new Promise((resolve, reject) => {
    const child = spawn(bin!, [...args, ...redirectArgs], {
      ...buildTriggerSpawnOptions(adapter),
      stdio: 'ignore',
      signal: AbortSignal.timeout(timeoutMs),
    })
    child.once('error', reject)
    child.once('close', () => resolve())
  })
}

/**
 * Attach session-history usage statistics to the report (CodeBuddy only —
 * other agents have no `sessionsDir` and are skipped). Best-effort: any scan
 * failure leaves `usageStats` unset and never blocks the diagnosis flow.
 */
export async function attachUsageStats(
  report: { usageStats?: UsageStats },
  sessionsDir?: string,
): Promise<void> {
  if (!sessionsDir) return
  try {
    report.usageStats = await collectUsageStats({ sessionsDir })
  } catch {
    // 采集失败降级：诊断主流程不受影响，报告不含 usageStats
  }
}

/**
 * Detect third-party save-token toolkits via the data-driven registry, enriching
 * with context from the filesystem scan and the intercepted proxy request.
 * All per-tool special cases (rtk hook / headroom process+MCP / ponytail &
 * i-have-adhd proxy markers / gitnexus、codebase-memory、context-mode MCP) live in
 * the declarative detect/enabled specs from the rules pack (data.toolkits).
 */
export async function detectToolkitsViaRegistry(
  fs: ReturnType<typeof scanFilesystem>,
  proxyParsed: ProxyDiagnosisData | null,
): Promise<ToolkitDetection[]> {
  const ctx = buildSpecContext(fs, proxyParsed)
  return Promise.all(getAllToolkits().map((t) => t.buildDetection(ctx)))
}

/** Build the spec-evaluator context from the filesystem scan + intercepted request. */
function buildSpecContext(
  fs: ReturnType<typeof scanFilesystem>,
  proxyParsed: ProxyDiagnosisData | null,
): SpecContext {
  const home = getHomeDir()
  let settingsJson: { enabledPlugins?: Record<string, boolean> } | null = null
  try {
    settingsJson = JSON.parse(readFileSync(join(home, '.codebuddy', 'settings.json'), 'utf8')) as {
      enabledPlugins?: Record<string, boolean>
    }
  } catch {
    // 无 settings.json → plugin-enabled 原语按 false 处理
  }
  return { home, mcpList: fs.mcpList, hookList: fs.hookList, proxyParsed, settingsJson }
}

/**
 * Wait until the proxy has captured at least one request, or the timeout elapses.
 * Used for agents that require manual triggering (e.g. WorkBuddy desktop), where
 * the user must restart the agent pointed at the proxy and fire a conversation.
 * Polls every 500ms so a long user interaction is not missed.
 */
export async function waitForCapture(capturedBodies: unknown[], timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (capturedBodies.length > 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
}

/**
 * Live-mode wait: resolve after `timeoutMs`, or early on Ctrl+C (SIGINT).
 * Unlike the probe path there is no early exit on first capture — the point
 * is to cover a real working session.
 */
export async function waitLiveCapture(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      process.off('SIGINT', done)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    process.once('SIGINT', done)
  })
}
