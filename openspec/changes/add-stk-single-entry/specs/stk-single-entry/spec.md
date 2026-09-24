# Spec Delta

## Purpose

提供 `/stk` 单一入口，自动推导 Token 优化流水线（诊断→分析→优化→报告）的当前进度，从断点续跑，并在每个阶段设置用户确认停点，消除用户记忆 4 个命令顺序与手动逐步触发的负担。

## ADDED Requirements

### Requirement: /stk 入口状态推导

`/stk` 启动时 SHALL 基于 `save-token/` 下的产物文件（diagnosis-report.md / context.json / tasks.md / save-token-report.json）推导流水线当前所处阶段，MUST NOT 要求用户手动指定进度。判定规则：

- `diagnosis-report.md` 缺失，或扫描时间距当前超过 5 分钟 → 处于「诊断」阶段
- 诊断新鲜且 `tasks.md` 缺失 → 处于「分析」阶段
- `tasks.md` 存在且有未勾选任务 → 处于「优化」阶段
- `tasks.md` 全部勾选且 `save-token-report.json` 缺失 → 处于「报告」阶段
- 报告已生成 → 流水线完结

#### Scenario: 首次使用从诊断开始

- **WHEN** `save-token/` 下无任何产物，用户运行 `/stk`
- **THEN** 系统判定处于「诊断」阶段并开始执行诊断

#### Scenario: 断点续跑

- **WHEN** `tasks.md` 存在且有 6 条未勾选任务，用户运行 `/stk`
- **THEN** 系统判定处于「优化」阶段，从优化阶段继续，而不重跑诊断与分析

#### Scenario: 诊断报告过期重跑

- **WHEN** `diagnosis-report.md` 的扫描时间距当前超过 5 分钟
- **THEN** 系统将其视为过期，重新执行诊断采集

### Requirement: 流水线状态图展示

`/stk` 在执行任何动作前 SHALL 输出一行流水线状态图，标明四个阶段各自的完成状态（已完成 ✓ / 进行中 ● / 未开始 ○），并说明检测到的断点位置与下一步动作。

#### Scenario: 展示当前进度

- **WHEN** 用户运行 `/stk` 且诊断、分析已完成，优化进行中
- **THEN** 输出形如「诊断 ✓ → 分析 ✓ → 优化 ● 进行中 → 报告 ○」的状态图，并说明将从优化阶段继续

### Requirement: 每阶段停点确认

`/stk` SHALL 在每个阶段结束后暂停，使用 AskUserQuestion 询问用户是否继续下一阶段，并提供默认推荐项。任何会修改用户配置或系统文件的动作，MUST 等到用户显式确认后才执行；无确认时 MUST NOT 自动落地任何修改。

#### Scenario: 诊断完成后询问继续

- **WHEN** 诊断阶段完成并展示了报告
- **THEN** AskUserQuestion 询问「是否继续分析阶段？」，默认推荐「继续」

#### Scenario: 用户选择停止

- **WHEN** 任一阶段结束后用户选择「停在这里」
- **THEN** 系统停止推进，不执行任何后续阶段；下次 `/stk` 可从该断点继续

### Requirement: 优化阶段任务级选择

优化阶段在 tasks.md 产出后 SHALL 在对话中展示完整任务清单（编号、等级、动作描述、预估节省），并 MUST 通过 AskUserQuestion 让用户选择本次执行哪些任务：选项至少包含「全部（推荐）」「仅初级」「初级 + 中级」，用户 SHALL 可通过自由输入编号清单（如 `1.1, 2.3`）圈定任意任务子集。系统 MUST NOT 在用户未选择前执行任何优化任务。

#### Scenario: 按编号选择子集

- **WHEN** tasks.md 含 8 条任务，用户在任务选择问题中输入「1.1, 2.3」
- **THEN** 系统仅执行编号 1.1 与 2.3 两条任务，其余保持未勾选

#### Scenario: 未确认不执行

- **WHEN** tasks.md 刚产出、用户尚未回答任务选择问题
- **THEN** 系统不修改任何配置或文件，仅展示清单等待输入

#### Scenario: 选定集合内连续执行

- **WHEN** 用户已选定任务集合
- **THEN** 系统按 tasks.md 顺序逐条执行并逐条回写完成状态，执行过程中不再逐条打断

### Requirement: 意图直达路由

用户在 `/stk` 调用中附带阶段意图（如「/stk 只要报告」「重新诊断」）时，系统 SHALL 直接路由到对应阶段执行，MUST NOT 强制走全链推进，路由后仍遵守该阶段的停点确认规则。

#### Scenario: 只要报告

- **WHEN** 用户输入「/stk 只要报告」且前置产物齐备
- **THEN** 系统直接进入报告阶段执行对比，不询问中间阶段

#### Scenario: 意图指向的阶段前置缺失

- **WHEN** 用户要求直达某阶段，但该阶段依赖的前置产物缺失
- **THEN** 系统提示缺失项并询问是否先补齐前置，不臆造数据

### Requirement: 流水线完结后的新轮次

报告阶段完成后，系统 SHALL 输出上次优化的节省摘要，并询问用户「开新一轮（重新诊断）还是结束」，默认推荐「结束」。

#### Scenario: 全流程完成后再次运行

- **WHEN** 所有产物齐备，用户运行 `/stk`
- **THEN** 输出上次节省摘要，询问开新一轮或结束，选择开新一轮则重跑诊断

### Requirement: 旧命令保留为高级入口

既有 4 个单步命令（/stk-diagnose、/stk-analyze、/stk-optimize、/stk-report）SHALL 继续可用，行为与各自对应的流水线阶段一致；其描述 SHALL 标注「高级·单步」前缀，与主入口 `/stk` 区分。二者 MUST 共享同一份阶段执行逻辑，单步命令的行为变化随之同步。

#### Scenario: 高级用户单步重跑

- **WHEN** 用户直接运行 `/stk-diagnose` 重新采集诊断
- **THEN** 仅执行诊断阶段，不影响 tasks.md 等既有产物，不触发后续阶段

#### Scenario: 单步命令前置缺失

- **WHEN** 用户运行 `/stk-optimize` 但 tasks.md 不存在
- **THEN** 提示先运行 `/stk-analyze`（或 `/stk`），不凭空生成任务
