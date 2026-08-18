---
name: stk-analyze
description: '分析用户AI使用场景，提供Token节省方案'
disable-model-invocation: true
---

# SKILL: stk-analyze

收集用户的使用场景与当前仓库的代码/文档情况，结合 `stk diagnose` 诊断报告，并行派发多个专注不同优化点的子 Agent，每个子 Agent 将统一 Schema 的 JSON 落盘到 `save-token/suggestions-<agent-name>.json` 并**自行用 `stk verify --file` 校验格式**（程序化死逻辑，失败则覆盖重写自纠），最后汇总为 `save-token/tasks.md` 待办清单。

## 编排模型（状态机）

采用**显式状态机**驱动，避免子 Agent 之间自由对话、各自为政。每个对象（子 Agent / 前置调研）在其生命周期内处于一个状态，由主 Agent 依据**产物是否落盘且校验通过**来推进：

```text
PENDING → READY → RUNNING → SUCCESS
                        └── FAILED → (RETRYING) → SUCCESS / FAILED
```

- `PENDING`：对象存在性判定通过、尚未派发。
- `READY`：输入产物（诊断字段 / `context.json` / `repo-scan.json`）齐备，可进入并行派发。
- `RUNNING`：子 Agent 已派发、正在产出并落盘 `suggestions-<name>.json`。
- `SUCCESS`：产物已落盘且通过 `stk verify --file`（或按对象为前置 `repo-analysis.json`）。
- `FAILED`：达到重试上限仍失败 / 超时 → 跳过该维度，汇总其余，摘要标注。
- `RETRYING`：`stk verify` 校验失败后子 Agent 自我修复并覆盖重写的中间态（有限重试，见"失败处理"）。

> 主 Agent 只依据**落盘产物的存在性 + 校验结果**推进状态，不靠子 Agent 的自我声称"我完成了"。这与"Artifact 而非 Conversation"一致——Agent 之间通过结构化 JSON 产物通信，不传聊天记录。

## 目标

通过"收集场景 → 收集仓库 → 派发子 Agent → 汇总 tasks.md"四阶段，产出可一键执行的 Token 优化待办。每个子 Agent 仅关注一类对象，对象不存在则不启动该 Agent。

## 执行流程

### 平台识别（全局前置）

先判定当前 AI 平台，确定**项目级指令主文件**（下称 `memoryMd`，即每次会话自动全量加载到上下文的项目级记忆/指令文件）：

| 平台 | 项目级指令主文件 |
| --- | --- |
| CodeBuddy | `CODEBUDDY.md` |
| Claude Code | `CLAUDE.md` |
| CodeX | `AGENTS.md` |

判定方式：以当前运行平台为准（Agent 自知身份）；无法确定时检查项目根目录，存在 `./CODEBUDDY.md` 视为 CodeBuddy，存在 `./CLAUDE.md` 视为 Claude Code，存在 `./AGENTS.md` 视为 CodeX，多者并存时以当前平台为准。

下文所有涉及主文件的分析（`repo-scan.json` 字段、`memory-md` 子 Agent 启动条件、建议 `target`、tasks.md 分组标题等）统一用 `memoryMd` 指代实际文件名，**不写死**为具体平台文件名。

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

**第一轮（必问）— 使用场景与用户角色：**

- 问题 1: 主要使用目的 → 代码编写 / 文档写作 / 通用办公 / 通用
- 问题 2: 代码与文档是否在同一仓库 → 是（同仓）/ 否（独立仓库）/ 不适用（纯文档/办公）
- 问题 3: 用户角色画像 → 前端开发 / 后端开发 / 测试 / 产品经理 / 全栈 / 其他

> 用户角色（`role`）用于精准判定 Plugin 的适用性：特定领域 Plugin（如前端 UI 套件、移动端 SDK）仅对对应角色的项目有价值，跨角色全局启用即为浪费。角色与 `purpose`/`sameRepo` 共同构成推荐依据。

**第二轮（条件触发）— 代码知识图谱工具倾向性：**

