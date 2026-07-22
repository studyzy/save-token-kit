## Why

`stk-optimize` 当前为单体 SKILL，一个文件承载了任务解析、等级筛选、按 operationType 分支执行（安装工具、禁用 Skill/MCP、CODEBUDDY.md 优化等）等全部逻辑。随着优化类型持续增加，单体文件变得难以维护：分支逻辑混杂、测试困难、新增优化类型需改动整个 SKILL。参照 `stk-analyze` 已成功拆分为 10 个子 Agent 的经验，将 `stk-optimize` 也拆分为子 Agent 架构，每个 Agent 专注一类执行操作，提升可维护性与扩展性。

## What Changes

- 将 `src/templates/skills/stk-optimize/SKILL.md` 从单体执行流程重构为子 Agent 编排器
- 新增 `src/templates/skills/stk-optimize/agents/` 目录，包含按 operationType 拆分的子 Agent 提示词
- 主 SKILL.md 负责：读取 tasks.md、询问等级、筛选任务、按 operationType 路由到对应子 Agent
- 每个子 Agent 接收单个任务上下文，产出执行结果报告
- **BREAKING**：SKILL.md 的执行逻辑从内联分支改为 Agent 派发，子 Agent 的提示词文件结构参考 `stk-analyze/agents/` 风格

## Capabilities

### New Capabilities
- `optimize-task-dispatcher`: 主 SKILL 的任务解析、等级筛选、按 operationType 路由派发逻辑
- `optimize-agent-install-tool`: 处理 `install-tool` 类型任务的子 Agent（stk install 工具安装）
- `optimize-agent-skill-opt`: 处理 `disable-skill` 类型任务的子 Agent（禁用 Skill）
- `optimize-agent-mcp-opt`: 处理 `disable-mcp` / `replace-mcp-with-cli` / `defer-mcp` 类型任务的子 Agent（MCP 配置修改）
- `optimize-agent-codebuddy-md`: 处理 `codebuddy-md-review` 类型任务的子 Agent（CODEBUDDY.md 精简优化）
- `optimize-agent-plugin-opt`: 处理 `disable-plugin` / `migrate-plugin` 类型任务的子 Agent（Plugin 配置修改）
- `optimize-agent-cli-replace-tapd`: 处理用 `tapd-ai-cli` 替代 TAPD MCP 的独立子 Agent（go install + auth 引导）
- `optimize-agent-cli-replace-gongfeng`: 处理用 `gongfeng-cli` 替代工蜂 MCP 的独立子 Agent（go install + auth 引导）
- `optimize-agent-cli-replace-gh`: 处理用 `gh` CLI 替代 GitHub MCP 的独立子 Agent（安装引导 + auth 引导）
- `optimize-agent-generic`: 处理其他 operationType 或未归类任务的兜底子 Agent

### Modified Capabilities
- `stk-optimize`: SKILL.md 执行流程从内联分支改为子 Agent 编排（不改变对外行为）

## Impact

- 受影响文件：`src/templates/skills/stk-optimize/SKILL.md`（重构）、`src/templates/skills/stk-optimize/agents/*.md`（新增约 10 个文件）
- 无运行时依赖变更
- 不涉及 CLI 代码（`src/cli.ts`）、类型定义（`src/types/index.ts`）、测试
- tasks.md 格式不变，仅消费方式从内联解析改为传递给子 Agent
