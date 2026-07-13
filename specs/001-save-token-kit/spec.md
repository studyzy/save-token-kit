# 功能规范: Save Token Kit (stk)

**功能分支**: `001-save-token-kit`
**创建时间**: 2026-07-10
**状态**: 草稿
**输入**: 用户描述: "这是一个帮忙用户的AI Agent节省Token的项目，采用了类似OpenSpec的架构(代码在 ../OpenSpec-cn)，有命令行工具save-token-kit简称stk，有AI Agent的Commands和SKILL。总体采用ts来编写。满足TypeScript业界规范，有足够的UT和集成测试，UT覆盖度60%以上，代码有英文注释，文档是中文文档。我之前也开发了一个版本，但是写的不好，只能作为你的参考，代码在../save-token 文件夹，你可以参考，里面也描述了功能有哪些。"

## 核心设计理念

本项目效仿 OpenSpec 的架构思路：**CLI 工具（stk）提供数据采集能力，AI Agent 通过 Commands 和 SKILL 驱动工作流**。职责划分如下：

- **stk CLI**：提供 `stk init` 命令效仿 OpenSpec-cn 的 `init`，默认将 Commands 全局安装到 `~/.codebuddy/commands/save-token-kit/`（不安装 SKILL）。通过 `--local` 标志改为安装到项目级 `.codebuddy/commands/save-token-kit/`，通过 `--skills` 标志额外安装 SKILL 文件。Command 文件名为 `diagnose.md`/`analyze.md`/`optimize.md`/`report.md`，frontmatter `name` 分别为 `stk-diagnose`/`stk-analyze`/`stk-optimize`/`stk-report`。同时通过 `stk diagnose` 的 HTTP Proxy 拦截 CodeBuddy 发送给 LLM 的 POST 请求，捕获请求体中的 messages、tools、skills 等数据。`stk diagnose` 命令执行后会输出 3 个文件到当前项目的 `save-token/` 目录：`proxy-raw-body.json`（原始 POST 内容）、`diagnosis-report.json`（解析后的 JSON 报告）、以及在控制台直接输出的 Markdown 格式诊断报告（可通过 `stk diagnose >> ./save-token/diagnosis-report.md` 保存）。
- **Commands**：定义 CodeBuddy 对话中可用的 `/stk-diagnose`、`/stk-analyze`、`/stk-optimize` 等斜杠命令，作为 AI Agent 执行诊断/分析/优化工作流的入口。
- **SKILL**：为每个命令提供具体的执行指令，告诉 AI Agent 如何解读诊断报告、如何分析 Token 优化空间、如何执行优化操作。分析和优化的决策由 AI Agent 完成，不是 stk CLI 的硬编码规则。

## 用户场景与测试 _(必填)_

### 用户故事 1 - stk diagnose 诊断 Token 占用 (优先级: P1)

作为 CodeBuddy 用户，我希望运行 `stk diagnose` 命令就能通过 HTTP Proxy 拦截 CodeBuddy 与 LLM 之间的通信，捕获实际发送给 LLM 的请求内容，并自动输出 2 个 JSON 诊断文件（每次覆盖）到当前项目的 `save-token/` 目录，并在控制台输出 Markdown 摘要（可重定向保存），以便精确了解 System Prompt、Tools 定义、Messages、Skills 等各部分的 Token 占用情况。

**优先级原因**: Proxy 拦截是最精确的数据采集方式，能拿到实际发送给 LLM 的完整请求体。这是整个工具链的数据基础，没有精确的诊断数据，AI Agent 就无法做出有效的分析和优化决策。

**独立测试**: 运行 `stk diagnose` 命令启动诊断模式，进行一次 CodeBuddy 对话，stk 捕获请求体并在 `./save-token/` 目录下生成诊断文件。不需要后续步骤即可交付价值。

**诊断输出**:

`stk diagnose` 执行后将 2 个 JSON 文件写入当前项目的 `save-token/` 目录（每次运行**覆盖**旧文件）：

| 文件                    | 说明                                               |
| ----------------------- | -------------------------------------------------- |
| `proxy-raw-body.json`   | 原始 POST 请求体，未经解析的完整内容               |
| `diagnosis-report.json` | 解析后的结构化 JSON 诊断报告（仅反映最近一次诊断） |

控制台另以 Markdown 格式输出诊断摘要，用户通过重定向保存为 `.md` 文件，CLI 本身**不写** `.md`：