- **触发条件**：仓库扫描已完成（`repo-scan.json` 存在）且 `codeFileCount >= 5`

- **前置判定（决定是否询问）**：进入询问前，先读取 `diagnosis-report.md` / `diagnosis-report.json` 中的代码知识库对象（如 `graphify` / `codebase-memory-mcp` / `codegraph` / `gitnexus` 等，对应 `knowledge-base` 维度字段），按以下规则判定：
  1. **已启用** → 直接写入 `context.json` 的 `graphTool` 为该工具，**不再** `AskUserQuestion` 询问选哪个知识库。
  2. **已安装但仅 1 个且未启用** → 默认使用该唯一已安装知识库，直接写入 `graphTool`，**不再** 询问是否使用。
  3. **已安装但多个且均未启用 / 全部未安装 / 触发条件不满足但用户主动提及** → 才走下方 `AskUserQuestion` 询问。

  > 判定依据一律取自诊断报告，不猜测；若报告字段缺失无法判定，降级为正常询问。

- **询问内容（仅当前置判定不满足时触发）**：列出已知工具，附简要描述：
  - `Graphify`（本地 CLI，轻量图谱）
  - `Codebase-Memory MCP`（本地 MCP，跨语言图谱）
  - `CodeGraph`（语义+历史层）
  - `GitNexus`（monorepo/影响分析）
  - `暂不需要`
- **推荐标记**：基于仓库扫描特征在对应选项标注"（推荐）"：
  - TypeScript/JavaScript 为主且有项目级指令主文件（`memoryMd` 存在）→ 推荐 **Graphify**
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
  "role": "frontend|backend|test|pm|fullstack|other",
  "graphTool": "graphify|codebase-memory-mcp|codegraph|gitnexus|none|<自定义>"
}
```

> `graphTool` 仅在第二轮相关时写入；仓库过小不触发则不写该字段（向后兼容）。若诊断报告显示已启用或仅 1 个已安装知识库，由前置判定直接写入，不触发询问。

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

# 项目级指令主文件（按平台识别结果检测，见"平台识别"）
ls CODEBUDDY.md CLAUDE.md AGENTS.md 2>/dev/null || true

# monorepo 检测：根外是否存在多个 package.json / Cargo.toml / go.mod
```

统计并写入 `./save-token/repo-scan.json`（字段见下方 RepoScan Schema）：

| 字段             | 说明                            |
| ---------------- | ------------------------------- |
| `scannedAt`      | ISO 8601                        |
| `codeFileCount`  | 代码文件数                      |
| `docFileCount`   | 文档文件数                      |
| `codeLineCount`  | 代码总行数（量级）              |
| `docLineCount`   | 文档总行数（量级）              |
| `topLanguages`   | Top 3 语言（按文件数降序，≤ 3） |
| `hasDocsDir`     | 是否存在 `docs/` 或 `README*`   |
| `hasMemoryMd`    | 是否存在项目级指令主文件（memoryMd） |
| `memoryMd`       | 项目级指令主文件文件名（如 `CODEBUDDY.md` / `CLAUDE.md` / `AGENTS.md`），不存在时省略 |
| `isMonorepo`     | 是否 monorepo                   |
| `scanError`      | 失败信息；成功为 `null`         |

排除目录：`node_modules` `.git` `dist` `build` `coverage` `.cache`。

**扫描失败处理**：`scanError` 非 null 时不阻塞问答；第二轮图谱询问降级为"无法推荐，请自行选择"；摘要标注扫描失败。

**步骤 3.5: 前置仓库调研（单独调用，非并行）**

扫描完成后、进入并行派发前，**单独调用一次**前置调研 Agent `repo-scan`（规则见 `@agents/repo-scan.md`），读取 `repo-scan.json` + `context.json`，产出 `save-token/repo-analysis.json`（含 `flags` 结构化结论 + `suggestions[]`）。

