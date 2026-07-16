# 子 Agent 2: MCP 优化 (mcp-opt)

**输入**：`mcpList[]` + `context.json`
遍历 `mcpList[]`：

| 条件                                                   | 输出                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `status === "disabled"` 且 `toolsCount === 0`          | 建议移除配置。`action`: "移除 mcp: <name>"                       |
| `hasCliAlternative === true` 且 `status === "enabled"` | 建议 CLI 替代。`action`: "用 CLI 替代 mcp: <name>"               |
| 大型 MCP 且支持延迟加载                                | 建议 `defer-mcp`。`action`: "为 <name> 设置 defer_loading: true" |

**输出 category**：`MCP 优化`
**`level`**：中级（MCP 属于配置优化类，按 Agent/Plugin 同级别）