| 文件                   | 说明                           | 生成方式                                            |
| ---------------------- | ------------------------------ | --------------------------------------------------- |
| `diagnosis-report.md`  | 首次诊断的 Markdown 报告       | `stk diagnose >> ./save-token/diagnosis-report.md`  |
| `diagnosis-report2.md` | 优化后二次诊断的 Markdown 报告 | `stk diagnose >> ./save-token/diagnosis-report2.md` |

**对比约定**：`/stk-report` 的 before/after 对比**以两个 `.md` 文件为准**（`diagnosis-report.md` 为前、`diagnosis-report2.md` 为后）。`diagnosis-report.json` 每次被覆盖、不保留历史，不用于对比。

**验收场景**:

1. **给定** 用户运行 `stk diagnose`，**当** Proxy 启动并拦截到一次 CodeBuddy 对话请求时，**那么** `./save-token/proxy-raw-body.json` 包含完整的原始 POST 请求体，包含 messages、tools、skills、system prompt 等字段。
2. **给定** Proxy 已捕获请求，**当** 诊断处理完成后，**那么** `./save-token/diagnosis-report.json` 包含结构化的解析数据：各部分 Token 占用明细（System Prompt、System Tools、Memory Files、Skills、Messages 的各自大小和估算 Token 数）。
3. **给定** 诊断完成，**当** 用户查看控制台输出时，**那么** 控制台以 Markdown 格式展示诊断摘要，包含 Token 总览和各部分占比。用户可通过 `stk diagnose >> ./save-token/diagnosis-report.md` 保存。
4. **给定** 多次对话请求被捕获，**当** 诊断报告生成时，**那么** 报告聚合所有捕获的请求数据，显示各部分的平均/最大/最小 Token 占用。
5. **给定** `stk diagnose` 运行中，**当** 用户按 Ctrl+C 或发送 SIGTERM 时，**那么** Proxy 优雅关闭，已采集的数据正常写入文件。
6. **给定** CodeBuddy 请求发送失败（网络问题），**当** Proxy 拦截到错误响应时，**那么** Proxy 记录错误信息但不中断服务，继续等待后续请求。
7. **给定** 捕获的请求体超过 10MB，**当** Proxy 处理请求时，**那么** 系统截断过大的 message 内容并标记为 [TRUNCATED]，避免诊断报告自身过于庞大。

---

### 用户故事 2 - AI Agent 分析 Token 优化空间 (优先级: P2)

作为 CodeBuddy 用户，我希望在对话中通过 `/stk-analyze` 命令让 AI Agent 基于诊断数据自动分析 Token 优化空间，生成具体的优化建议，包括哪些 Skill 可以关闭、哪些 MCP 可以用 CLI 替代、哪些配置文件需要精简等。

**优先级原因**: 分析优化空间需要理解 CodeBuddy 的最佳实践和用户的使用场景，这最适合由 AI Agent 来完成。`stk` CLI 只负责提供数据，决策由 AI Agent 做出。

**独立测试**: 在已有诊断报告的前提下（`./save-token/` 目录下已有诊断文件），用户在 CodeBuddy 对话中运行 `/stk-analyze`，AI Agent 读取诊断数据并生成优化建议列表。用户可独立阅读建议并手动执行。

**验收场景**:

1. **给定** 诊断报告已生成（`./save-token/diagnosis-report.json` 存在），**当** 用户在 CodeBuddy 中执行 `/stk-analyze` 时，**那么** AI Agent 读取诊断数据，分析各部分 Token 占用，生成按节省量排序的优化建议列表。
2. **给定** AI Agent 分析诊断数据，**当** 发现某 Skill 的 Token 占用 > 500 且非高频使用，**那么** AI Agent 建议禁用该 Skill，并说明预估节省量。
3. **给定** AI Agent 分析诊断数据，**当** 发现某 MCP 有已知 CLI 等价物（如 Playwright MCP → playwright CLI），**那么** AI Agent 建议关闭该 MCP 改用 CLI，并说明 CLI 不占用持久上下文工具定义。
4. **给定** AI Agent 分析诊断数据，**当** 发现 CODEBUDDY.md 文件过大，**那么** AI Agent 建议精简内容，并指出可移至项目级或删除的部分。
5. **给定** AI Agent 分析诊断数据，**当** 发现未安装省 Token 工具��RTK/Caveman/Headroom 等），**那么** AI Agent 推荐安装这些工具并说明各自的 Token 节省原理。
6. **给定** 分析完成，**当** AI Agent 输出建议报告时，**那么** 报告底部显示预估总 Token 节省量（绝对值+占当前占用的百分比）。

