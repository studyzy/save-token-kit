---
description: '重写 stk-optimize SKILL 支持分级优化 + 新增 stk install 子命令'
---

# 任务: 重写 stk-optimize SKILL 支持分级优化

**输入**: 来自 `/specs/003-rewrite-optimize-skill/` 的设计文档
**前置条件**: plan.md, spec.md(用户故事), research.md, data-model.md, contracts/
**测试**: 已实现单测（install 命令 + 工具 install 逻辑），遵循章程 III（Vitest，覆盖率 >=60%）

**组织结构**: 任务按用户故事分组（US1 分级筛选执行 / US2 无 tasks.md 兜底 / US3 状态落盘）。`stk install` 子命令作为 US1 的第三方工具路径支撑。

## 格式: `[ID] [P?] [Story] 描述`

- **[P]**: 可并行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1/US2/US3）
- 描述含确切文件路径

## 路径约定

- CLI 命令：`src/cli.ts` + `src/commands/*.ts`
- 注册表：`src/tools/`（`types.ts` / `registry.ts` / `impl/*.ts`）
- 模板（Agent 指令）：`src/templates/skills/stk-optimize/SKILL.md` + `src/templates/commands/optimize.md`
- 测试：`tests/unit/commands/install.test.ts`（新增）

---

## 阶段 1: 设置（共享基础设施）

**目的**: 建立 `stk install` 子命令的接口契约与注册表扩展

- [x] T001 在 `src/tools/types.ts` 中将 `configCommand: string` 字段改为 `getConfigCommand(agent: string, global: boolean): string` 方法，并在 `SaveTokenTool` 接口与 `BaseSaveTokenTool` 增加 `install(global, agent): Promise<InstallResult>`（默认实现：运行 `installCommand` 后运行 `getConfigCommand` 返回的 config 命令，用 tinyexec 的 `exec(cmd, {shell:true})`）
- [x] T002 在 `src/tools/types.ts` 中新增类型 `InstallStep { cmd; ok; error? }` 与 `InstallResult { tool; ok; steps: InstallStep[] }`
- [x] T003 [P] 在 `src/tools/impl/rtk.ts` 中覆写 `getConfigCommand(agent, global)` 返回 `rtk init${global ? ' -g' : ''} --agent ${agent}`（替换原硬编码 `rtk init -g --agent codebuddy`）
- [x] T004 [P] 在 `src/tools/impl/{headroom,lean-ctx,graphify,caveman,ponytail,karpathy-skills}.ts` 中将 `readonly configCommand = '...'` 改为 `getConfigCommand(): string { return '...' }`（graphify 的返回注入 `${agent}`：`graphify install --platform ${agent}`）

**检查点**: 注册表接口已扩展，所有 impl 编译通过（`make build`）

---

## 阶段 2: 基础（阻塞前置条件）

**目的**: 注册 `stk install` 子命令并接入 adapter 校验

- [x] T005 在 `src/commands/install.ts` 中实现 `runInstall(toolName, options)`：查 adapter（`getAdapter`，不支持则报错退出）→ 查注册表工具（`getTool`，未知则列出可用工具并退出）→ 默认全局（`options.local ? false : true`）→ 调用 `tool.install(global, agentName)` → 逐行打印步骤结果，失败置 `process.exitCode=1`
- [x] T006 在 `src/cli.ts` 注册 `install <tool>` 子命令，含 `-g/--global`、`--local`、`--agent <name>`（默认 codebuddy）选项，action 调 `runInstall`
- [x] T007 [P] 在 `tests/unit/commands/install.test.ts` 编写单测：未知 agent 退出码 1、claude 预留不支持退出码 1、未知工具退出码 1、默认传 `[true,'codebuddy']`、--local 传 `[false,'codebuddy']`

**检查点**: `stk install <tool>` 可运行；`make build && make lint && pnpm vitest run tests/unit/commands/install.test.ts` 全绿

---

## 阶段 3: 用户故事 1 - 分级筛选后执行优化（优先级: P1）🎯 MVP

**目标**: 读 `save-token/tasks.md` → 问等级 → 按等级筛选 → 按序执行（含第三方工具走 `stk install`）

**独立测试**: 准备含初/中/高三级的 `tasks.md`，选"初级"仅执行初级；选"全部"三级全执行且顺序一致；第三方工具任务触发 `stk install <名> -g --agent codebuddy`

### 用户故事 1 的实施

- [x] T008 [US1] 在 `src/templates/skills/stk-optimize/SKILL.md` 重写：读 `tasks.md` 解析行内 `[初级]/[中级]/[高级]` 标签与复选框；no-op（保持现状/节省 0）标记 skipped；用 AskUserQuestion 三选一（初级 / 初级+中级 / 全部）；按选择筛选并按文件顺序执行；第三方工具类解析工具名执行 `stk install <名> -g --agent codebuddy`；本地修改类操作前备份
- [x] T009 [US1] 在 `src/templates/commands/optimize.md` 同步：去掉 analysis.json 旧描述，改为读 `tasks.md` + 等级筛选 + `stk install` 第三方路径 + no-op 处理
- [x] T010 [US1] 在 `specs/003-rewrite-optimize-skill/contracts/skill-contract.md` 固化接口契约（输入/交互/install 命令/落盘），与 SKILL 对齐

