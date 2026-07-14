import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists } from '../../utils/fs-operations.js'

class KarpathySkillsTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'karpathy-skills'
  readonly description = 'Karpathy Skills — 编码行为准则减少 LLM 错误'
  readonly savingEstimate = '减少不必要的 diff/重写/盲目假设'
  readonly type = 'plugin'
  readonly installCommand =
    'codebuddy plugin marketplace add https://github.com/multica-ai/andrej-karpathy-skills && codebuddy plugin install andrej-karpathy-skills@karpathy-skills'
  readonly verifyCommand = 'ls ~/.codebuddy/plugins/marketplaces/andrej-karpathy-skills/'
  getConfigCommand(): string {
    return ''
  }

  detect(): Promise<boolean> {
    return Promise.resolve(this.hasMarketplaceDir())
  }

  isEnabled(): Promise<boolean> {
    return this.detect()
  }

  private hasMarketplaceDir(): boolean {
    const home = process.env.HOME ?? '/tmp'
    return exists(`${home}/.codebuddy/plugins/marketplaces/andrej-karpathy-skills/`)
  }
}

export const karpathySkillsTool = new KarpathySkillsTool()
registerTool(karpathySkillsTool)
