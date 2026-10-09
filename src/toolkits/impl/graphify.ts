import type { ToolkitId } from '../../types/index.js'
import { BaseSaveTokenToolkit } from '../types.js'
import { registerToolkit } from '../registry.js'
import { exists } from '../../utils/fs-operations.js'
import { commandExists } from '../../utils/platform.js'
import path from 'node:path'

class GraphifyToolkit extends BaseSaveTokenToolkit {
  readonly name: ToolkitId = 'graphify'
  readonly description = 'Graphify — 代码图谱减少盲搜'
  readonly savingEstimate = '71.5x 代码图谱'
  readonly type = 'cli'
  readonly installCommand = 'uv tool install graphifyy'
  readonly verifyCommand = 'graphify --version'
  getConfigCommand(agent: string): string {
    return `graphify install --platform ${agent}`
  }

  detect(): Promise<boolean> {
    return commandExists('graphify')
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(exists(path.join(process.cwd(), 'graphify-out')))
  }
}

export const graphifyToolkit = new GraphifyToolkit()
registerToolkit(graphifyToolkit)
