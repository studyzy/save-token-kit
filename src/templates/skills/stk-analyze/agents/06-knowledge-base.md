# 子 Agent 6: 知识图谱推荐 (knowledge-base)

**输入**：`repo-scan.json` + `context.json`
仅当 `graphTool` 非 `none` 时启动：

| 条件                     | 输出                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `graphTool` 指定具体工具 | 建议启用。`action`: "启用 <graphTool 展示名>"，`target`: "<存储值>"，`evidence`: "codeFileCount=N, topLanguages=[...]" |

**输出 category**：`知识图谱推荐`
**`level`**：高级（代码知识库类，同 Headroom 同级）
