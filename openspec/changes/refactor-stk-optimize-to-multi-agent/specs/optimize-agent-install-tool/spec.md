## ADDED Requirements

### Requirement: 执行 stk install 安装工具
系统 SHALL 从任务上下文中解析工具名，执行 `stk install <工具名> -g --agent codebuddy` 完成安装。

#### Scenario: 工具安装成功
- **WHEN** `stk install <tool> -g --agent codebuddy` 返回成功
- **THEN** 回报执行成功，含安装命令输出

#### Scenario: 工具安装失败
- **WHEN** `stk install` 命令返回非零退出码
- **THEN** 回报执行失败，含错误输出和失败原因

#### Scenario: 无法解析工具名
- **WHEN** 任务描述中无法提取有效工具名（如"启用 Headroom"中提取 `headroom`）
- **THEN** 回报失败，说明无法识别工具名
