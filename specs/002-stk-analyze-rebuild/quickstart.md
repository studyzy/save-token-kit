# 快速开始: stk-analyze 重构验证

**分支**: `002-stk-analyze-rebuild`

## 前置条件

- 已安装 CodeBuddy Code
- `stk diagnose` 已运行，`save-token/diagnosis-report.json` 存在且 `scanTimestamp` 在 5 分钟内

## 验证步骤

### 1. 触发 SKILL

在 CodeBuddy Code 中执行 `/stk-analyze`。

### 2. 验证第一阶段（诊断校验）

- 诊断报告有效时：直接进入第二阶段
- 诊断报告缺失/过期时：提示先运行 `stk diagnose`，停止

### 3. 验证第二阶段（场景收集 + 仓库扫描）

- 第一轮问答：purpose + sameRepo
- 仓库扫描：`save-token/repo-scan.json` 生成
- 第二轮问答（条件触发，`codeFileCount >= 5`）：图谱工具倾向性，含推荐标记
- `save-token/context.json` 写入（含 `graphTool` 字段，若询问过）

### 4. 验证第三阶段（并行子 Agent）

- 检查 `save-token/suggestions-*.json` 文件数量 = 应启动的子 Agent 数量
- 对象为空的子 Agent 不产生文件
- 每个文件 Schema 一致（`agentName`/`category`/`generatedAt`/`skipped`/`suggestions[]`）

### 5. 验证第四阶段（汇总）

- `save-token/tasks.md` 生成
- 顶部含场景注释 `<!-- scenario: ... -->`
- 按 `category` 分组
- 每条 Task 可执行（无"优化一下"等模糊表述）
- ID 全局唯一
- 已跳过的子 Agent 在摘要区列出

### 6. 验证控制台摘要

- 总计预估节省 Token 与百分比
- `tasks.md` 路径
- 场景标注
- 已跳过的子 Agent 列表
- 失败子 Agent 列表

## 测试用例

### 用例 A: 标准 code 仓库

```bash
# 前置
stk diagnose
# 触发
/stk-analyze
# 期望
# - repo-scan.json 含 codeFileCount >= 5
# - 询问图谱工具（含推荐）
# - suggestions-*.json 多个
# - tasks.md 非空
```

### 用例 B: 无 MCP 仓库

```bash
# 诊断报告中 mcpList 为空
# 期望
# - suggestions-mcp-opt.json 不存在
# - 摘要中"MCP 优化子 Agent 已跳过（无 MCP）"
# - tasks.md 无 MCP 分组
```

### 用例 C: 小仓库

```bash
# codeFileCount < 5
# 期望
# - 不询问图谱工具
# - context.json 无 graphTool 字段
# - suggestions-knowledge-base.json 不存在
```

### 用例 D: 7 天内复用

```bash
# 7 天内再次运行 /stk-analyze
# 期望
# - 跳过所有问答
# - 复用 context.json
```
