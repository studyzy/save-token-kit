import type { ToolDetection, ToolId } from '../types/index.js'

/** Result of running a single shell step during `stk install`. */
export interface InstallStep {
  /** The shell command that was executed */
  cmd: string
  /** Whether the step succeeded (exit code 0) */
  ok: boolean
  /** Error message when ok is false */
  error?: string
}

/** Aggregate result of `stk install <tool>`. */
export interface InstallResult {
  /** Tool name that was targeted */
  tool: string
  /** Overall success: true only if every step succeeded */
  ok: boolean
  /** Per-step outcomes, in execution order */
  steps: InstallStep[]
}

/**
 * 省 Token 第三方工具接口。
 * 每个工具（rtk / caveman / headroom / lean-ctx / graphify / ponytail）实现此接口。
 */
export interface SaveTokenTool {
  /** 工具唯一标识 */
  readonly name: ToolId
  /** 工具描述 */
  readonly description: string
  /** 预估节省说明 */
  readonly savingEstimate: string
  /** 工具类型 */
  readonly type: 'cli' | 'plugin'

  /** 检测是否已安装 */
  detect(): Promise<boolean>
  /** 检测是否已在 CodeBuddy 中启用 */
  isEnabled(): Promise<boolean>
  /** 构建 ToolDetection 对象 */
  buildDetection(): Promise<ToolDetection>
  /** 安装命令（shell） */
  installCommand: string
  /** 验证命令（shell） */
  verifyCommand: string
  /**
   * 配置命令（安装后注册到目标 Agent，shell）。
   * @param _agent target agent name (e.g. "codebuddy")
   * @param _global whether install targets global ~/.codebuddy
   */
  getConfigCommand(_agent: string, _global: boolean): string
  /** 卸载命令 — TODO: 以后实现 */
  uninstallCommand: string
  /**
   * 执行安装：先 installCommand，后 getConfigCommand 返回的 config 命令。
   * @param global 是否全局安装（~/.codebuddy）
   * @param agent 目标 Agent（默认 codebuddy）
   */
  install(global: boolean, agent: string): Promise<InstallResult>
}

/**
 * 为 plugin 类工具提供默认的 enable 逻辑：已安装即已启用。
 * cli 类工具自行实现 isEnabled。
 */
export abstract class BaseSaveTokenTool implements SaveTokenTool {
  abstract readonly name: ToolId
  abstract readonly description: string
  abstract readonly savingEstimate: string
  abstract readonly type: 'cli' | 'plugin'
  abstract readonly installCommand: string
  abstract readonly verifyCommand: string
  readonly uninstallCommand = ''

  // Default: no agent-specific config step. Tools that need it override this.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getConfigCommand(_agent: string, _global: boolean): string {
    return ''
  }

  abstract detect(): Promise<boolean>
  abstract isEnabled(): Promise<boolean>

  async buildDetection(): Promise<ToolDetection> {
    const [installed, enabled] = await Promise.all([this.detect(), this.isEnabled()])
    return {
      name: this.name,
      installed,
      enabled,
      version: null,
      installPath: null,
      codebuddyIntegrated: installed,
      recommendedSaving: this.savingEstimate,
    }
  }

  /**
   * Default install flow: run installCommand, then the config command (if any).
   * Subclasses may override for tool-specific behavior.
   */
  async install(global: boolean, agent: string): Promise<InstallResult> {
    const steps: InstallStep[] = []
    const run = async (cmd: string): Promise<void> => {
      const { exec } = await import('../utils/platform.js')
      await exec(cmd, { shell: true })
    }
    try {
      await run(this.installCommand)
      steps.push({ cmd: this.installCommand, ok: true })
    } catch (e) {
      steps.push({ cmd: this.installCommand, ok: false, error: (e as Error).message })
      return { tool: String(this.name), ok: false, steps }
    }
    const config = this.getConfigCommand(agent, global)
    if (config) {
      try {
        await run(config)
        steps.push({ cmd: config, ok: true })
      } catch (e) {
        steps.push({ cmd: config, ok: false, error: (e as Error).message })
        return { tool: String(this.name), ok: false, steps }
      }
    }
    return { tool: String(this.name), ok: true, steps }
  }
}
