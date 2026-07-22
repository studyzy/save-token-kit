## ADDED Requirements

### Requirement: 禁用 MCP Server
系统 SHALL 修改 `.mcp.json`，将目标 MCP server 添加到 `disabledMcpServers` 列表（不删除配置）。

#### Scenario: 禁用已启用的 MCP
- **WHEN** 目标 MCP server 在 `mcpServers` 中且不在 `disabledMcpServers` 中
- **THEN** 将其 name 追加到 `disabledMcpServers` 数组

#### Scenario: MCP 已在禁用列表中
- **WHEN** 目标 MCP server 已在 `disabledMcpServers` 中
- **THEN** 回报成功（无需修改），标注 "已处于禁用状态"

### Requirement: 设置 MCP defer_loading
系统 SHALL 修改 `.mcp.json`，为目标 MCP server 设置 `"defer_loading": true`。

#### Scenario: 设置 defer_loading
- **WHEN** 目标 MCP server 的 `defer_loading` 不为 `true`
- **THEN** 在 server 配置中添加或修改 `"defer_loading": true`

#### Scenario: defer_loading 已设置
- **WHEN** 目标 MCP server 的 `defer_loading` 已为 `true`
- **THEN** 回报成功（无需修改）

### Requirement: 用 CLI 替代 MCP
系统 SHALL 执行 `disable-mcp` 操作，并向用户提示对应的 CLI 命令。

#### Scenario: 禁用 MCP 并提示 CLI
- **WHEN** operationType 为 `replace-mcp-with-cli`
- **THEN** 将目标 MCP 添加到 `disabledMcpServers`，回报中提示替代 CLI 命令（如 `gh`、`tapd-cli`、`gongfeng`）
