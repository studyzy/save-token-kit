# 契约: suggestions-\<agent-name\>.json

**分支**: `002-stk-analyze-rebuild`
**来源**: `/stk-analyze` 第三阶段，每个子 Agent 输出一个文件
**路径**: `save-token/suggestions-<agent-name>.json`，`<agent-name>` ∈ {`tool-enable`, `mcp-opt`, `model-opt`, `defer-tools`, `skill-trim`, `knowledge-base`, `repo-scan`, `hook-audit`}

## Schema

```json
{
  "agentName": "tool-enable",
  "category": "第三方工具启用",
  "generatedAt": "2026-07-13T10:00:00Z",
  "skipped": false,
  "suggestions": [
    {
      "id": "S1",
      "title": "启用 Headroom",
      "detail": "headroom 已安装但未启用，可提供 47-92% 上下文压缩",
      "operationType": "install-tool",
      "target": "headroom",
      "estimatedSavingTokens": 6200,
      "risk": "low",
      "reversible": true,
      "scenario": "code",
      "evidence": "toolDetection: headroom installed=true, enabled=false"
    }
  ]
}
```

## 字段说明

| 字段                                  | 类型    | 必填 | 说明                                        |
| ------------------------------------- | ------- | ---- | ------------------------------------------- |
| `agentName`                           | string  | ✅   | 子 Agent 标识，与文件名一致                 |
| `category`                            | string  | ✅   | 分组类别，对应 tasks.md 章节                |
| `generatedAt`                         | string  | ✅   | ISO 8601 时间戳                             |
| `skipped`                             | boolean | ✅   | true 表示该 Agent 空跑（无可建议对象）      |
| `suggestions[]`                       | array   | ✅   | 建议列表；`skipped=true` 时为空数组         |
| `suggestions[].id`                    | string  | ✅   | 子 Agent 内唯一，格式 `S1`/`S2`             |
| `suggestions[].title`                 | string  | ✅   | 简短标题（中文）                            |
| `suggestions[].detail`                | string  | ✅   | 详细说明与理由（中文）                      |
| `suggestions[].operationType`         | enum    | ✅   | 见 data-model.md OperationType              |
| `suggestions[].target`                | string  | ❌   | 操作对象（工具名/Skill 名/文件路径）        |
| `suggestions[].estimatedSavingTokens` | number  | ✅   | 预估节省 Token，≥ 0，0 表示未知             |
| `suggestions[].risk`                  | enum    | ✅   | `low` / `medium` / `high`                   |
| `suggestions[].reversible`            | boolean | ✅   | 是否可回滚（仅提示，rollback 未实现）       |
| `suggestions[].scenario`              | string  | ✅   | 场景归因（`code`/`doc`/`office`/`general`） |
| `suggestions[].evidence`              | string  | ❌   | 数据依据（如诊断报告字段值）                |

## 汇总阶段读取规则

1. 通配读取 `save-token/suggestions-*.json`
2. 校验 `agentName` 与文件名一致
3. 合并所有 `suggestions[]`，按 `category` 分组
4. ID 在全文件范围内重新编号（S1, S2, ...）
5. `skipped=true` 的文件不参与分组，但在摘要中列出
