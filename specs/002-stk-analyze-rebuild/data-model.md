# 数据模型: 重构 stk-analyze SKILL

**分支**: `002-stk-analyze-rebuild` | **日期**: 2026-07-13
**对齐**: `src/types/index.ts` 既有契约（仅扩展，不破坏）

## 实体

### 1. Context（扩展）

文件：`save-token/context.json`
来源：`/stk-analyze` 第二阶段收集

```ts
interface Context {
  collectedAt: string // ISO 8601
  purpose: 'code' | 'doc' | 'office' | 'general'
  sameRepo: 'same' | 'separate'
  graphTool?: string // 新增：用户选择的图谱工具存储值
  // 取值：'graphify' | 'codebase-memory-mcp' | 'codegraph' | 'gitnexus' | 'none' | 自定义字符串
  // 展示名：Graphify / Codebase-Memory MCP / CodeGraph / GitNexus（首字母大写）
  // 缺省表示未询问（仓库规模不足）
}
```

变更：新增 `graphTool` 可选字段。已有 `collectedAt`/`purpose`/`sameRepo` 不变。

### 2. RepoScan（新增）

文件：`save-token/repo-scan.json`
来源：`/stk-analyze` 第二阶段扫描

```ts
interface RepoScan {
  scannedAt: string // ISO 8601
  codeFileCount: number // 代码文件数（按扩展名识别）
  docFileCount: number // 文档文件数（.md/.mdx/.rst/.txt）
  codeLineCount: number // 代码总行数（量级）
  docLineCount: number // 文档总行数（量级）
  topLanguages: string[] // Top 3 语言（按文件数占比降序）
  hasDocsDir: boolean // 是否存在 docs/ 或 README*
  hasCodebuddyMd: boolean // 是否存在项目级 CODEBUDDY.md
  isMonorepo: boolean // 是否 monorepo（多个 package.json/Cargo.toml/go.mod）
  scanError?: string // 扫描失败时的错误信息
}
```

### 3. SuggestionFile（新增）

文件：`save-token/suggestions-<agent-name>.json`
来源：每个子 Agent 输出

```ts
interface SuggestionFile {
  agentName: string // 子 Agent 标识，如 'tool-enable'、'mcp-opt'
  category: string // 分组类别，对应 tasks.md 章节
  generatedAt: string // ISO 8601
  skipped: boolean // true 表示该 Agent 因无可建议对象而空跑
  suggestions: AnalysisSuggestionV2[]
}

interface AnalysisSuggestionV2 extends AnalysisSuggestion {
  scenario: string // 新增：场景归因（如 'code' / 'doc' / 'general'）
  evidence?: string // 新增：支撑建议的数据依据（如 'mcpList 3 项，总 4500 tok'）
}
```

### 4. AnalysisSuggestion（扩展）

对齐 `src/types/index.ts:236` 既有定义，**不修改已有字段**，仅扩展：

```ts
// 既有字段（不变）：id, title, detail, operationType, target,
//                  estimatedSavingTokens, risk, reversible

// 新增字段（可选）
interface AnalysisSuggestion {
  // ... 既有字段
  scenario?: string // 场景归因
  evidence?: string // 数据依据
}
```

### 5. OperationType（扩展枚举）

`src/types/index.ts:224-232` 既有 8 值不变，新增：

```ts
type OperationType =
  | 'disable-skill' // 既有
  | 'disable-mcp' // 既有
  | 'defer-mcp' // 既有
  | 'replace-mcp-with-cli' // 既有
  | 'trim-codebuddy-md' // 既有
  | 'trim-file' // 既有
  | 'install-tool' // 既有
  | 'other' // 既有
  // 新增 ↓
  | 'defer-tools' // Plugin/Hook 工具明确化
  | 'knowledge-base' // 知识图谱工具启用
```

注意：`defer-mcp`（既有）语义 = 在 `.mcp.json` 中针对该 MCP server 设置 `"defer_loading": true`，使其工具按需加载而非常驻上下文。本次重构不新增 `mcp-defer` 枚举值。

### 6. TasksFile（不变）

`save-token/tasks.md` 结构沿用旧版，由汇总阶段生成。本次重构仅改变生成来源（从单 analysis.json 改为多 suggestions-*.json 合并），输出格式不变。

## 关系

```
DiagnosisReport ──输入──> /stk-analyze
                              │
                              ├─> Context (context.json)          [扩展 graphTool]
                              ├─> RepoScan (repo-scan.json)       [新增]
                              │
                              ├─> SuggestionFile[] (suggestions-*.json)  [新增]
                              │       └─> AnalysisSuggestionV2[]
                              │
                              └─> TasksFile (tasks.md)            [汇总输出]
```

## 验证规则

- `context.json` 的 `purpose` 必须为 4 枚举值之一；`graphTool` 若存在必须为非空字符串
- `repo-scan.json` 的 `codeFileCount`/`docFileCount` 必须 ≥ 0；`topLanguages` 长度 ≤ 3
- `suggestions-*.json` 的 `agentName` 必须与文件名 `<agent-name>` 段一致
- 每条 `suggestion.id` 在子 Agent 内唯一；汇总时全局重新编号
- `operationType` 必须为枚举值之一
- `estimatedSavingTokens` 必须 ≥ 0（0 表示未知）

## 子 Agent 标识与 category 映射

| agentName        | category       | 启动条件                             | operationType 倾向                                   |
| ---------------- | -------------- | ------------------------------------ | ---------------------------------------------------- |
| `tool-enable`    | 第三方工具启用 | `toolDetection[]` 非空               | `install-tool`                                       |
| `mcp-opt`        | MCP 优化       | `mcpList[]` 非空                     | `disable-mcp` / `defer-mcp` / `replace-mcp-with-cli` |
| `model-opt`      | 模型降级       | `skillList[]` 或 `pluginList[]` 非空 | `other`                                              |
| `defer-tools`    | 工具明确化     | `pluginList[]` 或 `hookList[]` 非空  | `defer-tools`                                        |
| `skill-trim`     | Skill 精简     | `skillList[]` 非空                   | `disable-skill`                                      |
| `knowledge-base` | 知识图谱推荐   | 仓库超阈值且 `graphTool` 非 `none`   | `knowledge-base`                                     |
| `repo-scan`      | 仓库扫描       | 始终（仓库扫描成功后）               | `other`                                              |
| `hook-audit`     | Hook 审查      | `hookList[]` 非空                    | `other` / `trim-file`                                |
