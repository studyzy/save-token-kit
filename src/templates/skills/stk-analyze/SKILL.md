---
name: stk-analyze
description: '收集使用场景与仓库代码/文档，结合诊断报告并行派发多个子 Agent 提供 Token 节省方案，每个子 Agent 输出统一 Schema 的 json，最终汇总为 tasks.md'
---

# SKILL: stk-analyze

收集用户的使用场景与当前仓库的代码/文档情况，结合 `stk diagnose` 诊断报告，并行派发多个专注不同优化点的子 Agent，每个子 Agent 输出统一 Schema 的 JSON 到 `save-token/`，最后汇总为 `save-token/tasks.md` 待办清单。

## 目标

通过"收集场景 → 收集仓库 → 派发子 Agent → 汇总 tasks.md"四阶段，产出可一键执行的 Token 优化待办。每个子 Agent 仅关注一类对象，对象不存在则不启动该 Agent。

## 执行流程

### 阶段 1: 上下文与场景收集

**步骤 1: 检查诊断数据**

```bash
cat save-token/diagnosis-report.json 2>/dev/null || echo "NOT_FOUND"
```

- 文件存在且 `scanTimestamp` 距当前 ≤ 5 分钟 → 复用，跳到步骤 2。
- 不存在或过期 → 提示用户先运行 `stk diagnose` 或 `/stk-diagnose`，**停止**，不产生任何输出文件。

**步骤 2: 收集使用场景（含图谱工具倾向性）**

检查 `./save-token/context.json`：存在且 `collectedAt` 在 7 天内 → 复用，跳到阶段 2。

否则用 `AskUserQuestion` 分轮收集（不猜测，必须询问）：

**第一轮（必问）— 使用场景：**

- 问题 1: 主要使用目的 → 代码编写 / 文档写作 / 通用办公 / 通用
- 问题 2: 代码与文档是否在同一仓库 → 是（同仓）/ 否（独立仓库）/ 不适用（纯文档/办公）

**第二轮（条件触发）— 代码知识图谱工具倾向性：**

- **触发条件**：仓库扫描已完成（`repo-scan.json` 存在）且 `codeFileCount >= 5`
- **询问内容**：列出已知工具，附简要描述：
  - `Graphify`（本地 CLI，轻量图谱）
  - `Codebase-Memory MCP`（本地 MCP，跨语言图谱）
  - `CodeGraph`（语义+历史层）
  - `GitNexus`（monorepo/影响分析）
  - `暂不需要`
- **推荐标记**：基于仓库扫描特征在对应选项标注"（推荐）"：
  - TypeScript/JavaScript 为主且有 CODEBUDDY.md → 推荐 **Graphify**
  - 多语言大型仓库（codeFileCount > 50 且 topLanguages ≥ 3）→ 推荐 **Codebase-Memory MCP**
  - monorepo 结构 → 推荐 **GitNexus**
  - 规模达标但无上述特征 → 推荐 **Graphify**（默认）
- 用户可选"暂不需要"跳过，或"其他"输入自定义工具。推荐仅供参考，用户自主决定。

**第三轮（可选）— 模糊点澄清：**

- 若存在边界情况（如多主流语言并存、上下文 Token 量临界、同名 marketplace/project Skill 并存），用额外 `AskUserQuestion` 确认倾向。

将结果写入 `./save-token/context.json`：

```json
{
  "collectedAt": "<ISO8601>",
  "purpose": "code|doc|office|general",
  "sameRepo": "same|separate",
  "graphTool": "graphify|codebase-memory-mcp|codegraph|gitnexus|none|<自定义>"
}
```

> `graphTool` 仅在第二轮触发时写入；仓库过小不询问则不写该字段（向后兼容）。

### 阶段 2: 仓库代码/文档采集

**步骤 3: 扫描仓库**

在派发子 Agent 前（且在第二轮问答前）扫描当前工作目录：

```bash
# 代码文件数（按扩展名）
find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.go' -o -name '*.rs' -o -name '*.java' -o -name '*.c' -o -name '*.cpp' -o -name '*.vue' -o -name '*.svelte' \) \
  -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/coverage/*' -not -path '*/.cache/*' | wc -l

# 文档文件数
find . -type f \( -name '*.md' -o -name '*.mdx' -o -name '*.rst' -o -name '*.txt' \) \
  -not -path '*/node_modules/*' ... | wc -l

# monorepo 检测：根外是否存在多个 package.json / Cargo.toml / go.mod
```

统计并写入 `./save-token/repo-scan.json`（字段见"统一 Schema"→ RepoScan）：

