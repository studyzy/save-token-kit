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
make clean       # 清理 dist/、coverage/ 与 save-token/
```

运行单个测试（vitest 按文件路径过滤）：

```bash
pnpm vitest run tests/unit/proxy/parser.test.ts
pnpm vitest run tests/unit/proxy/parser.test.ts -t "parseRequestBody"
```

## CLI 命令（src/cli.ts）

`stk diagnose`（默认 mock 探测）/ `init` / `install <toolkit>` / `uninstall` / `proxy` / `usage` / `diff [before] [after]` / `verify` / `rules <update|status>`。支持 `--agent codebuddy/workbuddy/claude/codex`。

## 关键文件索引（Resource Map）

- `src/cli.ts` — CLI 入口，注册上述命令
- `src/types/index.ts` — 数据契约核心（`DiagnosisReport` 等类型）
- `src/adapters/` — 各 AI 平台适配器（proxy 端口/路径、配置目录等平台差异）
- `src/toolkits/` — 第三方工具数据驱动检测引擎（`ToolkitSpec` 声明式规格 + 规则库加载）
- `src/proxy/server.ts` — 透明 HTTP 代理，拦截 LLM API 请求体
- `src/proxy/` — 各平台协议解析器与报告/diff 渲染
- `src/commands/diagnose.ts` — 诊断命令主流程
- `src/collectors/fs-collector.ts` — 直接读磁盘采集 MCP/SKILL/hooks/rules 等
- `docs/architecture.md` — 架构与 `stk diagnose` 完整数据流的按需参考

## 代码风格

- TypeScript strict，ESM，`.js` 扩展名显式导入（NodeNext）。
- 遵循 `.eslint.config.js` / `.prettierrc`。
- 单元测试覆盖率 ≥ 60%（`pnpm cover` 验证），测试在 `tests/unit/`（adapters / collectors / commands / proxy / rules / templates / toolkits / types / utils 等）与 `tests/integration/`（diagnose / mock-protocols / rules-stack）。

## 贡献规范（提交 / PR / 测试约定）

@.codebuddy/rules/contributing.md

## 关键约束

- `stk diagnose` 默认 mock 模式（`mock: !live`），用协议 mock 应答探测请求，无需真实上游可达；`--live` 模式与 `stk proxy` 才转发到真实 API。诊断数据 100% 来自拦截的请求体，不做额外 Agent 调用，故秒级完成。
- 优化操作不自动备份，不提供 rollback 命令——任何“节省 Token”的修改都是用户侧配置变更，本工具不反向修改，撤销由用户手动恢复。
- 令牌估算全为 `length/4` 经验值，非真实 tokenizer，仅用于相对比较。
- 所有产出物包括中间产物与最终报告等，都统一在 `./save-token` 文件夹。

## 上下文节省（文档读取约定）

@.codebuddy/rules/doc-reading.md

## graphify

@.codebuddy/rules/graphify.md
