## ADDED Requirements

### Requirement: 安装 gongfeng-cli
系统 SHALL 执行 `go install github.com/studyzy/gongfeng-cli/cmd/gongfeng@latest` 安装工蜂 CLI 工具。

#### Scenario: go 环境可用
- **WHEN** `which go` 返回有效路径
- **THEN** 执行 `go install github.com/studyzy/gongfeng-cli/cmd/gongfeng@latest`

#### Scenario: go 环境不可用
- **WHEN** `which go` 返回空或报错
- **THEN** 提示用户先安装 Go，回报失败

### Requirement: 引导工蜂认证配置
系统 SHALL 安装完成后，提示用户配置工蜂 Private Token 认证。

#### Scenario: 安装成功后提示认证
- **WHEN** `go install` 成功
- **THEN** 提示用户运行 `gongfeng auth login --token <private_token>` 完成认证

### Requirement: 禁用工蜂 MCP
系统 SHALL 在 CLI 安装成功后，将工蜂 MCP 添加到 `.mcp.json` 的 `disabledMcpServers` 列表。

#### Scenario: 禁用工蜂 MCP
- **WHEN** 目标工蜂 MCP name 在 `mcpServers` 中
- **THEN** 将其 name 追加到 `disabledMcpServers`，回报成功
