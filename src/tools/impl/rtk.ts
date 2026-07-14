import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { commandExists } from '../../utils/platform.js'

class RtkTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'rtk'
  readonly description = 'RTK — 终端命令输出压缩 ~89%'
  readonly savingEstimate = '~89% 命令输出压缩'
  readonly type = 'cli'
  readonly installCommand = 'brew install rtk'
  readonly verifyCommand = 'rtk gain'
  getConfigCommand(agent: string, global: boolean): string {
    return `rtk init${global ? ' -g' : ''} --agent ${agent}`
  }

  detect(): Promise<boolean> {
    return commandExists('rtk')
  }

  isEnabled(): Promise<boolean> {
    // RTK 通过 CodeBuddy PreToolUse hook 启用；调用方可通过 setHookEnabled 覆盖。
    return Promise.resolve(this._hookEnabled)
  }

  private _hookEnabled = false

  setHookEnabled(enabled: boolean): void {
    this._hookEnabled = enabled
  }
}

export const rtkTool = new RtkTool()
registerTool(rtkTool)
