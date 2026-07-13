---
name: stk-analyze
description: "基于诊断数据与项目上下文，通过 7 个并行子 Agent 多维度分析，生成 Token 优化方案（analysis.json + tasks.md）"
allowed-tools: Read, Write, Bash, AskUserQuestion, Agent
---

# SKILL: stk-analyze

收集用户的使用场景和项目上下文，结合 `stk diagnose` 诊断数据，通过 7 个并行子 Agent 多维度分析，
生成个性化的 Token 优化方案，输出 `analysis.json`（机器契约）和 `tasks.md`（人读待办清单）。

## 工作流

### 步骤 1: 检查诊断数据是否可用

```bash
cat save-token/diagnosis-report.json 2>/dev/null || echo "NOT_FOUND"
```

**文件存在**且 `scanTimestamp` 在 5 分钟内 → 复用，跳到步骤 3。
**不存在或过期** → 提示用户先运行 `stk diagnose` 或 `/stk-diagnose`，不继续。

### 步骤 2: 收集项目上下文

检查 `./save-token/context.json`：存在且 `collectedAt` 在 7 天内 → 复用，跳到步骤 3。

否则用 `AskUserQuestion` 收集（不要猜测，必须询问）：

- **问题 1: 主要使用目的** — 代码编写 / 文档写作 / 通用办公 / 通用（跳过）
- **问题 2: 代码与文档是否在同一仓库** — 是（同仓） / 否（文档在独立仓库） / 不适用（纯文档/办公）

将结果写入 `./save-token/context.json`：

```json
{ "collectedAt": "<ISO8601>", "purpose": "code|docs|office|general", "sameRepo": "same|separate|n-a|unknown" }
```

**重问**：用户删除 `context.json` 或显式声明新上下文 → 重新提问覆盖缓存。
**回退**：用户拒绝回答 → `purpose=general`、`sameRepo=unknown`，通用模式不阻塞。

### 步骤 3: 并行启动 7 个子 Agent 分析

使用 `Agent` tool **并行**启动以下 7 个分析子 Agent。每个传入完整上下文：
`diagnosis-report.json` 全文 + `context.json`（purpose + sameRepo）。

**数据驱动原则（所有子 Agent 必须遵守）**：

- 只基于诊断数据中**实际存在的字段值**做判断，不得虚构任何操作或配置细节。
- 每条 suggestion 的 `action` 和 `reason` 必须能追溯到诊断数据中的具体字段。
- 如果诊断数据中没有对应的数据（如 `toolDetection` 为空、`skillList` 为空等），输出空 `suggestions: []`，不得编造。

**所有子 Agent 必须严格输出以下统一 JSON 格式**（不要任何额外文字）：

```json
{
  "agent": "<agent 标识>",
  "suggestions": [
    {
      "id": "string",
      "category": "tool-enable|cleanup|model-opt|defer-tools|knowledge-base|mcp-defer|same-repo",
      "target": "string",
      "action": "string",
      "reason": "string",
      "estimatedSavingTokens": 0,
      "risk": "low|medium|high",
      "reversible": true
    }
  ]
}
```

### 步骤 4: 汇总生成 analysis.json 与 tasks.md

#### 4a. 生成 analysis.json（机器契约，供 /stk-optimize 消费）

合并 7 个子 Agent 的 `suggestions`，去重，按 `estimatedSavingTokens` 降序，写入：

```
./save-token/analysis.json
```

结构：`{ generatedAt, sourceDiagnosis, context: ProjectContext, suggestions: AnalysisSuggestion[], totalEstimatedSavingTokens }`

- `context` 字段承载 `purpose` 与 `sameRepo`
- 每条 `suggestion` 含 `scenario` 字段标注场景归因
- `operationType` 按下方映射表转换

#### 4b. 生成 tasks.md（人读待办清单）

合并 7 个子 Agent 的 `suggestions`，按 `category` 分组，写入：

```
./save-token/tasks.md
```

