# 研究: 重构 stk-analyze SKILL（多子Agent并行优化方案生成）

**分支**: `002-stk-analyze-rebuild` | **日期**: 2026-07-13
**状态**: 阶段 0 输出（待 Explore-2 补全后定稿）

## 研究任务

### R-1 代码知识图谱工具特性差异

**Decision**: 在 SKILL.md 中明示 4 工具推荐矩阵，Graphify 作为默认推荐。

**Rationale**:

| 工具                | 机制                                                                            | 适合仓库                            | 集成方式                                               | CodeBuddy 可用性                                              |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Graphify            | 本地 CLI（uv 安装），Tree-sitter + NetworkX + Leiden 聚类，产出 `graphify-out/` | TS/JS 为主、中小型、有 CODEBUDDY.md | CLI + Skill（`graphify install --platform codebuddy`） | ✅ 已内置注册（`src/tools/impl/graphify.ts`）                 |
| Codebase-Memory MCP | 本地 MCP server（纯 C，stdio），`index_repository` 建持久图谱，158 语言         | 多语言大型仓库（>50 文件、3+ 语言） | MCP server                                             | ✅ 已深度集成（`~/.codebuddy/settings.json`，14 个 mcp 工具） |
| CodeGraph           | 本地优先 CLI + MCP，带 embeddings + git/覆盖/生产错误历史层                     | 重视语义 + 历史的仓库               | CLI + MCP                                              | ⚠️ 需手动配置                                                 |
| GitNexus            | 零服务器，Tree-sitter 构建交互图谱，CLI/MCP/Web UI                              | monorepo / 子仓库感知 / 影响分析    | CLI + MCP + Web                                        | ⚠️ 需手动配置                                                 |

**推荐决策矩阵**（写入 SKILL.md）：

- TS/JS 为主 + 有 CODEBUDDY.md → **Graphify**（轻量默认）
- 多语言大型（>50 文件、3+ 语言）→ **Codebase-Memory MCP**（本地已集成）
- 需语义 + 历史（git/覆盖/错误）层 → **CodeGraph**
- monorepo / 子仓库感知 / 影响分析 → **GitNexus**
- 规模达标但无上述特征 → **Graphify**（默认）

**Alternatives considered**:

- 仅推荐 Graphify：放弃大型多语言仓库场景，损失推荐精准度
- 不询问用户倾向、纯自动推荐：违反 spec FR-2 要求的"用户自主决定"

### R-2 SKILL.md 现有结构与 Agent 调用表达

**Decision**: 重构时统一 SKILL 风格，采用 `## 目标` / `## 执行流程` / `## 边界` 章节结构（对齐 stk-diagnose/optimize/report），移除 `allowed-tools` frontmatter 字段（其余三个 SKILL 均未使用）。

**Rationale**:

- 现有 `src/templates/skills/stk-analyze/SKILL.md` 用 `## 工作流` + `## 子 Agent 定义`，其余 3 个 SKILL 统一用 `## 目标` / `## 执行流程` / `## 边界`，风格不一致。
- 现有 SKILL 仅定义 4 个子 Agent（tool-enable / mcp-opt / model-opt / defer-tools），但 `src/templates/commands/analyze.md:36` 提到 7 个维度，存在 spec 与实现不一致。
- 重构后子 Agent 数量扩展至 8 个（spec FR-4 表格），统一命名：`tool-enable` / `mcp-opt` / `model-opt` / `defer-tools` / `skill-trim` / `knowledge-base` / `repo-scan` / `hook-audit`。

**Alternatives considered**:

- 保留 `allowed-tools` frontmatter：与另外 3 个 SKILL 不一致，且 SKILL 加载机制不依赖此字段
- 沿用 `## 工作流` 章节：与统一风格冲突，阅读者需对照两种结构

### R-3 仓库扫描逻辑复用

**Decision**: 不复用 `src/collectors/fs-collector.ts` 的 `scanFilesystem`，新增独立的仓库源码扫描逻辑。扫描逻辑放在 SKILL 内部用 Bash + Glob 完成（不新增 TypeScript 源码模块）。

**Rationale**:

- `src/collectors/fs-collector.ts:55` 的 `scanFilesystem(adapter)` 仅扫描 CodeBuddy 配置（MCP/Skill/Plugin/Hook/Rule/config 文件大小），不统计代码文件数、文档行数、主流语言。
- spec 要求 `repo-scan.json` 含代码文件数、文档文件数、代码总行数、主流语言、CODEBUDDY.md 检测、monorepo 检测——与现有扫描目标完全不同。
- 本次重构是 SKILL.md 文档重写，不引入新 TypeScript 模块；扫描在 SKILL 执行时通过 Bash 命令（`find` + `wc -l`）+ Glob 完成，结果直接写入 `save-token/repo-scan.json`。

**Alternatives considered**:

- 新增 `src/collectors/repo-scanner.ts`：违反"重构仅作用于 stk-analyze"约束，且 SKILL 是文档而非可执行代码
- 复用 `scanFilesystem`：字段完全不匹配，需大量改造，破坏现有契约

### R-4 AskUserQuestion 多轮问答在 SKILL 中的表达

**Decision**: SKILL.md 中以"步骤"形式描述每轮问答，每步给出 `AskUserQuestion` 的 `questions` 数组示例（2-4 个 question 对象）。第一轮 2 问（purpose + sameRepo），第二轮 1 问（图谱工具，含推荐标记），第三轮条件触发 1 问（模糊点澄清）。

**Rationale**: `AskUserQuestion` 一次最多 4 个问题；分轮避免单次超限；推荐选项置于 options 数组首位并加"(推荐)"后缀。

**Alternatives considered**:

- 单次 4 问：超出实际需要，图谱工具问题依赖第一轮 sameRepo 答案，无法并行
- 串行多轮但写在同一步骤：阅读混乱，不利于维护

## 未决事项

- 全部已决。可进入阶段 1 设计。