- 此 Agent **不进入阶段 3 并行列表**，由主流程在步骤 3 后单发。
- `flags`（如 `docsOverInjected` / `needsMonorepoSplit` / `needsIndex`）供并行子 Agent 按需读取，避免各 Agent 重复计算仓库特征。
- `suggestions[]` 由汇总阶段（步骤 5）直接消费进 tasks.md 第 7 组"仓库专项"，不再经由并行 suggestion 文件。
- 该 Agent 失败/超时 → 跳过仓库专项维度，汇总其余，摘要标注。

### 阶段 3: 并行子 Agent 派发

**步骤 4: 按对象存在性动态启动**

读取诊断报告，仅对**存在且非空**的对象启动对应子 Agent。对象为空 → 不启动，摘要标注跳过。

在**单条消息**中并行发起所有需启动的子 Agent（多次 `Agent` 调用）。每个子 Agent 接收：诊断报告相关字段 + `context.json` + `repo-scan.json`（按需），并**自行落盘**统一 Schema JSON 到 `save-token/suggestions-<agent-name>.json`。

**落盘与格式校验（子 Agent 自验，程序化死逻辑）**：

1. 子 Agent 完成分析后，将建议写入自己的文件 `save-token/suggestions-<agent-name>.json`。
2. 子 Agent **随即运行** `stk verify --file save-token/suggestions-<agent-name>.json` 校验**自己这一个文件**的格式（字段齐全、`operationType`/`risk`/`level` 合法、`estimatedSavingTokens ≥ 0`、`agentName` 与文件名匹配等）。
3. **校验失败** → 子 Agent 依据 `stk verify` 输出的具体错误行**自我修复并覆盖重写**该文件，再次 `stk verify --file`，直至通过。
4. **有限重试**：同一文件连续校验失败达 3 次仍不通过 → 放弃该维度，标记该子 Agent 为 `FAILED`（**不再无限重试**），汇总其余，摘要标注失败原因。
5. 校验通过 → 状态推进到 `SUCCESS`，汇总阶段（步骤 5）直接消费该文件。

> **校验是确定性死逻辑，归程序（`stk verify`）而非 LLM 重读自检**：子 Agent 负责"产出建议 + 依据错误修复"，`stk verify` 负责"判定格式对错"，二者职责分离（Generate → Independent Verify）。格式校验不涉及主观质量判断，不存在"执行者自我验收的确认偏差"。
>
> **覆盖重写不触发删除**：修复采用覆盖写（`writeFileSync` 同路径），不删除旧文件，避免权限摩擦。

**失败分类与处理**（任一子 Agent 失败/超时）：

| 失败类型 | 判定 | 处理 |
| --- | --- | --- |
| `tool_error` | `stk verify` 报错/命令执行失败 | 重试一次 |
| `context_missing` | 子 Agent 反馈缺少必要输入字段 | 补全输入后重派发该 Agent |
| `impl_error` | `stk verify` 返回格式错误清单 | 子 Agent 按清单覆盖重写（见上"有限重试"） |
| `plan_error` | 连续 3 次 `impl_error` 仍失败 | 放弃该维度，标记 `FAILED`，不重规划 |
| `unknown` | 超时 / 未产出文件 | 跳过该维度，汇总其余 |

**子 Agent 启动条件表**

| # | 子 Agent         | 关注对象                          | 启动条件                                | 详细规则                  |
|---|------------------|-----------------------------------|-----------------------------------------|---------------------------|
| 1 | `tool-enable`    | `toolDetection[]`                 | 数组非空                                | @agents/tool-enable.md |
| 2 | `mcp-opt`        | `mcpList[]`                       | 数组非空                                | @agents/mcp-opt.md     |

> **MCP 优化关键约束**：TAPD（`mcp-server-tapd`）、工蜂（`gongfeng-mcp`）、GitHub（`github-mcp`）等开发协作平台 MCP 是开发必备工具，**不得建议禁用**。应建议用对应 CLI（`tapd-cli` / `gongfeng` / `gh`）替代 MCP，保留功能同时移除工具定义的 Token 开销。领域匹配判定（如 purpose=code/role=backend）不适用于此类开发协作平台——它们对所有开发角色均必要。
| 3 | `plugin-opt`     | `pluginList[]`                    | 数组非空                                | @agents/plugin-opt.md  |
| 4 | `agent-opt`      | `agentList[]`                     | 数组非空                                | @agents/agent-opt.md   |
| 5 | `skill-opt`      | `skillList[]`                     | 数组非空                                | @agents/skill-opt.md   |
| 6 | `knowledge-base` | `repo-scan.json` + `context.json` | 仓库超阈值 **且** `graphTool` 非 `none` | @agents/knowledge-base.md |

