---
description: '提交当前修改到 Git 并推送，可选等待 GitHub Actions CI 通过。'
model: lite
---

## 用户输入

```text
$ARGUMENTS
```

## 概述

自动将当前工作区的修改提交到 Git 并推送到远程仓库。先运行本地检查（`make check`），提交推送后使用 `gh` 命令等待 GitHub Actions CI 结果；如有失败则分析日志并尝试修复。

**智能跳过**：如果当前上下文中已运行并通过了 `make check`，**禁止**重复执行，直接进入提交阶段。

---

## 1: 解析用户参数

从 `$ARGUMENTS` 中解析以下信息：

- **type**（可选）：提交类型前缀，必须是以下之一：
  `feat` 新功能
  `fix` 修补 bug
  `docs` 文档
  `style` 格式（不影响代码运行）
  `refactor` 重构
  `perf` 性能优化
  `test` 测试
  `chore` 构建过程或辅助工具
  `ci` CI/CD 变更

- **--fast / -f**（可选）：快速模式，跳过本地检查和 CI 等待，直接提交推送

- **其余文本**：作为 commit message 的 body

---

## 2: 本地检查

如果**不是快速模式**且**上下文中未完成过验证**，运行：

```bash
make check
```

失败则分析输出、修复后重试直到通过。

---

## 3: 暂存变更

```bash
git add -A
```

如果没有任何变更，提示"没有需要提交的变更"并终止。

---

## 4: 生成提交信息

1. 运行 `git status` 和 `git diff --staged` 了解变更内容
2. 运行 `git log --oneline -5` 了解历史风格
3. 根据变更内容生成 Conventional Commits 格式的提��信息：

```
<type>(<scope>): <subject>

<body>
```

规则：

- `type` 使用步骤 1 中解析的类型，若未指定则根据变更内容推断
- `scope` 为可选的变更范围（如 `cli`、`skill`、`core`），若无法确定则省略
- `subject` 简洁描述变更，英文，不超过 50 字符
- `body` 为步骤 1 中传入的其余文本（如果有），或者用 1-2 行补充说明

将生成的信息展示给用户确认，或直接提交（若上下文明确）。

---

## 5: 提交并推送

```bash
git ut-writer -m "<type>(<scope>): <subject>" -m "<body>"
git push origin <current-branch>
```

---

## 6: 等待 CI（仅非快速模式）

推送成功后，获取最新 workflow run 并等待结果：

### 6a. 获取当前分支最新的 CI run

```bash
gh run list -R studyzy/save-token -b <current-branch> --limit 1 --json databaseId,status,conclusion,workflowName
```

如果当前分支没有任何 run（刚推送的尚未创建），等待几秒后重试。

### 6b. 等待完成

```bash
gh run watch <run-id> -R studyzy/save-token
```

或使用轮询方式：

```bash
gh run view <run-id> -R studyzy/save-token --json status,conclusion
```

每隔 15 秒检查一次，直到 status 为 `completed`。

### 6c. 处理结果

- **conclusion = success**：提示用户 CI 通过，结束
- **conclusion = failure**：
  1. 使用 `gh run view <run-id> --log` 获取失败日志
  2. 分析错误原因，修复代码
  3. 回到步骤 2（本地检查）重新走完整流程
- **如果 repo 无 CI 工作流**（`gh run list` 返回空）：直接跳过此步骤，提示"该仓库未配置 GitHub Actions，跳过 CI 等待"

---

## 参考

- GitHub Actions 仓库：https://github.com/studyzy/save-token
- 本地检查命令：`make check`（= typecheck + lint-fix + test-run）
