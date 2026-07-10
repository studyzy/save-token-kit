import type { ToolDetection, ToolId } from '../types/index.js'

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
  /** 安装命令 */
  installCommand: string
  /** 验证命令 */
  verifyCommand: string
  /** 配置命令（安装后注册到 CodeBuddy） */
  configCommand: string
  /** 卸载命令 — TODO: 以后实现 */
  uninstallCommand: string
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
  abstract readonly configCommand: string
  readonly uninstallCommand = ''

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
}
