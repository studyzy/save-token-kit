import { green, red, yellow } from 'ansis'
import { getAdapter } from '../adapters/codebuddy-adapter.js'
import { getAllTools, getTool } from '../tools/index.js'

export interface InstallOptions {
  global?: boolean
  local?: boolean
  agent?: string
}

/**
 * Implement `stk install <tool> [-g|--global] [--agent <name>]`.
 *
 * Installs a third-party token-saving tool by running its registered
 * install + config commands. `-g/--global` targets ~/.codebuddy (default);
 * `--local` overrides to project-level .codebuddy/. `--agent` defaults to
 * codebuddy; claude/codex are reserved (unsupported) and rejected.
 */
export async function runInstall(toolName: string, options: InstallOptions): Promise<void> {
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

  const tool = getTool(toolName)
  if (!tool) {
    const available = getAllTools()
      .map((t) => t.name)
      .join(', ')
    console.error(red(`未知工具: ${toolName}`))
    console.error(yellow(`可用工具: ${available}`))
    process.exitCode = 1
    return
  }

  // Default to global install (consistent with `stk init`). `--local` opts out.
  const global = options.local ? false : true

  console.log(`安装工具: ${tool.name} (agent=${agentName}, ${global ? '全局' : '项目级'})`)
  console.log(`步骤 1/2: ${tool.installCommand}`)
  const result = await tool.install(global, agentName)

  for (const step of result.steps) {
    if (step.ok) {
      console.log(green(`  ✓ ${step.cmd}`))
    } else {
      console.error(red(`  ✗ ${step.cmd}`))
      console.error(red(`    错误: ${step.error ?? 'unknown'}`))
    }
  }

  if (!result.ok) {
    console.error(red(`\n${tool.name} 安装失败，请检查上述错误。`))
    process.exitCode = 1
    return
  }
  console.log(green(`\n${tool.name} 安装完成。`))
  if (adapter.supported && agentName === 'codebuddy') {
    console.log(yellow(`提示: 重新运行 'stk diagnose' 以采集启用后的诊断报告。`))
  }
}