**检查点**: 用户故事 1 功能化——`/stk-optimize` 可分级筛选并按序执行，第三方工具走 `stk install`

---

## 阶段 4: 用户故事 2 - 无 tasks.md 的兜底（优先级: P2）

**目标**: `tasks.md` 缺失时不静默失败，提示先生成

**独立测试**: 在不存在 `tasks.md` 的目录触发 `/stk-optimize`，Agent 提示先 `/stk-analyze` 并停止

### 用户故事 2 的实施

- [x] T011 [US2] 在 `src/templates/skills/stk-optimize/SKILL.md` 的"前置条件"明确：若 `./save-token/tasks.md` 不存在，提示用户先运行 `/stk-analyze`，停止，不凭空生成任务
- [x] T012 [US2] 在 `src/templates/commands/optimize.md` 同步前置条件描述

**检查点**: 用户故事 2 功能化——缺 `tasks.md` 时给出明确前置指引

---

## 阶段 5: 用户故事 3 - 执行结果落盘（优先级: P3）

**目标**: 每个任务的成功/失败状态写入产出物，可复盘

**独立测试**: 执行若干任务后，`save-token/tasks.json` 反映实际状态（completed/failed/skipped）

### 用户故事 3 的实施

- [x] T013 [US3] 在 `src/templates/skills/stk-optimize/SKILL.md` 明确落盘规则：每条任务写 `./save-token/tasks.json`（结构见 data-model.md §3 `TasksFile`），成功 `completed`+`appliedChange`、失败 `failed`+`error`、no-op `skipped`；`actualSavingTokens` 留空由 `/stk-report` 计算
- [x] T014 [US3] 在 `src/templates/commands/optimize.md` 同步落盘规则（含 suggestionId/description/operationType/status/estimatedSavingTokens/risk/reversible/appliedChange 字段）

**检查点**: 用户故事 3 功能化——执行结果 100% 落盘 tasks.json

---

## 阶段 N: 完善与横切关注点

**目的**: 一致性收尾与验证

- [x] T015 [P] 更新 `specs/003-rewrite-optimize-skill/plan.md` / `research.md` / `data-model.md` / `spec.md`，将"纯模板重构"修正为"新增 install 子命令 + 模板重构"（已完成，核对一致）
- [x] T016 运行 `make lint && make build && pnpm vitest run` 确认全绿（init.test.ts 的 3 个失败为仓库既有问题，非本次引入）
- [x] T017 在 `save-token/tasks.md` 实测：选"初级+中级"验证筛选与顺序，第三方工具任务验证触发 `stk install`

---

## 依赖关系与执行顺序

### 阶段依赖关系

- **设置（阶段 1）**: 无依赖，可立即开始
- **基础（阶段 2）**: 依赖阶段 1 接口扩展完成
- **用户故事（阶段 3+）**: 依赖阶段 2 子命令可运行
- **完善（最终阶段）**: 依赖所有用户故事完成

### 用户故事依赖关系

- **US1 (P1)**: 核心 MVP，依赖阶段 2
- **US2 (P2)**: 可与 US1 同期（仅 SKILL/command 文案补充）
- **US3 (P3)**: 依赖 US1 执行流程落地

### 并行机会

- T003 / T004 各 impl 文件改动相互独立，可并行
- T008 / T009 / T011 / T012 / T013 / T014 均为模板（md）编辑，可并行
- 阶段 1/2 的代码改动与阶段 3+ 的模板改动无文件冲突，可并行推进

---

## 并行示例: 用户故事 1

```bash
# 并行启动 SKILL 与 command 模板重写:
任务: "T008 [US1] 重写 src/templates/skills/stk-optimize/SKILL.md"
任务: "T009 [US1] 同步 src/templates/commands/optimize.md"

# 并行启动注册表 impl 改造:
任务: "T003 覆写 src/tools/impl/rtk.ts getConfigCommand"
任务: "T004 转换 src/tools/impl/{headroom,lean-ctx,graphify,caveman,ponytail,karpathy-skills}.ts"
```

---

## 实施策略

### 仅 MVP（用户故事 1）

1. 完成阶段 1: 设置（接口扩展）
2. 完成阶段 2: 基础（`stk install` 子命令）
3. 完成阶段 3: US1（分级筛选执行 + 第三方 install 路径）
4. **停止并验证**: 实测 `tasks.md` 分级执行
5. 部署/演示

### 增量交付

1. 设置 + 基础 → `stk install` 可用
2. US1 → 分级优化 MVP
3. US2 → 兜底指引
4. US3 → 状态落盘
5. 每步独立可验证

---

## 注意事项

- [P] 任务 = 不同文件，无依赖
- [Story] 标签映射用户故事便于追溯
- 每个用户故事应独立可完成、可测试
- 在逻辑组后提交
- 避免：模糊任务、跨故事破坏性依赖
