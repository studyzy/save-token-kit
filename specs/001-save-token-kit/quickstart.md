# 快速入门: Save Token Kit (stk)

## 安装

```bash
npm install -g save-token-kit
# 或
pnpm add -g save-token-kit
```

## 初始化

在项目根目录运行：

```bash
stk init
```

选择 CodeBuddy 作为目标 AI Agent。完成后，CodeBuddy 对话中即可使用以下命令：

- `/stk-diagnose` — 诊断 Token 占用
- `/stk-analyze` — 分析 Token 优化空间
- `/stk-optimize` — 执行优化操作
- `/stk-report` — 生成优化结果对比报告

## 完整工作流

### 步骤 1: 诊断

在 CodeBuddy 对话中执行：

```
/stk-diagnose
```

或直接在终端运行：

```bash
stk diagnose                # 默认 --agent codebuddy
stk diagnose --agent codebuddy
stk diagnose >> ./save-token/diagnosis-report.md
```

诊断完成后，`./save-token/` 目录下生成（CLI 写入）：

- `proxy-raw-body.json` — 原始请求体
- `diagnosis-report.json` — 结构化诊断数据（每次覆盖）

重定向保存的 Markdown 报告（CLI 不写，需手动 `>>`）：

- `diagnosis-report.md` — 首次诊断的 Markdown 报告
- `diagnosis-report2.md` — 优化后二次诊断的 Markdown 报告（供 `/stk-report` 对比）

### 步骤 2: 分析

在 CodeBuddy 对话中执行：

```
/stk-analyze
```

AI Agent 会读取诊断数据，分析 Token 优化空间，生成按节省量排序的建议列表。

### 步骤 3: 执行优化

在 CodeBuddy 对话中执行：

```
/stk-optimize
```

AI Agent 逐条展示修改方案，用户确认后执行。执行前自动备份原文件。

### 步骤 4: 验证效果

优化完成后，重新诊断：

```bash
stk diagnose >> ./save-token/diagnosis-report2.md
```

然后在 CodeBuddy 对话中执行：

```
/stk-report
```

AI Agent 会对比优化前后的诊断数据，生成效果对比报告并存入 `./save-token/save-token-report.json`（及可选 `save-token-report.md`）。

> **本期不实现回滚**：优化操作不自动备份，如需撤销请手动恢复配置文件。

## 输出文件说明

| 文件                                  | 说明                                 | 生成阶段 |
| ------------------------------------- | ------------------------------------ | -------- |
| `./save-token/proxy-raw-body.json`    | 原始 POST 请求体（CLI 写，覆盖）     | 诊断     |
| `./save-token/diagnosis-report.json`  | 结构化 JSON 诊断报告（CLI 写，覆盖） | 诊断     |
| `./save-token/diagnosis-report.md`    | 首次诊断 Markdown 报告（重定向）     | 诊断     |
| `./save-token/diagnosis-report2.md`   | 优化后 Markdown 诊断报告（重定向）   | 验证     |
| `./save-token/analysis.json`          | 优化建议（Agent 落盘）               | 分析     |
| `./save-token/tasks.json`             | 优化任务执行结果（Agent 落盘）       | 优化     |
| `./save-token/save-token-report.json` | 优化结果对比报告（Agent 落盘）       | 报告     |

## CLI 命令参考

| 命令                                 | 说明                                   |
| ------------------------------------ | -------------------------------------- |
| `stk init`                           | 初始化，安装 Commands 和 SKILL         |
| `stk init --agent codebuddy --force` | 指定 Agent 并强制覆盖                  |
| `stk diagnose`                       | 诊断 Token 占用                        |
| `stk diagnose --port 9999`           | 指定代理端口                           |
| `stk diagnose --agent codebuddy`     | 显式指定目标 Agent（默认即 codebuddy） |
