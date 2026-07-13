# 契约: repo-scan.json

**分支**: `002-stk-analyze-rebuild`
**来源**: `/stk-analyze` 第二阶段仓库扫描
**路径**: `save-token/repo-scan.json`

## Schema

```json
{
  "scannedAt": "2026-07-13T10:00:00Z",
  "codeFileCount": 42,
  "docFileCount": 8,
  "codeLineCount": 5800,
  "docLineCount": 1200,
  "topLanguages": ["TypeScript", "JavaScript", "Python"],
  "hasDocsDir": true,
  "hasCodebuddyMd": true,
  "isMonorepo": false,
  "scanError": null
}
```

## 字段说明

| 字段             | 类型           | 必填 | 说明                                                       |
| ---------------- | -------------- | ---- | ---------------------------------------------------------- |
| `scannedAt`      | string         | ✅   | ISO 8601 时间戳                                            |
| `codeFileCount`  | number         | ✅   | 代码文件数（按扩展名识别，≥ 0）                            |
| `docFileCount`   | number         | ✅   | 文档文件数（.md/.mdx/.rst/.txt，≥ 0）                      |
| `codeLineCount`  | number         | ✅   | 代码总行数（量级）                                         |
| `docLineCount`   | number         | ✅   | 文档总行数（量级）                                         |
| `topLanguages`   | string[]       | ✅   | Top 3 语言（按文件数占比降序），长度 ≤ 3                   |
| `hasDocsDir`     | boolean        | ✅   | 是否存在 `docs/` 或 `README*`                              |
| `hasCodebuddyMd` | boolean        | ✅   | 是否存在项目级 `CODEBUDDY.md`                              |
| `isMonorepo`     | boolean        | ✅   | 是否 monorepo（多个 `package.json`/`Cargo.toml`/`go.mod`） |
| `scanError`      | string \| null | ❌   | 扫描失败时的错误信息；成功时为 `null`                      |

## 扫描规则

- 代码文件扩展名：`.ts/.tsx/.js/.jsx/.py/.go/.rs/.java/.c/.cpp/.vue/.svelte`
- 文档文件扩展名：`.md/.mdx/.rst/.txt`
- 排除目录：`node_modules`、`.git`、`dist`、`build`、`coverage`、`.cache`
- monorepo 判定：根目录外存在 ≥ 1 个 `package.json`/`Cargo.toml`/`go.mod`

## 阈值（用于图谱工具推荐）

| 阈值       | 值                                                 | 用途                     |
| ---------- | -------------------------------------------------- | ------------------------ |
| 询问触发   | `codeFileCount >= 5`                               | 触发图谱工具倾向性询问   |
| 推荐触发   | `codeFileCount >= 20` 或 `codeLineCount >= 2000`   | 触发带"推荐"标记的询问   |
| 大型多语言 | `codeFileCount > 50` 且 `topLanguages.length >= 3` | 推荐 Codebase-Memory MCP |

## 扫描失败处理

`scanError` 非 null 时：

- 不阻塞后续问答阶段
- 图谱工具倾向性询问降级为"无法推荐，请自行选择"模式
- 摘要中标注扫描失败
