# 功能规范: 重构 stk-analyze SKILL（多子Agent并行优化方案生成）

**功能分支**: `002-stk-analyze-rebuild`
**创建时间**: 2026-07-13
**状态**: 草稿
**输入**: 用户描述: "我希望重构整个 src/templates/skills/stk-analyze/SKILL.md ，我的目的是收集用户的使用场景，收集当前仓库的代码和文档（方便推荐代码知识图谱工具），然后根据收集的信息，结合 save-token/diagnosis-report.md ，开启多个子Agent来提供Token节省的改造方案，每个子Agent有自己专注的优化点，如果关注的对象不存在则不用开启这个子Agent（比如MCP优化Agent，如果我们没有MCP，则无需开启）。每个子Agent的输出应该都是json文件放到save-token文件夹，而且应该是统一的Schema。等所有子Agent执行完毕后stk-analyze这个SKILL再汇总大家的优化建议，并最终形成一个tasks.md文件。"

## 用户场景与测试 _(必填)_

### 用户故事 1 完整跑通"诊断 → 分析 → 待办"链路 (优先级: P1)

作为一名刚完成 `stk diagnose` 的开发者，我希望运行 `/stk-analyze` 后，SKILL 能自动收集我的使用场景与当前仓库的代码/文档情况，并行派出多个子 Agent 从不同维度给出 Token 节省建议，最终在 `save-token/` 目录下得到一份汇总的 `tasks.md` 待办清单，从而我可以直接照单执行优化。

**优先级原因**: 这是 stk-analyze 的核心价值闭环；没有这一完整链路，重构后的 SKILL 无法独立交付价值。

**独立测试**: 可以通过在一个已经产生 `diagnosis-report.json` 的项目里触发 `/stk-analyze`，验证 `save-token/tasks.md` 是否生成且内容非空来完成测试并交付"一键优化待办"价值。

**验收场景**:

1. **给定** `save-token/diagnosis-report.json` 存在且 `scanTimestamp` 在 5 分钟内，**当** 用户触发 `/stk-analyze`，**那么** SKILL 跳过重新诊断、直接进入上下文收集阶段。
2. **给定** 诊断报告已过期或缺失，**当** 用户触发 `/stk-analyze`，**那么** SKILL 提示用户先运行 `stk diagnose` 并停止后续步骤，不产生任何输出文件。
3. **给定** 诊断报告有效，**当** 上下文收集完成，**那么** SKILL 派出多个并行子 Agent，每个子 Agent 针对诊断报告中存在的一类对象（工具/Skill/MCP/Plugin/Hook/规则/配置文件/仓库代码文档）产出建议。
4. **给定** 所有子 Agent 执行完毕，**当** SKILL 进入汇总阶段，**那么** `save-token/tasks.md` 生成，包含分组待办项、每项可执行、顶部标注场景信息、列出已跳过的子 Agent。
5. **给定** 诊断报告中不存在某类对象（例如 `mcpList` 为空），**当** SKILL 派发子 Agent，**那么** 对应的 MCP 优化子 Agent 不被启动，且在最终摘要中标注为"已跳过"。

### 用户故事 2 仓库代码与文档采集以推荐知识图谱工具 (优先级: P1)

作为一名在大型代码仓库中工作的开发者，我希望 `/stk-analyze` 在调研阶段实际扫描当前仓库的代码文件、文档文件规模与结构，并结合仓库特征（语言分布、目录组织、是否已有 CODEBUDDY.md 等），**向我询问对代码知识图谱工具的倾向性**（Graphify / Codebase-Memory MCP / CodeGraph / GitNexus 等），并根据仓库特征给出推荐，从而我可以通过图谱检索替代大块源码回读来节省 Token。

**优先级原因**: 这是本次重构相对旧版 SKILL 的关键新增点；旧版仅凭工具检测结果推荐启用，缺少对仓库实际规模的判断依据，也从未给用户选择空间。

**独立测试**: 可以通过在一个包含较多代码/文档文件的仓库中运行 `/stk-analyze`，验证是否在问答阶段出现图谱工具倾向性选择问题，以及后续子 Agent 是否根据用户选择 + 仓库规模生成精准推荐来完成测试。

**验收场景**:

