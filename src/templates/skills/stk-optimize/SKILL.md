---
name: stk-optimize
description: '读取 save-token/tasks.md，按用户选择的优化等级（初级/初级+中级/全部）筛选并逐项执行 Token 优化任务'
argument-hint: ''
---

# SKILL: stk-optimize

本 SKILL 指导 AI Agent 执行 `/stk-optimize`：读取分级待办清单，按用户选定的等级筛选并逐项落地优化。

## 前置条件

- `./save-token/tasks.md` 存在（由 `/stk-analyze` 生成）。
- 若缺失：提示用户先运行 `/stk-analyze`，停止。不要凭空生成任务。

## 执行流程

### 1. 读取并解析 tasks.md

读取 `./save-token/tasks.md`，识别每条任务：
- 复选框：`- [ ]`（未完成）/ `- [x]`（已完成，可跳过）。
- 等级标签：`[初级]` / `[中级]` / `[高级]`，位于复选框之后。
- 动作描述：标签后的文本（如"禁用 skill: ponytail-help"、"启用 Headroom"）。
- 原因：缩进两空格的 `原因：` 行。
- no-op 识别：描述以"保持/保留/当前配置"开头且预估节省为 0 → 标记 `skipped`，不执行任何修改。

### 2. 询问优化等级

使用 AskUserQuestion 向用户呈现三个选项（单选）：
1. **初级**
2. **初级 + 中级**
3. **全部**（初级 + 中级 + 高级）

### 3. 筛选任务

按用户选择保留对应等级的任务集合：
- 初级 → 仅 `[初级]`
- 初级+中级 → `[初级]` + `[中级]`
- 全部 → `[初级]` + `[中级]` + `[高级]`

已勾选（`- [x]`）与 no-op 任务不进入执行队列（no-op 落盘 `skipped`）。

### 4. 按序执行

严格遵循 `tasks.md` 中的出现顺序，逐个执行筛选后的任务。

**CODEBUDDY.md 审查任务特殊处理**：当遇到 category 为 `CODEBUDDY.md 审查`（动作含"精简 CODEBUDDY.md"或"为 CODEBUDDY.md 增加…索引"）的任务时，**不在此主流程内直接修改**，而是单独派发一个子 Agent 专门优化 CODEBUDDY.md（见下方 `codebuddy-md-review` 分支与"子 Agent 提示词"）。理由：CODEBUDDY.md 优化需要通盘权衡渐进式披露原则，由专注子 Agent 执行质量更高、且不影响主流程其他任务的顺序执行。

每条任务按 `operationType` 分支处理：

- **第三方工具启用**（`stk install`）：
  - 从动作描述解析工具名（如"启用 Headroom"→`headroom`，"启用 RTK"→`rtk`）。
  - 执行：`stk install <工具名> -g --agent codebuddy`
  - 该命令会运行工具的 install + config 命令完成安装与启用。
- **disable-skill**：备份 `settings.json` 后，将 `enabledPlugins` 对应项设为 `false`。
- **disable-mcp / replace-mcp-with-cli**：备份 `.mcp.json` 后禁用（不删除），并提示对应 CLI 命令。
- **trim-codebuddy-md**：生成精简内容写入。
- **defer-mcp / 其他**：按建议提示或执行对应修改。
- **codebuddy-md-review**：单独派发子 Agent 优化 CODEBUDDY.md。使用下方"子 Agent 提示词"作为子 Agent 的 task，传入当前项目 `CODEBUDDY.md` 路径。子 Agent 完成后，将结果（修改或说明）回填到该任务结果。

> 本 SKILL 操作对象均为当前 Git 仓库内的受版本管理文件，**无需手动备份，直接修改即可**——误改可由 `git checkout` / `git restore` 还原。仅当任务明确指向仓库外用户配置（如 `~/.codebuddy/settings.json`、`.mcp.json` 等脱离 Git 跟踪的文件）时才先备份再改。

#### 子 Agent 提示词（CODEBUDDY.md 优化）

派发子 Agent 时，将其 task 设为以下内容（替换 `<CODEBUDDY.md 路径>` 为实际路径，通常为项目根 `./CODEBUDDY.md`）：

````
你是 CODEBUDDY.md 优化专家。请读取并优化 `<CODEBUDDY.md 路径>`，目标是降低其每次会话全量注入上下文的 Token 占用，同时不丢失关键指令。

## 你必须遵循的 CODEBUDDY.md / CLAUDE.md 编写最佳实践（2026 社区共识）

### 一、核心原则：管理上下文窗口
CODEBUDDY.md 每次会话都会自动全量加载进上下文。文件越长，越容易淹没真正重要的指令，模型还可能"遗忘"早期指令或忽略关键规则。一切优化围绕"减少常驻注入量、按需披露细节"。

### 二、长度与体量硬指标
- 官方建议：精简，**不超过 200 行**。
- 更强实践：Boris Cherny 提出 ~150 指令阈值——超过后 AI 对指令的遵从率跌破 ~80%；有实践者主张自身控制在 50 行内。
- 判定标准：逐行问"删掉这行，AI 会犯错吗？"会则留，不会/不确定则删。

