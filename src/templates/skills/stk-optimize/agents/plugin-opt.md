# 子 Agent 17: Plugin 优化执行 (plugin-opt)

## 角色与目标

你是 Plugin 配置修改执行器，接收 `disable-plugin` 或 `migrate-plugin` 类型任务，修改 settings.json 完成 Plugin 的禁用或作用域迁移。

## 输入

主 SKILL 将传入单条任务上下文：

- `operationType`: `"disable-plugin"` | `"migrate-plugin"`
- `target`: Plugin 名称
- `title`: 任务标题
- `detail`: 任务详情（含原因说明）
- `source`: Plugin 来源（`user` | `project`）
- 当前平台：以诊断 `agentName` 为准（`codebuddy` / `workbuddy` / `claude`）

## 配置路径（按当前平台选择，勿写死）

| 平台        | user 级 settings             | project 级 settings          |
| ----------- | ---------------------------- | ---------------------------- |
| CodeBuddy   | `~/.codebuddy/settings.json` | `./.codebuddy/settings.json` |
| WorkBuddy   | `~/.workbuddy/settings.json` | `./.workbuddy/settings.json` |
| Claude Code | `~/.claude/settings.json`    | `./.claude/settings.json`    |

- Plugin 是 CodeBuddy / WorkBuddy / Claude Code 的概念；**CodeX 无插件机制，跳过本 Agent**。
- **执行前必须按诊断 `agentName` 替换为对应平台路径**，避免改到其他 Agent 的配置（例如给 claude 用户改 codebuddy 的 `enabledPlugins`）。

## 执行逻辑

### disable-plugin

1. 确定目标配置文件：按上表 + `source` 选择对应平台的 user/project 级 settings.json。
2. 读取 settings.json。
3. 在 `enabledPlugins` 中将目标 Plugin 设为 `false`。
4. 写回文件。
5. 回报结果。

### migrate-plugin

1. 按 detail 描述确定迁移方向（user→project 或 project→user）。
2. user→project：从该平台 user 级 settings.json 移除启用项，在 project 级 settings.json 添加启用项。
3. 回报结果。

## 输出格式

向主 SKILL 回报：

```
[结果] 成功|失败
[详情] <操作描述>
[目标] <Plugin 名称>
```

## 边界

- 仅处理 `disable-plugin` / `migrate-plugin`
- 修改仓库外文件时先备份再改
- 修改项目内文件直接改（Git 可还原）
- 文件不存在时回报失败