1. **给定** 当前仓库存在 ≥ 1 个代码文件或文档目录，**当** 仓库扫描阶段运行，**那么** 统计代码文件数、文档文件数、代码总行数量级、文档总行数量级、主流编程语言、是否有 `CODEBUDDY.md`，并将结果写入 `repo-scan.json`。
2. **给定** 仓库代码/文档规模超过"值得使用图谱"的阈值，**当** 调研问答阶段，**那么** SKILL 通过 `AskUserQuestion` 向用户询问对代码知识图谱工具的倾向性，列出已知工具（Graphify / Codebase-Memory MCP / CodeGraph / GitNexus / 暂不需要），并附带基于仓库特征的推荐选项（标注"推荐"）。
3. **给定** 用户在图谱倾向性问题中选择"暂不需要"，**当** 后续派发知识图谱推荐子 Agent，**那么** 该子 Agent 不生成任何安装类建议，仅在输出中标明"用户已选择不使用图谱工具"。
4. **给定** 用户选择了某个具体图谱工具，**当** 知识图谱推荐子 Agent 运行，**那么** 建议的 `target` 字段为用户所选工具名称，`detail` 中包含仓库规模依据与选择理由。
5. **给定** 仓库极小（例如代码文件 < 5 个），**当** 调研问答阶段，**那么** 不询问图谱工具倾向性问题，也不启动知识图谱推荐子 Agent。

### 用户故事 3 子 Agent 输出统一 Schema 便于汇总 (优先级: P2)

作为后续维护者或自动汇总逻辑，我希望每个子 Agent 都把建议写入 `save-token/` 下一个独立 JSON 文件，且所有子 Agent 输出遵循同一 Schema，从而汇总阶段可以无差别地遍历这些文件合并建议，而不必为每个子 Agent 写定制解析器。

**优先级原因**: 统一 Schema 是"多子 Agent 并行 + 中央汇总"架构成立的前提；缺少它则汇总逻辑脆弱、易错。

**独立测试**: 可以通过人工模拟两个子 Agent 各产出一个 JSON 文件，再触发汇总逻辑，验证是否能正确合并为单一 `tasks.md` 来完成测试。

**验收场景**:

1. **给定** 子 Agent 名称集合为 `{tool-enable, mcp-opt, model-opt, defer-tools, skill-trim, knowledge-base, repo-scan, ...}`，**当** 每个子 Agent 完成，**那么** 在 `save-token/` 下出现形如 `suggestions-<agent-name>.json` 的文件。
2. **给定** 任意一个子 Agent 输出 JSON，**当** 校验其结构，**那么** 顶层包含 `agentName`、`category`、`generatedAt`、`suggestions[]`，每条 suggestion 含 `id/title/detail/operationType/target/estimatedSavingTokens/risk/reversible/scenario` 字段。
3. **给定** 多个子 Agent 输出文件，**当** 汇总阶段读取，**那么** 所有 `suggestions[]` 被合并、按 `category` 分组写入 `tasks.md`，ID 在全文件范围内重新编号以保证唯一。
4. **给定** 某子 Agent 未启动（对象不存在），**当** 汇总阶段扫描 `save-token/`，**那么** 不存在对应文件，汇总逻辑跳过该分组并在摘要中记录。

### 用户故事 4 旧版 SKILL 内容被完整替换 (优先级: P2)

作为仓库维护者，我希望本次重构直接覆盖 `src/templates/skills/stk-analyze/SKILL.md`，新内容在结构上明确体现"收集场景 → 收集仓库 → 派发子 Agent → 汇总 tasks.md"四阶段，旧版中分散的子 Agent 定义被重新组织为"按对象存在性条件启动"的统一约定。

**优先级原因**: 保证重构成果落到目标文件，避免新旧逻辑并存造成歧义。

**独立测试**: 可以通过对比重构前后 SKILL.md 的章节标题与子 Agent 启动条件描述来完成测试。

**验收场景**:

1. **给定** 重构完成，**当** 阅读 `src/templates/skills/stk-analyze/SKILL.md`，**那么** 文档明确包含四个阶段章节：上下文与场景收集、仓库代码/文档采集、并行子 Agent 派发、汇总生成 tasks.md。
2. **给定** 文档中每个子 Agent 条目，**当** 检查其启动条件，**那么** 条件以"诊断报告中某对象存在/非空"形式表达，对象不存在时不启动该子 Agent。
3. **给定** 文档中"统一 Schema"章节，**当** 检查字段定义，**那么** 与 `src/types/index.ts` 中 `AnalysisSuggestion` 字段一致（可扩展 `scenario`、`evidence` 等新字段）。
4. **给定** 旧版中"一个 SKILL 一个 Task、一个工具一个 Task"原则，**当** 重构后，**那么** 该原则在 tasks.md 输出格式章节中保留。

