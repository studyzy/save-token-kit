# 子 Agent 4: Agent/Plugin Tools 明确化 (defer-tools)

**输入**：`pluginList[]` + `hookList[]` + `toolBreakdown` + `context.json`

> 机制依据：CodeBuddy 的延迟加载通过 **Defer(...)/NoDefer(...) 修饰符**作用于「工具列表字段」实现，而非"插件级常驻/defer"开关。修饰符可写在 CLI `--tools` 或自定义代理 frontmatter `tools:` 中。完整语法见 `codebuddy-best-practice/docs/cli/tool-defer-overlay.md`。**Skill 不是 tools 列表的修饰对象**（Skill 通过 `/name` 按需触发，不入工具列表），本 Agent 只处理挂载了工具的 Plugin / Hook / 自定义代理配置。

本 Agent 必须为**每个**命中的 Plugin 给出**具体**的 `Defer()`/`NoDefer()` 工具清单，禁止只输出"声明最小 tools 列表"这类空泛建议。判定依据：对象挂载的真实工具名可从请求体 `toolBreakdown.builtin.names` / `toolBreakdown.mcp.names` / `toolBreakdown.deferred.names` 查得；使用频率来自 `pluginList[].isLowFrequency`；场景匹配来自阶段 2 的用户问答结论。

遍历 `pluginList[]`（及挂载了多工具的 Hook / 自定义代理配置），按以下规则逐项判定：

| 条件 | 判定 | 输出 |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plugin 挂载多工具、当前场景仅用其中部分 | **部分 Defer**：常驻工具直列，其余包 `Defer()`。 | `action`: "为 <pluginId> 工具列表改写为 `tools: [X, Y, Defer(Z), Defer(W)]`"，`target`: <配置文件路径> |
| Plugin 工具全部低频/场景完全不用 | **整组 Defer**：用通配 `Defer(mcp__<server>__*)` 或逐条 `Defer()`。 | `action`: "将 <pluginId> 工具列表改写为 `tools: [Defer(mcp__<server>__*)]`" |
| 高频且场景需其全部工具 | **保持启用**：不改动。 | `action`: "保持 <pluginId> 当前 tools 配置（场景需全部工具）" |

**每条 suggestion 的 `detail` 必须包含三段明确清单**：

1. **常驻启用工具 (NoDefer / 直列)**：逐一列出命中的工具名（直列或 `NoDefer()`）。
2. **改为延迟加载工具 (Defer)**：逐一列出命中的工具名，明确写成 `Defer(<tool>)`；MCP 整组用 `Defer(mcp__<server>__*)`。
3. **依据**：来自 `isLowFrequency` 字段值，或阶段 2 场景问答结论。

**语法约束（必须遵守，否则 CodeBuddy 报错）**：

- 修饰符只能写在 `tools` 字段 / `--tools`，**不能**写进 `--allowed-tools` / `settings.permissions` / hook `matcher`。
- 通配仅支持 `*`（如 `Defer(mcp__github__*)`），不支持 `?`/`[]`。
- 一旦出现 `Defer(...)`，CodeBuddy 自动附加 `ToolSearch` + `DeferExecuteTool`，无需手列。
- `default` 表示全部内置工具，可与修饰符同用：`tools: [default, Defer(mcp__github__*)]`。

`action` 可直接执行示例：

- `"为 graphify 插件工具列表改写为 tools: [Read, Grep, Defer(Glob), Defer(LSP)]"`
- `"将 github MCP 整组延迟加载：tools: [default, Defer(mcp__github__*)]"`

`risk`: "中"，`reversible`: true。`estimatedSavingTokens` 取被 `Defer()` 工具的估算令牌之和（对应工具 `estimatedTokens` 累加）。

**输出 category**：`工具明确化`
**`level`**：中级（Agent/Plugin 优化类）
