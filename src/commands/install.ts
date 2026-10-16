import { green, red, yellow } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'
import { getAllToolkits, getToolkit } from '../toolkits/index.js'

export interface InstallOptions {
  global?: boolean
  local?: boolean
  agent?: string
}

/**
 * Implement `stk install <toolkit> [-g|--global] [--agent <name>]`.
 *
 * Installs a third-party token-saving toolkit by running its registered
 * install + config commands. `-g/--global` targets ~/.codebuddy (default);
 * `--local` overrides to project-level .codebuddy/. `--agent` defaults to
 * codebuddy; claude/codex/cursor are resolved via the adapter registry.
 */
export async function runInstall(toolkitName: string, options: InstallOptions): Promise<void> {
  const agentName = options.agent ?? 'codebuddy'

  const adapter = getAdapter(agentName)
  if (!adapter) {
    console.error(red(`未知的 Agent: ${agentName}`))
    process.exitCode = 1
    return
  }
  if (!adapter.supported) {
    console.error(red(`该 Agent (${agentName}) 暂不支持，欢迎贡献`))
    process.exitCode = 1
    return
  }

  const toolkit = getToolkit(toolkitName)
  if (!toolkit) {
    const available = getAllToolkits()
      .map((t) => t.name)
      .join(', ')
    console.error(red(`未知 Toolkit: ${toolkitName}`))
    console.error(yellow(`可用 Toolkit: ${available}`))
    process.exitCode = 1
    return
  }

  // Default to global install (consistent with `stk init`). `--local` opts out.
  const global = options.local ? false : true

  console.log(`安装 Toolkit: ${toolkit.name} (agent=${agentName}, ${global ? '全局' : '项目级'})`)
  console.log(`步骤 1/2: ${toolkit.installCommand}`)
  const result = await toolkit.install(global, agentName)

  for (const step of result.steps) {
    if (step.ok) {
      console.log(green(`  ✓ ${step.cmd}`))
    } else {
      console.error(red(`  ✗ ${step.cmd}`))
      console.error(red(`    错误: ${step.error ?? 'unknown'}`))
    }
  }

  if (!result.ok) {
    console.error(red(`\n${toolkit.name} 安装失败，请检查上述错误。`))
    process.exitCode = 1
    return
  }
  console.log(green(`\n${toolkit.name} 安装完成。`))
  if (adapter.supported && (agentName === 'codebuddy' || agentName === 'workbuddy')) {
    console.log(
      yellow(`提示: 重新运行 'stk diagnose --agent ${agentName}' 以采集启用后的诊断报告。`),
    )
  }
}
