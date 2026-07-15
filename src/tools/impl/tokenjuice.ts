import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { commandExists } from '../../utils/platform.js'

/**
 * TokenJuice — 确定性命令输出压缩器（规则驱动）。
 * 观察命令（git status / pnpm test / docker build / rg 等）的高噪声输出，
 * 通过 JSON 规则重写为更小的有效载荷，减少 transcript waste，省 Token。
 */
class TokenJuiceTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'tokenjuice'
  readonly description = 'TokenJuice — 命令输出确定性压缩（规则驱动）'
  readonly savingEstimate = '终端命令输出压缩，减少 transcript 浪费'
  readonly type = 'cli'
  readonly installCommand =
    'go install github.com/vincentkoc/tokenjuice/cmd/tokenjuice@latest'
  readonly verifyCommand = 'tokenjuice --help'
  getConfigCommand(): string {
    return ''
  }

  detect(): Promise<boolean> {
    return commandExists('tokenjuice')
  }

  isEnabled(): Promise<boolean> {
    // TokenJuice 通过包装命令或 hook 接入；仓库不自动改写用户配置，默认未启用。
    return Promise.resolve(false)
  }
}

export const tokenJuiceTool = new TokenJuiceTool()
registerTool(tokenJuiceTool)
