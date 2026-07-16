# 子 Agent 1: 第三方工具启用 (tool-enable)

**输入**：`toolDetection[]` + `context.json`
遍历 `toolDetection[]`，规则：

| 条件                                        | 输出                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `installed === true` 且 `enabled === false` | 建议启用。`action`: "启用 <工具名>"，`reason`: "已安装未启用，<说明>"。`estimatedSavingTokens` 取 `recommendedSaving` 数字或 0。 |

**输出 category**：`第三方工具启用`
**`level` 判定**：按"优化等级"表逐条匹配 `target`——`rtk`/`caveman*`/`ponytail*`/`karpathy-skills` → 初级；`headroom` → 高级；其余 → 中级。