---

### 用户故事 3 - AI Agent 执行优化操作 (优先级: P3)

作为 CodeBuddy 用户，我希望在对话中通过 `/stk-optimize` 命令让 AI Agent 根据优化建议自动执行优化操作，包括修改配置文件、禁用 MCP/Skill、精简 CODEBUDDY.md 等，并在修改前备份、支持回滚。

**优先级原因**: 自动执行是体验闭环的最后一步。由 AI Agent 来执行优化操作，可以利用其理解上下文的能力做出更智能的决策（例如精简 CODEBUDDY.md 时保留关键内容）。

**独立测试**: 在已有优化建议（`analysis.json`）的前提下，用户在 CodeBuddy 对话中运行 `/stk-optimize`，AI Agent 展示每条建议的修改方案，用户确认后执行，结果写入 `tasks.json`。本期不实现回滚。

**验收场景**:

1. **给定** 优化建议报告已生成，**当** 用户在 CodeBuddy 中执行 `/stk-optimize` 时，**那么** AI Agent 列出每条建议的修改方案（before/after），用户可逐条确认或全部应用。
2. **给定** 用户确认关闭某个 Skill，**当** AI Agent 执行优化时，**那么** AI Agent 修改 `settings.json` 的 `enabledPlugins` 将该项设为 false，先备份原文件，并提示操作结果。
3. **给定** 用户确认用 CLI 替代某个 MCP，**当** AI Agent 执行优化时，**那么** AI Agent 将 MCP 从 `.mcp.json` 中禁用（而非直接删除），并提示用户安装对应 CLI 工具的命令。
4. **给定** 用户确认精简 CODEBUDDY.md，**当** AI Agent 执行优化时，**那么** AI Agent 生成精简后的内容并写入，原文件备份。
5. **给定** 任何优化操作执行失败（如文件权限问题），**当** 操作失败时，**那么** AI Agent 停止后续操作并在 `tasks.json` 中标记该任务 `failed`，显示清晰的错误信息。本期不实现自动回滚，提示用户手动恢复。
6. **给定** 优化已应用，**当** 用户希望撤销时，**那么** 由用户手动恢复（本期无 `stk rollback`）。

---

### 用户故事 4 - AI Agent 生成优化结果对比报告 (优先级: P4)

作为 CodeBuddy 用户，我希望在优化操作完成后，通过 `/stk-report` 命令让 AI Agent 自动对比优化后的 Token 占用变化，生成一份清晰的结果对比报告，让我直观地看到各项优化的实际效果。

**优先级原因**: 优化结果的量化对比是验证优化效果的关键。用户需要知道"我到底省了多少 Token"，而不仅仅是"我做了什么操作"。这为用户持续优化提供了数据支撑和信心。

**独立测试**: 优化操作已执行后，用户重新运行 `stk diagnose >> ./save-token/diagnosis-report2.md` 获取优化后的诊断数据，然后在 CodeBuddy 对话中运行 `/stk-report`，AI Agent 读取优化前后的诊断报告和 `tasks.json`，生成对比报告并存入 `./save-token/save-token-report.json`（及可选 `save-token-report.md`）。

**对比报告数据源**:

| 文件                                | 说明                                               |
| ----------------------------------- | -------------------------------------------------- |
| `./save-token/diagnosis-report.md`  | 优化前的诊断报告（Markdown）                       |
| `./save-token/diagnosis-report2.md` | 优化后重新诊断的报告（Markdown）                   |
| `./save-token/tasks.json`           | `/stk-optimize` 阶段生成的优化任务执行结果（可选） |

**验收场景**:

1. **给定** 优化操作已执行且重新诊断完成（`diagnosis-report2.md` 存在），**当** 用户在 CodeBuddy 中执行 `/stk-report` 时，**那么** AI Agent 读取优化前（`diagnosis-report.md`）、优化后（`diagnosis-report2.md`）和任务清单（`tasks.json`，可选）的数据。
2. **给定** AI Agent 已读取对比数据，**当** 生成对比报告时，**那么** 报告包含以下内容：
   - 优化前后 Token 总占用对比（绝对值变化 + 百分比变化，由两 `.md` 总 Token 直接相减）
   - 按类别（System Prompt/Tools/Skills/Memory/Messages）分解的 Token 变化明细表
   - 每条已执行优化任务的执行状态和实际效果（从 `tasks.json` 中读取任务，标注已完成/部分完成/失败）
   - 总体节省摘要（总节省 Token 数、节省比例）
