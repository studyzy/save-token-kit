import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists } from '../../utils/fs-operations.js'
import { commandExists } from '../../utils/platform.js'
import path from 'node:path'

class CodeGraphTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'codegraph'
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

export const codegraphTool = new CodeGraphTool()
registerTool(codegraphTool)