| 字段             | 说明                            |
| ---------------- | ------------------------------- |
| `scannedAt`      | ISO 8601                        |
| `codeFileCount`  | 代码文件数                      |
| `docFileCount`   | 文档文件数                      |
| `codeLineCount`  | 代码总行数（量级）              |
| `docLineCount`   | 文档总行数（量级）              |
| `topLanguages`   | Top 3 语言（按文件数降序，≤ 3） |
| `hasDocsDir`     | 是否存在 `docs/` 或 `README*`   |
| `hasCodebuddyMd` | 是否存在项目级 CODEBUDDY.md     |
| `isMonorepo`     | 是否 monorepo                   |
| `scanError`      | 失败信息；成功为 `null`         |

排除目录：`node_modules` `.git` `dist` `build` `coverage` `.cache`。

**扫描失败处理**：`scanError` 非 null 时不阻塞问答；第二轮图谱询问降级为"无法推荐，请自行选择"；摘要标注扫描失败。

### 阶段 3: 并行子 Agent 派发

**步骤 4: 按对象存在性动态启动**

读取诊断报告，仅对**存在且非空**的对象启动对应子 Agent（FR-4 表）。对象为空 → 不启动，摘要标注跳过。

在**单条消息**中并行发起所有需启动的子 Agent（多次 `Agent` 调用）。每个子 Agent 接收：诊断报告相关字段 + `context.json` + `repo-scan.json`（按需），输出统一 Schema JSON 到 `save-token/suggestions-<agent-name>.json`。

任一子 Agent 失败/超时 → 跳过该维度，汇总其余，摘要标注。

**FR-4 子 Agent 启动条件表**

| 子 Agent         | 关注对象                          | 启动条件                                |
| ---------------- | --------------------------------- | --------------------------------------- |
| `tool-enable`    | `toolDetection[]`                 | 数组非空                                |
| `mcp-opt`        | `mcpList[]`                       | 数组非空                                |
| `model-opt`      | `skillList[]` + `pluginList[]`    | 任一非空                                |
| `defer-tools`    | `pluginList[]` + `hookList[]`     | 任一非空                                |
| `skill-trim`     | `skillList[]`                     | 数组非空                                |
| `knowledge-base` | `repo-scan.json` + `context.json` | 仓库超阈值 **且** `graphTool` 非 `none` |
| `repo-scan`      | 仓库扫描结果                      | 始终（扫描成功后）                      |
| `hook-audit`     | `hookList[]`                      | 数组非空                                |

### 阶段 4: 汇总生成 tasks.md

**步骤 5: 合并与落盘**

读取 `save-token/suggestions-*.json` 全部文件，合并 `suggestions[]`，按 `category` 分组，写入 `save-token/tasks.md`：

- 顶部注释：`<!-- scenario: <purpose 中文> / <同仓|异仓> -->`
- **一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并**
- 每条 Task 含可执行 `action`、预估节省 Token、原因
- 已跳过的子 Agent 在摘要区列出
- ID 在全文件范围重新编号（S1, S2, ...）保证唯一

**步骤 6: 输出摘要**

控制台打印：总计预估节省 Token 与百分比、`tasks.md` 路径、场景标注、已跳过子 Agent 列表、失败子 Agent 列表。

## 统一 Schema

