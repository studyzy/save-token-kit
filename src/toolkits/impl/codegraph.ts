import type { ToolkitId } from '../../types/index.js'
import { BaseSaveTokenToolkit } from '../types.js'
import { registerToolkit } from '../registry.js'
import { exists } from '../../utils/fs-operations.js'
import { commandExists } from '../../utils/platform.js'
import path from 'node:path'

class CodeGraphToolkit extends BaseSaveTokenToolkit {
  readonly name: ToolkitId = 'codegraph'
  readonly description = 'CodeGraph — 本地代码知识图谱减少 Agent 盲搜'
  readonly savingEstimate = '语义代码图谱替代反复盲搜读仓'
  readonly type = 'cli'
  readonly installCommand = 'npm i -g @colbymchenry/codegraph'
  readonly verifyCommand = 'codegraph --version'
  getConfigCommand(agent: string): string {
    return `codegraph install --platform ${agent}`
  }

  detect(): Promise<boolean> {
    return commandExists('codegraph')
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(exists(path.join(process.cwd(), '.codegraph')))
  }
}

export const codegraphToolkit = new CodeGraphToolkit()
registerToolkit(codegraphToolkit)
