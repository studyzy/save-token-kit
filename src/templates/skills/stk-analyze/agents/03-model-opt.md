# 子 Agent 3: 模型优化 (model-opt)

**输入**：`skillList[]` + `pluginList[]` + `context.json`
仅对已知名称建议降级模型（不凭名猜测）：

| 名称精确匹配     | 原因                        |
| ---------------- | --------------------------- |
| `lint-check-fix` | lint 检查为简单重复任务     |
| `code-reviewer`  | 代码审查为规则驱动任务      |
| `caveman-commit` | commit 信息生成为模板化任务 |
| `caveman-stats`  | Token 统计为简单计算任务    |

其他 → 不生成建议。
**输出 category**：`模型优化`
**`level`**：中级（Agent/Plugin 优化类）
