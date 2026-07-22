## ADDED Requirements

### Requirement: 兜底处理未知 operationType
系统 SHALL 接收未归类到特定子 Agent 的任务，按 `detail` 描述执行修改，或回报无法处理。

#### Scenario: detail 包含可执行的修改指令
- **WHEN** 任务 detail 描述了明确的操作（如"将 rule X 加 paths 作用域"）
- **THEN** 按描述执行对应修改，回报执行结果

#### Scenario: detail 无法转化为具体操作
- **WHEN** 任务 detail 过于模糊或无明确操作路径
- **THEN** 回报失败，说明无法执行，建议用户手动处理

### Requirement: 处理 rules-opt 类型任务
系统 SHALL 处理 `rules-opt` operationType 的任务：修改 rule 配置（加 `paths` 作用域、拆分 rule、调整 `alwaysApply`）。

#### Scenario: 为 rule 添加 paths 作用域
- **WHEN** 任务建议为 rule 添加 `paths` 限制加载范围
- **THEN** 读取 rule 文件，在 frontmatter 中添加 `paths:` 字段，写回
