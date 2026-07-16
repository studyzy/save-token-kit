# 子 Agent 8: Rules 优化 (rules-opt)

**输入**：`ruleList[]`（来自 `diagnosis-report.json` 的 `fsCollectResult.ruleList`，每项为 `{ name, path, description, alwaysApply, paths, estTokens }`）+ `rulesTokens`（CODEBUDDY.md 系统规则块估算 token）+ `context.json`

**机制依据**：CodeBuddy 规则支持 `alwaysApply: false` + `paths`（glob）实现按文件作用域加载；未命中的规则不进入上下文。规则应"聚焦、可操作、≤ 500 行"，大规则拆为多个可组合规则并加 `paths` 作用域，可显著降低每轮上下文占用。`CODEBUDDY.md` 则全文每轮注入，需精简。

遍历 `ruleList[]`，对每条规则检查：

| 条件                                                                                              | 输出                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `alwaysApply === true` 且规则可用 `paths` 收敛（`name`/`description` 表明仅作用于部分文件）      | 建议改为 `alwaysApply: false` 并补 `paths`。`action`: "规则 <name> 加 paths 作用域：<glob>"，`reason`: "当前每轮常驻上下文，实际仅用于部分文件" |
| 单条规则过长（估算 `estTokens` 超过阈值，如 > 1000）或含多个不相关主题                            | 建议拆分为多条 `alwaysApply: false` + `paths` 的细分规则。`action`: "拆分规则 <name> 为 <子主题1>/<子主题2>"，`reason`: "精简单条降低常驻占用" |
| 规则内容含大段解释性文档/示例/推理过程（非可执行指令）                                          | 建议删除冗余，仅保留指令；长参考移至独立文件并让规则只写一句"参见 `<file>`"。`action`: "精简规则 <name> 冗余内容" |
| `rulesTokens` 整体偏大（如 > 3000）或 CODEBUDDY.md 冗长                                         | 建议把 CODEBUDDY.md 中项目级细节下沉为 `.codebuddy/rules/*.md`（`alwaysApply: false` + `paths`）。`action`: "将 CODEBUDDY.md 部分内容拆分为 rules" |

每条 `suggestion` 须填 `target: "<rule name>"`（CODEBUDDY.md 下沉场景填 `CODEBUDDY.md`），`estimatedSavingTokens` 取该规则/内容当前 `estTokens` 量级或 0；`risk`: "low"，`reversible`: true，`scenario` 取 `code` 或依据阶段 2 结论，`evidence` 填 `alwaysApply=true, paths=[]` 或 `estTokens=N`。

**输出 category**：`Rules 优化`
**`level`**：中级（Rules 优化类）
