import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { getAdapter } from '../../adapters/codebuddy-adapter.js'
import type { ToolkitCatalogEntry } from '../../types/rules.js'
import type { InstallResult, InstallStep } from '../types.js'
import { runShell } from '../shell.js'
import type { RegistryDeps } from '../data-registry.js'

/**
 * RTK.md template written to the target Agent config dir when missing.
 * Mirrors the file `rtk init -g --agent claude` generates.
 */
const RTK_DOC = `# RTK - Rust Token Killer

**Usage**: Token-optimized CLI proxy (cuts up to 90% of bash output)

## Meta Commands (always use rtk directly)

\`\`\`bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze CodeBuddy history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
\`\`\`

## Installation Verification

\`\`\`bash
rtk --version         # Should show: rtk X.Y.Z
rtk gain              # Should work (not "command not found")
which rtk             # Verify correct binary
\`\`\`

⚠️ **Name collision**: If \`rtk gain\` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## Hook-Based Usage

All other commands are automatically rewritten by the CodeBuddy hook.
Example: \`git status\` → \`rtk git status\` (transparent, 0 tokens overhead)

Refer to CODEBUDDY.md for full command reference.
`

const RTK_HOOK_COMMAND = 'rtk hook claude'

/**
 * rtk 的 `--agent` 枚举（claude/cursor/trae/windsurf/cline/kilocode/antigravity…）
 * 不含 codebuddy/workbuddy。对这两个 CodeBuddy 同内核 Agent 跳过 `rtk init`，
 * 由 stk 原生直接改写其 settings.json 与指令主文件，hook 命令沿用 claude 语义
 * （CodeBuddy 与 Claude Code 同为 claude 风格 PreToolUse hook，`rtk hook claude` 通用）。
 */
const NATIVE_CONFIG_AGENTS = new Set(['codebuddy', 'workbuddy'])

/** 执行 shell 步骤并显式校验退出码（tinyexec 默认不 throw）。 */
async function runStep(cmd: string, deps: RegistryDeps): Promise<InstallStep> {
  try {
    const run = deps.runShell ?? runShell
    const res = await run(cmd)
    if (res.exitCode !== 0) {
      return { cmd, ok: false, error: `exitCode=${res.exitCode} ${res.stderr.trim()}`.trim() }
    }
    return { cmd, ok: true }
  } catch (e) {
    return { cmd, ok: false, error: (e as Error).message }
  }
}

/** 数据化 config 命令：`{agent}` 占位符替换 + 非 global 剥离 `-g`（与 generic install 同语义）。 */
function resolveConfigCmd(entry: ToolkitCatalogEntry, agent: string, global: boolean): string {
  const template = entry.install?.config?.default ?? `rtk init -g --agent {agent}`
  let cmd = template.replaceAll('{agent}', agent)
  if (!global) cmd = cmd.replace(/\s-g(\s|$)/g, '$1').trim()
  return cmd
}

/** 校验三处产物是否齐备，返回缺失项名称（空数组 = 全齐）。 */
export function verifyNativeArtifacts(global: boolean, agent: string): string[] {
  const { settings, memoryMd, doc } = configPathsFor(agent, global)
  const missing: string[] = []
  try {
    const config = JSON.parse(readFileSync(settings, 'utf8')) as {
      hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> }
    }
    const hooked = (config.hooks?.PreToolUse ?? []).some((entry) =>
      (entry.hooks ?? []).some((h) => h.command === RTK_HOOK_COMMAND),
    )
    if (!hooked) missing.push('settings.json')
  } catch {
    missing.push('settings.json')
  }
  if (!existsSync(doc)) missing.push('RTK.md')
  try {
    if (!readFileSync(memoryMd, 'utf8').includes('@RTK.md')) missing.push('CODEBUDDY.md')
  } catch {
    missing.push('CODEBUDDY.md')
  }
  return missing
}

/** 解析目标 Agent 的 settings / 指令主文件 / RTK.md 路径。 */
function configPathsFor(agent: string, global: boolean): {
  settings: string
  memoryMd: string
  doc: string
} {
  const adapter = getAdapter(agent)
  if (!adapter) throw new Error(`未知 Agent: ${agent}`)
  const paths = adapter.getConfigPaths()
  if (global) {
    return {
      settings: paths.settings,
      memoryMd: paths.codebuddyMd,
      doc: join(dirname(paths.settings), 'RTK.md'),
    }
  }
  const dir = join(process.cwd(), `.${agent}`)
  return {
    settings: join(dir, 'settings.json'),
    memoryMd: join(dir, basename(paths.codebuddyMd)),
    doc: join(dir, 'RTK.md'),
  }
}

/**
 * 原生配置（codebuddy/workbuddy 回退 claude 语义）：
 * 1. settings.json 注入 PreToolUse[Bash] → `rtk hook claude`（幂等）
 * 2. 缺失时写入 RTK.md 模板
 * 3. 指令主文件（CODEBUDDY.md / SOUL.md）追加 @RTK.md 引用（幂等）
 */
