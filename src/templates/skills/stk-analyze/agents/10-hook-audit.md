# 子 Agent 10: Hook 审查 (hook-audit)

**输入**：`hookList[]` + `context.json`
遍历 `hookList[]`：

| 条件                      | 输出                                                 |
| ------------------------- | ---------------------------------------------------- |
| Hook 每次对话注入大块文本 | 建议精简或条件触发。`action`: "精简 hook: <matcher>" |

**输出 category**：`Hook 审查`
**`level`**：中级（Agent/Plugin 优化类）