> **`knowledge-base` 启动前置判定**（派发前执行，依据诊断报告）：
> - 诊断报告显示某代码知识库 `enabled === true`（已启用）→ **不启动**该 Agent（已就绪，无需建议）。
> - `graphTool` 指定某工具且诊断报告该工具 `installed === true` 但 `enabled === false` → **启动**，Agent 工作即产出"启用该知识库"建议。
> - `graphTool` 指定某工具且未安装 / 用户主动选择 → 启动，按规模产出"启用"建议。
> - `graphTool === 'none'` 或缺失 → 不启动。
> 判定依据一律取自诊断报告，不猜测；报告字段缺失时降级为按原"仓库超阈值且 graphTool 非 none"条件启动。
| 7 | `command-opt`    | `commandList[]`（主 Agent 从诊断报告提取后传入） | `commandList[]` 非空 | @agents/command-opt.md |
| 8 | `rules-opt`      | `ruleList[]`                      | 数组非空                                | @agents/rules-opt.md   |
| 9 | `memory-md`      | 项目级指令主文件（`memoryMd`） | `hasMemoryMd === true`                        | @agents/memory-md.md |
| 10 | `hook-audit`     | `hookList[]`                      | 数组非空                                | @agents/hook-audit.md  |

> **注**：`repo-scan` 为前置调研 Agent，在阶段 2 步骤 3.5 单独调用（非并行），产出 `repo-analysis.json`，其 `suggestions[]` 由汇总阶段直接消费，不占并行名额。并行子 Agent 共 10 个：`tool-enable`、`mcp-opt`、`plugin-opt`、`agent-opt`、`skill-opt`、`knowledge-base`、`command-opt`、`rules-opt`、`memory-md`、`hook-audit`（`command-opt` 由主 Agent 从 `diagnosis-report.json` 的 `commandList[]` 提取后作为参数传入）。各子 Agent 统一以表中**新名**（如 `plugin-opt`/`agent-opt`/`skill-opt`/`command-opt`）标识，禁止输出旧名别名。

### 阶段 4: 汇总生成 tasks.md

**步骤 5: 合并与落盘**

读取 `save-token/suggestions-*.json` 全部文件（各文件已由对应子 Agent 在落盘时 `stk verify --file` 校验通过，主 Agent **不再重复跑全量 verify**，信任子 Agent 自验），并额外读取前置调研产出 `save-token/repo-analysis.json` 的 `suggestions[]`（第 7 组"仓库专项"来源，非并行 suggestion 文件），合并所有 `suggestions[]`，按 `category` 分组，写入 `save-token/tasks.md`。

> 主 Agent 汇总前仅做**轻量自查**：确认每个已启动子 Agent 均有非空文件、且 `agentName` 与文件名匹配（对应 `stk verify` 的部分规则）。若发现某文件缺失（如子 Agent 未落盘即失败），按"失败分类"处理，不强行合并空数据。

**步骤 5a: 跨 Agent 去重与冲突仲裁（合并后、分组落盘前）**

各子 Agent 并行独立产出，可能对同一 `target` 产生重复或冲突建议。合并后必须先仲裁，再分组落盘：

