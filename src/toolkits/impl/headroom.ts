import type { ToolkitId } from '../../types/index.js'
import { BaseSaveTokenToolkit } from '../types.js'
import { registerToolkit } from '../registry.js'
import { commandExists, isProcessRunning } from '../../utils/platform.js'

class HeadroomToolkit extends BaseSaveTokenToolkit {
  readonly name: ToolkitId = 'headroom'
  readonly description = 'Headroom — 上下文压缩 47-92%'
  readonly savingEstimate = '47-92% 上下文压缩'
  readonly type = 'cli'
  readonly installCommand = 'pip install "headroom-ai[all]"'
  readonly verifyCommand = 'headroom --version'
  getConfigCommand(): string {
    return 'headroom mcp install'
  }

  detect(): Promise<boolean> {
    return commandExists('headroom')
  }

  async isEnabled(): Promise<boolean> {
    const installed = await this.detect()
    if (!installed) return false
    const processRunning = await isProcessRunning('headroom')
    return processRunning && this._mcpEnabled
  }

  private _mcpEnabled = false

  setMcpEnabled(enabled: boolean): void {
    this._mcpEnabled = enabled
  }
}

export const headroomToolkit = new HeadroomToolkit()
registerToolkit(headroomToolkit)