- 场景信息通过顶部注释标明（如 `<!-- scenario: 代码编写 / 同仓 -->`）
- **一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并**
- 格式见下方「tasks.md 输出格式」

### 步骤 5: 输出摘要

控制台打印分组摘要 + 总计节省 Token/百分比 + 文件路径 + 场景标注。

---

## 子 Agent 定义

每个子 Agent 使用 `Agent(subagent_type="general-purpose", prompt="...")` 启动。

### 子 Agent 1: 第三方工具启用分析 (tool-enable-agent)

**输入**：`toolDetection[]` + `context.json`

**分析规则（严格按数据驱动，不得虚构）**：

遍历 `toolDetection[]`，对每个条目执行：

| 条件 | 输出 |
|------|------|
| `installed === true` 且 `enabled === false` | 建议启用该工具。`action` 写 "启用 <工具名>"，`reason` 写 "已安装但未启用，启用后可节省 Token"。`estimatedSavingTokens` 取 `recommendedSaving` 值（若无则填 0）。 |
| `installed === true` 且 `enabled === true` | 已启用，不生成建议。 |
| `installed === false` | 未安装，不生成建议。 |

**禁止事项**：
- 不得建议"扩大覆盖范围"、"调整配置"等超出 `installed`/`enabled` 状态的操作。
- 不得虚构工具名或推荐诊断数据中不存在的工具。
- 每个工具最多 1 条 suggestion。

**输出 category**：`tool-enable`

### 子 Agent 2: SKILL/Agent/MCP 精简 (cleanup-agent)

**输入**：`skillList[]` + `pluginList[]` + `mcpList[]` + `context.json`

**分析规则（严格按数据驱动）**：

遍历 `skillList[]`，对每个条目执行：

| 条件 | 输出 |
|------|------|
| `estimatedTokens > 500` 且 `source` 为 `plugin-marketplace` 且与当前 `purpose` 无关 | 建议删除该 Skill。`action` 写 "删除 skill: <name>"，`reason` 写明为何与当前场景无关。 |
| `isDuplicate === true` | 建议删除重复 Skill。`action` 写 "删除重复 skill: <name>"，`reason` 写 "与另一来源重复加载"。 |

遍历 `mcpList[]`，对每个条目执行：

| 条件 | 输出 |
|------|------|
| `status === "disabled"` 且 `toolsCount === 0` | 建议彻底移除该 MCP 配置。`action` 写 "移除 mcp: <name>"，`reason` 写 "已禁用且无工具，占用配置无意义"。 |
| `hasCliAlternative === true` 且 `status === "enabled"` | 建议用 CLI 替代该 MCP。`action` 写 "用 CLI 替代 mcp: <name>"，`reason` 写 "有等效 CLI 可替代，不占持久上下文工具定义"。 |

**禁止事项**：
- 不得建议删除用户自建的 Skill（`source: "user"` 或 `source: "project"`），除非 `isDuplicate` 为 true。
- 不得虚构 Skill/MCP 名称。

**输出 category**：`cleanup`

### 子 Agent 3: 模型优化 (model-opt-agent)

**输入**：`skillList[]` + `pluginList[]` + `context.json`

**分析规则（严格按数据驱动）**：

遍历 `skillList[]` 与 `pluginList[]`，对每个条目判断其任务类型：

| 条件 | 输出 |
|------|------|
| Skill/Plugin 名称含 `lint`、`format`、`check`、`fix` 等关键词（简单重复任务） | 建议指定 `model: lite`。`action` 写 "为 <name> 指定 model: lite"。 |
| Skill/Plugin 名称为已知的简单查询类（如 `codebase-memory`、`graphify`） | 建议指定 `model: lite`。 |

**禁止事项**：
- 不得对需要推理/决策的 Skill（如 `stk-analyze`、`fix-bug`、`new-feature`）建议降级模型。
- 不得虚构 Skill 名称。

**输出 category**：`model-opt`

### 子 Agent 4: Agent/Plugin Tools 明确化 (defer-tools-agent)

**输入**：`pluginList[]` + `hookList[]` + `context.json`