- **完全重复**：`agentName` 不同但 `operationType` + `target` + `action` 语义完全相同（如 `tool-enable` 与 `knowledge-base` 均建议"启用某知识库工具"）→ 仅保留一条，取两者中 `estimatedSavingTokens` 较大者，并在保留条目的 `evidence` 追加"来源：<agentName1> + <agentName2>"。
- **对象级冲突（同 `target` 操作互斥）**：同一 `target` 同时命中两条互斥建议（如某 Agent 建议"启用 X"而另一 Agent 建议"禁用 X"；或"迁移 X 到 project 层"与"移除 X"）→ 保留**优先级最高**的一条，其余丢弃，并在 `detail` 注明"已合并同 target 的冲突建议"。
- **冲突优先级（从高到低）**：`启用/安装/就绪类` > `禁用/移除/迁移类` > `斜杠化/降级/收窄类` > `审查/检查类`。同一优先级内保留 `estimatedSavingTokens` 较大者。
- **无法判定是否互斥**（`target` 相同但操作不构成互斥，如"精简 X"与"为 X 补索引"可并存）→ 两者都保留。

仲裁仅针对**相同 `target`** 的建议；不同 `target` 之间不比较。

**步骤 5b: 分组与落盘**

按 `category` 分组，写入 `save-token/tasks.md`：

- 顶部注释：`<!-- scenario: <purpose 中文> / <同仓|异仓> -->`
- **一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并**
- 每条 Task 含可执行 `action`、预估节省 Token、原因
- 已跳过的子 Agent 在摘要区列出
- 仲裁合并用 suggestion 内部 ID（S1, S2, ...）保证唯一；tasks.md 落盘时另为每条 Task 生成用户可见的 `<N.M>` 编号（N 为组标题编号，M 为组内序号），供用户精确指定要执行的 Task

**步骤 6: 输出摘要**

控制台打印：总计预估节省 Token 与百分比、`tasks.md` 路径、场景标注、已跳过子 Agent 列表、失败子 Agent 列表。

**⚠️ 必须提醒用户**：`save-token/tasks.md` 中的每条建议均需用户**仔细核对**。若某条不想执行，用户可直接在 `tasks.md` 中删除该行（或在执行 `stk-optimize` 前手动移除）。所有优化均为用户侧配置变更，工具不自动执行——确认无误后再调用 `stk-optimize` 执行选中的任务。

**步骤 7: 收尾清理中间产物**

`tasks.md` 落盘且摘要打印完成后，删除所有子 Agent 产出的中间 JSON，只保留最终 `tasks.md`（以及阶段 1/2 的诊断与扫描产物）：

```bash
# 清理 stk-analyze 本次自产的中间态建议文件（格式已通过 stk verify，删除安全）
rm -f save-token/suggestions-*.json
```

- 删除对象：阶段 3 并行子 Agent 的 `save-token/suggestions-<agent-name>.json`。
- **保留**：`tasks.md`、`diagnosis-report.md` / `diagnosis-report.json`、`repo-scan.json`、`repo-analysis.json`、`context.json`、`proxy-raw-body.json`。
- 前置调研 `repo-analysis.json` 同为中间产物，但其 `suggestions[]` 已并入 `tasks.md` 第 7 组，故一并删除：

```bash
# 清理前置调研中间态（suggestions 已并入 tasks.md，删除安全）
rm -f save-token/repo-analysis.json
```

