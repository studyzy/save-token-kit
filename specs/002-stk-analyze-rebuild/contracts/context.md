# 契约: context.json（扩展）

**分支**: `002-stk-analyze-rebuild`
**来源**: `/stk-analyze` 第二阶段用户问答
**路径**: `save-token/context.json`

## Schema

```json
{
  "collectedAt": "2026-07-13T10:00:00Z",
  "purpose": "code",
  "sameRepo": "same",
  "graphTool": "graphify"
}
```

## 字段说明

| 字段          | 类型   | 必填 | 说明                                  |
| ------------- | ------ | ---- | ------------------------------------- |
| `collectedAt` | string | ✅   | ISO 8601 时间戳                       |
| `purpose`     | enum   | ✅   | `code` / `doc` / `office` / `general` |
| `sameRepo`    | enum   | ✅   | `same`（同仓） / `separate`（异仓）   |
| `graphTool`   | string | ❌   | 用户选择的图谱工具名称                |

## graphTool 取值

| 存储值（JSON）        | 展示名（SKILL 询问/文档） | 含义                                        |
| --------------------- | ------------------------- | ------------------------------------------- |
| `graphify`            | Graphify                  | 本地 CLI                                    |
| `codebase-memory-mcp` | Codebase-Memory MCP       | 本地 MCP server                             |
| `codegraph`           | CodeGraph                 | 本地优先 CLI+MCP，语义+历史层               |
| `gitnexus`            | GitNexus                  | 零服务器，monorepo/影响分析                 |
| `none`                | 暂不需要                  | 用户选择不使用                              |
| 自定义字符串          | 用户输入                  | 用户通过"其他"输入                          |
| _缺省_                | —                         | 未询问（仓库规模不足，`codeFileCount < 5`） |

注：存储值统一小写 kebab-case 以保证 JSON 契约稳定；SKILL.md 中向用户展示时使用展示名（首字母大写，如 `CodeGraph`/`GitNexus`）。

## 复用规则

- 7 天内 `collectedAt` 有效，跳过所有询问、复用文件
- 超过 7 天重新询问所有问题（包括图谱工具）
- `graphTool` 缺省时，知识图谱推荐子 Agent 不启动（除非 `graphTool` 为非 `none` 值）

## 兼容性

- 旧版 `context.json`（无 `graphTool`）可正常读取；缺省视为未询问
- 新版写入时若仓库规模不足，不写入 `graphTool` 字段（保持兼容）
