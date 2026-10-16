# 第三方工具零写死重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 第三方工具的**检测、启用判定、建议事实、安装**全部下沉到规则库配置文件（`data.toolkits`），引擎与 SKILL 模板不再写死任何具体工具名；自定义规则库可增删改第三方工具而无需改代码。

**Architecture:** ①数据层：`data.toolkits` 每项扩展 `detect`/`enabled`（原语+all/any 组合器的声明式规格）、`description`/`saving`/`level`/`estTokens`/`category` 建议事实；②引擎层：删除 13 个 `impl/*.ts`，新建 `spec.ts`（规格评估器）+ `data-registry.ts`（运行时注册表，从 merged.toolkits 构建）+ `handlers/rtk-native.ts`（rtk 安装特例 named handler，唯一保留的引擎侧工具代码）；③诊断层：`diagnose.ts` 的 7 处工具特例改由规格评估器 + 上下文注入统一处理；④模板层：level 表/估算表/知识库名单改为 toolkit-meta 新视图渲染。

**Tech Stack:** TypeScript strict / ESM（NodeNext），vitest，unbuild。

---

## 背景与已确认决策（执行者必读）

### 四个已拍板的架构决策（2026-10-10 用户确认）

1. **rtk 安装特例**：数据声明 `install.handler: 'rtk-native'`，引擎保留这一个 named handler（RTK.md 模板写入、hook 注入、native fallback 逻辑整体移植）。写死量从 13 个文件缩到 1 个 handler。
2. **13 个 `src/toolkits/impl/*.ts` 全部删除**：检测/启用/安装全走数据引擎；`ToolkitId` 联合类型改为 `string`。
3. **per-tool 建议事实进 data.toolkits**：`level`（初级/中级/高级）、`estTokens`（默认估算）、`category`（`'knowledge-base'` 或缺省）、`description`、`saving`；引擎注入 `ToolkitDetection` 供子 Agent 直读，模板用占位对渲染判定表。
4. **检测规格 = 原语 + 组合器**：`detect`/`enabled` 各为一条规格；宽松校验（字段在场才校形态），未知 `kind` 拒绝。

### 当前写死位置（重构目标清单）

| 位置                                | 写死内容                                                                                                                                | 去向                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `src/types/index.ts:75-88`          | `ToolkitId` 联合类型（13 id）                                                                                                           | 改 `string`                      |
| `src/toolkits/impl/*.ts`（13 文件） | detect/isEnabled/installCommand/verifyCommand/description/savingEstimate                                                                | 删除，数据化；rtk 移植为 handler |
| `src/commands/diagnose.ts:374-451`  | 7 处 enabled 探测特例（rtk hook / headroom 进程+MCP / ponytail & i-have-adhd proxy 标记 / gitnexus、codebase-memory、context-mode MCP） | 规格评估器统一处理               |
| 模板 toolkit-enable.md              | level 判定表、estTokens 估算清单、知识库名单（prose 多处）、工具名清单                                                                  | 占位对渲染 + category 过滤       |
| 模板 knowledge-base.md              | 4 工具名单、展示名映射                                                                                                                  | 占位对渲染                       |

### 检测原语清单（覆盖现有 13 工具的全部探测形态）

评估器签名：`evaluateSpec(spec: ToolkitSpec, ctx: SpecContext): Promise<boolean>`。
`SpecContext = { home: string; mcpList: McpEntry[]; hookList: HookEntry[]; proxyParsed: ProxyDiagnosisData | null; adapter: getAdapter 结果 }`（由 diagnose 注入；独立调用时可传最小上下文）。

