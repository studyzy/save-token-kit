# 数据模型：重写 stk-optimize SKILL 支持分级优化

**功能分支**: `003-rewrite-optimize-skill`
**日期**: 2026-07-14

## 实体

### 1. TasksMarkdown（`save-token/tasks.md` 契约）

由 `/stk-analyze` 生成的消费侧输入，本功能只读解析。

| 字段 | 类型 | 说明 |
|------|------|------|
| scenario | string（注释） | 顶部 `<!-- scenario: 中文 / 同仓\|异仓 -->` |
| groups | Group[] | `## N. 分组` 顺序列表 |
| levelStats | { 初级:int, 中级:int, 高级:int } | 尾部 `等级统计` 行 |
| totalSaving | string | 尾部 `总计：...` 行 |

### 2. Task（单条待办）

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| done | boolean | 复选框 `[ ]` / `[x]` | 行首 |
| level | enum `初级\|中级\|高级` | 行内 `[等级]` 标签 | 复选框后 |
| action | string | 可执行描述（如"禁用 skill: X" / "启用 RTK"） | 标签后文本 |
| reason | string | 缩进两空格的 `原因：` 行 | 下一行 |
| estimatedSaving | string | 括号内 `预估节省 ~XXX Token` | action 内 |
| category | string | 所属分组标题 | 父级 `##` |
| isNoOp | boolean | 派生：描述含"保持/保留/当前配置"且节省 0 | 运行时计算 |

### 3. OptimizationLevel（筛选维度）

- 值：`初级` | `初级+中级` | `全部(初+中+高)`
- 映射：用户选择 → 允许执行的 level 集合。

### 4. ExecutionRecord（落盘，复用现有 `tasks.json` Schema）

沿用 `src/types/index.ts` §3 `TasksFile` / `OptimizationTask`：

- suggestionId / description / operationType / target / status / estimatedSavingTokens / actualSavingTokens? / risk / reversible / error? / appliedChange?
- status ∈ `completed` | `failed` | `skipped` | `partial`
- no-op 任务 → `skipped`。

### 5. InstallCommandArgs（新增 CLI 子命令 `stk install`）

| 字段 | 类型 | 说明 |
|------|------|------|
| tool | string（位置参数） | 注册表工具名（rtk/headroom/caveman/graphify/lean-ctx/ponytail） |
| global | boolean | `-g/--global`=true（默认全局）；`--local` 置 false（项目级） |
| agent | string | `--agent <name>`，默认 `codebuddy`；claude/codex 预留不支持 |

### 6. SaveTokenTool 接口扩展（src/tools/types.ts）

- 新增 `install(global: boolean, agent: string): Promise<InstallResult>`（默认实现：运行 `installCommand` + `getConfigCommand(agent, global)`）
- `configCommand` 改为由 `getConfigCommand(agent, global): string` 提供（rtk 覆写为 `rtk init ${global?'-g':''} --agent ${agent}`）
- `InstallResult = { ok: boolean; steps: {cmd: string; ok: boolean; error?: string}[] }`

## 关系

```
TasksMarkdown 1──* Task
Task *──1 OptimizationLevel (筛选)
Task 1──1 ExecutionRecord (执行后落盘)
StkInstallCommand 1──* SaveTokenTool (按 tool 名查注册表)
```

## 状态转换

```
Task (未执行)
  └─[level 命中筛选]
       ├─[isNoOp=true]         → ExecutionRecord.status = skipped
       ├─[第三方工具启用类]    → 执行 `stk install <名> -g --agent codebuddy` → completed/failed
       ├─[本地配置修改类]      → 备份 + 修改 → completed/failed
       └─[执行异常]            → failed (记录 error)，继续/停下依边界
```

## 验证规则（来自 spec FR）

- VR-1: 仅 level 命中筛选集合的 Task 进入执行队列。
- VR-2: 执行顺序 = TasksMarkdown 中 Task 出现顺序。
- VR-3: 第三方工具类 100% 经 `stk install <名> -g --agent codebuddy`。
- VR-4: 每个被执行 Task 落盘 status（completed/failed/skipped）。
- VR-5: tasks.md 不存在 → 提示先 `/stk-analyze`，停止。