- 仅删除本次实际生成过的文件；未启动的子 Agent 无对应文件，`rm -f` 安全跳过。
- 这些文件均为 `stk-analyze` 本次会话自产、且已通过 `stk verify` 校验的中间态，删除不影响任何用户配置与最终 `tasks.md`。

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
      "level": "高级",
      "evidence": "toolDetection: installed=true, enabled=false"
    }
  ]
}
```

顶层字段：`agentName` / `category` / `generatedAt` / `skipped` / `suggestions[]`。
每条 `suggestion` 字段：`id` / `title` / `detail` / `operationType` / `target` / `estimatedSavingTokens` / `risk` / `reversible` / `scenario` / `level` / `evidence?`。

**验收条件（Acceptance，即 `stk verify` 的校验规则，二者必须一致）**：

- 顶层必填：`agentName` / `category` / `generatedAt` / `skipped` / `suggestions[]`。
- 每条必填：`id` / `title` / `detail` / `operationType` / `target` / `estimatedSavingTokens` / `risk` / `reversible` / `scenario` / `level`。
- `operationType` ∈ `src/types/index.ts` 的 `OperationType` 联合类型（含扩展值 `agent-opt` / `knowledge-base` / `plugin-opt` / `disable-plugin` / `migrate-plugin` / `migrate-skill` / `disable-model-invocation` / `skill-model-downgrade`）。
- `risk` ∈ `low` | `medium` | `high`。
- `level` ∈ `初级` | `中级` | `高级`。
- `estimatedSavingTokens` 为非负整数（未知填 0 并在 `detail` 描述效果）。
- `target` 为非空字符串。
- `reversible` 为布尔值。
- `agentName` 与文件名 `suggestions-<agent-name>.json` 匹配。

> 每条规则均可由 `stk verify` 机械判定。子 Agent 落盘后**必须**运行 `stk verify --file` 校验通过（见步骤 4），不得仅凭主观判断"格式对了"。

> `evidence?` 可选。汇总阶段（步骤 5a）对完全重复建议合并时会**追加**"来源：<agentName1> + <agentName2>"，故该字段允许在主流程中扩展，各子 Agent 初版输出无需预填合并来源。

**优化等级（`level`）字段**

每条 `suggestion` **必须**填 `level`，取值 `初级` / `中级` / `高级`。等级按 `target`（或工具/对象名）判定，而非按子 Agent 固定——同一个子 Agent（如 `tool-enable`）可能同时产出初级（RTK）与高级（Headroom）的 task。

判定规则（按优先级匹配，命中即定级）：

| 等级 | 命中条件（按 `target` / 对象名匹配） |
| ---- | ------------------------------------- |
| 初级 | `target` 或工具名为 `rtk` 之一（省 Token 工具类，安装即用、零配置）；或属于 Plugin 优化（子 Agent `plugin-opt` 产出，如 `disable-plugin` / `migrate-plugin` 类） |
| 高级 | `target` 为 `headroom`，或属于代码知识库类（子 Agent `knowledge-base` 产出，如 `graphify` / `codebase-memory-mcp` / `codegraph` / `gitnexus` 等） |
| 中级 | 其余所有：`caveman` / `caveman-*` / `ponytail` / `ponytail-*` / `karpathy-skills`、SKILL 优化、Agent 优化、MCP 优化、Rules 优化、Hook 审查、仓库专项等 |

> 同一 Agent 内部混合示例：`tool-enable` 中"启用 RTK"→ 初级，"启用 Headroom"→ 高级。各子 Agent 在输出时**逐条**按上表判定 `level`，不得整组统一标级。

`operationType` 取值同 `src/types/index.ts` 的 `OperationType`，含扩展值 `plugin-opt`、`agent-opt`、`knowledge-base`、`disable-plugin`、`migrate-plugin`；既有 `defer-mcp` 语义 = 在 `.mcp.json` 中对该 MCP server 设置 `"defer_loading": true`，使其工具按需加载而非常驻上下文。

## tasks.md 输出格式

核心原则：一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并。`action` 必须可直接执行。

```markdown
<!-- scenario: 代码编写 / 同仓 -->

# 优化建议：代码编写 / 同仓

## 1. 第三方工具启用

- [ ] 1.1 [初级] 启用 RTK（预估节省 ~XXX Token）
      原因：已安装未启用，CLI 透明代理省 Token
- [ ] 1.2 [高级] 启用 Headroom（预估节省 ~6200 Token）
      原因：已安装未启用，可提供 47-92% 上下文压缩

## 2. MCP 优化

- [ ] 2.1 [中级] 移除 mcp: skills-sec-audit（预估节省 ~XXX Token）
      原因：disabled 且无工具

## 3. 插件优化

- [ ] 3.1 [初级] 禁用 plugin: office-suite（预估节省 ~1000 Token）
      原因：purpose=code 与办公领域不符，全局启用浪费上下文
- [ ] 3.2 [初级] 将 plugin: react-ui-kit 从 user 迁移到 project 层（预估节省 ~1000 Token）
      原因：前端 UI 领域与当前前端项目强相关，全局常驻浪费其他项目

