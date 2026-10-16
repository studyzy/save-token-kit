# 架构与数据流（按需加载参考）

本文件从 CODEBUDDY.md 下沉而来，仅在需要理解实现细节时阅读。

## CLI 入口与命令

`src/cli.ts`（cac）注册命令：`diagnose`、`init`、`install`、`uninstall`、`proxy`、`usage`、`diff [before] [after]`、`verify`、`rules <update|status>`。优化操作不自动备份，无 rollback 命令。支持 `--agent codebuddy|workbuddy|claude|codex`。

## `stk diagnose` 数据流（核心路径）

1. `commands/diagnose.ts` 启动透明 HTTP 代理（`proxy/server.ts` 的 `startProxy`），监听 `127.0.0.1`，按 agent 拦截对应路径前缀的 POST 请求体并原样转发到真实上游 API。各平台拦截前缀与上游来源：

   | Agent | 拦截路径前缀 | 上游 base URL 来源 |
   |---|---|---|
   | CodeBuddy | `/v1/` | `CODEBUDDY_BASE_URL`（默认 `https://tencent.sso.copilot.tencent.com`） |
   | WorkBuddy | `/chat/completions` | `CODEBUDDY_BASE_URL`（默认 `https://copilot.tencent.com`，实际走 `/v2/chat/completions`） |
   | Claude | `/v1/` | `ANTHROPIC_BASE_URL` > `settings.json` env > `https://api.anthropic.com` |
   | CodeX | `/v1/` | `config.toml` 中 provider 的 `base_url`，回退 `https://api.openai.com` |

   端口占用时回退随机端口（`server.ts` tryListen），并打印黄色警告。请求体按 `content-encoding` 解压**副本**用于解析/捕获/落盘（gzip/deflate/br 走 Node 内置 `zlib`；zstd 等未知编码跳过解析），转发始终使用原始字节（双轨）；超过 `MAX_PROXY_BODY_BYTES` 的请求体跳过解析但仍原样转发。

2. 触发命令要求 Agent 发出一次真实请求（CodeBuddy/Claude 通过环境变量指向代理，CodeX 通过 `-c` 配置覆盖且需忽略 stdin，WorkBuddy 需注入自定义模型并手动触发），`findMainChatBody`（`server.ts`）用启发式（含 user message + tools/多 message）从捕获体里挑出主对话请求。
3. `proxy/parser.ts` 的 `parseRequestBody(body, agentName)` 按 agent 分派到对应解析器：`proxy/codebuddy-parser.ts`（`parseCodeBuddyRequestBody`）、`proxy/claude-parser.ts`（`parseClaudeRequestBody`）、`proxy/codex-parser.ts`（`parseCodexRequestBody`，OpenAI Responses API 格式），三者共享 `proxy/parser-core.ts`（消息/工具分解、MCP 聚合、令牌估算）。工具仅按前缀（`mcp__`/`headroom_`）区分 MCP，其余均为内置工具；从 `<available_skills>`、`<available_deferred_tools>` 文本块中正则提取 skill / MCP 引用与令牌估算（估算统一走 `collectors/token-estimator.ts`，ASCII `length/4` + CJK 感知）。
4. `collectors/fs-collector.ts` 的 `scanFilesystem(adapter)` 直接读磁盘：MCP 配置、SKILL、插件、hooks、rules、配置文件大小（`FsCollectResult`）。
5. `proxy/report.ts` 的 `buildDiagnosisReport` 合并 3 与 4，产出 `DiagnosisReport`（`types/index.ts` 定义的契约），写入 `./save-token/diagnosis-report.json`，控制台打印 `renderMarkdown` 摘要。原始请求体快照 `proxy-raw-body.json` 含完整对话内容，**仅在 `stk diagnose --debug` 时写入**（默认不落盘）。
6. 第三方省 Token 工具检测为**数据驱动**：`toolkits/data-registry.ts` 从规则库的 `data.toolkits` 加载声明式 `ToolkitSpec`（`toolkits/spec.ts` 引擎 + `toolkits/handlers/` 少量专用 handler，如 rtk），由 `detectToolkitsViaRegistry` 遍历求值，无旧的 `tools/registry.ts` + `impl/*` 自注册架构。

## 契约类型（`src/types/index.ts`）

数据模型核心，需跨多文件理解：

- `DiagnosisReport` ← `stk diagnose`（JSON 契约见文件头注释，对应 `diagnosis-report.json`）
- `AnalysisFile`（analysis.json）← `/stk-analyze`；`SaveTokenReport`（save-token-report.json）← `/stk-report`
- `ProxyDiagnosisData` / `ProxyCapture` 是代理采集的中间结构

## 适配器层（`src/adapters/`）

`platform-adapter.ts` 定义 `PlatformAdapter` 抽象接口（安装路径、代理环境变量、代理重定向参数、触发命令、headless 探测、配置路径解析、`getSettingsPath`、`configDirEnvVar` 等）。**能力子接口**（如 `ModelInjectionCapability` + `supportsModelInjection` 类型守卫）供 `diagnose` 按能力分派，避免 `instanceof` 具体类。当前实现：

- `codebuddy-adapter.ts` — 拦截 `/v1/`，`proxyBasePath='/v1'`
- `workbuddy-adapter.ts` — 拦截 `/chat/completions`，`proxyBasePath='/v2'`；实现 `ModelInjectionCapability`（注入/移除 `stk-diagnose` 自定义模型）
- `claude-adapter.ts` — 拦截 `/v1/`，`needsIsolatedConfigDir` + `configDirEnvVar='CLAUDE_CONFIG_DIR'`
- `codex-adapter.ts` — 拦截 `/v1/`，通过 `-c model_providers.<id>.base_url` 配置覆盖指向代理

`cursor` 等其它 Agent 已预留（`supported=false`）。

## 模板（`src/templates/`）

`skills/*/SKILL.md`（`stk`、`stk-diagnose`、`stk-analyze`、`stk-optimize`、`stk-report` 五个 SKILL，其中 `stk` 为流水线编排入口；`stk-analyze`/`stk-optimize` 各自带 `agents/` 子 Agent 提示词），由 `commands/init.ts` 复制到 agent 配置目录（如 `~/.codebuddy/`，或 `--local` 项目级）。