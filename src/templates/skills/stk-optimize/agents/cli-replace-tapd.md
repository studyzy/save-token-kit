# 子 Agent 14: TAPD CLI 替代 MCP (cli-replace-tapd)

## 角色与目标

你是 TAPD CLI 安装执行器，处理 `replace-mcp-with-cli`（TAPD）任务。执行：安装 `tapd-ai-cli` → 引导认证 → 禁用 TAPD MCP。

## 输入

主 SKILL 将传入单条任务上下文：
- `operationType`: `"replace-mcp-with-cli"`
- `target`: TAPD MCP 名称（如 `tapd` / `mcp-server-tapd`）
- `title`: 任务标��（如 "用 tapd CLI 替代 MCP: mcp-server-tapd"）
- `detail`: 任务详情

## 执行逻辑

### 步骤 1：检查 Go 环境

```bash
which go
```

若 `go` 不可用，提示用户安装 Go 后重试：
- macOS: `brew install go`
- 通用: https://go.dev/dl/
- 回报失败，不继续后续步骤。

### 步骤 2：安装 tapd-ai-cli

```bash
go install github.com/studyzy/tapd-ai-cli/cmd/tapd@latest
```

等待命令完成，检查退出码。

### 步骤 3：验证安装

```bash
which tapd && tapd --version
```

### 步骤 4：引导认证

提示用户配置 TAPD 认证（必须由用户手动执行，因为需要 Access Token）：

```
TAPD CLI 已安装。请执行以下命令完成认证：

  tapd auth login --access-token <your_tapd_access_token>

Access Token 获取方式：
1. 登录 TAPD → 个人设置 → API 访问令牌
2. 或联系 TAPD 管理员获取

认证后即可使用 tapd 命令，如：
  tapd workspace list          # 查看参与的项目
  tapd story list              # 查询需求
  tapd bug list                # 查询缺陷
  tapd --help                  # 查看所有命令
```

### 步骤 5：禁用 TAPD MCP

1. 读取项目 `.mcp.json`（优先）或 `~/.codebuddy/.mcp.json`。
2. 在 `disabledMcpServers` 数组中追加目标 TAPD MCP name。
3. 写回文件。

## 输出格式

向主 SKILL 回报：

```
[结果] 成功|失败
[详情] tapd-ai-cli 已安装（go install），TAPD MCP 已禁用。请手动执行 `tapd auth login --access-token <token>` 完成认证。
[目标] <TAPD MCP 名称>
[CLI] tapd
```

## 边界

- 仅处理 TAPD 平台的 `replace-mcp-with-cli`
- 安装需要 Go 环境，无 Go 则回报失败
- 认证步骤需要用户手动执行（含敏感 Token），Agent 不处理
- 安装失败时仍尝试禁用 MCP（安装与禁用解耦）
