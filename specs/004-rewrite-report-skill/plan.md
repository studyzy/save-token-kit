# 实施计划: 重构 stk-report SKILL 实现优化前后对比效果报告

**分支**: `004-rewrite-report-skill` | **日期**: 2026-07-14 | **规范**: [spec.md](./spec.md)
**输入**: 来自 `/specs/004-rewrite-report-skill/spec.md` 的功能规范

## 摘要

重构 `src/templates/skills/stk-report/SKILL.md`，把报告生成逻辑从「读取两个 markdown（`diagnosis-report.md`/`diagnosis-report2.md`）文本做总 Token 相减」升级为「基于 proxy 透明代理采集的结构化 `DiagnosisReport` JSON（`diagnosis-report.json` / `diagnosis-report2.json`）做分类对比」，并结合 `/stk-optimize` 落盘的 `tasks.json` 将 Token 变化归因到每项任务、标注预估 vs 实际偏差。产出 `save-token-report.json`（`SaveTokenReport` 契约）及中文摘要。纯文档重构，无代码改动。

主要需求（映射 spec）：
- R1-R3: 数据源升级为 proxy JSON 对比，缺优化后报告时引导跑 `stk diagnose`。
- R4-R6: 基于 `tasks.json` 的任务效果归因（`TaskResult[]`、`deviation`）。
- R7-R9: 结构化产出 `save-token-report.json` + 中文摘要，只读闭环。
- R10: 厘清 `tasks.md`（人读待办）与 `tasks.json`（机器契约）关系。

## 技术背景

**语言/版本**: Markdown（SKILL 文档），无编译代码；内容遵循项目既有的中文文档 / 英文注释约定
**主要依赖**: 无（仅引用既有的 `stk diagnose`、`stk-report` 命令与 `src/types/index.ts` 契约类型）
**存储**: 文件系统 `./save-token/` 目录（JSON + markdown）
**测试**: N/A（文档内容；但命令侧 `report.md` 与 `stk report` 命令已有/需配套校验，见复杂度跟踪）
**目标平台**: CodeBuddy Code 的 Skill 运行时（CLI 名 `stk`）
**项目类型**: CLI 工具的 Skill/Prompt 模板（文档即产品，章程原则 V）
**性能目标**: N/A（Agent 单次读取执行）
**约束条件**: 章程 II（Token 效率优先：SKILL 文档须精简，去冗余）；章程 IV（简洁至上：单函数/段落不过度展开）；章程 V（中文文档）
**规模/范围**: 单文件 `stk-report/SKILL.md` 重写 + 校验 `report.md` 命令一致性（R5/S5）

## 章程检查

*门控: 阶段 0 研究前通过。阶段 1 设计后重新检查。*

| 原则 | 检查项 | 结果 |
| --- | --- | --- |
| I. CLI 优先 | 本功能不新增 CLI，仅改 SKILL 文档；引用既有 `stk diagnose`/`stk report` 命令 | ✅ 通过 |
| II. Token 效率优先 | SKILL 文档须精简、去冗余描述；摘要默认紧凑 | ✅ 通过（重写时遵循） |
| III. 测试驱动质量 | 纯文档重构，无新增代码单元；但 `report.md` 命令一致性需在 PR 审核中确认 | ✅ 通过（无测试新增义务） |
| IV. 简洁至上 | 不引入超出需求的抽象；仅改目标文件及必要的命令一致性 | ✅ 通过 |
| V. 文档即产品 | 用户可见文案中文、术语保留英文；SKILL 作为产品最佳实践示范 | ✅ 通过 |

无章程违规，无需复杂度跟踪表。

## 项目结构

### 文档（此功能）

```
specs/004-rewrite-report-skill/
├── plan.md              # 此文件
├── research.md          # 阶段 0 输出
├── data-model.md        # 阶段 1 输出（复用既有契约，引用不复制）
├── quickstart.md        # 阶段 1 输出
└── contracts/           # 阶段 1 输出（复用 src/types 契约，不新定义）
```

### 源代码（仓库根目录，本次实际改动）

```
src/templates/skills/stk-report/SKILL.md   # 重写（核心交付物）
src/templates/commands/report.md           # 校验/对齐前置条件与步骤（必要时小改）
```

**结构决策**: 纯模板文档重构，不新增 `src/` 业务代码。改动范围限定在 SKILL 文档本体，并核对命令文件 `report.md` 与其一致性（R10/S5）。数据契约直接复用 `src/types/index.ts` 既有 `DiagnosisReport` / `TasksFile` / `SaveTokenReport`，不新造类型。

## 复杂度跟踪

无章程违规，无需填写。
