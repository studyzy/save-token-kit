---
name: stk-analyze
description: "分析 Token 诊断数据，产出按节省量排序的优化建议 analysis.json"
argument-hint: ""
---

# SKILL: stk-analyze

本 SKILL 指导 AI Agent 执行 `/stk-analyze` 的分析决策。

## 目标

基于诊断数据找出可优化空间，生成可行、明确的优化建议。

## 分析规则（优先级从高到低）

1. **Skill 占用 > 500 token 且非高频** → `disable-skill`，说明预估节省。
2. **MCP 有已知 CLI 等价物**（Playwright MCP → playwright CLI 等）→ `replace-mcp-with-cli` 或 `disable-mcp`，说明 CLI 不占持久上下文工具定义。
3. **CODEBUDDY.md > 200 行** → `trim-codebuddy-md`，指出可移至项目级或删除的段落。
4. **未安装省 Token 工具**（RTK / Caveman / Headroom）→ `install-tool`，说明各自节省原理。
5. **MCP 工具多但未延迟加载** → `defer-mcp`。

## 产出

- 每条建议字段：id、title、detail、operationType、target、estimatedSavingTokens、risk、reversible。
- **必须**写入 `./save-token/analysis.json`（结构见 data-model.md §2），按 `estimatedSavingTokens` 降序。
- 可选 `analysis.md` 展示。
- 输出预估总节省（绝对值 + 百分比）。

## 边界

- 不做任何文件修改，仅产出建议。
- 无法估算节省时填 0 并注明原因。
