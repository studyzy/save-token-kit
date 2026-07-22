## ADDED Requirements

### Requirement: 安装 gh CLI
系统 SHALL 引导用户安装 GitHub CLI（`gh`）。

#### Scenario: gh 已安装
- **WHEN** `which gh` 返回有效路径
- **THEN** 跳过安装，直接进入认证引导

#### Scenario: gh 未安装（macOS）
- **WHEN** 系统为 macOS 且 `gh` 未安装
- **THEN** 提示用户运行 `brew install gh`

#### Scenario: gh 未安装（Linux）
- **WHEN** 系统为 Linux 且 `gh` 未安装
- **THEN** 提示用户参考 https://github.com/cli/cli#installation 安装

### Requirement: 引导 gh 认证配置
系统 SHALL 安装完成后，提示用户配置 GitHub 认证。

#### Scenario: 安装成功后提示认证
- **WHEN** `gh` 已可用
- **THEN** 提示用户运行 `gh auth login` 完成认证

### Requirement: 禁用 GitHub MCP
系统 SHALL 在 CLI 安装成功后，将 GitHub MCP 添加到 `.mcp.json` 的 `disabledMcpServers` 列表。

#### Scenario: 禁用 GitHub MCP
- **WHEN** 目标 GitHub MCP name 在 `mcpServers` 中
- **THEN** 将其 name 追加到 `disabledMcpServers`，回报成功
