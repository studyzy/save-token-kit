# 快速上手: 优化前后 Token 对比报告

**分支**: `004-rewrite-report-skill` | **日期**: 2026-07-14

## 适用场景

已完成 `/stk-optimize` 优化，想量化"到底省了多少 Token、哪些任务真正生效"。

## 前置条件

`./save-token/` 下需具备：

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `diagnosis-report.json` | `stk diagnose`（优化前） | 基线，缺失则报错引导 |
| `diagnosis-report2.json` | `stk diagnose`（优化后重采） | proxy 实时数据，缺失则引导重采 |
| `tasks.json` | `/stk-optimize` 执行后 | 任务归因源，可选 |

## 步骤

```bash
# 1. 优化前已采基线（若没有）
stk diagnose

# 2. 执行优化
/stk-optimize

# 3. 优化后重新采集（proxy 透明代理拦截真实请求）
stk diagnose   # 写出 diagnosis-report2.json

# 4. 生成对比报告
/stk-report
```

## 产出

- `./save-token/save-token-report.json` — 结构化对比（`SaveTokenReport` 契约）
- 对话内中文摘要 — 总节省百分比、分类变化表、任务效果表（含预估/实际偏差）

## 缺失数据引导

- 缺 `diagnosis-report.json` → "缺少优化前基线，请先运行 `stk diagnose`"
- 缺 `diagnosis-report2.json` → "请优化后再次运行 `stk diagnose` 采集对比数据"
- 仅有 `tasks.md` 无 `tasks.json` → "请先运行 `/stk-optimize` 生成执行结果后再报告"

## 注意

- Token 估算为 `length/4` 经验值，仅用于相对比较，非真实 tokenizer。
- 报告只读，不修改任何配置或前置文件。
