# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## 项目定位

`save-token-kit`（CLI 名 `stk`）帮助 AI Agent 节省 Token。架构效仿 OpenSpec：**CLI 负责数据采集，`stk diagnose` 拦截 CodeBuddy 发往 API 的请求体并产出结构化报告；优化工作流由安装的 Commands / SKILL 驱动**（本仓库只负责采集与模板，不自动改写用户配置）。

## 常用命令

```bash
make install     # 安装依赖 (pnpm install)
make build       # unbuild 构建 ESM 单文件产物到 dist/cli.mjs
make test        # vitest run 运行全部测试
make cover       # 测试 + 覆盖率 (阈值 60%)
make lint        # eslint .
make format      # prettier --write .
make clean       # 清理 dist/ 与 coverage/
```

`package.json` 脚本等价于：`build`(unbuild)、`test`(vitest run)、`coverage`(vitest run --coverage)、`lint`(eslint .)、`format`(prettier --write .)。

运行单个测试（vitest 按文件路径过滤）：

```bash
pnpm vitest run tests/unit/proxy/parser.test.ts
pnpm vitest run tests/unit/proxy/parser.test.ts -t "parseRequestBody"
```

## 架构与数据流

CLI 入口 `src/cli.ts`（cac）注册三个命令：`diagnose`、`init`、`rollback`（rollback 为预留，仅提示手动恢复）。代理仅支持 `codebuddy`。

**`stk diagnose` 数据流（核心路径）：**

1. `commands/diagnose.ts` 启动透明 HTTP 代理（`proxy/server.ts` 的 `startProxy`），监听 `127.0.0.1`，拦截所有 `POST /v2/*` 请求体并原样转发到真实 CodeBuddy API（`CODEBUDDY_API_BASE` 或 `process.env.CODEBUDDY_API_BASE`）。端口占用时回退随机端口（`server.ts:92`）。
2. 触发命令要求 CodeBuddy 发出一次真实请求，`findMainChatBody`（`server.ts:121`）用启发式（含 user message + tools/多 message）从捕获体里挑出主对话请求。
3. `proxy/parser.ts` 的 `parseRequestBody` 把请求体解析为 `ProxyDiagnosisData`：按前缀（`mcp__`/`headroom_`）和 `BUILTIN_TOOLS`/`DEFERRED_TOOLS` 集合分类工具，并从 `<available_skills>`、`<available_deferred_tools>` 文本块中正则提取 skill / MCP 引用与令牌估算（估算为 `length/4` 的经验值）。
4. `collectors/fs-collector.ts` 的 `scanFilesystem(adapter)` 直接读磁盘：MCP 配置、SKILL、插件、hooks、rules、配置文件大小（`FsCollectResult`）。
5. `proxy/report.ts` 的 `buildDiagnosisReport` 合并 3 与 4，产出 `DiagnosisReport`（`types/index.ts` 定义的契约），写入 `./save-token/diagnosis-report.json` 与 `proxy-raw-body.json`，控制台打印 `renderMarkdown` 摘要。
6. 第三方省 Token 工具检测通过 `tools/registry.ts` 注册表（`tools/index.ts` 导入各 `impl/*` 触发自注册）配合 `detectToolsViaRegistry` 完成。

**契约类型（`src/types/index.ts`）** 是数据模型核心，需跨多文件理解：

- `DiagnosisReport` ← `stk diagnose`（JSON 契约见文件头注释，对应 `diagnosis-report.json`）
- `AnalysisFile`（analysis.json）← `/stk-analyze`；`TasksFile`（tasks.json）← `/stk-optimize`；`SaveTokenReport`（save-token-report.json）← `/stk-report`
- `ProxyDiagnosisData` / `ProxyCapture` 是代理采集的中间结构

**适配器层（`src/adapters/`）**：`platform-adapter.ts` 定义 `PlatformAdapter` 抽象接口（安装路径、代理环境变量、触发命令、headless 探测、配置路径解析）。目前只有 `codebuddy-adapter.ts` 实现；其它 Agent 在接口中已预留（`supported=false`）。

**模板（`src/templates/`）**：`commands/*.md`（4 个触发命令）+ `skills/*/SKILL.md`（4 个 SKILL），由 `commands/init.ts` 复制到 `~/.codebuddy/`（或 `--local` 项目级）。

## 代码风格

- TypeScript strict，ESM，`.js` 扩展名显式导入（NodeNext）。
- 英文代码注释 + 中文文档/用户可见文案（报告、模板、CLI 输出）。
- 遵循 `.eslint.config.js` / `.prettierrc`。
- 单元测试覆盖率 ≥ 60%（`pnpm cover` 验证），测试在 `tests/unit/`（proxy / collectors / commands / cli）与 `tests/integration/`（diagnose）。

## 关键约束

- `proxy/server.ts` 中代理转发依赖真实 CodeBuddy API 可达；诊断数据 100% 来自拦截的请求体，不做额外 Agent 调用，故秒级完成。
- 优化操作不自动备份，`rollback` 仅提示手动恢复——任何“节省 Token”的修改都是用户侧配置变更，本工具不反向修改。
- 令牌估算全为 `length/4` 经验值，非真实 tokenizer，仅用于相对比较。
- 所有产出物包括中间产物我最终报告等，都统一在`./save-token`文件夹。

## 上下文节省（文档读取约定）

本仓库含大量文档类 markdown（changelog、示例 docs、历史说明等，约 84 个）。为减少不必要的上下文占用：

- **不要主动读取** `CHANGELOG*`、`**/changelog*`、纯文档目录（如 `docs/`、`examples/` 下的说明文档）等大体积 markdown，除非用户明确指向或任务确实需要。
- 需要了解项目用法时，优先参考本 CODEBUDDY.md 与 `src/types/index.ts` 契约定义，而非回读全部文档。
- skill 描述与插件说明已自动注入上下文，无需为“了解某个 skill 做什么”而额外读取其 SKILL.md。
