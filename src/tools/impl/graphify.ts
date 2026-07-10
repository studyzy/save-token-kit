import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists } from '../../utils/fs-operations.js'
import { commandExists } from '../../utils/platform.js'
import path from 'node:path'

class GraphifyTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'graphify'
  readonly description = 'Graphify — 代码图谱减少盲搜'
  readonly savingEstimate = '71.5x 代码图谱'
  readonly type = 'cli'
  readonly installCommand = 'uv tool install graphifyy'
  readonly verifyCommand = 'graphify --version'
  readonly configCommand = 'graphify install --platform codebuddy'

  detect(): Promise<boolean> {
    return commandExists('graphify')
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(exists(path.join(process.cwd(), 'graphify-out')))
  }
}

export const graphifyTool = new GraphifyTool()
registerTool(graphifyTool)