3. **给定** 某条优化任务的预期效果与实际效果不符（如预估节省 500 Token，实际节省 200 Token），**当** AI Agent 生成对比报告时，**那么** 报告标注该任务的偏差并给出可能原因分析。
4. **给定** 对比报告生成完成，**当** AI Agent 输出报告时，**那么** 报告**必须**以 JSON 写入 `./save-token/save-token-report.json`，并可在对话中展示摘要（可选 `save-token-report.md`）。
5. **给定** 优化前诊断报告不存在（`diagnosis-report.md` 缺失），**当** 用户执行 `/stk-report` 时，**那么** AI Agent 提示"缺少优化前诊断数据，请先运行 /stk-diagnose 采集基线数据"。
6. **给定** 优化后诊断报告不存在（`diagnosis-report2.md` 缺失），**当** 用户执行 `/stk-report` 时，**那么** AI Agent 提示"缺少优化后诊断数据，请先运行 stk diagnose >> ./save-token/diagnosis-report2.md"。
7. **给定** `tasks.json` 不存在，**当** 用户执行 `/stk-report` 时，**那么** AI Agent 仅对比前后诊断数据，不展示任务级别的执行效果。

---

### 用户故事 5 - stk init 安装 Commands (优先级: P5)

作为 CodeBuddy 用户，我希望运行 `stk init` 命令就能将 stk 的 Commands 一键安装到 CodeBuddy 全局配置中，效仿 OpenSpec-cn 的 `openspec-cn init` 体验。默认仅安装 Commands 到 `~/.codebuddy/commands/save-token-kit/`（全局生效），不安装 SKILL 文件。如果需要项目级安装或额外安装 SKILL，可通过 `--local` 和 `--skills` 参数控制。

**优先级原因**: `stk init` 是用户接入 stk 工作流的入口。全局安装意味着一次安装、所有项目可用，最大程度降低使用门槛。默认不安装 SKILL 是因为 SKILL 文件体积较大，仅在需要更精细的 AI Agent 行为引导时才安装。

**独立测试**: 运行 `stk init`，选择 CodeBuddy，验证 `~/.codebuddy/commands/save-token-kit/` 目录下已生成 4 个 Command 文件。然后即可在任意 CodeBuddy 项目中调用这些命令。

**交互流程**:

```
$ stk init

? 选择目标 AI Agent: (使用方向键)
❯ CodeBuddy
  Claude Code (暂不支持)
  Codex (暂不支持)
  Cursor (暂不支持)

✓ 已选择 CodeBuddy
✓ 已安装 Commands (4 个) 到 ~/.codebuddy/commands/save-token-kit/
✓ 初始化完成！现在可以在 CodeBuddy 中使用以下命令:
  /stk-diagnose  - 诊断 Token 占用
  /stk-analyze   - 分析 Token 优化空间
  /stk-optimize  - 执行优化操作
  /stk-report    - 生成优化结果对比报告
```

**验收场景**:

1. **给定** stk 已全局安装，**当** 用户运行 `stk init` 时，**那么** 系统展示 AI Agent 选择列表，当前仅 CodeBuddy 可选（其余标记为"暂不支持"）。
2. **给定** 用户选择了 CodeBuddy，**当** 安装执行时，**那么** 4 个 Command 文件写入 `~/.codebuddy/commands/save-token-kit/` 目录，不安装 SKILL 文件。
3. **给定** 用户运行 `stk init --local`，**当** 安装执行时，**那么** 4 个 Command 文件写入当前项目的 `.codebuddy/commands/save-token-kit/` 目录。
4. **给定** 用户运行 `stk init --skills`，**当** 安装执行时，**那么** 除 Commands 外，4 个 SKILL 文件也安装到 `~/.codebuddy/skills/` 目录。
5. **给定** 用户运行 `stk init --local --skills`，**当** 安装执行时，**那么** Commands 和 SKILL 均安装到项目级 `.codebuddy/` 目录。
6. **给定** 目标目录已有同名文件，**当** `stk init` 执行时，**那么** 系统提示"已存在，是否覆盖?"，用户确认后才覆盖。
7. **给定** 用户运行 `stk init --force`，**当** 执行时，**那么** 跳过确认直接覆盖已有文件。
8. **给定** 用户运行 `stk init --help`，**当** 查看帮助时，**那么** 显示命令用法、`--local`、`--skills`、`--force` 选项说明。