## 4. 子代理工具优化

- [ ] 4.1 [中级] 为 ponytail 声明最小 tools 列表（预估节省 ~XXX Token）
      原因：plugin 未声明 tools，全量加载

## 5. Skill 优化

- [ ] 5.1 [中级] 禁用 skill: ponytail-help（预估节省 ~48 Token）
      原因：帮助类 Skill，代码场景非高频

## 6. 知识图谱推荐

- [ ] 6.1 [高级] 启用 Graphify（预估节省 依赖图谱检索替代回读）
      原因：codeFileCount=42, topLanguages=[TypeScript,JavaScript]

## 7. 仓库专项

- [ ] 7.1 [中级] 排除 docs/ 出自动上下文（预估节省 ~3000 Token）
      原因：同仓，文档每次对话重复注入

## 8. Rules 优化

- [ ] 8.1 [中级] 规则 lint-rule 加 paths 作用域：src/**/*.ts（预估节省 ~XXX Token）
      原因：alwaysApply=true, paths=[]
- [ ] 8.2 [中级] 将 <memoryMd> 中"文档读取约定"拆分为 rules: doc-read（预估节省 ~XXX Token）
      原因：rulesTokens 整体偏大，项目级细节可下沉为按需加载规则

## 9. <memoryMd> 审查

- [ ] 9.1 [初级] 精简 <memoryMd> 至 ≤200 行（预估节省 ~XXX Token）
      原因：lines=73 含可推断数据流/架构描述，主文件每次会话全量注入，应下沉为 @docs/xxx.md 或 rules
- [ ] 9.2 [初级] 为 <memoryMd> 增加关键文件/目录索引
      原因：缺 Resource Map，AI 需自行探索文件系统

## 10. Hook 审查

- [ ] 10.1 [中级] 精简 hook: rtk（预估节省 ~XXX Token）
      原因：每次对话注入压缩提示

---

等级统计：初级 X 项 / 中级 X 项 / 高级 X 项
总计：预估节省 ~XXXXX Token (XX.X%)
```

每组标题对应实际启动的 Agent，跳过的 Agent 不出现。标题顺序固定：1.第三方工具启用 → 2.MCP 优化 → 3.插件优化 → 4.子代理工具优化 → 5.Skill 优化 → 6.知识图谱推荐 → 7.仓库专项 → 8.Command 优化 → 9.Rules 优化 → 10.<memoryMd> 审查 → 11.Hook 审查。每条一行 `- [ ] <N.M> [等级] 描述` + 原因缩进两空格，总计行末尾用 `---` 分隔。其中 `<N.M>` 为该 Task 的全局唯一编号：`N` 取所属组标题编号（如 `## 8.` 组内为 `8.x`），`M` 为组内从 1 递增的序号，供用户精确指定要执行的 Task。

## 边界

- 不做任何用户侧配置文件修改，仅产出 `suggestions-*.json` 与 `tasks.md` 等中间/最终产物。
- 子 Agent 落盘后**自行 `stk verify --file` 校验格式**（程序化死逻辑），失败覆盖重写，连续 3 次失败则标记该维度 `FAILED` 跳过（有限重试，不无限循环）。
- 汇总生成 `tasks.md` 后执行收尾清理（步骤 7）：删除 `suggestions-*.json` 与 `repo-analysis.json`（均经校验、安全），仅保留 `tasks.md` 及诊断/扫描产物。
- 无法估算节省时 `estimatedSavingTokens` 填 0 并在 `detail` 描述效果。
- 汇总阶段（步骤 5a）对同一 `target` 的重复/冲突建议做仲裁合并，tasks.md 中同一 `target` 只出现一条最终建议。
- 子 Agent 超时/失败 → 跳过该维度，汇总其余，摘要标注。
- tasks.md 一个条目对应一个具体操作，绝不合并。
- 所有 `action` 必须可执行，不得泛泛而谈。
- 各子 Agent 详细规则见 `agents/` 目录下对应文件，按需读取。