| kind             | 参数                                                                   | 语义                                                                                                    | 现有出处                                                                                                    |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `command`        | `name: string`                                                         | `commandExists(name)`                                                                                   | rtk / lean-ctx / headroom 等 cli 类 detect                                                                  |
| `path`           | `path: string`                                                         | `exists(expandHome(path))`，`~` 展开                                                                    | caveman marketplace 目录、codebase-memory 安装目录                                                          |
| `mcp`            | `names: string[]`；`source?: 'fs' \| 'proxy' \| 'any'`（默认 `'any'`） | fs 源：`mcpList` 中 name ∈ names 且 status==='enabled'；proxy 源：`proxyParsed.mcpServers` name ∈ names | codebase-memory / codegraph / gitnexus / context-mode（含 `plugin_context-mode_context-mode` 命名空间形态） |
| `plugin-enabled` | `key: string`                                                          | `~/.codebuddy/settings.json` 的 `enabledPlugins[key] === true`                                          | caveman                                                                                                     |
| `proxy-plugin`   | `name: string`                                                         | `proxyParsed.detectedPlugins?.includes(name)`                                                           | ponytail / i-have-adhd                                                                                      |
| `hook`           | `event: string`；`match: string`                                       | `hookList` 中 event 匹配且 command 含 match                                                             | rtk enabled                                                                                                 |
| `process`        | `pattern: string`                                                      | `pgrep -af` 输出正则匹配（沿用 diagnose.ts 的 `isHeadroomProxyRunning` 实现，泛化参数）                 | headroom enabled                                                                                            |
| 组合器           | `{ all: Spec[] }` / `{ any: Spec[] }`                                  | 嵌套不超过 3 层                                                                                         | headroom 复合条件                                                                                           |

### 13 工具规格映射表（Task 3 数据落地必须逐项核对 impl 原文件）

> 执行时**逐个读 `git show <base>:src/toolkits/impl/<id>.ts`** 核对，不得凭本表臆断。base = 迁移前基线 `0ded8eb`。

| id              | detect                                             | enabled                                                                | 备注                                                                                                   |
| --------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| rtk             | `command:rtk`                                      | `hook PreToolUse match rtk`                                            | handler rtk-native；detectToolkitsViaRegistry 的 hook 特例同时存在（评估器统一后二选一，以 spec 为准） |
| caveman         | `path ~/.codebuddy/plugins/marketplaces/caveman/`  | `plugin-enabled caveman@caveman`                                       |                                                                                                        |
| headroom        | `command:headroom`                                 | `all[process pattern headroom…proxy, mcp names[headroom]]`             | 原 enabled = 进程 AND MCP                                                                              |
| lean-ctx        | `command:lean-ctx`                                 | 缺省（cli 类默认 false）                                               |                                                                                                        |
| graphify        | 按 impl 原文件（推测 command:graphify）            | 缺省                                                                   | 核对后定                                                                                               |
| ponytail        | 按 impl 原文件                                     | `any[原 isEnabled, proxy-plugin ponytail]`                             | 原 diagnose 用 proxy 标记覆盖 installed                                                                |
| i-have-adhd     | 按 impl 原文件                                     | `any[原 isEnabled, proxy-plugin i-have-adhd]`                          | 同上                                                                                                   |
| karpathy-skills | 按 impl 原文件                                     | 缺省                                                                   |                                                                                                        |
| gitnexus        | `mcp names[gitnexus] source fs`（推测）            | `mcp names[gitnexus]`                                                  | 原 markInstalledFromMcp                                                                                |
| tokenjuice      | 按 impl 原文件（推测 command）                     | 缺省                                                                   |                                                                                                        |
| codebase-memory | `mcp names[codebase-memory]`（`.mcp.json` 键存在） | `mcp names[codebase-memory]`                                           |                                                                                                        |
| codegraph       | 按 impl 原文件（推测 mcp）                         | `mcp names[codegraph]`                                                 |                                                                                                        |
| context-mode    | 按 impl 原文件                                     | `mcp names[context-mode, plugin_context-mode_context-mode] source any` | 插件机制安装，可能不在磁盘 .mcp.json                                                                   |

### 数据 schema 示例（data.toolkits 条目，全部可选新增）

