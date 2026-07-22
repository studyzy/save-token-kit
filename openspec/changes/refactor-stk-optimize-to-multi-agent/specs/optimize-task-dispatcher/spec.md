## ADDED Requirements

### Requirement: 主 SKILL 解析 tasks.md 并提取任务列表
系统 SHALL 读取 `./save-token/tasks.md`，识别每条任务的复选框状态、等级标签、动作描述、原因和 operationType。

#### Scenario: tasks.md 存在且格式正确
- **WHEN** `./save-token/tasks.md` 存在
- **THEN** 系统解析出按出现顺序排列的任务列表，每条含 `id`、`level`、`title`、`detail`、`operationType`、`target`、`estimatedSavingTokens`

#### Scenario: tasks.md 缺失
- **WHEN** `./save-token/tasks.md` 不存在
- **THEN** 系统提示用户先运行 `/stk-analyze`，停止执行，不产出任何修改

### Requirement: 询问优化等级并筛选任务
系统 SHALL 使用 AskUserQuestion 呈现三级选项（初级 / 初级+中级 / 全部），按用户选择筛选任务集合。

#### Scenario: 用户选择初级
- **WHEN** 用户选择"初级"
- **THEN** 仅保留 `level === "初级"` 的任务进入执行队列

#### Scenario: 用户选择初级+中级
- **WHEN** 用户选择"初级 + 中级"
- **THEN** 保留 `level === "初级"` 或 `level === "中级"` 的任务

#### Scenario: 用户选择全部
- **WHEN** 用户选择"全部"
- **THEN** 保留所有等级（初级、中级、高级）的任务

### Requirement: 按 operationType 路由到对应子 Agent
系统 SHALL 按任务出现顺序，逐条派发到对应的子 Agent。每条任务完成后，主 SKILL 等待子 Agent 回报结果，再处理下一条。

#### Scenario: 路由到 install-tool Agent
- **WHEN** 当前任务 `operationType === "install-tool"`
- **THEN** 派发子 Agent `optimize-agent-install-tool`，传入该任务的完整上下文

#### Scenario: 路由到 skill-opt Agent
- **WHEN** 当前任务 `operationType` 为 `disable-skill` 或 `migrate-skill`
- **THEN** 派发子 Agent `optimize-agent-skill-opt`

#### Scenario: 路由到 mcp-opt Agent
- **WHEN** 当前任务 `operationType` 为 `disable-mcp` 或 `defer-mcp`
- **THEN** 派发子 Agent `optimize-agent-mcp-opt`

#### Scenario: 路由到 CLI 替代 TAPD Agent
- **WHEN** 当前任务 `operationType` 为 `replace-mcp-with-cli` 且 `target` 匹配 `tapd` 或 `mcp-server-tapd`
- **THEN** 派发子 Agent `optimize-agent-cli-replace-tapd`，安装 tapd-ai-cli + 禁用 TAPD MCP

#### Scenario: 路由到 CLI 替代工蜂 Agent
- **WHEN** 当前任务 `operationType` 为 `replace-mcp-with-cli` 且 `target` 匹配 `gongfeng` 或 `gongfeng-mcp`
- **THEN** 派发子 Agent `optimize-agent-cli-replace-gongfeng`，安装 gongfeng-cli + 禁用工蜂 MCP

#### Scenario: 路由到 CLI 替代 GitHub Agent
- **WHEN** 当前任务 `operationType` 为 `replace-mcp-with-cli` 且 `target` 匹配 `github` 或 `github-mcp`
- **THEN** 派发子 Agent `optimize-agent-cli-replace-gh`，安装 gh CLI + 禁用 GitHub MCP

#### Scenario: 路由到 plugin-opt Agent
- **WHEN** 当前任务 `operationType` 为 `disable-plugin` 或 `migrate-plugin`
- **THEN** 派发子 Agent `optimize-agent-plugin-opt`

#### Scenario: 路由到 codebuddy-md Agent
- **WHEN** 当前任务 `operationType` 为 `codebuddy-md-review`
- **THEN** 派发子 Agent `optimize-agent-codebuddy-md`

#### Scenario: 路由到 generic Agent
- **WHEN** 当前任务 `operationType` 不在任何已知 Agent 的覆盖范围
- **THEN** 派发子 Agent `optimize-agent-generic` 作为兜底

### Requirement: 回写任务执行状态
系统 SHALL 在每条任务执行完成后，立即回写 `tasks.md` 中对应行的复选框状态。

#### Scenario: 任务成功
- **WHEN** 子 Agent 回报执行成功
- **THEN** 将该任务行的 `- [ ]` 改为 `- [x]`

#### Scenario: 任务失败
- **WHEN** 子 Agent 回报执行失败
- **THEN** 将该任务行的 `- [ ]` 改为 `- [x]`，并在原因行追加失败信息

### Requirement: 输出执行摘要
系统 SHALL 在所有任务完成后，向用户输出执行摘要：总任务数、成功数、失败数、预计节省 Token。

#### Scenario: 全部成功
- **WHEN** 所有筛选后的任务执行成功
- **THEN** 输出 "共 N 条任务全部完成，预计节省 ~XXXXX Token"

#### Scenario: 部分失败
- **WHEN** 部分任务执行失败
- **THEN** 输出 "成功 X 条 / 失败 Y 条 / 共 N 条"，并列出失败任务的 ID 和原因
