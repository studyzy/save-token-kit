# Changelog

## Unreleased

### 重构：第三方 Toolkit 零写死，检测/建议/安装全量数据驱动（v1.2.0，breaking）

- **动机**：第三方工具的清单与事实性数据（检测方式、启用判定、建议参数、安装命令、官方仓库、支持 Agent）全部下沉到规则库 `data.toolkits`，自定义规则包可增删改第三方工具而无需改代码
- **声明式检测规格**：`data.toolkits[]` 新增 `detect` / `enabled` 规格字段——7 种原语（`command` / `path` / `mcp` / `plugin-enabled` / `proxy-plugin` / `hook` / `process`）+ `all` / `any` 组合器（嵌套 ≤3 层），由 `src/toolkits/spec.ts` 的 `evaluateSpec` 统一评估；`proxyMarkers` / `mcpPrefixes` 字段数据化 proxy 请求体标记与 MCP 工具名前缀
- **删除 `src/toolkits/impl/`（13 个文件）**：检测注册表改为 `data-registry.ts` 运行时从 `merged.toolkits` 构建；`diagnose.ts` 的 7 处 per-tool enabled 探测特例清除；唯一例外 `handlers/rtk-native.ts`（rtk 复杂安装流，数据经 `install.handler: 'rtk-native'` 引用）
- **类型放宽**：`ToolkitId` 从 13 个字面量联合改为 `string`（工具清单数据驱动）；`ToolkitCatalogEntry` 扩展 `detect` / `enabled` / `description` / `saving` / `level` / `estTokens` / `category` / `install{verify,config,handler}` 可选字段
- **loader**：`validateToolkitSpec` 宽松校验（字段在场才校形态、未知字段不拒绝、未知 kind 拒绝），旧格式规则包向后兼容（schemaVersion 保持 1，packVersion → 1.2.0）
- **建议事实数据化**：level 判定表 / estTokens 默认估算 / 知识库 4 工具分类（`category: 'knowledge-base'`）从 toolkit-enable / knowledge-base 模板硬编码迁入数据，经 toolkit-meta 新视图渲染——`levels` / `est` / `names` 视图 + `category=` / `exclude-category=` 过滤属性（与既有 `only` / `exclude` 正交）
- **模板零写死**：toolkit-enable / knowledge-base 的工具名枚举、level 表、估算清单、展示名映射全部改为渲染期注入；smoke 测试行级白名单断言清单性硬编码为零
- **proxy 解析器**：插件激活标记（caveman / ponytail / i-have-adhd）与 `headroom_` MCP 前缀从 codebuddy-parser / codex-parser 硬编码迁入数据，`parser-core` 共享实现（`getToolkitProxyData()` 惰性缓存）；`'mcp__'` 通用语法保留引擎
- **行为等价**：13 工具重构后检测结果与旧实现逐项一致（已通过逐字段对照 + 真实环境 diagnose 冒烟验证）；`report.ts` 仅写 `installed` 工具的既有行为不变
- **测试**：465 用例（51 文件），重构模块覆盖 92-98%，全仓 83.2%

### 迁移：toolkit-meta 建议元数据下沉规则库（v1.1.0，自 tokenlint 反向移植）

- **动机**：第三方工具的官方仓库 / 支持 Agent / 安装方式是事实性数据，应可由自定义规则库覆盖而非硬编码在 SKILL 模板
- **数据**：`data.toolkits[]` 新增可选平铺字段 `repo` / `agents`（claude/codex/codebuddy 布尔映射）/ `agentNotes` / `agentNote` / `install{default,byAgent}`；packVersion 1.1.0；`FR-001` parity（fallback.json 与 rules/stk-rules.json 逐字节一致）保持
- **渲染**：`render.ts` 新增 `stk:rules:toolkit-meta/links|agents [only=|exclude=]` 占位对，渲染期生成 markdown 表；零项带 meta 时保留占位对内兜底骨架，产物不含占位标记、天然幂等
- **模板**：toolkit-enable / knowledge-base 接入占位对；新增「支持 Agent 过滤」规则（当前 `--agent` 不支持的工具不产出建议，rtk 在 codebuddy 下除外）；建议 `detail` 必须附官方仓库链接
- **有意偏差**：`agentCell` 的 note 对 ✗ 也渲染（tokenlint 仅 ✓ 渲染会丢 rtk 特例注记）