```json
{
  "id": "rtk",
  "type": "cli",
  "description": "RTK — 终端命令输出压缩 ~89%",
  "saving": "~89% 命令输出压缩",
  "level": "初级",
  "estTokens": 50000,
  "category": "knowledge-base",
  "detect": { "kind": "command", "name": "rtk" },
  "enabled": { "kind": "hook", "event": "PreToolUse", "match": "rtk" },
  "install": {
    "default": "brew install rtk",
    "verify": "rtk gain",
    "config": { "default": "rtk init -g --agent {agent}" },
    "handler": "rtk-native"
  }
}
```

- `{agent}` 占位符在执行期替换（现有 `getConfigCommand(agent, global)` 的数据化等价物）；`-g` 语义由执行器按 global 拼接或 handler 处理，schema 不表达条件分支。
- `detect` 缺失 → 该工具**不参与诊断检测**（仅出现在建议渲染中）；`enabled` 缺失 → cli 类默认 false、plugin 类默认 = installed（沿用 `BaseSaveTokenToolkit` 语义）。
- `level` ∈ 初级/中级/高级（复用 `VALID_LEVELS`）；`estTokens` 非负整数；`category` 当前仅 `'knowledge-base'`。

### 版本与兼容

- `packVersion` 1.1.0 → 1.2.0；`schemaVersion` 保持 1（纯可选新增，旧格式包向后兼容——无 `detect` 的条目不参与检测但不报错）。
- FR-001 parity 保持：`src/rules/fallback.json` 与 `rules/stk-rules.json` 逐字节一致。
- 模板占位对产物幂等语义不变。

### 关键消费方清单（改动波及面，已核实）

- `src/commands/install.ts` — `getToolkit/getAllToolkits`（改为 data-registry 同签名）
- `src/commands/diagnose.ts:374-451` — `detectToolkitsViaRegistry` + headroomToolkit 等具名导入（全部重写）
- `src/toolkits/{index,registry,types}.ts` — 重构为 data-registry 核心；`SaveTokenToolkit` 接口由 `DataToolkit` 替代
- `tests/` — 凡 import `impl/*` 或 `rtkToolkit` 等具名导出的测试需改写（执行时 grep 确定）；`tests/unit/toolkits/` 若有检测断言需迁移到 spec evaluator 测试
- 报告渲染消费 `ToolkitDetection.recommendedSaving` → 数据 `saving` 注入，字段名不变

---

### Task 1: 类型层 — ToolkitSpec 与建议事实字段

**Files:**

- Modify: `src/types/rules.ts`（`ToolkitCatalogEntry` 扩展）
- Modify: `src/types/index.ts`（`ToolkitId` → `string`；新增 `ToolkitSpec`）

**Step 1: rules.ts 扩展 `ToolkitCatalogEntry`**

```ts
/** Declarative detection/enabled spec (primitives + all/any combinators). */
export interface ToolkitSpec {
  kind?: 'command' | 'path' | 'mcp' | 'plugin-enabled' | 'proxy-plugin' | 'hook' | 'process'
  name?: string
  names?: string[]
  path?: string
  key?: string
  event?: string
  match?: string
  pattern?: string
  source?: 'fs' | 'proxy' | 'any'
  all?: ToolkitSpec[]
  any?: ToolkitSpec[]
}

export interface ToolkitInstallSpec {
  default?: string
  verify?: string
  config?: { default?: string; byAgent?: Record<string, string> }
  handler?: string
  byAgent?: Record<string, string>
}
```

`ToolkitCatalogEntry` 追加可选字段：`description?: string`、`saving?: string`、`level?: Level`、`estTokens?: number`、`category?: 'knowledge-base'`、`detect?: ToolkitSpec`、`enabled?: ToolkitSpec`、`install` 类型从 `{ default?: string; byAgent?: ... }` 扩展为 `ToolkitInstallSpec`（兼容既有 `default`/`byAgent` 字段）。

