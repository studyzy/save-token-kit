# 子 Agent 5: Skill 精简 (skill-trim)

**输入**：`skillList[]` + `context.json`

> 注意：Skill 通过 `/<name>` 按需触发，**不入 tools 列表**，因此不能用 Defer() 修饰符处理。本 Agent 只能决定"禁用/保留"整个 Skill，或建议其 frontmatter 加 `paths:` 限制加载范围。

按 `purpose` 与 `usageFrequency` 裁剪非高频 Skill：

| 条件                                 | 输出                                     |
| ------------------------------------ | ---------------------------------------- |
| `usageFrequency === 'low'` 且文档类/帮助类 Skill | 建议禁用。`action`: "禁用 skill: <name>" |
| 与已装工具功能重复                   | 建议禁用。`action`: "禁用 skill: <name>" |
| 高频 Skill 但 `paths:` 未限定        | 建议加 `paths:` 限制触发范围。`action`: "为 skill <name> 增加 paths 限定" |

**输出 category**：`Skill 精简`
**`level`**：中级（SKILL 优化类）
