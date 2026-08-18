import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists, readJsonSafe } from '../../utils/fs-operations.js'

/** Plugin id key in settings.json enabledPlugins (pluginId@marketplace). */
const ENABLED_PLUGIN_KEY = 'caveman@caveman'

class CavemanTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'caveman'
  readonly description = 'Caveman — AI 回复压缩 65-75%'
  readonly savingEstimate = '65-75% AI 回复压缩'
  readonly type = 'plugin'
  readonly installCommand =
    'git clone https://github.com/studyzy/caveman /tmp/caveman && cd /tmp/caveman && ./install.sh'
  readonly verifyCommand = 'ls ~/.codebuddy/plugins/marketplaces/caveman/'
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
    return exists(`${home}/.codebuddy/plugins/marketplaces/caveman/`)
  }

  /** Enabled only when the corresponding plugin is set to true in settings.json. */
  private isEnabledInSettings(): boolean {
    const home = process.env.HOME ?? '/tmp'
    const settings = readJsonSafe<{ enabledPlugins?: Record<string, boolean> }>(
      `${home}/.codebuddy/settings.json`,
    )
    return settings?.enabledPlugins?.[ENABLED_PLUGIN_KEY] === true
  }
}

export const cavemanTool = new CavemanTool()
registerTool(cavemanTool)
