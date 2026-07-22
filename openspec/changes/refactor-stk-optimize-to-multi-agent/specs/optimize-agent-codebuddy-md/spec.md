## ADDED Requirements

### Requirement: 精简 CODEBUDDY.md
系统 SHALL 读取项目 `CODEBUDDY.md`，按照 CODEBUDDY.md 编写最佳实践进行精简优化，将细节下沉为 `@引用` 或 rules，直接写回原文件。

#### Scenario: CODEBUDDY.md 存在且超过 200 行
- **WHEN** 项目 `CODEBUDDY.md` 存在且行数 > 200
- **THEN** 精简至 200 行以内，保留命令、风格、关键约束，架构/数据流下沉为 `@docs/` 引用

#### Scenario: CODEBUDDY.md 存在但未超标
- **WHEN** 项目 `CODEBUDDY.md` 存在且行数 ≤ 200
- **THEN** 仅做最小必要调整（如补充 Resource Map），回报修改内容

#### Scenario: CODEBUDDY.md 不存在
- **WHEN** 项目 `CODEBUDDY.md` 不存在
- **THEN** 回报失败，说明文件不存在

### Requirement: 为 CODEBUDDY.md 增加索引
系统 SHALL 在 CODEBUDDY.md 中补充关键文件/目录索引（Resource Map）。

#### Scenario: 补充 Resource Map
- **WHEN** CODEBUDDY.md 缺少 Resource Map 章节
- **THEN** 在文件中添加 `## 关键文件索引` 章节，列出常用命令涉及的核心文件路径
