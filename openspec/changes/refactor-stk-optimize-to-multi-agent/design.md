## Context

`stk-optimize` 当前是单体 SKILL（约 150 行），包含 5 个步骤：解析 tasks.md → 询问等级 → 筛选任务 → 按 operationType 分支执行 → 回写状态。所有优化操作的执行逻辑（stk install、禁用 Skill/MCP/Plugin、CODEBUDDY.md 精简等）都内联在主流程的 if-else 分支中。

参照 `stk-analyze` 已完成的架构：主 SKILL.md 负责流程编排（阶段 1~4），10 个子 Agent（`agents/01~10-*.md`）各司其职，通过 `Agent` 工具并行派发。这套模式已经过验证，职责清晰、扩展性好。

## Goals / Non-Goals

**Goals:**
- 将 stk-optimize 的执行逻辑从主 SKILL.md 中拆分到独立子 Agent
- 每个子 Agent 处理一类 operationType，输出执行结果
- 主 SKILL.md 保持精简：只做解析、筛选、路由、状态汇总
- 子 Agent 提示词格式与 stk-analyze 保持一致（角色与目标、输入、执行逻辑、输出格式、边界）

**Non-Goals:**
- 不修改 tasks.md 格式
- 不修改 CLI 代码或类型定义
- 不改变 stk-optimize 对外行为（用户看到的流程不变）
- 不拆分为并行执行（optimize 任务有顺序依赖，必须串行）

## Decisions

### 1. 子 Agent 按 operationType 拆分，而非按 category

stk-analyze 按诊断对象（MCP/Plugin/Skill）拆分，因为这些对象是并行的。stk-optimize 的核心差异在于：任务是**串行执行**的，且每个任务有明确的 `operationType` 决定执行动作。

按 operationType 拆分更自然：
- `install-tool` → agent: install-tool
- `disable-skill` / `migrate-skill` → agent: skill-opt
- `disable-mcp` / `defer-mcp` → agent: mcp-opt
- `replace-mcp-with-cli`（TAPD）→ agent: cli-replace-tapd（独立 Agent，安装 tapd-ai-cli + 禁用 TAPD MCP）
- `replace-mcp-with-cli`（工蜂）→ agent: cli-replace-gongfeng（独立 Agent，安装 gongfeng-cli + 禁用工蜂 MCP）
- `replace-mcp-with-cli`（GitHub）→ agent: cli-replace-gh（独立 Agent，安装 gh + 禁用 GitHub MCP）
- `disable-plugin` / `migrate-plugin` → agent: plugin-opt
- `codebuddy-md-review` → agent: codebuddy-md
- 其他 → agent: generic

**为什么 CLI 替代 MCP 需要独立子 Agent**：安装 tapd-ai-cli / gongfeng-cli / gh 涉及 go install、环境检查、认证引导等完整流程，与简单的 `stk install` 或修改 `.mcp.json` 不同。独立 Agent 可提供针对性的安装指导、错误处理和认证提示。

**备选方案**：按 category（MCP 优化/Skill 优化/...）拆分。被拒绝，因为同一 category 下可能有多种 operationType（如 MCP 优化含 disable、replace、defer），按 category 拆会导致单个 Agent 仍需分支处理。

### 2. 子 Agent 串行派发，主 SKILL 逐条等待结果

与 stk-analyze 的并行派发不同，stk-optimize 的任务有顺序依赖（先安装工具，再禁用 MCP，再修改配置...），且每条任务完成后需回写 tasks.md。因此主 SKILL 逐条派发子 Agent，等待完成后回写，再处理下一条。

**备选方案**：批量派发所有子 Agent。被拒绝，因为：
- 任务有顺序依赖（如先装 stk 才能用 stk install）
- 需要逐条回写 tasks.md 保证进度可追踪
- 某任务失败不应影响后续判断（如工具安装失败，后续依赖该工具的配置修改应跳过）

### 3. 子 Agent 接收单条任务上下文，而非整批

每个子 Agent 只接收一条任务的信息（id、title、operationType、target、detail），不读取完整 tasks.md。这样 Agent 的上下文最小化，职责最单一。

**备选方案**：传入整批同类型任务。被拒绝，因为 optimize 是串行流程，逐条执行更可控。

### 4. 子 Agent 直接执行修改，不产出中间 JSON

与 stk-analyze 的子 Agent 产出 `suggestions-*.json` 不同，stk-optimize 的子 Agent 直接执行系统修改（文件编辑、命令执行）。它们回报执行结果（成功/失败/原因）给主 SKILL，由主 SKILL 回写 tasks.md。

### 5. 子 Agent 文件命名

使用描述性文件名，无编号前缀：

| 文件名 | operationType | 职责 |
|--------|---------------|------|
| `install-tool.md` | `install-tool` | 执行 `stk install` 安装工具 |
| `skill-opt.md` | `disable-skill`, `migrate-skill` | 修改 settings.json 禁用/迁移 Skill |
| `mcp-opt.md` | `disable-mcp`, `defer-mcp` | 修改 .mcp.json |
| `cli-replace-tapd.md` | `replace-mcp-with-cli`（TAPD） | 安装 tapd-ai-cli、引导认证、禁用 TAPD MCP |
| `cli-replace-gongfeng.md` | `replace-mcp-with-cli`（工蜂） | 安装 gongfeng-cli、引导认证、禁用工蜂 MCP |
| `cli-replace-gh.md` | `replace-mcp-with-cli`（GitHub） | 安装 gh CLI、引导认证、禁用 GitHub MCP |
| `plugin-opt.md` | `disable-plugin`, `migrate-plugin` | 修改 settings.json 禁用/迁移 Plugin |
| `codebuddy-md.md` | `codebuddy-md-review` | 精简/优化 CODEBUDDY.md |
| `rules-opt.md` | `rules-opt` | 修改 rules 配置（加 paths、拆分等） |
| `generic.md` | 其他 | 兜底，按 detail 描述执行 |

## Risks / Trade-offs

- **串行执行速度慢**：逐条派发子 Agent 比内联执行慢（每次 Agent 调用有开销）。但 optimize 场景下任务量通常 <20 条，每条执行时间占主导（如 stk install 可能需下载），Agent 派发开销可忽略。
- **子 Agent 独立性风险**：某些任务间有隐式依赖（如先装 stk 才能用 stk install 装其他工具）。主 SKILL 的任务顺序已由 tasks.md 保证，但需在子 Agent 中处理前置工具未安装的情况（返回失败而非崩溃）。
- **子 Agent 提示词维护成本**：10 个文件 vs 1 个文件。但每个文件职责单一、修改互不干扰，长期维护成本更低。
