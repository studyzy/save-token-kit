# 快速开始：重写 stk-optimize SKILL 支持分级优化

**功能分支**: `003-rewrite-optimize-skill`
**日期**: 2026-07-14

## 目标

重写 `src/templates/skills/stk-optimize/SKILL.md` 与 `src/templates/commands/optimize.md`，使 `/stk-optimize` 改为：

1. 读取 `./save-token/tasks.md`
2. 询问优化等级（初级 / 初级+中级 / 全部）
3. 按等级筛选、按原顺序执行
4. 第三方工具类走 `stk install <名> -g --agent codebuddy`
5. 执行状态落盘 `./save-token/tasks.json`

## 现有产物（无需改动生成侧）

- `save-token/tasks.md`：由 `/stk-analyze` 生成，格式见 `data-model.md`
- `save-token/tasks.json`：本 SKILL 执行后写入，Schema 见 `src/types/index.ts` §3

## 实施步骤（供 /speckit.tasks 拆分）

1. 重写 `src/templates/skills/stk-optimize/SKILL.md`
   - 读 tasks.md → 解析等级标签 → AskUserQuestion 三选一 → 筛选 → 按序执行
   - no-op（保持现状/节省 0）标记 skipped
   - 第三方工具：执行 `stk install <名> -g --agent codebuddy`
   - 本地修改：备份原文件再改（沿用原 SKILL 边界）
   - 落盘 tasks.json + 提示重跑 diagnose
2. 同步更新 `src/templates/commands/optimize.md`（与 SKILL 对齐，去掉 analysis.json 旧描述）
3. 校验 `make lint && make test` 通过（SKILL/command 为 md，主要检查文档一致性）

## 验证

- 准备含初/中/高三级的 `tasks.md`
- 选"初级" → 仅初级任务执行
- 选"全部" → 三级全执行，顺序与文件一致
- 第三方工具任务 → 实际触发 `stk install ... -g --agent codebuddy`
- 缺失 tasks.md → 提示先 `/stk-analyze`