**Step 2: index.ts** — `ToolkitId` 改为 `export type ToolkitId = string`（保留导出名避免大面积改 import），`ToolkitDetection.name: string`。此时编译会因 impl 文件类型冲突报错——**本任务允许编译暂时红**（Task 5 删除 impl），但 `pnpm build` 之外的 vitest 单文件可先跳过；或将 impl 文件的 `readonly name: ToolkitId = 'rtk'` 临时改为 `as ToolkitId` 断言。**推荐后者**（小 diff，Task 5 删文件时一并消失）。

**Step 3: Commit**

```bash
git commit -m "feat(types): ToolkitSpec 规格类型与建议事实字段，ToolkitId 放宽为 string"
```

---

### Task 2: loader — 规格宽松校验 validateToolkitSpec（TDD）

**Files:**

- Test: `tests/unit/rules/loader.test.ts`
- Modify: `src/rules/loader.ts`（`validateToolkitMeta` 内追加或并列新函数）

**Step 1: 先写失败测试**（追加用例，风格同既有 toolkit meta 校验用例）：

1. 合法规格通过（每种 kind 各一 + all/any 嵌套）
2. 未知 `kind` → 拒绝，信息含 `toolkits[id].detect`
3. `command` 缺 `name` → 拒绝；`path` 缺 `path` → 拒绝；`mcp` 缺 `names` → 拒绝；`plugin-enabled` 缺 `key` → 拒绝；`proxy-plugin` 缺 `name` → 拒绝；`hook` 缺 `event`/`match` → 拒绝；`process` 缺 `pattern` → 拒绝
4. 组合器嵌套超 3 层 → 拒绝
5. `install.handler` 非字符串 → 拒绝；`install.verify` 非字符串 → 拒绝
6. `level` 非 初级/中级/高级 → 拒绝；`estTokens` 负数 → 拒绝
7. 旧格式（无新字段）通过；未知字段放行

**Step 2:** 跑测试见红。

**Step 3: 实现** `validateToolkitSpec(toolkits)`（递归校验组合器；kind 白名单硬编码在引擎——这是**语法**而非工具事实，不算写死）。挂入 `validateToolkitMeta` 同级循环。

**Step 4:** 见绿 + 全量 `pnpm test`。

**Step 5: Commit**

```bash
git commit -m "feat(rules): loader 新增 detect/enabled/install 规格宽松校验"
```

---

### Task 3: 数据落地 — 13 工具规格映射 + 建议事实 + packVersion 1.2.0

**Files:**

- Modify: `src/rules/fallback.json` + `rules/stk-rules.json`（cp 同步）
- Test: `tests/unit/rules/data-parity.test.ts`

**Step 1: 逐项核对 impl 原文件**（`git show 0ded8eb:src/toolkits/impl/<id>.ts` + `src/commands/diagnose.ts:374-451` 当前版），按上方「13 工具规格映射表」把 `detect`/`enabled`/`install.default`/`install.verify`/`install.config`/`description`/`saving`/`level`/`estTokens`/`category` 写入 13 个条目。

事实来源对照：

- `level`/`estTokens` 取自 toolkit-enable.md 现有「level 判定」与「estimatedSavingTokens 估算口径」两表（rtk=初级/50000、caveman=中级/30000、headroom=高级/60000、context-mode=中级/40000、karpathy-skills=中级/10000、i-have-adhd=中级/10000；ponytail/lean-ctx/graphify 等按表中实际值；知识库 4 工具 level 不在 toolkit-enable 表中 → 标 `category: 'knowledge-base'`，level 按 knowledge-base.md 实际语义或留空）
- `category: 'knowledge-base'`：graphify / codebase-memory / codegraph / gitnexus
- `saving` = 原 impl 的 `savingEstimate`；`description` = 原 impl 的 `description`

**Step 2:** `cp src/rules/fallback.json rules/stk-rules.json`，跑 data-parity。

