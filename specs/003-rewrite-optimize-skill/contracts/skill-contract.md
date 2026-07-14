# 合同：stk-optimize SKILL 行为契约

**功能分支**: `003-rewrite-optimize-skill`
**日期**: 2026-07-14

## 接口 1：SKILL 输入（消费侧）

- 输入文件：`./save-token/tasks.md`（格式见 `data-model.md` §1/§2，由 `/stk-analyze` 生成）
- 前置条件：文件存在且含合法 `[等级]` 标签
- 缺失处理：提示用户运行 `/stk-analyze`，停止

## 接口 2：用户交互契约

```
Agent → 用户：呈现 3 个等级选项
  1. 初级
  2. 初级 + 中级
  3. 全部（初级 + 中级 + 高级）
用户 → Agent：选择其一
Agent → 用户：展示筛选后的待办队列（按 tasks.md 顺序）
```

## 接口 3：第三方工具安装命令契约

```bash
stk install <tool-name> -g --agent codebuddy
```

- `<tool-name>`：从 Task action 解析（如"启用 Headroom" → `headroom`；"启用 RTK" → `rtk`）
- 触发条件：仅 `category == "第三方工具启用"` 或 action 含"启用"且 targets 第三方省 Token 工具
- 范围：本仓库不实现 `install` 子命令，直接 shell 调用 codebuddy CLI

## 接口 4：输出落盘契约（复用现有）

- 路径：`./save-token/tasks.json`
- 结构：`TasksFile`（见 `src/types/index.ts` §3）
- 字段：status 反映实际结果（completed/failed/skipped/partial）
- 完成后提示：`stk diagnose >> ./save-token/diagnosis-report2.md`

## 非契约（明确排除）

- 不生成 `tasks.md`（属 analyze 职责）
- 不实现 `stk install` 源码（属 codebuddy CLI）
- 不自动回滚（沿用备份 + 手动恢复边界）
