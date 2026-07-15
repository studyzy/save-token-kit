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
cat save-token/diagnosis-report.md 2>/dev/null || echo "NOT_FOUND"
```

- 文件存在且其中 `扫描时间:` 行（即 `scanTimestamp`）距当前 ≤ 5 分钟 → 复用，跳到步骤 2。
- 不存在或过期 → 提示用户先运行 `stk diagnose` 或 `/stk-diagnose`，**停止**，不产生任何输出文件。

> 诊断以 `diagnosis-report.md`（由 `stk diagnose` 生成的终端友好 Markdown 摘要）为可读源，避免直接解析过长的 `diagnosis-report.json`。子 Agent 派发时仍从源报告读取所需字段；若某字段 Markdown 摘要未涵盖，回退读取 `diagnosis-report.json`。

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
| `rules-opt`      | `ruleList[]`                      | 数组非空                                |
| `hook-audit`     | `hookList[]`                      | 数组非空                                |
| `codebuddy-md`   | `CODEBUDDY.md`（项目级）          | 文件存在                                |

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
每条 `suggestion` 字段：`id` / `title` / `detail` / `operationType` / `target` / `estimatedSavingTokens` / `risk` / `reversible` / `scenario` / `level` / `evidence?`。

**优化等级（`level`）字段**

每条 `suggestion` **必须**填 `level`，取值 `初级` / `中级` / `高级`。等级按 `target`（或工具/对象名）判定，而非按子 Agent 固定——同一个子 Agent（如 `tool-enable`）可能同时产出初级（RTK）与高级（Headroom）的 task。

判定规则（按优先级匹配，命中即定级）：

| 等级 | 命中条件（按 `target` / 对象名匹配） |
| ---- | ------------------------------------- |
| 初级 | `target` 或工具名为 `rtk`、`caveman`、`caveman-*`、`ponytail`、`ponytail-*`、`karpathy-skills` 之一（省 Token 工具类，安装即用、零配置） |
| 高级 | `target` 为 `headroom`，或属于代码知识库类（子 Agent `knowledge-base` 产出，如 `graphify` / `codebase-memory-mcp` / `codegraph` / `gitnexus` 等） |
| 中级 | 其余所有：SKILL 优化（`skill-trim`）、Agent / Plugin 优化（`defer-tools` / `model-opt`）、MCP 优化（`mcp-opt`）、Rules 优化（`rules-opt`）、Hook 审查（`hook-audit`）、仓库专项（`repo-scan`）等 |

> 同一 Agent 内部混合示例：`tool-enable` 中"启用 RTK"→ 初级，"启用 Headroom"→ 高级。各子 Agent 在输出时**逐条**按上表判定 `level`，不得整组统一标级。

`operationType` 取值同 `src/types/index.ts` 的 `OperationType`，含扩展值 `defer-tools`、`knowledge-base`；既有 `defer-mcp` 语义 = 在 `.mcp.json` 中对该 MCP server 设置 `"defer_loading": true`，使其工具按需加载而非常驻上下文。

## 子 Agent 定义

### 子 Agent 1: 第三方工具启用 (tool-enable)

**输入**：`toolDetection[]` + `context.json`
遍历 `toolDetection[]`，规则：

| 条件                                        | 输出                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `installed === true` 且 `enabled === false` | 建议启用。`action`: "启用 <工具名>"，`reason`: "已安装未启用，<说明>"。`estimatedSavingTokens` 取 `recommendedSaving` 数字或 0。 |

**输出 category**：`第三方工具启用`
**`level` 判定**：按"优化等级"表逐条匹配 `target`——`rtk`/`caveman*`/`ponytail*`/`karpathy-skills` → 初级；`headroom` → 高级；其余 → 中级。

### 子 Agent 2: MCP 优化 (mcp-opt)

**输入**：`mcpList[]` + `context.json`
遍历 `mcpList[]`：

| 条件                                                   | 输出                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `status === "disabled"` 且 `toolsCount === 0`          | 建议移除配置。`action`: "移除 mcp: <name>"                       |
| `hasCliAlternative === true` 且 `status === "enabled"` | 建议 CLI 替代。`action`: "用 CLI 替代 mcp: <name>"               |
| 大型 MCP 且支持延迟加载                                | 建议 `defer-mcp`。`action`: "为 <name> 设置 defer_loading: true" |

**输出 category**：`MCP 优化`
**`level`**：中级（MCP 属于配置优化类，按 Agent/Plugin 同级别）

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
**`level`**：中级（Agent/Plugin 优化类）

### 子 Agent 4: Agent/Plugin Tools 明确化 (defer-tools)

**输入**：`pluginList[]` + `hookList[]` + `toolBreakdown` + `context.json`

> 机制依据：CodeBuddy 的延迟加载通过 **Defer(...)/NoDefer(...) 修饰符**作用于「工具列表字段」实现，而非"插件级常驻/defer"开关。修饰符可写在 CLI `--tools` 或自定义代理 frontmatter `tools:` 中。完整语法见 `codebuddy-best-practice/docs/cli/tool-defer-overlay.md`。**Skill 不是 tools 列表的修饰对象**（Skill 通过 `/name` 按需触发，不入工具列表），本 Agent 只处理挂载了工具的 Plugin / Hook / 自定义代理配置。

本 Agent 必须为**每个**命中的 Plugin 给出**具体**的 `Defer()`/`NoDefer()` 工具清单，禁止只输出"声明最小 tools 列表"这类空泛建议。判定依据：对象挂载的真实工具名可从请求体 `toolBreakdown.builtin.names` / `toolBreakdown.mcp.names` / `toolBreakdown.deferred.names` 查得；使用频率来自 `pluginList[].isLowFrequency`；场景匹配来自阶段 2 的用户问答结论。

遍历 `pluginList[]`（及挂载了多工具的 Hook / 自定义代理配置），按以下规则逐项判定：

| 条件 | 判定 | 输出 |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plugin 挂载多工具、当前场景仅用其中部分 | **部分 Defer**：常驻工具直列，其余包 `Defer()`。 | `action`: "为 <pluginId> 工具列表改写为 `tools: [X, Y, Defer(Z), Defer(W)]`"，`target`: <配置文件路径> |
| Plugin 工具全部低频/场景完全不用 | **整组 Defer**：用通配 `Defer(mcp__<server>__*)` 或逐条 `Defer()`。 | `action`: "将 <pluginId> 工具列表改写为 `tools: [Defer(mcp__<server>__*)]`" |
| 高频且场景需其全部工具 | **保持启用**：不改动。 | `action`: "保持 <pluginId> 当前 tools 配置（场景需全部工具）" |

**每条 suggestion 的 `detail` 必须包含三段明确清单**：

1. **常驻启用工具 (NoDefer / 直列)**：逐一列出命中的工具名（直列或 `NoDefer()`）。
2. **改为延迟加载工具 (Defer)**：逐一列出命中的工具名，明确写成 `Defer(<tool>)`；MCP 整组用 `Defer(mcp__<server>__*)`。
3. **依据**：来自 `isLowFrequency` 字段值，或阶段 2 场景问答结论。

**语法约束（必须遵守，否则 CodeBuddy 报错）**：

- 修饰符只能写在 `tools` 字段 / `--tools`，**不能**写进 `--allowed-tools` / `settings.permissions` / hook `matcher`。
- 通配仅支持 `*`（如 `Defer(mcp__github__*)`），不支持 `?`/`[]`。
- 一旦出现 `Defer(...)`，CodeBuddy 自动附加 `ToolSearch` + `DeferExecuteTool`，无需手列。
- `default` 表示全部内置工具，可与修饰符同用：`tools: [default, Defer(mcp__github__*)]`。

`action` 可直接执行示例：

- `"为 graphify 插件工具列表改写为 tools: [Read, Grep, Defer(Glob), Defer(LSP)]"`
- `"将 github MCP 整组延迟加载：tools: [default, Defer(mcp__github__*)]"`

`risk`: "中"，`reversible`: true。`estimatedSavingTokens` 取被 `Defer()` 工具的估算令牌之和（对应工具 `estimatedTokens` 累加）。

**输出 category**：`工具明确化`
**`level`**：中级（Agent/Plugin 优化类）

### 子 Agent 5: Skill 精简 (skill-trim)

**输入**：`skillList[]` + `context.json`

> 注意：Skill 通过 `/<name>` 按需触发，**不入 tools 列表**，因此不能用 Defer() 修饰符处理。本 Agent 只能决定"禁用/保留"整个 Skill，或建议其 frontmatter 加 `paths:` 限制加载范围。

按 `purpose` 与 `usageFrequency` 裁剪非高频 Skill：

| 条件                                 | 输出                                     |
| ------------------------------------ | ---------------------------------------- |
| `usageFrequency === 'low'` 且文档类/帮助类 Skill | 建议禁用。`action`: "禁用 skill: <name>" |
| 与已装工具功能重复                   | 建议禁用。`action`: "禁用 skill: <name>" |
| 高频 Skill 但 `paths:` 未限定        | 建议加 `paths:` 限制触发范围。`action`: "为 skill <name> 增加 paths 限定" |

**输出 category**：`Skill 精简`
**`level`**：中级（SKILL 优化类）

### 子 Agent 6: 知识图谱推荐 (knowledge-base)

**输入**：`repo-scan.json` + `context.json`
仅当 `graphTool` 非 `none` 时启动：

| 条件                     | 输出                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `graphTool` 指定具体工具 | 建议启用。`action`: "启用 <graphTool 展示名>"，`target`: "<存储值>"，`evidence`: "codeFileCount=N, topLanguages=[...]" |

**输出 category**：`知识图谱推荐`
**`level`**：高级（代码知识库类，同 Headroom 同级）

### 子 Agent 7: 仓库扫描 (repo-scan)

**输入**：`repo-scan.json` + `context.json`
基于扫描结果给出仓库级建议：

| 条件                                 | 输出                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `sameRepo=same` 且 `docFileCount` 大 | 建议排除文档目录出自动上下文。`action`: "在 CODEBUDDY.md 排除 docs/ 目录" |
| `isMonorepo`                         | 建议按子包加载上下文                                                      |

**输出 category**：`仓库专项`
**`level`**：中级（仓库配置优化类）

### 子 Agent 7.5: Rules 优化 (rules-opt)

**输入**：`ruleList[]`（来自 `diagnosis-report.json` 的 `fsCollectResult.ruleList`，每项为 `{ name, path, description, alwaysApply, paths, estTokens }`）+ `rulesTokens`（CODEBUDDY.md 系统规则块估算 token）+ `context.json`

**机制依据**：CodeBuddy 规则支持 `alwaysApply: false` + `paths`（glob）实现按文件作用域加载；未命中的规则不进入上下文。规则应"聚焦、可操作、≤ 500 行"，大规则拆为多个可组合规则并加 `paths` 作用域，可显著降低每轮上下文占用。`CODEBUDDY.md` 则全文每轮注入，需精简。

遍历 `ruleList[]`，对每条规则检查：

| 条件                                                                                              | 输出                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `alwaysApply === true` 且规则可用 `paths` 收敛（`name`/`description` 表明仅作用于部分文件）      | 建议改为 `alwaysApply: false` 并补 `paths`。`action`: "规则 <name> 加 paths 作用域：<glob>"，`reason`: "当前每轮常驻上下文，实际仅用于部分文件" |
| 单条规则过长（估算 `estTokens` 超过阈值，如 > 1000）或含多个不相关主题                            | 建议拆分为多条 `alwaysApply: false` + `paths` 的细分规则。`action`: "拆分规则 <name> 为 <子主题1>/<子主题2>"，`reason`: "精简单条降低常驻占用" |
| 规则内容含大段解释性文档/示例/推理过程（非可执行指令）                                          | 建议删除冗余，仅保留指令；长参考移至独立文件并让规则只写一句"参见 `<file>`"。`action`: "精简规则 <name> 冗余内容" |
| `rulesTokens` 整体偏大（如 > 3000）或 CODEBUDDY.md 冗长                                         | 建议把 CODEBUDDY.md 中项目级细节下沉为 `.codebuddy/rules/*.md`（`alwaysApply: false` + `paths`）。`action`: "将 CODEBUDDY.md 部分内容拆分为 rules" |

每条 `suggestion` 须填 `target: "<rule name>"`（CODEBUDDY.md 下沉场景填 `CODEBUDDY.md`），`estimatedSavingTokens` 取该规则/内容当前 `estTokens` 量级或 0；`risk`: "low"，`reversible`: true，`scenario` 取 `code` 或依据阶段 2 结论，`evidence` 填 `alwaysApply=true, paths=[]` 或 `estTokens=N`。

**输出 category**：`Rules 优化`
**`level`**：中级（Rules 优化类）

### 子 Agent 8.5: CODEBUDDY.md 审查 (codebuddy-md)

**输入**：项目级 `CODEBUDDY.md`（存在即启动，`repo-scan.json.hasCodebuddyMd` 已标记）+ `context.json`

> 机制依据（渐进式披露 / 索引式主文件最佳实践，2026 社区共识）：
> - 主文件每次会话全量注入上下文；**官方建议精简、不超过 200 行**，更强实践主张 ≤ 150 指令（Boris Cherny，超此 AI 遵从率跌破 ~80%）或 ≤ 50 行。
> - 主文件应作**索引/资源地图**：项目描述 + 常用命令 + 关键文件指针；细节（架构、数据流、契约、长文档）下沉到 `@引用` 文件或 Skills，**按需加载**。
> - 判定标准：逐行问"删掉这行 AI 会犯错吗？"不会则删。读代码能推断的、仅特定场景相关的、长篇解释/教程，都不该写进主文件。

基于上述知识对 `CODEBUDDY.md` 做 Review，逐项检查并产出建议（可多条）：

| 检查维度 | 判定条件 | 输出 |
| --- | --- | --- |
| 行数/体量 | 行数 > 200，或估算 token 远超 ~150 指令阈值 | 建议精简并下沉细节。`action`: "精简 CODEBUDDY.md 至 ≤200 行"，`reason`: "主文件每次会话全量注入，过长淹没关键指令" |
| 全量写入可推断内容 | 含读代码即可得的架构/数据流/文件职责描述（如逐文件说明、调用链） | 建议下沉为 `@引用` 文件或 Skills。`action`: "将 <章节名> 下沉为 @docs/xxx.md 或 skill"，`reason`: "AI 可读代码推断，无需每轮注入" |
| 缺索引/资源地图 | 无"关键文件"指针或目录组织，AI 需自行探索文件系统 | 建议补 Resource Map。`action`: "为 CODEBUDDY.md 增加关键文件/目录索引"，`reason`: "索引式主文件省去探索 token" |
| 含长篇解释/教程 | 大段说明、示例、推理过程而非可执行指令 | 建议删除冗余，仅留指令；参考移至独立文件。`action`: "精简 CODEBUDDY.md <章节名> 冗余内容" |
| 缺按需加载机制 | 项目级细节（如文档读取约定、特定规则）未拆为 `.codebuddy/rules/*.md`（`alwaysApply:false`+`paths`）或 Skills | 建议拆分。`action`: "将 CODEBUDDY.md <章节名> 拆分为按需 rules/skill"，`reason`: "细节按需加载降低常驻占用" |

每条 `suggestion` 须填 `target: "CODEBUDDY.md"`，`detail` 引用具体行号/章节与对应最佳实践条款；`estimatedSavingTokens` 取该章节估算 token 量级或 0；`risk`: "low"，`reversible`: true，`scenario` 取 `code` 或阶段 2 结论，`evidence` 填如 `lines=73, 超 200 行阈值` / `含可推断数据流描述`。

**输出 category**：`CODEBUDDY.md 审查`
**`level`**：初级（配置优化类）

### 子 Agent 8: Hook 审查 (hook-audit)

**输入**：`hookList[]` + `context.json`
遍历 `hookList[]`：

| 条件                      | 输出                                                 |
| ------------------------- | ---------------------------------------------------- |
| Hook 每次对话注入大块文本 | 建议精简或条件触发。`action`: "精简 hook: <matcher>" |

**输出 category**：`Hook 审查`
**`level`**：中级（Agent/Plugin 优化类）

## tasks.md 输出格式

核心原则：一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并。`action` 必须可直接执行。

```markdown
<!-- scenario: 代码编写 / 同仓 -->

# 优化建议：代码编写 / 同仓

## 1. 第三方工具启用

- [ ] [初级] 启用 RTK（预估节省 ~XXX Token）
      原因：已安装未启用，CLI 透明代理省 Token
- [ ] [高级] 启用 Headroom（预估节省 ~6200 Token）
      原因：已安装未启用，可提供 47-92% 上下文压缩

## 2. MCP 优化

- [ ] [中级] 移除 mcp: skills-sec-audit（预估节省 ~XXX Token）
      原因：disabled 且无工具

## 3. 模型优化

- [ ] [中级] lint-check-fix 指定 model: lite（预估节省 ~20% 成本）
      原因：lint 检查为简单重复任务

## 4. 工具明确化

- [ ] [中级] 为 ponytail 声明最小 tools 列表（预估节省 ~XXX Token）
      原因：plugin 未声明 tools，全量加载

## 5. Skill 精简

- [ ] [中级] 禁用 skill: ponytail-help（预估节省 ~48 Token）
      原因：帮助类 Skill，代码场景非高频

## 6. 知识图谱推荐

- [ ] [高级] 启用 Graphify（预估节省 依赖图谱检索替代回读）
      原因：codeFileCount=42, topLanguages=[TypeScript,JavaScript]

## 7. 仓库专项

- [ ] [中级] 排除 docs/ 出自动上下文（预估节省 ~3000 Token）
      原因：同仓，文档每次对话重复注入

## 7.5 Rules 优化

- [ ] [中级] 规则 lint-rule 加 paths 作用域：src/**/*.ts（预估节省 ~XXX Token）
      原因：alwaysApply=true, paths=[]
