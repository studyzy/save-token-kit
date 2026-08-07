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

## 关键文件索引（Resource Map）

- `src/cli.ts` — CLI 入口，注册 `diagnose`/`init`/`rollback` 命令
- `src/types/index.ts` — 数据契约核心（`DiagnosisReport` 等类型）
- `src/proxy/server.ts` — 透明 HTTP 代理，拦截 CodeBuddy API 请求体
- `src/commands/diagnose.ts` — 诊断命令主流程
- `src/collectors/fs-collector.ts` — 直接读磁盘采集 MCP/SKILL/hooks/rules 等
- `docs/architecture.md` — 架构与 `stk diagnose` 完整数据流的按需参考

## 代码风格

- TypeScript strict，ESM，`.js` 扩展名显式导入（NodeNext）。
- 遵循 `.eslint.config.js` / `.prettierrc`。
- 单元测试覆盖率 ≥ 60%（`pnpm cover` 验证），测试在 `tests/unit/`（proxy / collectors / commands / cli）与 `tests/integration/`（diagnose）。

## 关键约束

- `proxy/server.ts` 中代理转发依赖真实 CodeBuddy API 可达；诊断数据 100% 来自拦截的请求体，不做额外 Agent 调用，故秒级完成。
- 优化操作不自动备份，`rollback` 仅提示手动恢复——任何“节省 Token”的修改都是用户侧配置变更，本工具不反向修改。
- 令牌估算全为 `length/4` 经验值，非真实 tokenizer，仅用于相对比较。
- 所有产出物包括中间产物与最终报告等，都统一在 `./save-token` 文件夹。

## 上下文节省（文档读取约定）

@.codebuddy/rules/doc-reading.md

## graphify

@.codebuddy/rules/graphify.md
