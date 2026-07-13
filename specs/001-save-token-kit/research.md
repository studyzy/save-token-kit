# 技术研究: Save Token Kit (stk)

**功能**: 001-save-token-kit
**日期**: 2026-07-10

## 1. CLI 框架选择

**决策**: 使用 `cac`（参考 save-token）

**理由**:

- save-token 已验证 `cac` 的轻量性和实用性
- 比 Commander.js 更精简（符合 Token 效率原则和章程"简洁至上"）
- 原生 TypeScript 支持，ESM 兼容
- 命令注册直观：`cli.command('diagnose').option(...).action(...)`

**替代方案**: Commander.js（OpenSpec-cn 使用）— 功能更全但更重，save-token-kit 的 CLI 命令数量少（3 个），cac 足够。

## 2. HTTP Proxy 实现

**决策**: 使用 Node.js 原生 `http` 模块实现（参考 save-token 的 `src/proxy/server.ts`）

**关键技术点**:

- **默认端口**: 8899（规范中定义），端口冲突时自动回退到随机端口
- **Agent 路由**: `--agent` 决定 Proxy 的目标配置（API base、触发命令、环境变量名）。本期仅 `codebuddy`：`CODEBUDDY_BASE_URL` + `codebuddy -p`；其他 Agent 暂未实现，由 CLI 在参数解析阶段拦截报错。
- **拦截目标**: `POST /v2/*` 路径的请求（CodeBuddy 发送给 LLM 的 API）
- **透明转发**: 根据目标 URL 协议选择 `http`/`https` 模块转发请求，不修改请求体
- **环境变量**: 启动 Proxy 前将 `CODEBUDDY_BASE_URL` 重定向到 `http://127.0.0.1:${port}/v2`，停止后还原
- **触发方式**: 启动 Proxy 后自动执行一次 `codebuddy -p "Hello" -y --max-turns 1` 触发真实请求（Agent 相关，未来按 `--agent` 切换）
- **请求体捕获**: 在 `req.on('end')` 中拦截有 body 的 POST 请求，JSON.parse 后保存

**理由**:

- save-token 的 Proxy 实现已充分验证，核心逻辑可复用
- 原生 `http` 模块零依赖，符合"简洁至上"原则
- 透明转发保证 CodeBuddy 正常对话不受影响（延迟 <100ms）

## 3. 请求体解析

**决策**: 实现独立的请求体解析器（参考 save-token 的 `src/proxy/parser.ts`）

**解析内容**:

- **Messages 分解**: 按 role（system/user/assistant）分类统计 token
- **特殊内容识别**: system prompt、memory files（`<system-reminder data-role="memory">`）、rules（`<rules>`、`codebuddyMd`）
- **Tools 分类**: builtin tools / MCP tools（`mcp__` 前缀）/ deferred tools
- **Skills**: 从 `<available_skills>` 块提取
- **MCP 服务器**: 从 `mcp__SERVER` 前缀聚合

**理由**: save-token 的解析器已覆盖 CodeBuddy 请求体的核心结构，字段识别准确。

## 4. Token 估算

**决策**: 采用 save-token 的 CJK 感知算法

**算法**:

- 纯 ASCII: `Math.ceil(content.length / 3.3)`（基于 cl100k/Claude BPE 实测，比朴素 4.0 更准）
- 混合 CJK: `Math.ceil(ASCII长度 / 3.3) + CJK字符数`（CJK ≈ 1.0 token/字符）
- 纯 ASCII 快路径：先 `!/[\u0080-\uFFFF]/.test(content)` 跳过逐字符扫描
- MCP 工具: 200 token/工具（基于字段 schema + 描述均值）
- 空串返回 0，非空串至少 1 token

**CJK 范围**: 平假名/片假名、CJK 扩展 A、CJK 统一表意、Hangul、全角半角、CJK 兼容、CJK 扩展 B-F

**理由**: save-token 的算法经过实测校准，比业界通用的 `length/4` 更精确。

