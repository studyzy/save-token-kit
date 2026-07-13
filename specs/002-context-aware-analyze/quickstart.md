# 快速开始: 上下文感知 /stk:analyze（最简实践）

**功能**: 002-context-aware-analyze
**日期**: 2026-07-13

## 目标读者

不熟悉 SKILL/Agent 编写。本期**只改两个 Markdown 文件，不写代码、不写子 Agent**。

## 改动清单（共 2 文件）

1. `src/templates/commands/analyze.md` — 在"前置条件"后新增「步骤 0: 收集项目上下文」。
2. `src/templates/skills/stk-analyze/SKILL.md` — 在"分析规则"前新增「上下文收集」与「场景过滤规则表」。

## 实施步骤

1. 编辑 `analyze.md`：
   - 增加一段说明：若 `./save-token/context.json` 不存在/过期，先用 `AskUserQuestion` 问「使用目的」与「代码/文档是否同仓」，结果写入 `context.json`。
   - 说明支持重问：删除 `context.json` 或声明新上下文即重问。
2. 编辑 `SKILL.md`：
   - 新增"上下文收集"小节（同上两问）。
   - 新增"场景过滤规则表"（code/docs/office + 同仓/分离的具体保留/降权/专项建议）。
   - 要求每条建议标注 `scenario`，并写入 `analysis.json` 的 `context` 字段。
3. 同步安装产物：运行 `make build`（如需）并通过 `stk init --skills --force` 把更新推到 `~/.codebuddy/`。
4. 验证：在任一仓库运行 `/stk:analyze`，确认先问两问、产出报告含场景标注、落盘 `analysis.json` 含 `context`。

## 验证清单

- [ ] 首次运行先询问使用目的与同仓情况。
- [ ] 二次运行复用 `context.json`，不再询问。
- [ ] 删除 `context.json` 后重跑会重新询问。
- [ ] 报告按用途裁剪（code 推禁用演示 skill；docs 推知识库；office 聚焦无关条目清理）。
- [ ] 同仓时报告含"文档冗余上下文"专项建议；分离时含"排除文档仓库"建议。
- [ ] `analysis.json` 含 `context` 与每条 `scenario` 字段。
- [ ] 不修改任何用户文件，仅产出建议。

## 注意

- 本期纯 Markdown，无需 TypeScript 单测；如需防回归，可加一条轻量断言检查模板文件包含"context.json"关键字（可选，非必需）。