---

### 边界情况

- 当 `~/.codebuddy/` 目录不存在时，系统应友好提示用户 CodeBuddy 尚未初始化，并给出安装指引。
- 当 `codebuddy` 命令不在 PATH 中时，Proxy 无法拦截请求，应报错提示用户检查 CodeBuddy 安装。
- 当 Proxy 端口被占用时，应报告端口冲突并支持 `--port` 指定其他端口。
- 当 Proxy 长时间未收到任何请求时，应提示用户确认 `CODEBUDDY_BASE_URL` 配置是否正确。
- 当 `./save-token/` 目录已存在旧诊断文件时，新文件覆盖旧文件，无需确认。
- 当捕获的请求体包含超大内容（>10MB），应截断并标记，避免诊断报告自身膨胀。
- 当配置文件中存在 JSON 语法错误时，AI Agent 应报告解析失败的具体文件和行号，而非崩溃。
- 当用户同时运行多个 `stk diagnose` 实例时，系统应通过端口冲突检测并拒绝启动。
- 当 `.codebuddy/commands/` 或 `.codebuddy/skills/` 目录已存在同名文件时，`stk init` 应提示用户确认是否覆盖（除非指定 `--force`）。
- 当用户选择了标记为"暂不支持"的 AI Agent 时，应明确提示"该 Agent 暂不支持，欢迎贡献"并退出。

## 需求 _(必填)_

### 功能需求

**stk CLI 命令**:

- **FR-001**: 系统必须提供 `stk diagnose` 命令，通过 `--agent <name>` 指定目标 AI Agent（默认 `codebuddy`），启动本地 HTTP 代理服务器，拦截该 Agent 发送给 LLM 的 POST 请求，捕获请求体数据并生成诊断报告。本期仅实现 `codebuddy`，指定其他 Agent 时直接报错退出（退出码 1）。
- **FR-002**: `stk diagnose` 必须将拦截的原始 POST 请求体完整覆盖写入 `./save-token/proxy-raw-body.json`。
- **FR-003**: `stk diagnose` 必须将解析后的结构化诊断数据覆盖写入 `./save-token/diagnosis-report.json`，分解出 System Prompt、Tools 定义、Skills 引用、Memory Files、Messages 等组成部分，并包含各部分 Token 估算。该文件仅反映最近一次诊断，不保留历史。
- **FR-004**: `stk diagnose` 必须在控制台以 Markdown 格式输出诊断摘要（各部分 Token 占用、占比、Top N 消耗项）；CLI 不写 `.md` 文件，用户通过 `stk diagnose >> ./save-token/diagnosis-report.md`（首次）或 `>> ./save-token/diagnosis-report2.md`（优化后）重定向保存。
- **FR-005**: `stk diagnose` 必须支持 `--port <number>` 指定代理监听端口（默认 8899）。
- **FR-006**: `stk diagnose` 必须在收到 SIGTERM/SIGINT 时优雅关闭，已采集的数据正常写入 `./save-token/` 目录。
- **FR-007**: 系统必须提供 `stk init` 命令，效仿 OpenSpec-cn 的 `init`，通过交互式界面让用户选择目标 AI Agent，默认将 Commands 全局安装到 `~/.codebuddy/commands/save-token-kit/`，不安装 SKILL。
- **FR-008**: `stk init` 必须展示可用的 AI Agent 列表（CodeBuddy 可选，Claude Code/Codex/Cursor 等标记为"暂不支持"），用户通过方向键选择后安装。
- **FR-009**: `stk init` 必须支持 `--local` 标志，将 Commands 安装到项目级 `.codebuddy/commands/save-token-kit/` 而非全局目录。
- **FR-010**: `stk init` 必须支持 `--skills` 标志，额外安装 4 个 SKILL 文件到对应 Agent 的 skills 目录（全局 `~/.codebuddy/skills/` 或项目 `.codebuddy/skills/`）。
- **FR-011**: `stk init` 必须支持 `--force` 标志，跳过覆盖确认直接写入文件。
- **FR-012**: `stk init` 在目标目录已有同名文件且未指定 `--force` 时，必须提示用户确认是否覆盖。
- **FR-013**: 所有 CLI 命令必须支持 `--help` 显示使用说明。

