## ADDED Requirements

### Requirement: 安装 tapd-ai-cli
系统 SHALL 执行 `go install github.com/studyzy/tapd-ai-cli/cmd/tapd@latest` 安装 TAPD CLI 工具。

#### Scenario: go 环境可用
- **WHEN** `which go` 返回有效路径
- **THEN** 执行 `go install github.com/studyzy/tapd-ai-cli/cmd/tapd@latest`

#### Scenario: go 环境不可用
- **WHEN** `which go` 返回空或报错
- **THEN** 提示用户先安装 Go（`brew install go` 或访问 https://go.dev/dl/），回报失败

### Requirement: 引导 TAPD 认证配置
系统 SHALL 安装完成后，提示用户配置 TAPD 认证（Access Token 或 API User/Password）。

#### Scenario: 安装成功后提示认证
- **WHEN** `go install` 成功
- **THEN** 提示用户运行 `tapd auth login --access-token <token>` 完成认证

### Requirement: 禁用 TAPD MCP
系统 SHALL 在 CLI 安装成功后，将 TAPD MCP 添加到 `.mcp.json` 的 `disabledMcpServers` 列表。

#### Scenario: 禁用 TAPD MCP
- **WHEN** 目标 TAPD MCP name 在 `mcpServers` 中
- **THEN** 将其 name 追加到 `disabledMcpServers`，回报成功
