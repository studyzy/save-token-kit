import type { ToolId } from '../../types/index.js'
import { BaseSaveTokenTool } from '../types.js'
import { registerTool } from '../registry.js'
import { commandExists } from '../../utils/platform.js'

/**
 * Context Mode — AI 编程代理上下文窗口优化工具（mksglu/context-mode）。
 * 通过 MCP server（ctx_* 工具）将工具输出沙箱化（FTS5 外部索引，宣称减 98%）、
 * 持久化会话记忆、跨平台强制路由，使 Agent 用按需检索替代全量记忆，从而省 Token。
 */
class ContextModeTool extends BaseSaveTokenTool {
  readonly name: ToolId = 'context-mode'
  readonly description = 'Context Mode — 工具输出沙箱化 + 会话记忆持久化（MCP）'
  readonly savingEstimate = '工具输出 FTS5 外部索引，减少 ~98% 上下文占用'
  readonly type = 'plugin'
  readonly installCommand = 'npm install -g context-mode'
  readonly verifyCommand = 'context-mode --version'

  private _mcpEnabled = false

  /** 全局命令可用即视为已安装。 */
  detect(): Promise<boolean> {
    return commandExists('context-mode')
  }

  /** 已安装且 CodeBuddy MCP 已注册时返回 true（由 detectToolsViaRegistry 覆盖）。 */
  isEnabled(): Promise<boolean> {
    return Promise.resolve(this._mcpEnabled)
  }

  /** 由 detectToolsViaRegistry 根据 .mcp.json 中是否配置 context-mode server 覆盖。 */
  setMcpEnabled(enabled: boolean): void {
    this._mcpEnabled = enabled
  }

  /** 将 context-mode 注册为 CodeBuddy MCP server 的提示命令。 */
  getConfigCommand(): string {
    // context-mode 自身不带 CodeBuddy 插件，需在 .mcp.json 注册 MCP server。
    return 'codebuddy mcp add context-mode -- context-mode'
  }
}

export const contextModeTool = new ContextModeTool()
registerTool(contextModeTool)
