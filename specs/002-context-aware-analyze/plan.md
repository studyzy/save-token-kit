# 实施计划: 上下文感知的 /stk:analyze 优化分析

**分支**: `002-context-aware-analyze` | **日期**: 2026-07-13 | **规范**: [spec.md](./spec.md)
**输入**: 来自 `/specs/002-context-aware-analyze/spec.md` 的功能规范

## 摘要

让 `/stk:analyze` 在产出优化建议前先了解用户实际用途（代码编写/文档写作/通用办公）与代码/文档是否同仓，并据此裁剪、重排、归因建议。采用**最简实践**：仅修改两个现有 Markdown 模板（`commands/analyze.md` + `skills/stk-analyze/SKILL.md`），不新增 TypeScript 代码，不引入并行子 Agent；上下文用 `AskUserQuestion` 收集并缓存到 `./save-token/context.json`。落盘 `analysis.json` 增量 `context` 与每条 `scenario` 字段，向后兼容 `/stk-optimize`。

## 技术背景

**语言/版本**: TypeScript 严格模式（仅涉及 Markdown 模板，无逻辑改动）
**主要依赖**: 无新增（cac CLI 不动；`AskUserQuestion` 为 Agent 内建能力）
**存储**: `./save-token/context.json`（新增缓存）、`analysis.json`（增量字段）
**测试**: Vitest（本期纯模板改动，无单测；可选轻量文件断言）
**目标平台**: Node.js >= 18，CodeBuddy Agent 消费
**项目类型**: CLI 工具（`stk`）的 Command + SKILL 提示词增强
**性能目标**: 交互 <1 次额外提问轮次（复用缓存后 0 次）
**约束条件**: 不修改任何用户文件；保持 CLI 仅采集、决策交 Agent 的架构
**规模/范围**: 2 个模板文件，约 +40 行 Markdown

## 章程检查

*门控: 阶段 0 前通过；阶段 1 后复检。*

| 原则 | 符合 | 说明 |
|------|------|------|
| I. CLI 优先 | ✅ | 不改 CLI 入口，仅增强 Command/SKILL 文本 |
| II. Token 效率 | ✅ | 提示词精简，无装饰性内容 |
| III. 测试驱动 | ✅ | 纯模板改动无逻辑，可选文件断言 |
| IV. 简洁至上 | ✅ | 无新增抽象/子 Agent，最简实现 |
| V. 文档即产品 | ✅ | 中文命令文案，结构清晰 |

无章程违规。复杂度跟踪表为空（无需偏离原则）。

## 项目结构

### 文档(此功能)

```
specs/002-context-aware-analyze/
├── plan.md              # 本文件
├── research.md          # 阶段 0: 决策与理由
├── data-model.md        # 阶段 1: context / scenario 字段增量
├── quickstart.md        # 阶段 1: 最简实施步骤
├── contracts/
│   └── analyze-command.md  # 阶段 1: 命令交互/输出契约
└── checklists/requirements.md
```

### 源代码(仓库根目录)

```
src/templates/
├── commands/analyze.md        # [修改] 新增步骤 0 上下文收集
└── skills/stk-analyze/SKILL.md # [修改] 新增上下文收集 + 场景过滤规则表
```

**结构决策**: 沿用仓库既有"模板→init 安装到 ~/.codebuddy"机制，仅改 2 个已存在模板文件，零新增文件/目录（除 specs 文档）。符合原则 IV。

## 复杂度跟踪

> 无章程违规，本表为空。