export function configureNative(global: boolean, agent: string): InstallStep[] {
  const { settings, memoryMd, doc } = configPathsFor(agent, global)
  const steps: InstallStep[] = []

  // 1) settings.json hook
  try {
    mkdirSync(dirname(settings), { recursive: true })
    let config: Record<string, unknown> = {}
    if (existsSync(settings)) {
      config = JSON.parse(readFileSync(settings, 'utf8')) as Record<string, unknown>
    }
    const hooks = (config.hooks as Record<string, unknown> | undefined) ?? {}
    const pre = (hooks.PreToolUse as Array<Record<string, unknown>> | undefined) ?? []
    const alreadyHooked = pre.some((entry) =>
      ((entry.hooks as Array<{ command?: string }> | undefined) ?? []).some(
        (h) => h.command === RTK_HOOK_COMMAND,
      ),
    )
    if (!alreadyHooked) {
      pre.push({ matcher: 'Bash', hooks: [{ type: 'command', command: RTK_HOOK_COMMAND }] })
      hooks.PreToolUse = pre
      config.hooks = hooks
      writeFileSync(settings, JSON.stringify(config, null, 2))
      steps.push({ cmd: `settings.json: hooks.PreToolUse[Bash] += ${RTK_HOOK_COMMAND} (${settings})`, ok: true })
    } else {
      steps.push({ cmd: `settings.json: ${RTK_HOOK_COMMAND} hook 已存在 (${settings})`, ok: true })
    }
  } catch (e) {
    steps.push({ cmd: `settings.json: 写入失败 (${settings})`, ok: false, error: (e as Error).message })
    return steps
  }

  // 2) RTK.md 模板
  try {
    if (!existsSync(doc)) {
      writeFileSync(doc, RTK_DOC)
      steps.push({ cmd: `RTK.md 已写入 (${doc})`, ok: true })
    } else {
      steps.push({ cmd: `RTK.md 已存在 (${doc})`, ok: true })
    }
  } catch (e) {
    steps.push({ cmd: `RTK.md 写入失败 (${doc})`, ok: false, error: (e as Error).message })
  }

  // 3) 指令主文件 @RTK.md 引用
  try {
    let content = ''
    if (existsSync(memoryMd)) {
      content = readFileSync(memoryMd, 'utf8')
    }
    if (!content.includes('@RTK.md')) {
      const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
      writeFileSync(memoryMd, `${content}${sep}\n@RTK.md\n`)
      steps.push({ cmd: `${basename(memoryMd)} += @RTK.md (${memoryMd})`, ok: true })
    } else {
      steps.push({ cmd: `${basename(memoryMd)} 已含 @RTK.md 引用 (${memoryMd})`, ok: true })
    }
  } catch (e) {
    steps.push({ cmd: `${basename(memoryMd)} 追加 @RTK.md 失败 (${memoryMd})`, ok: false, error: (e as Error).message })
  }

  return steps
}

/**
 * rtk-native named handler：整体接管 install.handler === 'rtk-native' 的安装流。
 * 移植自已删除的 src/toolkits/impl/rtk.ts，步骤保持一一对应：
 * install → rtk init 尝试 → 产物校验 → native fallback 三件套。
 */
export async function rtkNativeInstall(
  entry: ToolkitCatalogEntry,
  { global, agent, deps }: { global: boolean; agent: string; deps: RegistryDeps },
): Promise<InstallResult> {
  const name = entry.id
  const installCmd = entry.install?.default ?? ''

  // claude 系 agent：rtk 原生支持，走透传流程（install + config 两步）
  if (!NATIVE_CONFIG_AGENTS.has(agent)) {
    const steps: InstallStep[] = []
    const installRes = await runStep(installCmd, deps)
    steps.push(installRes)
    if (!installRes.ok) return { toolkit: name, ok: false, steps }
    const configCmd = resolveConfigCmd(entry, agent, global)
    if (configCmd) {
      const configRes = await runStep(configCmd, deps)
      steps.push(configRes)
      if (!configRes.ok) return { toolkit: name, ok: false, steps }
    }
    return { toolkit: name, ok: true, steps }
  }

  const steps: InstallStep[] = []
  // 1) 安装二进制
  const installRes = await runStep(installCmd, deps)
  steps.push(installRes)
  if (!installRes.ok) {
    return { toolkit: name, ok: false, steps }
  }

  // 2) 优先尝试 rtk init —— 若未来 rtk 原生支持 codebuddy/workbuddy 则直接生效
  const initCmd = resolveConfigCmd(entry, agent, global)
  const initRes = await runStep(initCmd, deps)
  steps.push(initRes)
  const initOk = initRes.ok

  // 3) 校验产物 —— 即使退出码为 0 也可能静默缺项（实测 rtk 对全新环境宣称
  //    "hook registered" 却不写 settings.json），故一律校验
  const missing = verifyNativeArtifacts(global, agent)
  if (initOk && missing.length === 0) {
    steps.push({ cmd: `verify: rtk init 已完成全部配置 (${agent})`, ok: true })
    return { toolkit: name, ok: true, steps }
  }

  // 4) 回退：手动改写 settings.json / RTK.md / 指令主文件（幂等，只补缺失项）
  const reason = initRes.error ? `rtk init 失败 (${initRes.error})，` : ''
  steps.push({
    cmd: `fallback: ${reason}手动配置缺失项 ${missing.length > 0 ? missing.join('/') : ''} (${agent})`,
    ok: true,
  })
  const fallbackSteps = configureNative(global, agent)
  return {
    toolkit: name,
    ok: fallbackSteps.every((s) => s.ok),
    steps: [...steps, ...fallbackSteps],
  }
}