**分析规则（严格按数据驱动）**：

遍历 `pluginList[]`，对每个条目检查其 tools 定义：

| 条件 | 输出 |
|------|------|
| Plugin 未声明 `tools` 或声明为 `*` | 建议明确最小必要 Tools 并其余 defer。`action` 写 "为 <name> 明确 tools 并 defer 其余"。 |

**禁止事项**：
- 不得对已明确声明具体 tools 列表的 Plugin 再提建议。
- 不得虚构 Plugin 名称或 tools 列表。

**输出 category**：`defer-tools`

### 子 Agent 5: 知识库推荐 (knowledge-base-agent)

**输入**：`contextOverview` + `configFiles[]` + `context.json`

**分析规则（严格按数据驱动）**：

| 条件 | 输出 |
|------|------|
| `contextOverview.totalEstimatedTokens > 20000` | 推荐安装知识库工具。`action` 写 "安装 codebase-memory 知识库 Skill"，`reason` 写 "上下文 Token 总量大，知识库可减少重复文件读取"。 |
| `configFiles[]` 中 `CODEBUDDY.md` 文件 `charCount > 5000` | 同上。 |

以上条件均不满足 → 输出空 `suggestions: []`。

**禁止事项**：
- 不得推荐诊断数据中未列出的工具（codebase-memory 除外，因它是项目自带的已知 Skill）。
- 不得在 Token 总量不高时强行推荐。

**输出 category**：`knowledge-base`

### 子 Agent 6: MCP 延迟加载 (mcp-defer-agent)

**输入**：`mcpList[]` + `context.json`

**分析规则（严格按数据驱动）**：

遍历 `mcpList[]`，对每个条目执行：

| 条件 | 输出 |
|------|------|
| `status === "enabled"` 且 `deferLoading !== true` 且 `toolsCount > 5` | 建议启用延迟加载。`action` 写 "配置 mcp: <name> 延迟加载"，`reason` 写 "工具数多（<toolsCount>），延迟加载减少初始化 Token 注入"。 |
| `status === "enabled"` 且 `deferLoading !== true` 且 `toolsCount <= 5` | 工具数少，不生成建议。 |

**禁止事项**：
- 不得对已启用延迟加载的 MCP 重复建议。
- 不得虚构 MCP 名称。

**输出 category**：`mcp-defer`

### 子 Agent 7: 同仓专项分析 (same-repo-agent)

**输入**：`context.json` + `configFiles[]` + `ruleList[]`

**分析规则（严格按数据驱动）**：

| 条件 | 输出 |
|------|------|
| `sameRepo === "same"` | 建议排除文档目录出自动上下文。`action` 写 "排除文档目录（docs/）出自动上下文"，`reason` 写 "代码与文档同仓，文档内容每次对话被重复注入"。 |
| `sameRepo === "separate"` | 建议排除文档仓库出主代码对话上下文。`action` 写 "排除文档仓库出主代码对话上下文"，`reason` 写 "文档在独立仓库，避免文档内容被反复注入"。 |
| `sameRepo === "n-a"` | 不生成建议。 |

**禁止事项**：
- 不得对 `sameRepo === "n-a"` 生成代码相关建议。
- 不得虚构文件路径或目录名（仅用通用的 `docs/` 作为示例）。

**输出 category**：`same-repo`

---

## operationType 映射

子 Agent 的 `category` 到 `analysis.json` 中 `operationType` 的映射：

| category | operationType |
|----------|---------------|
| `tool-enable` | `install-tool` |
| `cleanup` | `disable-skill` 或 `disable-mcp`（视 target 而定） |
| `model-opt` | `other` |
| `defer-tools` | `other` |
| `knowledge-base` | `install-tool` |
| `mcp-defer` | `defer-mcp` |
| `same-repo` | `trim-file` 或 `other` |

---

## analysis.json 输出格式