## 5. `stk diagnose` 输出文件

**决策**: CLI 写 2 个 JSON 文件（每次覆盖）；Markdown 报告由用户重定向保存，CLI 不写 `.md`

| 文件                                 | 内容                                   | 来源                                                |
| ------------------------------------ | -------------------------------------- | --------------------------------------------------- |
| `./save-token/proxy-raw-body.json`   | 原始 POST 请求体                       | CLI 写入（覆盖）                                    |
| `./save-token/diagnosis-report.json` | 解析后的结构化 JSON 报告（仅最近一次） | CLI 写入（覆盖）                                    |
| `./save-token/diagnosis-report.md`   | 首次诊断 Markdown 报告                 | `stk diagnose >> ./save-token/diagnosis-report.md`  |
| `./save-token/diagnosis-report2.md`  | 优化后二次诊断 Markdown 报告           | `stk diagnose >> ./save-token/diagnosis-report2.md` |

**对比约定**：`/stk-report` 的 before/after 对比以两个 `.md` 文件为准；`diagnosis-report.json` 每次被覆盖、不保留历史。

**diagnosis-report.json 结构**: 基于 save-token 的 `DiagnosisReport` 类型，精简为必要字段：

- `scanTimestamp`: 扫描时间戳
- `codebuddyVersion`: CodeBuddy 版本
- `contextOverview`: Token 总览（totalTokens + breakdown 数组）
- `mcpList`: MCP 服务器列表
- `skillList`: Skill 列表
- `toolBreakdown`: 工具定义分类（builtin/mcp/deferred）
- `warnings`: 警告信息

## 6. `stk init` 实现

**决策**: 效仿 OpenSpec-cn 的 `InitCommand`（`src/core/init.ts`），使用 `@inquirer/prompts` 做交互式选择

**交互流程**:

1. 检测项目根目录（`.git` 或 `package.json`）
2. 展示 AI Agent 列表（CodeBuddy 可选，其余标记"暂不支持"）
3. 用户选择后，将 Commands 和 SKILL 文件写入对应目录
4. 已有文件时提示确认覆盖

**CodeBuddy 适配器**（参考 OpenSpec-cn 的 `codebuddyAdapter`）:

- Commands 路径: `.codebuddy/commands/save-token-kit/{command}.md`
- Skills 路径: `.codebuddy/skills/{skill}/SKILL.md`
- Frontmatter 格式: `name`, `description`, `argument-hint`

**Commands/SKILL 文件内容**: 预定义的模板文件，通过 CLI 内置的字符串模板生成，不需要从文件系统读取。

**理由**:

- OpenSpec-cn 的 init 模式已成熟验证
- `@inquirer/prompts` 提供良好的交互体验
- 适配器模式便于后续扩展（Claude Code、Cursor 等）

## 7. 本期不实现 rollback

本期范围仅覆盖 `stk diagnose` / `stk init` 两个 CLI 命令，分析与优化回滚交由用户手动处理。Agent 产出 JSON 契约见 data-model.md §2–§4。相关 `backup-manager` / `rollback` 模块不纳入本期实现，后续若需自动回滚再补充。

## 8. Commands 和 SKILL 文件格式

**决策**: 效仿 OpenSpec-cn 的格式

**Command 文件格式** (`.codebuddy/commands/save-token-kit/{name}.md`，文件名 `diagnose.md`/`analyze.md`/`optimize.md`/`report.md`):

```markdown
---
name: stk-diagnose
description: '诊断当前 CodeBuddy 环境的 Token 占用情况'
argument-hint: '[options]'
---

[中文指令正文，告诉 AI Agent 如何执行诊断]
```

**SKILL 文件格式** (`.codebuddy/skills/st-{name}/SKILL.md`):

```markdown
---
name: st-diagnose
description: 诊断 CodeBuddy Token 占用。当用户想要了解 Token 消耗情况时使用。
license: MIT
compatibility: 需要 stk CLI。
metadata:
  author: save-token-kit
  version: '1.0'
---

[中文指令正文，告诉 AI Agent 如何执行诊断]
```

