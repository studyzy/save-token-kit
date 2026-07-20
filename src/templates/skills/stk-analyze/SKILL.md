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

**第一轮（必问）— 使用场景与用户角色：**

- 问题 1: 主要使用目的 → 代码编写 / 文档写作 / 通用办公 / 通用
- 问题 2: 代码与文档是否在同一仓库 → 是（同仓）/ 否（独立仓库）/ 不适用（纯文档/办公）
- 问题 3: 用户角色画像 → 前端开发 / 后端开发 / 测试 / 产品经理 / 全栈 / 其他

> 用户角色（`role`）用于精准判定 Plugin 的适用性：特定领域 Plugin（如前端 UI 套件、移动端 SDK）仅对对应角色的项目有价值，跨角色全局启用即为浪费。角色与 `purpose`/`sameRepo` 共同构成推荐依据。

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
  "role": "frontend|backend|test|pm|fullstack|other",
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
| `hasCodebuddyMd` | 是否存在项目级 CODEBUDDY.md     |
| `isMonorepo`     | 是否 monorepo                   |
| `scanError`      | 失败信息；成功为 `null`         |

排除目录：`node_modules` `.git` `dist` `build` `coverage` `.cache`。

**扫描失败处理**：`scanError` 非 null 时不阻塞问答；第二轮图谱询问降级为"无法推荐，请自行选择"；摘要标注扫描失败。

**步骤 3.5: 前置仓库调研（单独调用，非并行）**

扫描完成后、进入并行派发前，**单独调用一次**前置调研 Agent `00-repo-scan`（规则见 `@agents/00-repo-scan.md`），读取 `repo-scan.json` + `context.json`，产出 `save-token/repo-analysis.json`（含 `flags` 结构化结论 + `suggestions[]`）。

- 此 Agent **不进入阶段 3 并行列表**，由主流程在步骤 3 后单发。
- `flags`（如 `docsOverInjected` / `needsMonorepoSplit` / `needsIndex`）供并行子 Agent 01~10 按需读取，避免各 Agent 重复计算仓库特征。
- `suggestions[]` 由汇总阶段（步骤 5）直接消费进 tasks.md 第 7 组"仓库专项"，不再经由并行 suggestion 文件。
- 该 Agent 失败/超时 → 跳过仓库专项维度，汇总其余，摘要标注。

### 阶段 3: 并行子 Agent 派发

**步骤 4: 按对象存在性动态启动**

读取诊断报告，仅对**存在且非空**的对象启动对应子 Agent。对象为空 → 不启动，摘要标注跳过。

在**单条消息**中并行发起所有需启动的子 Agent（多次 `Agent` 调用）。每个子 Agent 接收：诊断报告相关字段 + `context.json` + `repo-scan.json`（按需），输出统一 Schema JSON 到 `save-token/suggestions-<agent-name>.json`。

任一子 Agent 失败/超时 → 跳过该维度，汇总其余，摘要标注。

**子 Agent 启动条件表**

| # | 子 Agent         | 关注对象                          | 启动条件                                | 详细规则                  |
|---|------------------|-----------------------------------|-----------------------------------------|---------------------------|
| 1 | `tool-enable`    | `toolDetection[]`                 | 数组非空                                | @agents/01-tool-enable.md |
| 2 | `mcp-opt`        | `mcpList[]`                       | 数组非空                                | @agents/02-mcp-opt.md     |
| 3 | `plugin-opt`     | `pluginList[]`                    | 数组非空                                | @agents/03-plugin-opt.md  |
| 4 | `agent-opt`      | `agentList[]`                     | 数组非空                                | @agents/04-agent-opt.md   |
| 5 | `skill-opt`      | `skillList[]`                     | 数组非空                                | @agents/05-skill-opt.md   |
| 6 | `knowledge-base` | `repo-scan.json` + `context.json` | 仓库超阈值 **且** `graphTool` 非 `none` | @agents/06-knowledge-base.md |
| 7 | `command-opt`    | `commandList[]`（主 Agent 从诊断报告提取后传入） | `commandList[]` 非空 | @agents/07-command-opt.md |
| 8 | `rules-opt`      | `ruleList[]`                      | 数组非空                                | @agents/08-rules-opt.md   |
| 9 | `codebuddy-md`   | `CODEBUDDY.md`（项目级）          | 文件存在                                | @agents/09-codebuddy-md.md |
| 10 | `hook-audit`     | `hookList[]`                      | 数组非空                                | @agents/10-hook-audit.md  |

