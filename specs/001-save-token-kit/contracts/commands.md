# Command 接口合同

## 概述

stk 通过 CodeBuddy Commands 机制暴露 4 个斜杠命令，每个命令有对应的 SKILL 文件定义 AI Agent 行为。

## Command 文件格式

```markdown
---
name: stk-{command}
description: '{Description}'
argument-hint: '[arguments]'
---

{Instructions body in Chinese}
```

## Command 列表

### 1. `/stk-diagnose`

**文件**: `.codebuddy/commands/save-token-kit/diagnose.md`
**SKILL**: `.codebuddy/skills/st-diagnose/SKILL.md`

**行为**:

1. AI Agent 检查 `./save-token/` 目录是否存在诊断数据
2. 如不存在，启动 `stk diagnose >> ./save-token/diagnosis-report.md` 采集数据并保存首次诊断报告
3. 读取 `diagnosis-report.json`（最近一次结构化数据）并展示诊断摘要；如需对比历史，以 `diagnosis-report.md` 为准
4. 如有警告，高亮提示

### 2. `/stk-analyze`

**文件**: `.codebuddy/commands/save-token-kit/analyze.md`
**SKILL**: `.codebuddy/skills/st-analyze/SKILL.md`

**前置条件**: `./save-token/diagnosis-report.json` 或 `diagnosis-report.md` 存在

**行为**:

1. AI Agent 读取诊断数据（`.md` 展示 + `.json` 取精确数字）
2. 分析 Token 占用分布，识别优化空间：
   - Skill 占用 > 500 token 且非高频 → 建议关闭
   - MCP 有 CLI 等价物 → 建议替代
   - CODEBUDDY.md > 200 行 → 建议精简
   - 未安装省 Token 工具 → 建议安装
   - MCP 工具多但无延迟加载 → 建议启用
3. 生成按节省量排序的优化建议列表
4. **必须**将建议以 JSON 落盘 `./save-token/analysis.json`（结构见 data-model.md §2）；可另写 `analysis.md` 作展示
5. 输出预估总节省量

### 3. `/stk-optimize`

**文件**: `.codebuddy/commands/save-token-kit/optimize.md`
**SKILL**: `.codebuddy/skills/st-optimize/SKILL.md`

**前置条件**: `./save-token/analysis.json` 存在

**行为**:

1. AI Agent 读取 `analysis.json`，展示每条建议的修改方案
2. 用户逐条确认或全部应用
3. 执行修改（禁用 Skill / 关闭 MCP / 精简文件 / 安装工具等）
4. **必须**将执行结果以 JSON 落盘 `./save-token/tasks.json`（结构见 data-model.md §3）；`actualSavingTokens` 本期留空
5. 完成后提示用户重新运行 `stk diagnose >> ./save-token/diagnosis-report2.md` 采集优化后的诊断报告（用于与首次 `diagnosis-report.md` 对比）

### 4. `/stk-report`

**文件**: `.codebuddy/commands/save-token-kit/report.md`
**SKILL**: `.codebuddy/skills/st-report/SKILL.md`

**前置条件**: 优化已执行，重新诊断已完成（`diagnosis-report2.md` 存在）

**行为**:

1. AI Agent 读取文件：
   - `./save-token/diagnosis-report.md`（优化前）
   - `./save-token/diagnosis-report2.md`（优化后）
   - `./save-token/tasks.json`（任务执行结果，可选）
2. 计算 before/after 总 Token 差值与各分类变化
3. 将任务执行效果与 Token 变化归因，生成对比报告
4. **必须**以 JSON 落盘 `./save-token/save-token-report.json`（结构见 data-model.md §4）；可另写 `save-token-report.md` 作展示

## 错误处理

| 场景                                             | AI Agent 行为                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| 首次诊断报告不存在（`diagnosis-report.md` 缺失） | 提示先运行 `/stk-diagnose` 或 `stk diagnose >> ./save-token/diagnosis-report.md` |
| 优化后诊断数据不存在                             | 提示先运行 `stk diagnose >> ./save-token/diagnosis-report2.md`                   |
| 任务清单不存在                                   | 仅对比前后诊断数据，不展示任务级效果                                             |
| JSON 解析失败                                    | 报告具体文件和行号，不崩溃                                                       |
