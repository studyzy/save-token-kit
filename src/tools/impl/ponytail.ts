import type { ToolId, ToolDetection } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists, readJsonSafe } from '../../utils/fs-operations.js'

/** Plugin id key in settings.json enabledPlugins (pluginId@marketplace). */
const ENABLED_PLUGIN_KEY = 'ponytail@ponytail'

class PonytailTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'ponytail'
  readonly description = 'Ponytail — 决策阶梯减少过度工程'
  readonly savingEstimate = '54% 代码量 + 20-75% 成本'
  readonly type = 'plugin'
  readonly installCommand = 'codebuddy plugin marketplace add https://github.com/studyzy/ponytail'
  readonly verifyCommand = 'ls ~/.codebuddy/plugins/marketplaces/ponytail/'
  getConfigCommand(): string {
    return ''
  }

  detect(): Promise<boolean> {
    return Promise.resolve(this.hasMarketplaceDir())
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(this.isEnabledInSettings())
  }

  private hasMarketplaceDir(): boolean {
    const home = process.env.HOME ?? '/tmp'
    return exists(`${home}/.codebuddy/plugins/marketplaces/ponytail/`)
  }

  /** Enabled only when the corresponding plugin is set to true in settings.json. */
  private isEnabledInSettings(): boolean {
    const home = process.env.HOME ?? '/tmp'
    const settings = readJsonSafe<{ enabledPlugins?: Record<string, boolean> }>(
      `${home}/.codebuddy/settings.json`,
    )
    return settings?.enabledPlugins?.[ENABLED_PLUGIN_KEY] === true
  }

  /** 当 Proxy 请求体中检测到 ponytail 标记时，覆盖 detection 结果。 */
  markInstalledFromProxy(detection: ToolDetection): ToolDetection {
    if (!detection.installed) {
      return {
        ...detection,
        installed: true,
        codebuddyIntegrated: true,
      }
    }
    return detection
  }
}

export const ponytailTool = new PonytailTool()
registerTool(ponytailTool)