> **注**：`00-repo-scan` 为前置调研 Agent，在阶段 2 步骤 3.5 单独调用（非并行），产出 `repo-analysis.json`，其 `suggestions[]` 由汇总阶段直接消费，不占并行名额。并行子 Agent 为 01~06、07-command-opt、08~10 共 10 个（`command-opt` 由主 Agent 从 `diagnosis-report.json` 的 `commandList[]` 提取后作为参数传入）。各子 Agent 统一以表中**新名**（如 `plugin-opt`/`agent-opt`/`skill-opt`/`command-opt`）标识，禁止输出旧名别名。

### 阶段 4: 汇总生成 tasks.md

**步骤 5: 合并与落盘**

读取 `save-token/suggestions-*.json` 全部文件，并额外读取前置调研产出 `save-token/repo-analysis.json` 的 `suggestions[]`（第 7 组"仓库专项"来源，非并行 suggestion 文件），合并所有 `suggestions[]`，按 `category` 分组，写入 `save-token/tasks.md`：

- 顶部注释：`<!-- scenario: <purpose 中文> / <同仓|异仓> -->`
- **一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并**
- 每条 Task 含可执行 `action`、预估节省 Token、原因
- 已跳过的子 Agent 在摘要区列出
- ID 在全文件范围重新编号（S1, S2, ...）保证唯一

**步骤 6: 输出摘要**

控制台打印：总计预估节省 Token 与百分比、`tasks.md` 路径、场景标注、已跳过子 Agent 列表、失败子 Agent 列表。

**⚠️ 必须提醒用户**：`save-token/tasks.md` 中的每条建议均需用户**仔细核对**。若某条不想执行，用户可直接在 `tasks.md` 中删除该行（或在执行 `stk-optimize` 前手动移除）。所有优化均为用户侧配置变更，工具不自动执行——确认无误后再调用 `stk-optimize` 执行选中的任务。

**步骤 7: 收尾清理中间产物**

`tasks.md` 落盘且摘要打印完成后，删除所有子 Agent 产出的中间 JSON，只保留最终 `tasks.md`（以及阶段 1/2 的诊断与扫描产物）：

```bash
rm -f save-token/suggestions-*.json
```

- 删除对象：阶段 3 并行子 Agent 01~10 的 `save-token/suggestions-<agent-name>.json`。
- **保留**：`tasks.md`、`diagnosis-report.md` / `diagnosis-report.json`、`repo-scan.json`、`repo-analysis.json`、`context.json`、`proxy-raw-body.json`。
- 前置调研 `repo-analysis.json` 同为中间产物，但其 `suggestions[]` 已并入 `tasks.md` 第 7 组，故一并删除：

```bash
rm -f save-token/repo-analysis.json
```

- 仅删除本次实际生成过的文件；未启动的子 Agent 无对应文件，`rm -f` 安全跳过。

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

**优化等级（`level`）字段**

每条 `suggestion` **必须**填 `level`，取值 `初级` / `中级` / `高级`。等级按 `target`（或工具/对象名）判定，而非按子 Agent 固定——同一个子 Agent（如 `tool-enable`）可能同时产出初级（RTK）与高级（Headroom）的 task。

判定规则（按优先级匹配，命中即定级）：

| 等级 | 命中条件（按 `target` / 对象名匹配） |
| ---- | ------------------------------------- |
| 初级 | `target` 或工具名为 `rtk`、`caveman`、`caveman-*`、`ponytail`、`ponytail-*`、`karpathy-skills` 之一（省 Token 工具类，安装即用、零配置）；或属于 Plugin 优化（子 Agent `plugin-opt` 产出，如 `disable-plugin` / `migrate-plugin` 类） |
| 高级 | `target` 为 `headroom`，或属于代码知识库类（子 Agent `knowledge-base` 产出，如 `graphify` / `codebase-memory-mcp` / `codegraph` / `gitnexus` 等） |
| 中级 | 其余所有：SKILL 优化、Agent 优化、MCP 优化、Rules 优化、Hook 审查、仓库专项等 |

