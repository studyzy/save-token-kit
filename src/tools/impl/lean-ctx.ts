import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { commandExists } from '../../utils/platform.js'

class LeanCtxTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'lean-ctx'
  readonly description = 'lean-ctx — 读取筛选 + 跨会话记忆 60-90%'
  readonly savingEstimate = '60-90% 读取筛选'
  readonly type = 'cli'
  readonly installCommand = 'brew install lean-ctx'
  readonly verifyCommand = 'lean-ctx doctor'
  readonly configCommand = 'lean-ctx setup'

  detect(): Promise<boolean> {
    return commandExists('lean-ctx')
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(false)
  }
}

export const leanCtxTool = new LeanCtxTool()
registerTool(leanCtxTool)