## 功能需求 _(必填)_

### FR-1 诊断数据可用性校验

SKILL 启动后第一步必须校验 `save-token/diagnosis-report.json`：文件存在且 `scanTimestamp` 距当前时间 ≤ 5 分钟时复用；否则提示用户先运行 `stk diagnose` 或 `/stk-diagnose`，并停止后续步骤、不产生任何输出文件。

**验收标准**: 在诊断文件缺失/过期两种情况下，SKILL 不派发任何子 Agent、不写入 `tasks.md`；提示信息中明确给出补救命令。

### FR-2 用户使用场景收集（含图谱工具倾向性）

SKILL 必须通过 `AskUserQuestion` 向用户收集使用场景信息（不猜测），至少包括三轮问答：

**第一轮（必问）** — 使用场景：

- 主要使用目的（代码编写 / 文档写作 / 通用办公 / 通用）
- 代码与文档是否在同一仓库

**第二轮（条件触发）** — 代码知识图谱工具倾向性：

- **触发条件**：仓库代码文件数 ≥ 5 且仓库扫描已完成（`repo-scan.json` 存在）
- **询问内容**：列出已知代码知识图谱工具（Graphify / Codebase-Memory MCP / CodeGraph / GitNexus / 暂不需要），附带每个工具的简要描述
- **推荐标记**：基于仓库扫描特征给出推荐选项并标注"推荐"（例如：仓库以 TypeScript 为主、已有 CODEBUDDY.md 则推荐 Graphify；仓库为多语言大型仓库则推荐 Codebase-Memory MCP；仓库为 monorepo 结构则推荐 GitNexus）
- 用户可选择"暂不需要"跳过
- 用户也可选择"其他"输入自定义工具名称

**第三轮（可选）** — 模糊点澄清：

- 如果存在任何需要进一步确认的边界情况（例如：仓库同时存在多种主流语言、上下文总 Token 量处于临界值、Skill 列表中同时存在 marketplace 版和 project 版同名 Skill），可通过额外的 `AskUserQuestion` 向用户确认倾向

收集结果写入 `save-token/context.json`，带 `collectedAt` 时间戳；若 7 天内已有 `context.json` 则复用、跳过所有询问。

**验收标准**: `context.json` 含 `purpose`、`sameRepo`、`graphTool`（可选，用户图谱工具选择）、`collectedAt` 字段；7 天内复用时不再向用户提问；超过 7 天重新询问；图谱工具选择为用户自主决定，推荐仅供参考。

### FR-3 仓库代码与文档采集

SKILL 必须在派发子 Agent 前（且在图谱工具倾向性询问前），扫描当前工作目录下的代码文件与文档文件，统计以下信息并写入 `save-token/repo-scan.json`：

- 代码文件数量（按扩展名识别）
- 文档文件数量（`.md`/`.mdx`/`.rst`/`.txt`）
- 代码总行数量级
- 文档总行数量级
- 主流编程语言（按文件数占比排序，取 Top 3）
- 是否存在 `docs/` 或 `README*` 等关键文档入口
- 是否存在项目级 `CODEBUDDY.md`
- 仓库是否为 monorepo 结构（存在多个 `package.json` / `Cargo.toml` / `go.mod` 等）

扫描时排除 `node_modules`、`.git`、`dist`、`build`、`coverage`、`.cache` 等常见忽略目录。

**验收标准**: `repo-scan.json` 含上述统计字段；扫描失败时不阻塞后续问答阶段，图谱工具倾向性询问降级为"无法推荐，请自行选择"模式，并在摘要中标注扫描失败。

### FR-4 子 Agent 按对象存在性条件启动

SKILL 必须按诊断报告内容决定派发哪些子 Agent。每个子 Agent 对应一类对象，**仅当该对象在诊断报告中存在且非空时启动**：