**Step 3: data-parity 补断言**：rtk 有 `detect.kind === 'command'`、caveman 有 `enabled.kind === 'plugin-enabled'`、知识库 4 项 `category === 'knowledge-base'`、headroom `enabled.all` 长度 2、packVersion 1.2.0。

**Step 4:** 全量测试 + lint（若 loader 校验拒绝某条目会在此暴露）。

**Step 5: Commit**

```bash
git commit -m "feat(rules): fallback.json 落地 13 工具检测/启用/安装规格与建议事实，packVersion 1.2.0"
```

---

### Task 4: 引擎规格评估器 evaluateSpec（TDD）

**Files:**

- Create: `src/toolkits/spec.ts`
- Test: `tests/unit/toolkits/spec.test.ts`（目录不存在则新建）

**Step 1: 先写失败测试**——每种 kind 一组（mock `SpecContext`：command 用一个必然存在与必然不存在的命令名；path 用 tmpdir；mcp/hook/plugin-enabled/proxy-plugin 用构造的 ctx；process 用 mock 注入 pgrep 执行函数避免真跑进程）+ all/any 组合 + 嵌套深度 + 未知 kind 抛错。

> 设计要求：`process` 原语把 shell 调用注入为可替换参数（`runProcess?: (pattern: string) => Promise<string>`，默认 pgrep 实现），保证可测。`command` 同理可注入 `commandExists`。

**Step 2:** 见红。

**Step 3: 实现** `evaluateSpec(spec, ctx)`：switch kind → 各原语；`all`/`any` 递归（深度 ≤3 已由 loader 校验，运行时防御性截断可不做）。所有 I/O 失败按 false 处理（宁漏不误，沿用原 impl 的 try/catch 语义）。

**Step 4:** 见绿 + 全量。

**Step 5: Commit**

```bash
git commit -m "feat(toolkits): 声明式检测规格评估器 evaluateSpec"
```

---

### Task 5: data-registry + rtk handler + 删除 impl（核心任务）

**Files:**

- Create: `src/toolkits/data-registry.ts`
- Create: `src/toolkits/handlers/rtk-native.ts`（从 `src/toolkits/impl/rtk.ts` 移植）
- Modify: `src/toolkits/index.ts`、`src/toolkits/registry.ts`、`src/toolkits/types.ts`
- Delete: `src/toolkits/impl/`（13 文件）
- Modify: `src/commands/install.ts`
- Test: `tests/unit/toolkits/data-registry.test.ts` + 受影响既有测试改写

**Step 1: 先写失败测试**（data-registry.test.ts）：

1. 从构造的 merged.toolkits 构建注册表：`getAllToolkits()` 返回 13 项、`getToolkit('rtk')` 存在、`getToolkit('nonexistent')` undefined
2. `buildDetection()`：detect spec 命中/不命中 → installed true/false；enabled 缺省语义（cli 默认 false、plugin 默认 = installed）
3. `recommendedSaving` 来自数据 `saving` 字段
4. generic install：mock shell runner，按序执行 `install.default` → `install.config`（byAgent 优先，`{agent}` 占位符替换），步骤结果聚合
5. `install.handler: 'rtk-native'` → 路由到 handler（handler 单独直测其 install 流，移植原 rtk.test 逻辑——若 tests 中已有 rtk 测试则迁移改写）
6. 数据缺 `detect` 的条目不进注册表

**Step 2:** 见红。

**Step 3: 实现**：

- `data-registry.ts`：`buildRegistry(merged: MergedRules, deps: { commandExists, runProcess, runShell })` → `DataToolkit implements 最小接口 { name, description, type, detect(), isEnabled(), buildDetection(), install(global, agent) }`。generic install 读 `install.default`/`install.verify`/`install.config`；`handler` 命中 `HANDLERS['rtk-native']` 时整体委托（handler 从 data 读 installCommand，逻辑移植自 impl/rtk.ts，`RTK_DOC` 模板随迁）。
- `registry.ts`：模块级缓存 `getRegistry()`（进程内构建一次，复用 loadRules 的 merged 快照——由调用方注入还是内部 loadRules？**内部 loadRules**，与 diagnose 现状一致）。
- `index.ts`：导出 `getAllToolkits/getToolkit/getToolkitIds`（签名不变）+ `buildRegistry`/`evaluateSpec` 供 diagnose 注入上下文；删除全部 impl re-export。
- 删除 `src/toolkits/impl/` 与 `src/toolkits/types.ts` 中死代码（`SaveTokenToolkit`/`BaseSaveTokenToolkit` 若仅 impl 使用则删，`InstallStep`/`InstallResult` 移到 data-registry 或保留）。

