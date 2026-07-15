import type { ToolId, ToolDetection } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists, readJsonSafe } from '../../utils/fs-operations.js'
import { join } from 'node:path'

interface CodebaseMemoryMcpConfig {
  mcpServers?: Record<string, unknown>
  disabledMcpServers?: string[]
}

/**
 * Codebase Memory MCP — 代码库记忆 MCP server（DeusData/codebase-memory-mcp）。
 * 通过 MCP server 维护一份代码库知识图谱/记忆（codebase-memory__* 工具），
 * 让 Agent 用结构化查询替代反复读取整个仓库，从而省 Token。
 */
class CodebaseMemoryTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'codebase-memory'
  readonly description = 'Codebase Memory MCP — 代码库记忆图谱替代反复读仓'
  readonly savingEstimate = '记忆图谱检索替代全仓盲读'
  readonly type = 'cli'
  readonly installCommand =
    'git clone https://github.com/DeusData/codebase-memory-mcp ~/.codebuddy/codebase-memory-mcp && cd ~/.codebuddy/codebase-memory-mcp && npm install'
  readonly verifyCommand = 'ls ~/.codebuddy/codebase-memory-mcp/'

  /** MCP server 名称（出现在 .mcp.json 的 mcpServers 键中）。 */
  static readonly MCP_NAME = 'codebase-memory'

  private _mcpEnabled = false

  private mcpConfigPath(): string {
    const home = process.env.HOME ?? '/tmp'
    return join(home, '.codebuddy', '.mcp.json')
  }

  /** 检测 ~/.codebuddy/.mcp.json 是否配置了 codebase-memory MCP server。 */
  detect(): Promise<boolean> {
    const path = this.mcpConfigPath()
    if (!exists(path)) return Promise.resolve(false)
    const config = readJsonSafe<CodebaseMemoryMcpConfig>(path)
    if (!config?.mcpServers) return Promise.resolve(false)
    return Promise.resolve(CodebaseMemoryTool.MCP_NAME in config.mcpServers)
  }

  /** 已安装且 MCP 已启用时返回 true（由 detectToolsViaRegistry 覆盖 _mcpEnabled）。 */
  isEnabled(): Promise<boolean> {
    return this.detect().then((installed) => installed && this._mcpEnabled)
  }

  setMcpEnabled(enabled: boolean): void {
    this._mcpEnabled = enabled
  }

  /** 当检测到 codebase-memory MCP server 时，覆盖 detection 结果。 */
  markInstalledFromMcp(detection: ToolDetection): Promise<ToolDetection> {
    if (!detection.installed) {
      return Promise.resolve({
        ...detection,
        installed: true,
        codebuddyIntegrated: true,
      })
    }
    return Promise.resolve(detection)
  }
}

export const codebaseMemoryTool = new CodebaseMemoryTool()
registerTool(codebaseMemoryTool)
