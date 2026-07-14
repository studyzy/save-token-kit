# 研究：重写 stk-optimize SKILL 支持分级优化

**功能分支**: `003-rewrite-optimize-skill`
**日期**: 2026-07-14

## 研究任务与发现

### R1: `tasks.md` 的格式契约从何而来

- **Decision**: 复用 `/stk-analyze` SKILL 已定义的 `tasks.md` 输出格式，本功能只做消费者，不重新定义。
- **Rationale**: 实际仓库已存在 `save-token/tasks.md`，格式为：顶部 `<!-- scenario: ... -->` 注释；以 `## N. 分组` 组织；每条任务一行 `- [ ] [等级] 描述`，等级标签为 `[初级]`/`[中级]`/`[高级]`，位于复选框之后；文件尾部 `等级统计：初级 X 项 / 中级 X 项 / 高级 X 项` 与 `总计：...`。
- **Alternatives considered**: 新建独立 JSON schema（否决——与现有 analyze 产物割裂，且用户已确认使用现有 `tasks.md` 行内标签）。

### R2: 是否需要新增 stk 源码（命令/解析器）

- **Decision**: 需要新增 `stk install` 子命令源码（原计划判定"纯模板"已修正）。等级解析/筛选/执行仍在 SKILL 运行时完成，但 `stk install` 是真实 CLI 子命令，需落地代码。
- **Rationale**: 用户明确要求实现 `stk install <tool> [-g|--global] [--agent <name>]`，且 `-g`=全局 `~/.codebuddy`、`--agent` 默认 codebuddy（claude/codex 预留不支持）。它消费 `src/tools/` 注册表中的第三方工具定义（`installCommand` / `configCommand`）。
- **Alternatives considered**: 仅让 SKILL 提示手动命令（否决——用户要求 `stk install` 成为真实子命令，且 analyze 的 `tasks.md` 已引用此命令形式）。

### R3: `stk install` 命令的真实形态

- **Decision**: `stk install <tool> [-g|--global] [--agent <name>]`
  - `<tool>`：注册表中的工具名（rtk/headroom/caveman/graphify/lean-ctx/ponytail）。
  - `-g/--global`：全局安装到 `~/.codebuddy/`（默认即全局；`--local` 覆盖为项目级 `.codebuddy/`，与 `init` 语义一致）。
  - `--agent <name>`：默认 `codebuddy`；claude/codex 在 adapter 中标记为 `supported=false`，install 时显式报错"暂不支持"。
  - 执行流程：注册表查工具 → 校验 agent 支持 → 运行 `installCommand`（shell）→ 运行 `configCommand`（shell，agent/global 注入）→ 打印结果。
- **Rationale**: 复用 `src/tools/` 既有 `SaveTokenTool` 接口（`installCommand`/`configCommand`），新增 `install(global, agent)` 与 `getConfigCommand(agent, global)` 以注入 agent 与 global 标志（rtk 的 config 为 `rtk init -g --agent codebuddy`，需参数化）。
- **Alternatives considered**: 在 SKILL 中硬编码 `stk init` 重建（否决——`init` 装 command/skill 模板，非第三方省 Token 工具）。

### R4: 与现有 `optimize` command/SKILL 的关系

- **Decision**: 重写 `src/templates/skills/stk-optimize/SKILL.md` 与 `src/templates/commands/optimize.md`，将"读取 analysis.json + 逐条确认"改为"读取 tasks.md + 等级筛选 + 按序执行"；保留备份优先、状态落盘（`tasks.json` 仍为机器可读落盘）、失败即停/记录、提示重跑 diagnose 的既有边界。
- **Rationale**: 用户原始描述明确要重写 SKILL；现有两份文件内容陈旧（仍指向 analysis.json）。
- **Alternatives considered**: 新增独立 SKILL 名（否决——入口 `/stk-optimize` 保持一致，避免用户认知负担）。

### R5: no-op 任务处理

- **Decision**: 描述为"保持/保留/当前配置"且预估节省 0 的任务识别为 no-op，执行时标记为 `skipped`，不做任何文件修改。
- **Rationale**: 实际 `tasks.md` 中大量"保持现状"条目（预估 0），若逐条执行会无谓改动；标记为 skipped 既反映真实状态又节省 Token。

## 章程检查（阶段 0 前）

| 原则 | 合规 | 说明 |
|------|------|------|
| I. CLI 优先 | ✅ | `stk install` 经 CLI 调用；SKILL 本身非 CLI 但属 Agent 指令产品面 |
| II. Token 效率优先 | ✅ | SKILL 文本精简；no-op 跳过节省开销 |
| III. 测试驱动质量 | ✅ | SKILL 为提示词，无单测；但 analyze→optimize 端到端可用集成测试覆盖（可选） |
| IV. 简洁至上 | ✅ | 不新增源码/抽象，复用现有格式 |
| V. 文档即产品 | ✅ | SKILL/command 中文说明，符合规范 |

无违规，无需复杂度跟踪表。
