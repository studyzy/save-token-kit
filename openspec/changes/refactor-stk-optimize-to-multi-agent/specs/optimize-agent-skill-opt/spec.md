## ADDED Requirements

### Requirement: 禁用 Skill
系统 SHALL 修改 `settings.json`（或项目 `.codebuddy/settings.json`），将目标 Skill 对应的 `enabledPlugins` 项设为 `false`。

#### Scenario: 禁用全局 Skill
- **WHEN** 目标 Skill 位于 user 层（`~/.codebuddy/settings.json`）
- **THEN** 修改 `~/.codebuddy/settings.json` 中 `enabledPlugins.<skillName>` 为 `false`

#### Scenario: 禁用项目 Skill
- **WHEN** 目标 Skill 位于 project 层（`./.codebuddy/settings.json`）
- **THEN** 修改 `./.codebuddy/settings.json` 中对应项为 `false`

#### Scenario: settings.json 不存在
- **WHEN** 目标 settings.json 文件不存在
- **THEN** 回报失败，说明配置文件缺失

### Requirement: 迁移 Skill 作用域
系统 SHALL 按任务建议将 Skill 从 user 层迁移到 project 层（或反向）。

#### Scenario: user → project 迁移
- **WHEN** operationType 为 `migrate-skill` 且当前在 user 层
- **THEN** 将 Skill 从 `~/.codebuddy/skills/` 复制到 `./.codebuddy/skills/`，从 user settings 移除，在 project settings 启用
