## ADDED Requirements

### Requirement: 禁用 Plugin
系统 SHALL 修改 `settings.json`，将目标 Plugin 对应的 `enabledPlugins` 项设为 `false`。

#### Scenario: 禁用全局 Plugin
- **WHEN** 目标 Plugin 位于 user 层
- **THEN** 修改 `~/.codebuddy/settings.json` 中 `enabledPlugins.<pluginName>` 为 `false`

#### Scenario: 禁用项目 Plugin
- **WHEN** 目标 Plugin 位于 project 层
- **THEN** 修改 `./.codebuddy/settings.json` 中对应项为 `false`

### Requirement: 迁移 Plugin 作用域
系统 SHALL 按任务建议将 Plugin 从 user 层迁移到 project 层（或反向）。

#### Scenario: user → project 迁移
- **WHEN** operationType 为 `migrate-plugin` 且当前在 user 层
- **THEN** 从 user settings 移除 Plugin 启用项，在 project settings 添加启用项
