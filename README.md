<div align="center">

# Save Token Kit (stk)

**为 AI Agent 节省 Token 的 CLI 工具** — 诊断上下文占用，驱动优化工作流。

为 **CodeBuddy · Claude Code · CodeX** 提供透明代理诊断、结构化 Token 报告与可执行的优化建议。

`npm` · `stk diagnose` · `/stk-analyze`

</div>

---

## 简介

`stk` 是一个帮助 AI Agent 节省 Token 的命令行工具。它采用 **OpenSpec 式架构**：

- **CLI (`stk`)** 负责数据采集 — 通过透明 HTTP 代理拦截 LLM 请求体，产出结构化诊断报告（不额外调用 Agent，秒级完成）；
- **AI Agent** 通过安装的 SKILL（`/stk-diagnose`、`/stk-analyze`、`/stk-optimize`、`/stk-report`）驱动"诊断 → 分析 → 优化 → 报告"的完整工作流。

仓库只负责采集与模板，**不自动改写用户配置**——任何节省 Token 的修改都是用户侧配置变更，工具不反向修改。

## 特性

- **多 Agent 支持** — 同时支持 CodeBuddy、Claude Code、CodeX 的诊断与优化，自动检测当前运行环境
- **透明代理诊断** — 拦截真实 LLM 请求体，100% 基于实际数据，非估算模拟
- **结构化报告** — 输出 `diagnosis-report.json` / `.md`，按 system-prompt、tools、skills、MCP、rules、hooks、messages 等维度拆解 Token 占用
- **SKILL 驱动工作流** — 安装后 Agent 对话内即可运行 `/stk-analyze`、`/stk-optimize`、`/stk-report`
- **零副作用** — 诊断数据全部来自拦截的请求体，不做额外 Agent 调用，秒级完成

## 安装

需要 **Node.js ≥ 18**。

```bash
npm install -g @studyzy/save-token-kit
# 或
pnpm add -g @studyzy/save-token-kit
```

## 快速开始

### 1. 初始化（安装 SKILL）

在项目根目录运行，选择目标 Agent（`codebuddy` / `claude` / `codex`）：

```bash
stk init
```

完成后，对应 Agent 的对话中即可使用以下命令：

| 命令            | 作用                                     |
| --------------- | ---------------------------------------- |
| `/stk-diagnose` | 采集当前会话 Token 占用基线数据          |
| `/stk-analyze`  | 分析 Token 优化空间，给出节省建议        |
| `/stk-optimize` | 执行优化操作                             |
| `/stk-report`   | 生成优化前后的 Token 对比报告            |

### 2. 诊断 Token 占用

```bash
stk diagnose                        # 自动检测 Agent，默认 codebuddy
stk diagnose --agent claude         # 显式指定 Agent
stk diagnose --agent codex
stk diagnose --report-path ./save-token/diagnosis-report.md
```

`stk diagnose` 在 `./save-token/` 下生成：

- `proxy-raw-body.json` — 拦截到的原始请求体
- `diagnosis-report.json` — 结构化 JSON 报告（每次覆盖）

控制台输出 Markdown 摘要，也可用 `--report-path` 直接写入 `.md` 文件。

### 3. 分析 / 优化 / 报告

在目标 Agent 对话中依次运行：

```
/stk-diagnose → /stk-analyze → /stk-optimize → /stk-report
```

各阶段产物：

| 文件                     | 阶段          | 说明                              |
| ------------------------ | ------------- | --------------------------------- |
| `analysis.json`          | `/stk-analyze` | 优化建议（机器可读）             |
| `save-token-report.json` | `/stk-report`  | 前后 Token 对比报告              |

优化后再次运行 `stk diagnose --report-path ./save-token/diagnosis-report2.md` 即可对比效果。

## 命令参考

### `stk diagnose`

拦截 LLM 请求体，产出 Token 诊断报告。

