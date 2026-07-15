import type { ToolId, ToolDetection } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { exists, readJsonSafe } from '../../utils/fs-operations.js'
import { join } from 'node:path'

interface GitNexusMcpConfig {
  mcpServers?: Record<string, unknown>
  disabledMcpServers?: string[]
}

/**
 * GitNexus — 客户端代码知识图谱与 Graph RAG 引擎。
 * 通过 MCP server 暴露 17 个代码检索工具（mcp__gitnexus__*），
 * 让 Agent 用图谱查询替代盲搜整个仓库，从而省 Token。
 */
class GitNexusTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'gitnexus'
  readonly description = 'GitNexus — 代码知识图谱 Graph RAG 替代盲搜'
  readonly savingEstimate = '图谱检索替代全仓盲搜'
  readonly type = 'cli'
  readonly installCommand = 'git clone https://github.com/abhigyanpatwari/GitNexus ~/.codebuddy/gitnexus && cd ~/.codebuddy/gitnexus && npm install'
  readonly verifyCommand = 'ls ~/.codebuddy/gitnexus/'

  /** MCP server 名称（出现在 .mcp.json 的 mcpServers 键中）。 */
  static readonly MCP_NAME = 'gitnexus'

  private _mcpEnabled = false

  private mcpConfigPath(): string {
    const home = process.env.HOME ?? '/tmp'
    return join(home, '.codebuddy', '.mcp.json')
  }

  /** 检测 ~/.codebuddy/.mcp.json 是否配置了 gitnexus MCP server。 */
  detect(): Promise<boolean> {
    const path = this.mcpConfigPath()
    if (!exists(path)) return Promise.resolve(false)
    const config = readJsonSafe<GitNexusMcpConfig>(path)
    if (!config?.mcpServers) return Promise.resolve(false)
    return Promise.resolve(GitNexusTool.MCP_NAME in config.mcpServers)
  }

  /** 已安装且 MCP 已启用时返回 true（由 detectToolsViaRegistry 覆盖 _mcpEnabled）。 */
  isEnabled(): Promise<boolean> {
    return this.detect().then((installed) => installed && this._mcpEnabled)
  }

  setMcpEnabled(enabled: boolean): void {
    this._mcpEnabled = enabled
  }

  /** 当检测到 gitnexus MCP server 时，覆盖 detection 结果。 */
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

export const gitnexusTool = new GitNexusTool()
registerTool(gitnexusTool)