- [ ] [中级] 将 CODEBUDDY.md 中"文档读取约定"拆分为 rules: doc-read（预估节省 ~XXX Token）
      原因：rulesTokens 整体偏大，项目级细节可下沉为按需加载规则

## 8.5 CODEBUDDY.md 审查

- [ ] [初级] 精简 CODEBUDDY.md 至 ≤200 行（预估节省 ~XXX Token）
  原因：lines=73 含可推断数据流/架构描述，主文件每次会话全量注入，应下沉为 @引用 或 skill
- [ ] [初级] 为 CODEBUDDY.md 增加关键文件/目录索引
  原因：缺 Resource Map，AI 需自行探索文件系统

## 8. Hook 审查

- [ ] [中级] 精简 hook: rtk（预估节省 ~XXX Token）
  原因：每次对话注入压缩提示

---

等级统计：初级 X 项 / 中级 X 项 / 高级 X 项
总计：预估节省 ~XXXXX Token (XX.X%)
```

每组标题对应实际启动的 Agent，跳过的 Agent 不出现。标题顺序固定：1.第三方工具启用 → 2.MCP 优化 → 3.模型优化 → 4.工具明确化 → 5.Skill 精简 → 6.知识图谱推荐 → 7.仓库专项 → 7.5 Rules 优化 → 8.5 CODEBUDDY.md 审查 → 8.Hook 审查。每条一行 `- [ ]` + 原因缩进两空格，总计行末尾用 `---` 分隔。

## 边界

- 不做任何文件修改，仅产出 `suggestions-*.json` 与 `tasks.md`。
- 无法估算节省时 `estimatedSavingTokens` 填 0 并在 `detail` 描述效果。
- 子 Agent 超时/失败 → 跳过该维度，汇总其余，摘要标注。
- tasks.md 一个条目对应一个具体操作，绝不合并。
- 所有 `action` 必须可执行，不得泛泛而谈。