> 同一 Agent 内部混合示例：`tool-enable` 中"启用 RTK"→ 初级，"启用 Headroom"→ 高级。各子 Agent 在输出时**逐条**按上表判定 `level`，不得整组统一标级。

`operationType` 取值同 `src/types/index.ts` 的 `OperationType`，含扩展值 `plugin-opt`、`agent-opt`、`knowledge-base`、`disable-plugin`、`migrate-plugin`；既有 `defer-mcp` 语义 = 在 `.mcp.json` 中对该 MCP server 设置 `"defer_loading": true`，使其工具按需加载而非常驻上下文。

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

## 3. 插件优化

- [ ] [初级] 禁用 plugin: office-suite（预估节省 ~1000 Token）
      原因：purpose=code 与办公领域不符，全局启用浪费上下文
- [ ] [初级] 将 plugin: react-ui-kit 从 user 迁移到 project 层（预估节省 ~1000 Token）
      原因：前端 UI 领域与当前前端项目强相关，全局常驻浪费其他项目

## 4. 子代理工具优化

- [ ] [中级] 为 ponytail 声明最小 tools 列表（预估节省 ~XXX Token）
      原因：plugin 未声明 tools，全量加载

## 5. Skill 优化

- [ ] [中级] 禁用 skill: ponytail-help（预估节省 ~48 Token）
      原因：帮助类 Skill，代码场景非高频

## 6. 知识图谱推荐

- [ ] [高级] 启用 Graphify（预估节省 依赖图谱检索替代回读）
      原因：codeFileCount=42, topLanguages=[TypeScript,JavaScript]

## 7. 仓库专项

- [ ] [中级] 排除 docs/ 出自动上下文（预估节省 ~3000 Token）
      原因：同仓，文档每次对话重复注入

## 8. Rules 优化

- [ ] [中级] 规则 lint-rule 加 paths 作用域：src/**/*.ts（预估节省 ~XXX Token）
      原因：alwaysApply=true, paths=[]
- [ ] [中级] 将 CODEBUDDY.md 中"文档读取约定"拆分为 rules: doc-read（预估节省 ~XXX Token）
      原因：rulesTokens 整体偏大，项目级细节可下沉为按需加载规则

## 9. CODEBUDDY.md 审查

- [ ] [初级] 精简 CODEBUDDY.md 至 ≤200 行（预估节省 ~XXX Token）
      原因：lines=73 含可推断数据流/架构描述，主文件每次会话全量注入，应下沉为 @docs/xxx.md 或 rules
- [ ] [初级] 为 CODEBUDDY.md 增加关键文件/目录索引
      原因：缺 Resource Map，AI 需自行探索文件系统

## 10. Hook 审查

- [ ] [中级] 精简 hook: rtk（预估节省 ~XXX Token）
      原因：每次对话注入压缩提示

---

等级统计：初级 X 项 / 中级 X 项 / 高级 X 项
总计：预估节省 ~XXXXX Token (XX.X%)
```

每组标题对应实际启动的 Agent，跳过的 Agent 不出现。标题顺序固定：1.第三方工具启用 → 2.MCP 优化 → 3.插件优化 → 4.子代理工具优化 → 5.Skill 优化 → 6.知识图谱推荐 → 7.仓库专项 → 8.Command 优化 → 9.Rules 优化 → 10.CODEBUDDY.md 审查 → 11.Hook 审查。每条一行 `- [ ]` + 原因缩进两空格，总计行末尾用 `---` 分隔。

## 边界

- 不做任何用户侧配置文件修改，仅产出 `suggestions-*.json` 与 `tasks.md` 等中间/最终产物。
- 汇总生成 `tasks.md` 后执行收尾清理（步骤 7）：删除 `suggestions-*.json` 与 `repo-analysis.json`，仅保留 `tasks.md` 及诊断/扫描产物。
- 无法估算节省时 `estimatedSavingTokens` 填 0 并在 `detail` 描述效果。
- 子 Agent 超时/失败 → 跳过该维度，汇总其余，摘要标注。
- tasks.md 一个条目对应一个具体操作，绝不合并。
- 所有 `action` 必须可执行，不得泛泛而谈。
- 各子 Agent 详细规则见 `agents/` 目录下对应文件，按需读取。
