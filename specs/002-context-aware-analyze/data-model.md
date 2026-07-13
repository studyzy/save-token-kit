# 数据模型补充: 上下文感知的 /stk:analyze

**功能**: 002-context-aware-analyze
**日期**: 2026-07-13
**基础**: 扩展自 `specs/001-save-token-kit/data-model.md` §2（AnalysisFile / AnalysisSuggestion）。

> 本期不新增 TypeScript 类型文件（Command/SKILL 为 Markdown 模板，由 Agent 解析执行）。以下为 Agent 落盘 JSON 时应遵循的契约增量。

## 1. ProjectContext（项目上下文）— 新增缓存文件 `./save-token/context.json`

Agent 在 `/stk:analyze` 开始时通过 `AskUserQuestion` 收集，并缓存复用。

```typescript
interface ProjectContext {
  /** 收集时间戳（ISO 8601） */
  collectedAt: string
  /** 使用目的 */
  purpose: 'code'     // 代码编写
         | 'docs'     // 文档写作
         | 'office'   // 通用办公
         | 'general'  // 通用/未指定（拒绝回答时）
  /** 代码与文档是否在同一仓库 */
  sameRepo: 'same'        // 同仓
          | 'separate'    // 文档在独立仓库
          | 'n-a'         // 非代码仓库（纯文档/办公）
          | 'unknown'     // 未提供
}
```

## 2. AnalysisFile 增量（修改 §2）

在 `specs/001-save-token-kit/data-model.md` 的 `AnalysisFile` 接口上**新增可选字段** `context`：

```typescript
interface AnalysisFile {
  generatedAt: string
  sourceDiagnosis: string
  /** [新增] 分析时采用的项目上下文，供 /stk-optimize 复用 */
  context?: ProjectContext
  suggestions: AnalysisSuggestion[]
  totalEstimatedSavingTokens: number
}
```

## 3. AnalysisSuggestion 增量（修改 §2）

在 `AnalysisSuggestion` 接口上**新增可选字段** `scenario`（说明该建议针对的场景归因）：

```typescript
interface AnalysisSuggestion {
  id: string
  title: string
  detail: string
  operationType: 'disable-skill' | 'disable-mcp' | 'defer-mcp'
              | 'replace-mcp-with-cli' | 'trim-codebuddy-md'
              | 'trim-file' | 'install-tool' | 'other'
  target?: string
  estimatedSavingTokens: number
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
  /** [新增] 该建议适用的场景归因（如 "code" | "docs" | "office" | "same-repo"），便于理解为何提出 */
  scenario?: string
}
```

## 4. 实体关系（增量）

```
ProjectContext (context.json, 缓存)
       │ 被 /stk:analyze 读取
       ▼
AnalysisFile (analysis.json)
       ├── context: ProjectContext        [新增]
       └── suggestions[].scenario: string [新增]
       │
       └── 被消费 ─── /stk-optimize (沿用 context，无需重问)
```

## 5. 验证规则

- `context.json` 存在且 `collectedAt` 在 7 天内 → 复用，不重问。
- `purpose` 与 `sameRepo` 仅取预定义枚举值，非法值按 `general` / `unknown` 处理。
- `AnalysisFile.context` 缺失时，`/stk-optimize` 行为退化为现有通用模式（向后兼容）。