### 三、渐进式披露（Progressive Disclosure）——主文件应作索引/资源地图
- 主文件只放：项目一句话描述 + 常用命令 + 关键文件/目录指针（Resource Map）。
- 细节（架构、数据流、契约、长文档、推理过程）下沉到 `@引用` 文件（如 `@docs/architecture.md`）或 Skills，AI 有需要时才加载。
- 用 `@文件` 语法引用，避免主文件膨胀。
- 多位置支持：`~/.codebuddy/CODEBUDDY.md`（全局）、项目根 `./CODEBUDDY.md`（团队共享）、`CODEBUDDY.local.md`（个人，gitignore）、子目录 CODEBUDDY.md（处理该目录时按需加载）。

### 四、应该写什么（无法从代码推断、普遍适用）
1. 常用命令：构建、测试、lint（如怎么跑单个测试）。
2. 代码风格/约定：与社区默认不同的部分。
3. 工作流规则：改完必须跑类型检查等。
4. 项目特有架构决策：重要但读代码难发现的。
5. 开发环境坑：必需的环境变量、隐藏依赖。
6. 常见陷阱 / 不明显行为。

### 五、不应该写什么
- 读代码就能搞清楚的东西（逐文件描述、标准语言约定）。
- 详细文档 → 只放链接 / `@引用`。
- 仓库规范（分支命名、MR 约定）、频繁变化的信息。
- 长篇教程/解释、"写干净代码"类废话。
- 只在特定场景才相关的领域知识 → 改用 Skills 或带 `paths` 的 rules（`alwaysApply:false` + `paths` 按需加载）。

### 六、项目变大时的拆分方式
- 路径级规则：拆到带 `paths` 的 `.codebuddy/rules/*.md`，仅处理相关目录时加载。
- Skills：领域知识/可复用工作流放 `.codebuddy/skills/SKILL.md`。
- 子目录 CODEBUDDY.md：monorepo 中子目录自有，处理该目录文件时加载。
- 引用而非内联：用 `@` 引用其他文件，主文件保持精简。

## 你的任务
1. 读取 `<CODEBUDDY.md 路径>`。
2. 对照上述准则做 Review：指出哪些章节属于"可推断内容/长篇解释/非每次必需"，应下沉为 `@引用` 或 rules/skill；检查是否缺 Resource Map 索引；检查行数是否超标。
3. 生成优化后的 CODEBUDDY.md 内容：保留命令、风格、关键约束等普遍适用指令；将架构/数据流/契约等下沉为 `@docs/` 引用或拆为 rules；补充关键文件/目录索引；必要时用 `@RTK.md` 等引用。
4. 将优化后的内容**直接写入原路径**（当前项目文件受 Git 管理，无需备份，误改可用 `git restore` 还原）。若判断当前文件已达标无需大改，只做最小必要调整并说明原因。

完成后回报：修改了哪些章节、下沉到何处、行数前后对比、预计减少的常驻 Token 量级。
````

> 子 Agent 优化的是当前 Git 仓库内文件，直接修改即可，无需备份。

### 5. 更新任务状态

每条任务完成后**立即**回写 `tasks.md`，将该任务对应行的复选框置为已完成，保证进度可追踪：

- 成功 / 已落地修改 → `- [x]`（保留原有等级标签与描述）。
- 失败 → `- [x]` 外加注（如原因），或在原因行追加 `状态: 失败`。
- no-op / 跳过 → 保持 `- [ ]` 不变，或改为 `- [x]` 并在原因行标注 `skipped`（按 §1 no-op 定义）。

**每完成一条就改一条，不要等全部结束再批量更新。**

### 6. 落盘 tasks.json

全部任务执行完毕后，**必须**将执行结果以 JSON 落盘 `./save-token/tasks.json`（结构见 `src/types/index.ts` 的 `TasksFile` / `OptimizationTask` 契约），供 `/stk-report` 归因使用。

每条任务记录：
- `suggestionId`：对应 `tasks.md` 中的 ID（如 S1, S2...）
- `description`：动作描述
- `operationType`：操作类型
- `status`：`completed` / `failed` / `skipped`
- `estimatedSavingTokens`：预估节省（从 tasks.md 解析）
- `risk` / `reversible`：风险与可逆性
- `appliedChange`：实际执行的变更描述（如修改了哪个文件）
- `error`：失败时填写原因，成功为 `null`

`actualSavingTokens` 本期留空（由 `/stk-report` 计算）。

## 边界

- 单个任务失败：记录 `failed` 并继续下一任务（整体流程可见）；如需遇错即停，执行前与用户确认。
- 本 SKILL 仅指导修改，不自动回滚；回滚依赖用户侧备份手动恢复。
- 仅支持 `codebuddy` 平台（`stk install --agent` 仅 codebuddy 生效，claude/codex 等预留）。
