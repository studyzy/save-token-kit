## 1. 创建 agents/ 目录结构

- [x] 1.1 创建 `src/templates/skills/stk-optimize/agents/` 目录
- [x] 1.2 创建 10 个子 Agent 占位文件（11~20）

## 2. 编写子 Agent 提示词

- [x] 2.1 编写 `11-install-tool.md`（处理 `install-tool`：解析工具名，执行 stk install）
- [x] 2.2 编写 `12-skill-opt.md`（处理 `disable-skill` / `migrate-skill`：修改 settings.json）
- [x] 2.3 编写 `13-mcp-opt.md`（处理 `disable-mcp` / `defer-mcp`：修改 .mcp.json）
- [x] 2.4 编写 `14-cli-replace-tapd.md`（处理 `replace-mcp-with-cli` TAPD：go install tapd-ai-cli + auth 引导 + 禁用 TAPD MCP）
- [x] 2.5 编写 `15-cli-replace-gongfeng.md`（处理 `replace-mcp-with-cli` 工蜂：go install gongfeng-cli + auth 引导 + 禁用工蜂 MCP）
- [x] 2.6 编写 `16-cli-replace-gh.md`（处理 `replace-mcp-with-cli` GitHub：安装 gh + auth 引导 + 禁用 GitHub MCP）
- [x] 2.7 编写 `17-plugin-opt.md`（处理 `disable-plugin` / `migrate-plugin`：修改 settings.json）
- [x] 2.8 编写 `18-codebuddy-md.md`（处理 `codebuddy-md-review`：精简/优化 CODEBUDDY.md）
- [x] 2.9 编写 `19-rules-opt.md`（处理 `rules-opt`：修改 rules 配置）
- [x] 2.10 编写 `20-generic.md`（兜底处理：按 detail 描述执行或回报无法处理）

## 3. 重构主 SKILL.md

- [x] 3.1 重写 SKILL.md 的执行流程章节：解析 tasks.md → 询问等级 → 筛选任务 → 路由派发（含 CLI 替代 Agent 的 target 匹配路由）→ 回写状态 → 输出摘要
- [x] 3.2 删除原 SKILL.md 中内联的 operationType 分支执行逻辑
- [x] 3.3 删除原 SKILL.md 中的 CODEBUDDY.md 子 Agent 提示词（移入 `18-codebuddy-md.md`）
- [x] 3.4 保留前置条件检查、边界说明、回写逻辑
- [x] 3.5 添加子 Agent 启动条件表（参照 stk-analyze 的阶段 3 格式，含 CLI 替代 Agent 的 target 匹配条件）

## 4. 验证与测试

- [x] 4.1 人工审查：确认每个 operationType 都有对应子 Agent 覆盖
- [x] 4.2 人工审查：确认子 Agent 提示词格式与 stk-analyze/agents/ 一致（角色与目标、输入、执行逻辑、输出格式、边界）
- [x] 4.3 人工审查：确认主 SKILL.md 的执行流程完整（无遗漏步骤）
- [x] 4.4 人工审查：确认 CLI 替代 Agent（tapd/gongfeng/gh）的安装命令与认证流程正确
