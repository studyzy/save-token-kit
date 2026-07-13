# 实施计划: Save Token Kit (stk)

**分支**: `001-save-token-kit` | **日期**: 2026-07-10 | **规范**: [spec.md](./spec.md)
**输入**: 来自 `/specs/001-save-token-kit/spec.md` 的功能规范

## 摘要

Save Token Kit (stk) 是一个帮助 AI Agent 节省 Token 的 CLI 工具，效仿 OpenSpec-cn 的 Commands + SKILL 驱动架构。stk CLI 提供 3 个命令：`stk init`（默认全局安装 Commands 到 `~/.codebuddy/commands/`，通过 `--local`/`--skills`/`--force` 控制安装行为）、`stk diagnose`（通过 HTTP Proxy 拦截 LLM 请求并生成诊断报告）、`stk rollback`（从备份恢复配置）。Token 分析、优化执行和结果报告由 AI Agent 通过 4 个 Commands（`/stk-diagnose`、`/stk-analyze`、`/stk-optimize`、`/stk-report`）和对应的 SKILL 文件完成。

## 技术背景

**语言/版本**: TypeScript 5.x, strict 模式
**主要依赖**: cac (CLI), ansis (颜色), @inquirer/prompts (交互), tinyexec (子进程)
**存储**: 文件系统（`./save-token/` 输出目录, `~/.codebuddy/` 备份目录）
**测试**: Vitest + @vitest/coverage-v8, 覆盖率阈值 60%
**目标平台**: Node.js >= 18, macOS/Linux/Windows
**项目类型**: CLI 工具
**性能目标**: Proxy 转发延迟 <100ms, `stk init` 在 5s 内完成
**约束条件**: 依赖精简（Token 效率原则）, 单函数 ≤50 行
**规模/范围**: 3 个 CLI 命令, 4 个 Commands, 4 个 SKILL, ~25 源文件

## 章程检查

_门控: 必须在阶段 0 研究前通过. 阶段 1 设计后重新检查._

### I. CLI 优先 ✅

- [x] 所有核心能力通过 `stk <command>` 调用：`stk init`, `stk diagnose`（分析/优化/对比由 Commands/SKILL 驱动）
- [x] CLI 参数遵循 POSIX 规范：`stk <verb> [options]`
- [x] 支持 `--help` 和 `--version`
- [x] stdout 输出结果，stderr 输出错误
- [x] 诊断报告支持 Markdown 和 JSON 格式

### II. Token 效率优先 ✅

- [x] SKILL 文件内容精简，总 Token < 5000
- [x] 输出格式默认紧凑
- [x] 命令输出避免装饰性内容
- [x] 项目自身的 Commands/SKILL 示范 Token 节省原则

### III. 测试驱动质量 ✅

- [x] 测试框架：Vitest
- [x] 覆盖率目标 ≥60%
- [x] 关键 CLI 命令有集成测试
- [x] 测试文件命名：`*.test.ts`

### IV. 简洁至上 ✅

- [x] 单函数 ≤50 行
- [x] 使用标准库和轻量依赖（cac, ansis, tinyexec）
- [x] 不引入不必要的抽象层
- [x] 复杂逻辑有英文注释

### V. 文档即产品 ✅

- [x] README、帮助文本使用中文
- [x] 代码注释使用英文
- [x] 每个 CLI 命令有 `--help` 输出
- [x] 架构决策记录在 `.specify/` 中

### 设计后重新检查 ✅

- 所有章程原则在设计阶段得到遵守
- 项目结构保持简单，职责分离清晰
- 无违反章程的设计决策

## 项目结构

### 文档(此功能)

```
specs/001-save-token-kit/
├── spec.md              # 功能规范
├── plan.md              # 此文件
├── research.md          # 技术研究
├── data-model.md        # 数据模型
├── quickstart.md        # 快速入门
├── contracts/
│   ├── cli.md           # CLI 接口合同
│   └── commands.md      # Command 接口合同
├── checklists/
│   └── requirements.md  # 规范质量检查清单
└── tasks.md             # 阶段 2 输出 (/speckit.tasks)
```

### 源代码(仓库根目录)

```
src/
├── cli.ts                    # CLI 入口 (cac)
├── commands/
│   ├── diagnose.ts           # stk diagnose 实现
│   └── init.ts               # stk init 实现
├── adapters/
│   ├── platform-adapter.ts   # 抽象接口 (预留多平台)
│   └── codebuddy-adapter.ts  # CodeBuddy 实现
├── proxy/
│   ├── server.ts             # HTTP 代理服务器
│   └── parser.ts             # 请求体解析
├── collectors/
│   └── token-estimator.ts    # Token 估算
├── templates/
│   ├── commands/             # 4 个 Command 模板
│   │   ├── diagnose.md
│   │   ├── analyze.md
│   │   ├── optimize.md
│   │   └── report.md
│   └── skills/               # 4 个 SKILL 模板
│       ├── st-diagnose/
│       │   └── SKILL.md
│       ├── st-analyze/
│       │   └── SKILL.md
│       ├── st-optimize/
│       │   └── SKILL.md
│       └── st-report/
│           └── SKILL.md
└── types/
    └── index.ts              # 类型定义 (含 analysis.json/tasks.json/save-token-report.json 契约)

tests/
├── unit/
│   ├── proxy/
│   │   ├── server.test.ts
│   │   └── parser.test.ts
│   ├── collectors/
│   │   └── token-estimator.test.ts
│   └── adapters/
│       └── codebuddy-adapter.test.ts
└── integration/
    ├── diagnose.test.ts
    └── init.test.ts
```

**结构决策**: 单体 TypeScript CLI 项目，参考 save-token 的分层结构。去掉 save-token 中不需要的模块（analyzers、tools、i18n、utils/output.ts 等），新增 `templates/` 目录存放 Command/SKILL 模板文件。使用 `unbuild` 单文件打包，`vitest` 测试。

## 复杂度跟踪

> 无章程违规，无需填写。

## 实施阶段

### 阶段 1: 基础设施（基础层）

1. 项目初始化：package.json, tsconfig.json, vitest.config.ts, build.config.ts
2. 类型定义：`src/types/index.ts`
3. CLI 入口：`src/cli.ts` (cac 框架搭建)
4. Token 估算器：`src/collectors/token-estimator.ts`

### 阶段 2: 核心功能（Proxy + 诊断）

5. HTTP 代理服务器：`src/proxy/server.ts`
6. 请求体解析器：`src/proxy/parser.ts`
7. CodeBuddy 适配器：`src/adapters/codebuddy-adapter.ts`
8. diagnose 命令：`src/commands/diagnose.ts`

### 阶段 3: 管理功能（Init）

9. init 命令：`src/commands/init.ts`

### 阶段 4: Commands 和 SKILL

10. Command 模板：4 个 `.md` 文件（diagnose/analyze/optimize/report）
11. SKILL 模板：4 个 `SKILL.md` 文件
12. 在 SKILL/Command 中明确 Agent 产出 JSON 契约：analyze→`analysis.json`、optimize→`tasks.json`、report→`save-token-report.json`

### 阶段 5: 测试

13. 单元测试：proxy, parser, token-estimator, adapter
14. 集成测试：diagnose, init
15. 覆盖率验证：≥60%（parser/estimator 等可测模块重点覆盖）

### 阶段 6: 文档和发布

17. README.md
18. Changesets 配置
19. CI/CD (GitHub Actions)