**Commands 和 SKILL**:

- **FR-015**: 系统必须提供 `/stk-diagnose` Command，触发 AI Agent 启动 `stk diagnose` 采集诊断数据到 `./save-token/` 目录。
- **FR-016**: 系统必须提供 `/stk-analyze` Command，触发 AI Agent 基于诊断数据生成 Token 优化建议，并**必须**将建议以 JSON 落盘 `./save-token/analysis.json`（结构见 data-model.md §2）。
- **FR-017**: 系统必须提供 `/stk-optimize` Command，触发 AI Agent 读取 `analysis.json` 按优化建议执行优化操作（修改配置、禁用 MCP/Skill 等），并**必须**将执行结果以 JSON 落盘 `./save-token/tasks.json`（结构见 data-model.md §3）。
- **FR-018**: 系统必须提供 `/stk-report` Command，触发 AI Agent 读取优化前诊断报告（`diagnosis-report.md`）、优化后诊断报告（`diagnosis-report2.md`）和任务清单（`tasks.json`，可选），生成优化结果对比报告，并**必须**以 JSON 落盘 `./save-token/save-token-report.json`（结构见 data-model.md §4）。
- **FR-019**: 每个 Command 必须有对应的 SKILL 文件，定义 AI Agent 执行该命令时的具体指令、分析规则和执行步骤。
- **FR-020**: SKILL 文件必须使用中文编写，内容精简（符合 Token 节省原则），清晰描述 AI Agent 的行为规范。

**诊断数据**:

- **FR-021**: 诊断数据必须包含：上下文总览（各部分 Token 占用）、MCP 列表（名称/工具数量/状态）、Skill 列表（名称/来源/Token 占用）、配置文件摘要（CODEBUDDY.md 大小、settings.json 关键配置、hooks 列表）。
- **FR-022**: 诊断数据必须支持结构化 JSON 输出（`diagnosis-report.json`），字段命名使用英文，字段值中的描述文本使用中文。

### 关键实体 _(如果功能涉及数据则包含)_

- **诊断报告 (DiagnosisReport)**: Proxy 采集的完整数据，包含请求概览（请求次数、时间范围）、各部分 Token 占用明细（System Prompt/Tools/Skills/Memory/Messages）、MCP 列表、Skill 列表、配置文件摘要、采集时间戳。CLI 写 `diagnosis-report.json`，Markdown 由用户重定向为 `diagnosis-report.md` / `diagnosis-report2.md`。
- **优化建议 (OptimizationSuggestion)**: AI Agent 生成的单条建议（落盘 `analysis.json`），包含类型、目标、原因、预估节省 Token 数、风险等级、是否可逆、操作描述。
- **优化任务 (OptimizationTask)**: AI Agent 在 `/stk-optimize` 阶段生成的任务执行结果（落盘 `tasks.json`），每条任务包含关联建议 ID、操作类型、目标、执行状态、预估节省量、可逆性。
- **优化结果对比报告 (SaveTokenReport)**: AI Agent 生成的优化效果对比报告（落盘 `save-token-report.json`），包含优化前后 Token 占用对比、各类别变化明细、任务执行效果汇总、总体节省摘要。
- **rollback 已移除**：本期不实现 `stk rollback` 与备份记录。

## 成功标准 _(必填)_

### 可衡量的结果

- **SC-001**: `stk diagnose` 能成功拦截并解析 CodeBuddy 的 LLM 请求，诊断数据中各部分的 Token 占用与 CodeBuddy `/context` 命令输出的偏差在 20% 以内。
- **SC-002**: `stk diagnose` 对请求转发的延迟增加不超过 100ms（不影响正常对话体验）。
- **SC-003**: AI Agent 通过 `/stk-analyze` 生成的优化建议中，至少 80% 的建议确实有助于减少 Token 消耗且方案可行。
- **SC-004**: 执行优化操作后，用户的 CodeBuddy 上下文 Token 占用减少至少 15%。
- **SC-005**: 所有阶段（analyze/optimize/report）产出的建议/任务/对比报告均以机器可读 JSON（`analysis.json`/`tasks.json`/`save-token-report.json`）落盘，可被下一阶段或工具程序化消费。
- **SC-006**: 单元测试覆盖度达到 60% 以上，`stk diagnose` 命令有集成测试覆盖。
- **SC-007**: 用户首次使用即可通过 `stk init` + 4 个命令完成完整工作流：`stk init` → `/stk-diagnose` → `/stk-analyze` → `/stk-optimize` → `/stk-report`。
- **SC-008**: `stk init` 能在 5 秒内完成 Commands 和 SKILL 的安装。
- **SC-009**: Commands 和 SKILL 文件总 Token 占用不超过 5000 Token（示范 Token 节省原则）。