每个子 Agent 输出 `save-token/suggestions-<agent-name>.json`：

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
      "evidence": "toolDetection: installed=true, enabled=false"
    }
  ]
}
```

顶层字段：`agentName` / `category` / `generatedAt` / `skipped` / `suggestions[]`。
每条 `suggestion` 字段：`id` / `title` / `detail` / `operationType` / `target` / `estimatedSavingTokens` / `risk` / `reversible` / `scenario` / `evidence?`。

`operationType` 取值同 `src/types/index.ts` 的 `OperationType`，含扩展值 `defer-tools`、`knowledge-base`；既有 `defer-mcp` 语义 = 在 `.mcp.json` 中对该 MCP server 设置 `"defer_loading": true`，使其工具按需加载而非常驻上下文。

## 子 Agent 定义

### 子 Agent 1: 第三方工具启用 (tool-enable)

**输入**：`toolDetection[]` + `context.json`
遍历 `toolDetection[]`，规则：

| 条件                                        | 输出                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `installed === true` 且 `enabled === false` | 建议启用。`action`: "启用 <工具名>"，`reason`: "已安装未启用，<说明>"。`estimatedSavingTokens` 取 `recommendedSaving` 数字或 0。 |

**输出 category**：`第三方工具启用`

### 子 Agent 2: MCP 优化 (mcp-opt)

**输入**：`mcpList[]` + `context.json`
遍历 `mcpList[]`：

| 条件                                                   | 输出                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `status === "disabled"` 且 `toolsCount === 0`          | 建议移除配置。`action`: "移除 mcp: <name>"                       |
| `hasCliAlternative === true` 且 `status === "enabled"` | 建议 CLI 替代。`action`: "用 CLI 替代 mcp: <name>"               |
| 大型 MCP 且支持延迟加载                                | 建议 `defer-mcp`。`action`: "为 <name> 设置 defer_loading: true" |

**输出 category**：`MCP 优化`

### 子 Agent 3: 模型优化 (model-opt)

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

### 子 Agent 4: Agent/Plugin Tools 明确化 (defer-tools)

**输入**：`pluginList[]` + `hookList[]` + `context.json`
遍历 `pluginList[]`：

| 条件                                  | 输出                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| 未声明 `tools` 或声明为 `*` / `["*"]` | 建议明确最小必要 Tools 并 defer 其余。`action`: "为 <pluginId> 声明最小 tools 列表" |

**输出 category**：`工具明确化`

### 子 Agent 5: Skill 精简 (skill-trim)

**输入**：`skillList[]` + `context.json`
按 `purpose` 裁剪非高频 Skill：

| 条件                                 | 输出                                     |
| ------------------------------------ | ---------------------------------------- |
| `purpose=code` 且文档类/帮助类 Skill | 建议禁用。`action`: "禁用 skill: <name>" |
| 与已装工具功能重复                   | 建议禁用。`action`: "禁用 skill: <name>" |

**输出 category**：`Skill 精简`

### 子 Agent 6: 知识图谱推荐 (knowledge-base)

**输入**：`repo-scan.json` + `context.json`
仅当 `graphTool` 非 `none` 时启动：

| 条件                     | 输出                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `graphTool` 指定具体工具 | 建议启用。`action`: "启用 <graphTool 展示名>"，`target`: "<存储值>"，`evidence`: "codeFileCount=N, topLanguages=[...]" |

**输出 category**：`知识图谱推荐`

### 子 Agent 7: 仓库扫描 (repo-scan)

**输入**：`repo-scan.json` + `context.json`
基于扫描结果给出仓库级建议：

| 条件                                 | 输出                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `sameRepo=same` 且 `docFileCount` 大 | 建议排除文档目录出自动上下文。`action`: "在 CODEBUDDY.md 排除 docs/ 目录" |
| `isMonorepo`                         | 建议按子包加载上下文                                                      |

**输出 category**：`仓库专项`

### 子 Agent 8: Hook 审查 (hook-audit)

**输入**：`hookList[]` + `context.json`
遍历 `hookList[]`：

| 条件                      | 输出                                                 |
| ------------------------- | ---------------------------------------------------- |
| Hook 每次对话注入大块文本 | 建议精简或条件触发。`action`: "精简 hook: <matcher>" |

**输出 category**：`Hook 审查`

## tasks.md 输出格式

核心原则：一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并。`action` 必须可直接执行。

```markdown
<!-- scenario: 代码编写 / 同仓 -->

# 优化建议：代码编写 / 同仓

## 1. 第三方工具启用

- [ ] 启用 Headroom（预估节省 ~6200 Token）
      原因：已安装未启用，可提供 47-92% 上下文压缩

## 2. MCP 优化

- [ ] 移除 mcp: skills-sec-audit（预估节省 ~XXX Token）
      原因：disabled 且无工具

## 3. 模型优化

- [ ] lint-check-fix 指定 model: lite（预估节省 ~20% 成本）
      原因：lint 检查为简单重复任务

## 4. 工具明确化

- [ ] 为 ponytail 声明最小 tools 列表（预估节省 ~XXX Token）
      原因：plugin 未声明 tools，全量加载

## 5. Skill 精简

- [ ] 禁用 skill: ponytail-help（预估节省 ~48 Token）
      原因：帮助类 Skill，代码场景非高频

## 6. 知识图谱推荐

- [ ] 启用 Graphify（预估节省 依赖图谱检索替代回读）
      原因：codeFileCount=42, topLanguages=[TypeScript,JavaScript]

## 7. 仓库专项

- [ ] 排除 docs/ 出自动上下文（预估节省 ~3000 Token）
      原因：同仓，文档每次对话重复注入

## 8. Hook 审查

- [ ] 精简 hook: rtk（预估节省 ~XXX Token）
      原因：每次对话注入压缩提示

---

总计：预估节省 ~XXXXX Token (XX.X%)
```

每组标题对应实际启动的 Agent，跳过的 Agent 不出现。标题顺序固定：1.第三方工具启用 → 2.MCP 优化 → 3.模型优化 → 4.工具明确化 → 5.Skill 精简 → 6.知识图谱推荐 → 7.仓库专项 → 8.Hook 审查。每条一行 `- [ ]` + 原因缩进两空格，总计行末尾用 `---` 分隔。

## 边界

- 不做任何文件修改，仅产出 `suggestions-*.json` 与 `tasks.md`。
- 无法估算节省时 `estimatedSavingTokens` 填 0 并在 `detail` 描述效果。
- 子 Agent 超时/失败 → 跳过该维度，汇总其余，摘要标注。
- tasks.md 一个条目对应一个具体操作，绝不合并。
- 所有 `action` 必须可执行，不得泛泛而谈。
