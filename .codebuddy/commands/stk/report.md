---
name: stk:report
description: "对比优化前后诊断报告，生成 Token 节省结果对比报告并落盘 save-token-report.json"
argument-hint: ""
---

# /stk-report

生成优化结果对比报告。

## 前置条件

- 优化已执行，且重新诊断完成：`diagnosis-report2.md` 存在。
- 如 `diagnosis-report.md` 缺失 → 提示"缺少优化前诊断数据，请先运行 /stk-diagnose 采集基线数据"。
- 如 `diagnosis-report2.md` 缺失 → 提示先运行 `stk diagnose >> ./save-token/diagnosis-report2.md`。

## 步骤

1. 读取文件：
   - `./save-token/diagnosis-report.md`（优化前）
   - `./save-token/diagnosis-report2.md`（优化后）
   - `./save-token/tasks.json`（任务执行结果，可选）
2. 计算 before / after 总 Token 差值（由两 `.md` 总 Token 直接相减）与各分类变化。
3. 将任务执行效果与 Token 变化归因，生成对比报告：
   - 优化前后 Token 总占用对比（绝对值变化 + 百分比变化）
   - 按类别（System Prompt / Tools / Skills / Memory / Messages）分解的 Token 变化明细表
   - 每条已执行优化任务的执行状态与效果（completed / partial / failed），标注偏差（如预估省 500 实际省 200）并给原因分析
   - 总体节省摘要（总节省 Token 数、节省比例）
4. **必须**以 JSON 落盘 `./save-token/save-token-report.json`（结构见 data-model.md §4）。
5. 可另写 `./save-token/save-token-report.md` 作展示（可选），并在对话中展示摘要。

## 错误处理

- JSON 解析失败 → 报告具体文件和行号，**不崩溃**。
- 任务清单不存在 → 仅对比前后诊断数据，不展示任务级效果。