## 架构参考: OpenSpec 模式

本项目效仿 OpenSpec-cn 的 Commands + SKILL 驱动架构：

| OpenSpec-cn                         | Save Token Kit                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `openspec-cn init` — 初始化项目配置 | `stk init` — 安装 Commands 和 SKILL 到 AI Agent                                       |
| `/opsx:explore` — 探索项目结构      | `/stk-diagnose` — 诊断 Token 占用                                                     |
| `/opsx:propose` — 生成变更提案      | `/stk-analyze` — 生成优化建议                                                         |
| `/opsx:apply` — 执行变更            | `/stk-optimize` — 执行优化操作                                                        |
| `/opsx:archive` — 归档已完成变更    | `/stk-report` — 生成优化结果对比报告                                                  |
| CLI `openspec-cn` — 管理制品        | CLI `stk` — `stk init` / `stk diagnose`（诊断采集）；分析与优化由 Commands/SKILL 驱动 |

**工作流**: `/stk-diagnose` → `/stk-analyze` → `/stk-optimize` → (重新 `stk diagnose`) → `/stk-report`

**关键区别**: OpenSpec 的 CLI 管理整个规范驱动流程；而 stk 的 CLI 专注于数据采集（Proxy），分析决策和执行由 AI Agent 通过 Commands/SKILL 完成。

## 假设

- 用户已安装 CodeBuddy 并能在 PATH 中访问 `codebuddy` 命令。
- CodeBuddy 支持通过 `CODEBUDDY_BASE_URL` 环境变量设置自定义 API 端点（使 Proxy 能拦截请求）。
- CodeBuddy 发送给 LLM 的请求体为 JSON 格式，包含 `messages`、`tools`、`skills`、`system` 等可解析字段。
- Token 估算采用业界通用方法：ASCII 字符按 `length/3.3` 估算，CJK 字符单独计数。
- MCP 与 CLI 的替代关系基于已知的常见方案，由 AI Agent 在分析时判断。
- 优化操作仅修改 CodeBuddy 相关配置文件（`~/.codebuddy/` 和项目 `.codebuddy/`），不修改系统级设置。
- 本期仅支持 CodeBuddy，架构上预留扩展到其他 AI Agent 平台的能力。

## 范围界定

### 包含

- `stk init` CLI 命令：交互式选择 AI Agent + 安装 Commands 和 SKILL 文件
- `stk diagnose` CLI 命令：HTTP 代理拦截 + 请求体解析 + 诊断报告生成（2 个 JSON 到 `./save-token/`，Markdown 由重定向保存）
- 4 个 Commands：`/stk-diagnose`、`/stk-analyze`、`/stk-optimize`、`/stk-report`
- 4 个 SKILL 文件：每个 Command 对应的 AI Agent 执行指令
- 3 个 Agent 产出 JSON 契约：`analysis.json` / `tasks.json` / `save-token-report.json`（见 data-model.md §2–§4）
- 诊断数据 JSON 格式定义
- 单元测试（≥60% 覆盖）+ 集成测试（diagnose）

### 不包含（本期）

- Plugin 封装（仅通过 Commands + SKILL 驱动）
- `stk analyze`、`stk optimize`、`stk report` 等 CLI 命令（分析和优化由 AI Agent 完成）
- Claude Code、Codex、Cursor 等其他 AI Agent 平台的 Commands/SKILL 安装支持（`stk init` 中标记为"暂不支持"）
- Token 消耗的实时持续监控
- 云端配置同步
- GUI 界面
- 自动安装推荐工具（仅提示安装命令）
- 修改 `history.jsonl`/`blobs/` 等运行时数据（仅提示清理建议）