### 变更：第三方省 Token 工具统一改称 Toolkit（breaking）

- **动机**：避免与 LLM 请求体中的 Tools（builtinTools / mcpTools）概念混淆，第三方省 Token 工具（rtk / caveman / headroom / lean-ctx / graphify / ponytail / i-have-adhd 等）统一改称 **Toolkit**
- **CLI**：`stk install <tool>` → `stk install <toolkit>`；错误提示改为「未知 Toolkit / 可用 Toolkit」
- **类型契约**：`ToolId`→`ToolkitId`、`ToolDetection`→`ToolkitDetection`、`DiagnosisReport.toolDetection`→`toolkitDetection`、`OperationType 'install-tool'`→`'install-toolkit'`、`AnalysisContext.graphTool`→`graphToolkit`（该字段所属的 `AnalysisContext` 已随下条 stk-analyze 重构一并移除）
- **源码**：`src/tools/` → `src/toolkits/`（`SaveTokenToolkit` / `BaseSaveTokenToolkit` / `registerToolkit` / `getAllToolkits` 等），测试目录 `tests/unit/tools/` → `tests/unit/toolkits/`
- **规则包**：数据集键 `data.tools` → `data.toolkits`（schemaVersion 仍为 1；旧用户覆盖文件用 `tools` 键将收到 unknown-dataset 警告，需改名为 `toolkits`）
- **SKILL 模板**：stk-analyze 子 Agent `tool-enable` → `toolkit-enable`（产出 `suggestions-toolkit-enable.json`）、stk-optimize 子 Agent `install-tool` → `install-toolkit`；诊断报告展示「第三方 Toolkit 检测」
- **不改**：LLM 语义的 tool 全部保留（`system-tools`、`builtinTools`、`mcpTools`、`tool-opt` 子 Agent 与 prompts 等）

### 重构：stk-analyze 全面改为 usage 数据驱动，不再询问用户（breaking）

- **移除用户意图收集**：删除阶段 1「收集使用场景」的三轮 `AskUserQuestion` 与 `save-token/context.json`（`AnalysisContext` 类型同步删除）；`scenario` 字段与 tasks.md 顶部注释改由 `repo-scan.json` 机械推断（`docFileCount ≥ codeFileCount` → doc，否则 code，异常 → general）
- **判定依据切换**：各子 Agent 改以诊断报告 `usageStats`（`toolUsage` / `skillUsage` / `subagentUsage` / `mcpServerUsage`，各含 `last30Days.ranking` 调用计数）与 `repo-scan.json` 仓库特征判定；Markdown 摘要不渲染 `usageStats`，子 Agent 直读 `diagnosis-report.json`
- **usage 缺失回退总则**：所有「零调用 → 禁用/移除」类规则不触发（宁漏不误杀），仅保留结构性规则；`agent-opt` 无 usage 数据时整体 `skipped: true`
- **tool-opt（CodeBuddy/WorkBuddy）**：改为「Top 20 常驻、其余 Defer」——按 `toolUsage.last30Days` 调用排序，`builtinTools` 中不在 Top 20 的全部收进 `Defer(...)`；usage 缺失时仅保守 `Defer(*PlanMode)` + `Defer(SendMessage)`
- **tool-opt（Claude Code）**：deny 候选改由 30 天零调用筛选（排除 Read/Write/Edit/Bash/Glob/Grep 安全兜底），**保留** `AskUserQuestion` 安全确认
- **knowledge-base**：`graphToolkit` 用户选择改自动推断——已装未启用→建议启用（多个按 repo 特征选 1）；全未装且 `codeFileCount ≥ 100`→按特征推荐；其余不启动
- **mcp-opt**：通用 CLI 替代改 `mcpServerUsage.last30Days` 零调用判定；TAPD / 工蜂 / GitHub 开发协作平台 MCP 仍**禁止建议禁用**（零调用也仅走 CLI 替代）
- **plugin-opt / skill-opt**：`purpose`/`role` 画像改 `topLanguages` 领域特征；粗粒度 `usageFrequency` 改 `skillUsage.ranking` 精确计数（禁用需 90 天零调用且领域无关双重确认）
- **stk-optimize**：无需结构性改动（仅路由表 tool-opt 措辞对齐），其任务级 `AskUserQuestion` 确认为执行安全机制，保留