```json
{
  "generatedAt": "2026-07-13T10:00:00Z",
  "sourceDiagnosis": "save-token/diagnosis-report.json",
  "context": {
    "collectedAt": "2026-07-13T10:00:00Z",
    "purpose": "code",
    "sameRepo": "same"
  },
  "suggestions": [
    {
      "id": "S1",
      "title": "启用 RTK",
      "detail": "rtk 已安装但未启用",
      "operationType": "install-tool",
      "target": "rtk",
      "estimatedSavingTokens": 8900,
      "risk": "low",
      "reversible": true,
      "scenario": "code"
    }
  ],
  "totalEstimatedSavingTokens": 45000
}
```

- `context` 承载 `purpose` 与 `sameRepo`
- 每条 `suggestion` 含 `scenario` 字段标注场景归因

---

## tasks.md 输出格式

> **核心原则**：一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task。绝不合并多个条目到一行。
> **action 必须可直接执行**，如 "启用 RTK"、"删除 skill: presentation"、"配置 mcp: serena 延迟加载"。

```markdown
<!-- scenario: 代码编写 / 同仓 -->

# 优化建议：代码编写 / 同仓

## 1. 第三方工具启用

- [ ] 启用 RTK（预估节省 ~8900 Token）
      原因：rtk 已安装但未通过 Hook 启用
- [ ] 启用 Headroom（预估节省 ~6200 Token）
      原因：headroom 已安装但未注册 MCP

## 2. SKILL/Agent/MCP 精简

- [ ] 删除 skill: presentation（预估节省 ~300 Token）
      原因：当前为代码开发场景，演示类 skill 无意义
- [ ] 用 CLI 替代 mcp: playwright（预估节省 ~1600 Token）
      原因：有等效 CLI 可替代，不占持久上下文工具定义

## 3. 模型优化

- [ ] 为 lint-check-fix 指定 model: lite（预估节省 ~20% 成本）
      原因：lint 检查为简单重复任务，无需旗舰模型

## 4. Agent Tools 明确化

- [ ] 为 code-reviewer 明确 tools 并 defer 其余（预估节省 ~2000 Token）
      原因：当前未声明 tools 或声明为 *，每次对话注入过多工具定义

## 5. 知识库推荐

- [ ] 安装 codebase-memory 知识库 Skill（预估节省 ~5000 Token/会话）
      原因：上下文 Token 总量大，知识库可减少重复文件读取

## 6. MCP 延迟加载

- [ ] 配置 mcp: serena 延迟加载（预估节省 ~2000 Token）
      原因：工具数多（12 个），延迟加载减少初始化注入

## 7. 同仓专项

- [ ] 排除文档目录（docs/）出自动上下文（预估节省 ~3000 Token）
      原因：代码与文档同仓，文档内容每次对话被重复注入

---
总计：预估节省 ~XXXXX Token (XX.X%)
```

每组标题固定为上述 7 个，顺序不变。每条建议一行 `- [ ]` 复选框 + 原因缩进两空格。
总计行放在文件末尾，用 `---` 分隔。

---

## 场景过滤

子 Agent 在分析时结合 `context.json` 的 `purpose` 自动裁剪：

| purpose | 重点分析维度 | 降权/跳过 |
|---------|-------------|----------|
| `code` | tool-enable, cleanup, defer-tools, mcp-defer | 文档协作类知识库推荐 |
| `docs` | cleanup, knowledge-base, same-repo | 代码审查类 Agent 精简 |
| `office` | cleanup, same-repo | 代码特定工具启用/模型优化 |
| `general` | 全部 7 个维度（默认） | 无 |

---

## 边界

- 不做任何文件修改，仅产出 `analysis.json` 与 `tasks.md`。
- 无法估算节省时 `estimatedSavingTokens` 填 0 并注明原因。
- 子 Agent 超时或失败 → 跳过该维度，汇总其余，在摘要中标注跳过项。
- tasks.md 中一个条目对应一个具体操作，绝不把多个 SKILL/MCP/工具合并成一条。
- 所有建议的 `action` 必须是可执行的操作描述，不得是泛泛的"优化"、"调整"。
