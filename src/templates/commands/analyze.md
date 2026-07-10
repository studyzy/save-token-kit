---
name: stk-analyze
description: "基于诊断数据分析 Token 优化空间，生成按节省量排序的优化建议并落盘 analysis.json"
argument-hint: ""
---

# /stk-analyze

基于诊断数据，分析可优化的 Token 占用空间。

## 前置条件

- `./save-token/diagnosis-report.json` 或 `diagnosis-report.md` 存在。
- 如缺失，提示用户先运行 `/stk-diagnose` 或 `stk diagnose >> ./save-token/diagnosis-report.md`。

## 步骤

1. 读取诊断数据（`.md` 用于展示，`.json` 取精确数字）。
2. 分析 Token 占用分布，识别以下优化空间：
   - **Skill 占用 > 500 token 且非高频使用** → 建议禁用（`disable-skill`）
   - **MCP 有已知 CLI 等价物**（如 Playwright MCP → playwright CLI）→ 建议改用 CLI（`replace-mcp-with-cli` 或 `disable-mcp`）
   - **CODEBUDDY.md > 200 行** → 建议精简（`trim-codebuddy-md`）
   - **未安装省 Token 工具**（RTK / Caveman / Headroom 等）→ 建议安装（`install-tool`）
   - **MCP 工具多但未延迟加载** → 建议启用延迟加载（`defer-mcp`）
3. 生成**按预估节省量降序**的优化建议列表。每条建议包含：id、title、detail、operationType、target、estimatedSavingTokens、risk、reversible。
4. **必须**将建议以 JSON 落盘 `./save-token/analysis.json`（结构见 data-model.md §2）。
5. 可另写 `./save-token/analysis.md` 作展示（可选）。
6. 输出预估总节省 Token（绝对值 + 占当前占用百分比）。

## 注意

- 建议方案必须可行且明确；无法估算节省量时 `estimatedSavingTokens` 填 0。
- 决策由你（AI Agent）做出，`stk` CLI 仅提供数据。