## 0.7.2 (2026-10-09)

### 新增：stk uninstall 卸载命令

- **`stk uninstall`**：删除 `stk init` 安装的 5 个 SKILL 目录（`stk` / `stk-diagnose` / `stk-analyze` / `stk-optimize` / `stk-report`），选项与 init 对齐（`--agent` / `--local`）
- **安全护栏**：只删除 stk 自有的 5 个 SKILL 目录，不触碰同目录下用户其他 SKILL；TTY 下交互确认，非交互环境（脚本/CI）必须显式 `--force` 才执行
- **README**：命令参考新增 `stk uninstall` 小节；新增「卸载」章节（SKILL → 全局包 → `~/.stk/` 规则库缓存与 `./save-token/` 报告产物清理）

### 质量

- 369 测试全绿；lint 0 错误

## 0.7.1 (2026-10-09)

### 新增：i-have-adhd 工具检测与推荐

- **新工具注册**：接入 [i-have-adhd](https://github.com/ayghri/i-have-adhd)（ADHD 友好输出风格：行动优先、步骤编号、去冗余），与 Ponytail / Caveman 同为输出压缩类 plugin，`stk diagnose` 报告与 `/stk` 推荐流程自动覆盖
- **检测**：`~/.codebuddy/plugins/marketplaces/i-have-adhd/` 目录 + `settings.json` 的 `enabledPlugins['i-have-adhd@i-have-adhd']`
- **Proxy 标记**：codebuddy / codex parser 识别 `ADHD MODE ACTIVE` 标记，命中时覆盖 installed 状态
- **推荐接入**：规则包 `stk-rules.json` / 内置兜底新增条目；tool-enable / install-tool 子 Agent 模板与 `docs/优化规则.md` 同步

### 质量

- 358 测试全绿；lint 0 错误

## 0.7.0 (2026-09-24)

### 新增：规则包 stk-rules（specs/005-stk-rules-pack）

- **规则与引擎分离（单文件）**：优化经验（低频插件名单、MCP 替代映射、工具目录、阈值、分级表、平台提示词片段）收敛为单个规则文件 `rules/stk-rules.json`（版本/engines/data/prompts 全含），推文件即发布，改经验不再需要升级 stk 主程序
- **`stk rules update`**：从 URL 下载单文件到 `~/.stk/rules/stk-rules.json`（STK_RULES_URL 可覆盖源），支持 `--check` 与 `--json`
- **`stk rules status`**：查看生效版本、四层加载结果与更新时间
- **多源叠加**：项目级 `./stk-rules/` > 全局用户 `~/.stk/rules.d/` > 已装规则库 > 内置兜底，条目级覆盖合并，支持 `"!条目"` 移除语法
- **兼容护栏**：规则包 manifest 声明 schemaVersion 与 engines.stk 区间，不兼容整包拒载并回退兜底，警告含两侧版本号
- **可追溯**：诊断报告新增 `rulesInfo` 字段并在 Markdown 头部标注规则库版本
- **提示词外置**：技能模板中的平台经验章节外置为规则包片段，`stk init` 渲染注入（占位符 + 兜底）

### 变更

- 移除 `LOW_FREQUENCY_PLUGINS` / `MCP_CLI_ALTERNATIVES` 硬编码常量（迁入规则包，附 data-parity 测试防回归）
- `stk init` 产物头部插入规则库版本注释

### 质量

- 280 测试全绿；覆盖率 80%（门槛 60%）；lint 0 错误
