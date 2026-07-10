import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists } from '../../utils/fs-operations.js'

class CavemanTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'caveman'
  readonly description = 'Caveman — AI 回复压缩 65-75%'
  readonly savingEstimate = '65-75% AI 回复压缩'
  readonly type = 'plugin'
  readonly installCommand = 'git clone https://github.com/studyzy/caveman /tmp/caveman && cd /tmp/caveman && ./install.sh'
  readonly verifyCommand = 'ls ~/.codebuddy/plugins/marketplaces/caveman/'
  readonly configCommand = ''

  detect(): Promise<boolean> {
    return Promise.resolve(this.hasMarketplaceDir())
  }

  isEnabled(): Promise<boolean> {
    return this.detect()
  }

  private hasMarketplaceDir(): boolean {
    const home = process.env.HOME ?? '/tmp'
    return exists(`${home}/.codebuddy/plugins/marketplaces/caveman/`)
  }
}

export const cavemanTool = new CavemanTool()
registerTool(cavemanTool)