| 选项                    | 默认值      | 说明                                                          |
| ----------------------- | ----------- | ------------------------------------------------------------- |
| `--agent <name>`        | `codebuddy` | 目标 Agent（`codebuddy` / `claude` / `codex`）                |
| `--port <number>`       | `8899`      | 代理端口（占用时自动回退随机端口）                            |
| `--report-path <path>`  | 控制台输出  | 将 Markdown 报告写入指定路径而非打印到控制台                  |

### `stk init`

为指定 AI Agent 安装 SKILL 文件。

| 选项             | 说明                                                          |
| ---------------- | ------------------------------------------------------------- |
| `--agent <name>` | 目标 Agent（`codebuddy` / `claude` / `codex`，默认 `codebuddy`）|
| `--local`        | 安装到项目级 `.codebuddy/`（默认全局 `~/.codebuddy/`）        |
| `--force`        | 覆盖已存在的文件                                              |

### `stk install <tool>`

安装第三方省 Token 工具并注册到 AI Agent。

| 选项            | 说明                                                          |
| --------------- | ------------------------------------------------------------- |
| `-g, --global`  | 安装到全局 `~/.codebuddy/`（默认）                            |
| `--local`       | 安装到项目级 `.codebuddy/`                                    |
| `--agent <name>`| 目标 Agent（默认 `codebuddy`）                                |

### `stk proxy`

启动代理并记录所有 CodeBuddy API 请求/响应到磁盘。

| 选项              | 说明                                              |
| ----------------- | ------------------------------------------------- |
| `--port <number>` | 代理端口（默认随机）                              |
| `--upstream <url>`| 上游 API 地址（默认 `CODEBUDDY_API_BASE` 环境变量）|
| `--trace-dir`     | 覆盖 trace 输出目录                              |

### `stk rollback`

预留命令。优化操作不自动备份，故 `rollback` 仅提示手动恢复。

## 架构

```
┌─────────────┐   透明 HTTP 代理     ┌──────────────┐
│  AI Agent   │ ───────────────────▶ │  stk diagnose │
│(CodeBuddy/  │   拦截 LLM 请求体     │   (stk CLI)   │
│ Claude/CodeX)│                     └──────┬───────┘
└─────────────┘                            │
                                    诊断报告 (JSON / MD)
                                           │
                                  SKILL 驱动优化工作流
                                  /stk-diagnose → analyze → optimize → report
```

- **采集**：`stk diagnose` 启动透明代理，重定向 Agent 流量，触发一次 LLM 请求并捕获请求体，解析为结构化报告。
- **工作流**：优化由安装的 SKILL 驱动，CLI 不反向修改用户配置。
- **估算**：Token 估算采用 `length/4` 经验值，非真实 tokenizer，仅用于相对比较。

## 开发

```bash
pnpm install    # 安装依赖
pnpm build      # unbuild 产出 ESM 单文件 dist/cli.mjs
pnpm test       # vitest 运行测试
pnpm coverage   # 测试 + 覆盖率（阈值 60%）
pnpm lint       # ESLint 检查
pnpm format     # Prettier 格式化
```

或使用 Makefile 统一入口：`make install / build / test / cover / lint / format / clean`。

## 关键目录

```
src/
├── cli.ts                 # CLI 入口，注册命令
├── commands/              # diagnose / init / install / proxy / rollback
├── proxy/                 # 透明代理、解析器、报告渲染
├── collectors/            # 磁盘采集（MCP / SKILL / hooks / rules 等）
├── adapters/              # Agent 适配器
├── templates/             # SKILL 模板
└── types/                 # 数据契约（DiagnosisReport 等）
tests/
├── unit/                  # 单元测试
└── integration/           # 集成测试（diagnose）
```

## 当前限制

- Plugin 封装尚未提供
- `cursor` 等其他 AI Agent 平台暂不支持
- 不提供实时持续监控、云端同步、GUI 与自动回滚
- `stk analyze` / `optimize` / `report` 等 CLI 命令由 AI Agent 的 SKILL 完成

## License

MIT
