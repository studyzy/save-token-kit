import type { ToolkitId } from '../../types/index.js'
import { BaseSaveTokenToolkit } from '../types.js'
import { registerToolkit } from '../registry.js'
import { exists, readJsonSafe } from '../../utils/fs-operations.js'

/** Plugin id key in settings.json enabledPlugins (pluginId@marketplace). */
const ENABLED_PLUGIN_KEY = 'caveman@caveman'

class CavemanToolkit extends BaseSaveTokenToolkit {
  readonly name: ToolkitId = 'caveman'
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

export const cavemanToolkit = new CavemanToolkit()
registerToolkit(cavemanToolkit)
