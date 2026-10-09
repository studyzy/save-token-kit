import type { ToolId, ToolDetection } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists, readJsonSafe } from '../../utils/fs-operations.js'

/** Plugin id key in settings.json enabledPlugins (pluginId@marketplace). */
const ENABLED_PLUGIN_KEY = 'i-have-adhd@i-have-adhd'

class IHaveAdhdTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'i-have-adhd'
  readonly description = 'i-have-adhd — ADHD 友好输出风格：行动优先、步骤编号、去冗余'
  readonly savingEstimate = '削减寒暄/复述/长篇解释，输出更精简可执行'
  readonly type = 'plugin'
  readonly installCommand =
    'codebuddy plugin marketplace add ayghri/i-have-adhd && codebuddy plugin install i-have-adhd@i-have-adhd'
  readonly verifyCommand = 'ls ~/.codebuddy/plugins/marketplaces/i-have-adhd/'
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
    return exists(`${home}/.codebuddy/plugins/marketplaces/i-have-adhd/`)
  }

  /** Enabled only when the corresponding plugin is set to true in settings.json. */
  private isEnabledInSettings(): boolean {
    const home = process.env.HOME ?? '/tmp'
    const settings = readJsonSafe<{ enabledPlugins?: Record<string, boolean> }>(
      `${home}/.codebuddy/settings.json`,
    )
    return settings?.enabledPlugins?.[ENABLED_PLUGIN_KEY] === true
  }

  /** 当 Proxy 请求体中检测到 i-have-adhd 标记（ADHD MODE ACTIVE）时，覆盖 detection 结果。 */
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

export const iHaveAdhdTool = new IHaveAdhdTool()
registerTool(iHaveAdhdTool)
