# 架构与数据流（按需加载参考）

本文件从 CODEBUDDY.md 下沉而来，仅在需要理解实现细节时阅读。

## CLI 入口与命令

`src/cli.ts`（cac）注册三个命令：`diagnose`、`init`、`rollback`（`rollback` 为预留，仅提示手动恢复）。代理支持 `codebuddy`、`claude`、`codex`。

## `stk diagnose` 数据流（核心路径）

1. `commands/diagnose.ts` 启动透明 HTTP 代理（`proxy/server.ts` 的 `startProxy`），监听 `127.0.0.1`，按 agent 拦截对应路径前缀的 POST 请求体（CodeBuddy `/v2/*`、Claude `/v1/*`、CodeX `/v1/*`）并原样转发到真实上游 API（CodeBuddy `CODEBUDDY_API_BASE`、Claude `ANTHROPIC_BASE_URL`、CodeX 从 config.toml 解析 provider 的 `base_url`）。端口占用时回退随机端口（`server.ts:92`）。
2. 触发命令要求 Agent 发出一次真实请求（CodeBuddy/Claude 通过环境变量指向代理，CodeX 通过 `-c` 配置覆盖且需忽略 stdin），`findMainChatBody`（`server.ts:121`）用启发式（含 user message + tools/多 message）从捕获体里挑出主对话请求。
3. `proxy/parser.ts` 的 `parseRequestBody(body, agentName)` 按 agent 分派到对应解析器：`proxy/codebuddy-parser.ts`（`parseCodeBuddyRequestBody`）、`proxy/claude-parser.ts`（`parseClaudeRequestBody`）、`proxy/codex-parser.ts`（`parseCodexRequestBody`，OpenAI Responses API 格式），三者共享 `proxy/parser-core.ts`（消息/工具分解、MCP 聚合、令牌估算）。工具仅按前缀（`mcp__`/`headroom_`）区分 MCP，其余均为内置工具；从 `<available_skills>`、`<available_deferred_tools>` 文本块中正则提取 skill / MCP 引用与令牌估算（估算为 `length/4` 的经验值）。
4. `collectors/fs-collector.ts` 的 `scanFilesystem(adapter)` 直接读磁盘：MCP 配置、SKILL、插件、hooks、rules、配置文件大小（`FsCollectResult`）。
5. `proxy/report.ts` 的 `buildDiagnosisReport` 合并 3 与 4，产出 `DiagnosisReport`（`types/index.ts` 定义的契约），写入 `./save-token/diagnosis-report.json` 与 `proxy-raw-body.json`，控制台打印 `renderMarkdown` 摘要。
6. 第三方省 Token 工具检测通过 `tools/registry.ts` 注册表（`tools/index.ts` 导入各 `impl/*` 触发自注册）配合 `detectToolsViaRegistry` 完成。

## 契约类型（`src/types/index.ts`）

数据模型核心，需跨多文件理解：

- `DiagnosisReport` ← `stk diagnose`（JSON 契约见文件头注释，对应 `diagnosis-report.json`）
- `AnalysisFile`（analysis.json）← `/stk-analyze`；`SaveTokenReport`（save-token-report.json）← `/stk-report`
- `ProxyDiagnosisData` / `ProxyCapture` 是代理采集的中间结构

## 适配器层（`src/adapters/`）

`platform-adapter.ts` 定义 `PlatformAdapter` 抽象接口（安装路径、代理环境变量、代理重定向参数、触发命令、headless 探测、配置路径解析）。当前实现有 `codebuddy-adapter.ts`、`claude-adapter.ts`、`codex-adapter.ts`（`codex` 通过 `-c model_providers.<id>.base_url` 配置覆盖指向代理，而非环境变量）；`cursor` 等其它 Agent 已预留（`supported=false`）。

## 模板（`src/templates/`）

`commands/*.md`（4 个触发命令）+ `skills/*/SKILL.md`（4 个 SKILL），由 `commands/init.ts` 复制到 `~/.codebuddy/`（或 `--local` 项目级）。