**Step 4: 改 `src/commands/install.ts`**：逻辑不变，仅 `toolkit.installCommand` 展示改为数据 `install.default`（`DataToolkit` 上保留同名只读属性最小化 diff）。

**Step 5:** 全量测试（受影响测试改写到新接口；**不**放宽断言语义）+ lint + build。

**Step 6: Commit**

```bash
git commit -m "refactor(toolkits): 检测/安装全量数据驱动，删除 13 个 impl，rtk 收编为 named handler"
```

---

### Task 6: diagnose.ts 特例清除

**Files:**

- Modify: `src/commands/diagnose.ts:374-451`

**Step 1: 先写失败测试**（`tests/unit/commands/diagnose.test.ts` 或就近位置追加）：

1. 构造 fs/proxy 上下文：hook 含 rtk → rtk enabled=true
2. proxy mcpServers 含 `plugin_context-mode_context-mode` → context-mode enabled
3. mcpList gitnexus enabled → gitnexus enabled 且 installed 被覆盖
4. proxy detectedPlugins 含 ponytail → ponytail installed 覆盖
5. headroom：无进程无 MCP → enabled false

**Step 2:** 见红。

**Step 3: 实现**：`detectToolkitsViaRegistry` 重写为——构建 `SpecContext`（fs.mcpList/hookList/proxyParsed）→ 遍历注册表 `buildDetection(ctx)`；删除 `isHeadroomProxyRunning` 特例（逻辑沉入 process 原语）与全部具名导入。`headroomToolkit.setMcpEnabled` 类副作用接口随 impl 删除而消失。

**Step 4:** 见绿 + 全量（含 integration/diagnose）。

**Step 5: Commit**

```bash
git commit -m "refactor(diagnose): 工具检测特例清除，统一走声明式规格评估"
```

---

### Task 7: 渲染层 — toolkit-meta 新视图 levels/est/names（TDD）

**Files:**

- Test: `tests/unit/rules/render.test.ts`
- Modify: `src/rules/render.ts`

**Step 1: 先写失败测试**：

1. `toolkit-meta/levels` → `| 工具 | level |` 表（level 字段在场条目）
2. `toolkit-meta/est` → `| 工具 | 默认估算 (tokens) |` 表
3. `toolkit-meta/names category=knowledge-base` → 逗号分隔名单（graphify, codebase-memory, codegraph, gitnexus，插入序）
4. category 过滤与 only/exclude 正交；零项保留兜底语义复用
5. 幂等 + 无占位标记

**Step 2:** 见红。

**Step 3: 实现**：`TOOLKIT_RE` 的 `(links|agents)` 扩为 `(links|agents|levels|est|names)`，`renderToolkitTables` 增加分支；names 视图行内无表格（纯名单 + 前置说明由模板兜底承载）；`category=` 过滤参数并入 mode/list 语法（`category=knowledge-base` 与 only/exclude 并存）。

**Step 4:** 见绿 + 全量。

**Step 5: Commit**

```bash
git commit -m "feat(rules): toolkit-meta 新增 levels/est/names 视图与 category 过滤"
```

---

### Task 8: 模板零写死改造

**Files:**

- Modify: `src/templates/skills/stk-analyze/agents/toolkit-enable.md`
- Modify: `src/templates/skills/stk-analyze/agents/knowledge-base.md`

