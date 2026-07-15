---
alwaysApply: false
paths: "src/**/*.ts"
---
# Glob: presentation/**

## 委派规则：Lint 检查

当用户请求中包含「Lint 检查」、「检查 lint」、「lint 错误」、「eslint 修复」等关键词时，必须委派给 `lint-check-fix` agent 处理。始终通过 Agent 工具将 lint 检查工作委派给此 agent — 永远不要直接运行 lint 命令。

```
Agent(subagent_type="lint-check-fix", description="检查并修复 lint 错误", prompt="检查代码中的 lint 错误并自动修复")
```

## 委派规则：演示文稿编辑

任何更新、修改或修复演示文稿（`presentation/index.html`）的请求都必须由 `presentation-curator` agent 处理。始终通过 Agent 工具将演示文稿工作委派给此 agent — 永远不要直接编辑演示文稿。

```
Agent(subagent_type="presentation-curator", description="...", prompt="...")
```

## 原因

- `lint-check-fix` agent 预配置了 lint 检查和自动修复能力，确保修复符合项目 ESLint 配置。