**理由**: OpenSpec-cn 的格式已被 CodeBuddy 正确解析，YAML frontmatter 字段明确。

## 9. 项目结构

**决策**: 单体 TypeScript 项目，参考 save-token 的清晰分层

```
src/
├── cli.ts                    # CLI 入口（cac 注册命令）
├── commands/
│   ├── diagnose.ts           # stk diagnose 命令实现
│   └── init.ts               # stk init 命令实现
├── adapters/
│   ├── platform-adapter.ts   # 抽象接口（预留多平台扩展）
│   └── codebuddy-adapter.ts  # CodeBuddy 实现
├── proxy/
│   ├── server.ts             # HTTP 代理服务器
│   └── parser.ts             # 请求体解析器
├── collectors/
│   └── token-estimator.ts    # Token 估算
├── templates/
│   ├── commands/             # Command 模板（diagnose.md 等）
│   └── skills/               # SKILL 模板
└── types/
    └── index.ts              # 类型定义

tests/
├── unit/
│   ├── proxy/
│   │   ├── server.test.ts
│   │   └── parser.test.ts
│   ├── collectors/
│   │   └── token-estimator.test.ts
└── integration/
    ├── diagnose.test.ts
    └── init.test.ts
```

**理由**:

- save-token 的分层结构清晰，职责分离好
- 去掉 save-token 中不需要的模块（analyzers、tools、i18n 等）
- 新增 `templates/` 目录存放 Command/SKILL 模板

## 10. 构建与测试

**决策**: 使用 `unbuild` 构建 + `vitest` 测试（参考 save-token）

**构建配置**:

- `unbuild` 单文件打包，`entries: ['src/cli']`
- `declaration: true`，`clean: true`
- rollup: `emitCJS: false`（纯 ESM），`inlineDependencies: true`

**测试配置**:

- `vitest` + `@vitest/coverage-v8`
- 覆盖率阈值: 60%（branches/functions/lines/statements）
- 测试文件: `tests/**/*.test.ts`
- alias: `@` → `./src`

**理由**: save-token 已验证这套工具链稳定可靠。

## 11. 技术栈汇总

| 类别     | 选择                         | 参考来源          |
| -------- | ---------------------------- | ----------------- |
| 语言     | TypeScript strict, ESM       | 章程              |
| 运行时   | Node.js >= 18                | 章程              |
| 包管理   | pnpm                         | 章程              |
| CLI 框架 | cac                          | save-token        |
| 构建     | unbuild                      | save-token        |
| 测试     | vitest + @vitest/coverage-v8 | 章程 + save-token |
| 代码规范 | ESLint + Prettier            | 章程              |
| 交互提示 | @inquirer/prompts            | OpenSpec-cn       |
| 终端颜色 | ansis                        | save-token        |
| 子进程   | tinyexec                     | save-token        |
| 版本管理 | Changesets                   | 章程              |

## 12. 关键差异：stk vs save-token

| 维度     | save-token（旧版）                                      | stk（新版）                                                           |
| -------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| CLI 命令 | 6 个（diagnose/analyze/optimize/rollback/report/trace） | 2 个（diagnose/init）；analyze/optimize/report 由 Commands/SKILL 驱动 |
| 分析优化 | CLI 硬编码规则 + LLM 辅助                               | AI Agent 通过 Commands/SKILL 完成                                     |
| 多平台   | PlatformAdapter 接口（仅 CodeBuddy 实现）               | 预留扩展，本期仅 CodeBuddy                                            |
| i18n     | i18next（中英文）                                       | 无（章程"简洁至上"，中文默认）                                        |
| 插件     | 有 Plugin 封装                                          | 无（仅 Commands + SKILL）                                             |
| 安装     | npm 全局安装                                            | `stk init` 交互式安装 Commands/SKILL                                  |