| 子 Agent           | 关注对象                          | 启动条件                                                                              |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| 第三方工具启用     | `toolDetection[]`                 | 数组非空                                                                              |
| MCP 优化           | `mcpList[]`                       | 数组非空                                                                              |
| 模型降级           | `skillList[]` + `pluginList[]`    | 任一非空                                                                              |
| Defer Tools 明确化 | `pluginList[]` + `hookList[]`     | 任一非空                                                                              |
| Skill 精简         | `skillList[]`                     | 数组非空                                                                              |
| 知识图谱推荐       | `repo-scan.json` + `context.json` | 仓库规模超阈值 **且** `context.json` 中 `graphTool` 非 `none`（用户未选择"暂不需要"） |
| 规则/配置精简      | `ruleList[]` + `configFiles[]`    | 任一非空                                                                              |
| Hook 审查          | `hookList[]`                      | 数组非空                                                                              |

**验收标准**: 对象为空时对应子 Agent 不被启动；最终摘要中列出"已跳过"的子 Agent 及其跳过原因。

> 注：`defer-mcp`（OperationType）语义 = 在 `.mcp.json` 中针对该 MCP server 设置 `"defer_loading": true`，使其工具按需加载而非常驻上下文。本次重构不引入 `mcp-defer` 等新枚举值。

### FR-5 子 Agent 并行派发

SKILL 必须在单条消息中并行派发所有需要启动的子 Agent（通过多次 Agent 工具调用），而非串行。每个子 Agent 接收：诊断报告相关字段、`context.json`、`repo-scan.json`（按需），输出一个统一 Schema 的 JSON 文件到 `save-token/suggestions-<agent-name>.json`。

**验收标准**: 子 Agent 调用在同一回合发出；任一子 Agent 失败不阻塞其他子 Agent；失败子 Agent 在摘要中标注错误。

### FR-6 子 Agent 输出统一 Schema

每个子 Agent 输出的 JSON 文件必须遵循统一 Schema：

- 顶层字段：`agentName`、`category`、`generatedAt`、`suggestions[]`、`skipped`（布尔，表示该 Agent 是否因无可建议对象而空跑）
- 每条 `suggestion` 字段：`id`（子 Agent 内唯一）、`title`、`detail`、`operationType`、`target`、`estimatedSavingTokens`、`risk`、`reversible`、`scenario`、`evidence`（可选，支撑建议的数据依据）

`operationType` 取值与 `src/types/index.ts` 中 `OperationType` 一致，并允许新增 `defer-tools`、`knowledge-base` 扩展值（`defer-mcp` 为既有值，语义见 FR-4 注）。

**验收标准**: 任意子 Agent 输出 JSON 通过上述字段校验；汇总阶段无需为不同子 Agent 写定制解析逻辑。

### FR-7 汇总生成 tasks.md

所有子 Agent 完成后，SKILL 必须读取 `save-token/suggestions-*.json` 全部文件，合并 `suggestions[]`，按 `category` 分组，写入 `save-token/tasks.md`。要求：

- 顶部以注释标明场景（如 `<!-- scenario: 代码编写 / 同仓 -->`）
- 一个 SKILL 一个 Task、一个工具一个 Task、一个 MCP 一个 Task，绝不合并
- 每条 Task 含可执行的 `action` 描述、预估节省 Token、原因
- 已跳过的子 Agent 在摘要区列出
- ID 在全文件范围内重新编号以保证唯一

**验收标准**: `tasks.md` 含场景注释、分组章节、可执行条目、跳过列表；ID 全局唯一；任一子 Agent 失败时其分组缺失但不影响其他分组生成。

### FR-8 输出摘要

SKILL 必须在控制台打印摘要：总计预估节省 Token 与百分比、`tasks.md` 路径、场景标注、已跳过的子 Agent 列表、失败子 Agent 列表。

**验收标准**: 摘要包含上述全部信息；用户无需打开文件即可了解优化方案概貌。

## 成功标准 _(必填)_