**Step 1: toolkit-enable.md**

1. 「level 判定」表 → `toolkit-meta/levels exclude-category=knowledge-base`（或 exclude=知识库 4 id）占位对渲染，表列头与判定逻辑说明保留
2. 「estimatedSavingTokens 估算口径」逐工具默认值清单 → `toolkit-meta/est` 渲染 + 估算**公式**保留为 prose（公式是逻辑不是事实）
3. 「角色与目标」「职责边界」中的工具名清单（rtk / caveman / …）→ `toolkit-meta/names` 渲染或删除枚举改为「规则库 data.toolkits 全量工具」表述
4. 知识库名单（prose 多处）→ `toolkit-meta/names category=knowledge-base`
5. rtk 特例文案：保留（是部署侧约定 + agentNotes 已有注记），但「RTK」实体名不可移除——**特例规则本身允许保留**（它是判定逻辑的一部分，已获用户裁决）

**Step 2: knowledge-base.md**

1. 4 工具名单与展示名映射表 → `toolkit-meta/names category=knowledge-base` + 展示名若需保留则进数据（`displayName` 字段，Task 7 一并渲染）或简化用 id
2. 规模阈值/判定规则（逻辑）保留 prose
3. smoke 测试更新（render.test.ts 既有真实模板渲染用例）：断言无占位残留、无 `rtk|caveman|ponytail` 等硬编码 id 残留于**清单性**文案（特例与判定规则中允许出现的除外——断言范围以实际改写结果为准，宁窄勿误报）

**Step 3:** 全量测试 + lint。

**Step 4: Commit**

```bash
git commit -m "feat(templates): toolkit-enable/knowledge-base 工具清单/level/估算全面数据渲染，消除硬编码"
```

---

### Task 9: 收尾验证

**Step 1:** `make build && make cover && make lint` 全过。

**Step 2:** 功能冒烟（真实环境）：

```bash
node dist/cli.mjs diagnose --agent codebuddy   # 确认 toolkitDetection 正常产出 13 项
node dist/cli.mjs install rtk -g --agent codebuddy --dry-run 2>/dev/null || echo "无 dry-run 则跳过实际安装"
node dist/cli.mjs init --force --agent codebuddy   # 刷新本机 SKILL，确认渲染产物无占位残留
```

**Step 3:** `graphify update .`。

**Step 4:** 最终整体 code review（对照本计划逐 Task 验收）+ 汇报：删除行数/新增行数、写死残留 grep 证明（`grep -rn "rtk\|caveman\|headroom\|ponytail" src/ --include="*.ts"` 仅剩 handler 与类型注释）、测试结果。

---

## 风险与注意事项

1. **行为等价性是红线**：重构后 13 工具的检测结果必须与旧实现一致——Task 5/6 的测试改写必须**保留旧断言语义**（用相同 mock 上下文），Task 9 冒烟在真实环境二次确认。
2. **rtk hook 特例双轨**：旧代码里 diagnose.ts 的 hook 特例与 impl 的 `_hookEnabled` 是两条路径，数据化后合并为 spec 的 hook 原语——映射表中标注了这一点，执行时以 spec 单轨为准，勿留双写。
3. **`ToolkitId` 放宽的代价**：编译期失去 13 id 收窄；`stk verify` 若校验 `target` ∈ ToolkitId 需同步放宽为「注册表内存在」（执行时 grep `src/commands/verify.ts` 确认）。
4. **install.byAgent vs install.config.byAgent 结构重叠**：上一轮迁移引入的平铺 `install.byAgent` 与本计划的 `install.config.byAgent` 语义不同（前者是「按 agent 的完整安装命令」、后者是「按 agent 的配置命令」）。**保持两个字段并存**（上一轮消费方 install-toolkit.md 引用前者），在 schema 注释中写清区别。
5. **测试环境**：command/process 原语依赖真实 shell，测试一律走注入 mock；真实 shell 仅 Task 9 冒烟使用。