1. 在一个已经产生有效 `diagnosis-report.json` 的项目中，用户触发 `/stk-analyze` 后 5 分钟内可在 `save-token/tasks.md` 看到非空待办清单。
2. 当诊断报告中 `mcpList` 为空时，最终摘要中明确出现"MCP 优化子 Agent 已跳过（无 MCP）"类标注，且 `tasks.md` 中不存在 MCP 分组。
3. 在一个代码文件数 ≥ 20 的仓库中运行时，调研阶段会向用户展示图谱工具选择（含推荐标记）；用户选择具体工具后，`tasks.md` 中出现该工具的安装建议；用户选择"暂不需要"后，不出现此类建议。在代码文件数 < 5 的仓库中运行时，不询问图谱工具倾向性问题。
4. 任意两个子 Agent 输出的 JSON 文件结构相同（字段集合一致），可被同一段汇总代码无差别处理。
5. 用户在 7 天内重复运行 `/stk-analyze` 时，无需再次回答使用场景问题；超过 7 天再次运行时会被重新询问。
6. `tasks.md` 中每条 Task 都能被直接执行（描述具体操作对象与动作），不存在"优化一下""精简一些"等模糊表述。
7. 重构后的 `src/templates/skills/stk-analyze/SKILL.md` 文档结构清晰地体现"收集场景 → 收集仓库 → 派发子 Agent → 汇总 tasks.md"四阶段，阅读者无需对照旧版即可理解执行流程。

## 关键实体 _(可选)_

- **DiagnosisReport**: `save-token/diagnosis-report.json`，由 `stk diagnose` 产出，是本次分析的输入数据源。
- **Context**: `save-token/context.json`，记录用户使用场景（purpose、sameRepo、graphTool（可选）、collectedAt）。
- **RepoScan**: `save-token/repo-scan.json`，仓库代码/文档规模扫描结果，本次重构新增。
- **SuggestionFile**: `save-token/suggestions-<agent-name>.json`，每个子 Agent 的统一 Schema 输出，本次重构新增。
- **TasksFile**: `save-token/tasks.md`，人读待办清单，由汇总阶段合并所有 SuggestionFile 生成。
- **AnalysisSuggestion**: 单条建议的统一数据结构，字���定义对齐 `src/types/index.ts`。

## 假设与约束 _(可选)_

### 假设

- 用户已安装 CodeBuddy Code 并能正常触发 SKILL；`stk diagnose` 已可作为前置步骤产出 `diagnosis-report.json`。
- `AskUserQuestion` 一次最多支持 4 个问题，本 SKILL 的调研问答阶段分轮进行：第一轮 2 个问题（purpose + sameRepo），第二轮 1 个问题（图谱工具倾向性，条件触发），第三轮最多 1 个问题（模糊点澄清，可选）。每轮不超过 4 个问题，符合限制。
- 子 Agent 通过 Agent 工具派发，可在单条消息中并行发起多个调用；子 Agent 内部使用 Read/Write/Bash/Glob/Grep 工具完成分析与文件写入。
- 仓库扫描的"代码文件"以常见扩展名（`.ts/.tsx/.js/.jsx/.py/.go/.rs/.java/.c/.cpp/.vue/.svelte` 等）识别；"文档文件"以 `.md/.mdx/.rst/.txt` 识别。
- "值得使用图谱"的阈值默认为代码文件数 ≥ 5（触发询问）且代码文件数 ≥ 20 或代码总行数 ≥ 2000（触发推荐）。阈值在 SKILL 文档中明示，可后续调整。
- 图谱工具推荐逻辑基于仓库扫描特征：
  - TypeScript/JavaScript 为主且有 CODEBUDDY.md → 推荐 Graphify（本地轻量图谱）
  - 多语言大型仓库（> 50 文件，3+ 语言）→ 推荐 Codebase-Memory MCP（跨语言图谱）
  - monorepo 结构 → 推荐 GitNexus（子仓库感知）
  - 以上条件都不满足但规模达标 → 推荐 Graphify（默认）
- 7 天的 `context.json` 复用窗口与 5 分钟的 `diagnosis-report.json` 复用窗口沿用旧版设定。

### 约束

- 不修改 `src/types/index.ts` 中已有字段定义（可新增扩展字段，不破坏现有契约）。
- 不引入对 `stk-optimize`、`stk-report` 两个下游 SKILL 的破坏性变更；本次重构仅作用于 `stk-analyze`。
- 不在 SKILL 内部执行任何实际优化动作（不真正禁用 Skill、不真正改 CODEBUDDY.md），只产出建议与待办。
- 子 Agent 输出文件命名必须为 `suggestions-<agent-name>.json`，`<agent-name>` 与子 Agent 标识一致，便于汇总阶段通配读取。

本次重构范围明确，所有关键决策（子 Agent 启动条件、统一 Schema、仓库扫描阈值、图谱工具推荐逻辑、复用窗口）均已明确，无需进一步澄清。
