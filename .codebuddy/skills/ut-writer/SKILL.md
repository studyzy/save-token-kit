---
name: ut-writer
description: '为 save-token 项目补充单元测试，使覆盖率达到 60% 且全部通过。'
context: fork
model: deepseek-v4-pro-ioa
---

# UT Writer

## 用户输入

```text
$ARGUMENTS
```

## 概述

为 save-token 项目补充单元测试，使 vitest 覆盖率达到 60%（branches / functions / lines / statements 四项），且所有测试通过。循环「写测试 → 跑测试 → 修复失败」直到达标。

**覆盖率阈值已在 `vitest.config.ts` 中配置为 60%，`pnpm test:coverage` 失败即表示未达标。**

---

## 第 0 步：评估当前覆盖率基线

```bash
pnpm test:coverage 2>&1
```

解读输出：

- 若四项阈值全部达到且无失败测试 → 已达标，报告"覆盖率已达标"并结束。
- 若有失败测试 → 跳到第 2 步，先修复现有失败。
- 若有覆盖率不足 → 继续第 1 步。

---

## 第 1 步：分析覆盖率缺口，识别待测源文件

检查 `coverage/index.html` 或终端 text reporter 输出，找出覆盖率最低的源文件。

需要关注的源文件（`src/` 下，排除项见 `vitest.config.ts`）：

| 源文件                                 | 对应测试文件                                  | 排除？ |
| -------------------------------------- | --------------------------------------------- | ------ |
| `src/adapters/codebuddy-adapter.ts`    | 无                                            | 否     |
| `src/adapters/platform-adapter.ts`     | 无                                            | 否     |
| `src/analyzers/rules.ts`               | `tests/analyzers/rules.test.ts`               | 否     |
| `src/analyzers/suggestion-engine.ts`   | `tests/analyzers/suggestion-engine.test.ts`   | 否     |
| `src/cli-setup.ts`                     | 无                                            | 否     |
| `src/cli.ts`                           | 无                                            | 否     |
| `src/collectors/fs-collector.ts`       | `tests/collectors/fs-collector.test.ts`       | 否     |
| `src/collectors/headless-collector.ts` | `tests/collectors/headless-collector.test.ts` | 否     |
| `src/collectors/proxy-collector.ts`    | `tests/collectors/` 无对应                    | 否     |
| `src/collectors/token-estimator.ts`    | `tests/collectors/token-estimator.test.ts`    | 否     |
| `src/commands/*.ts` (6 个)             | `tests/commands/*.test.ts`                    | 否     |
| `src/executors/*.ts` (4 个)            | `tests/executors/*.test.ts`                   | 否     |
| `src/proxy/*.ts` (2 个)                | `tests/proxy/*.test.ts`                       | 否     |
| `src/utils/error-handler.ts`           | `tests/utils/error-handler.test.ts`           | 否     |
| `src/utils/fs-operations.ts`           | `tests/utils/fs-operations.test.ts`           | 否     |
| `src/utils/output.ts`                  | `tests/utils/output.test.ts`                  | 否     |
| `src/utils/platform.ts`                | 无                                            | 否     |
| `src/utils/prompt-templates.ts`        | `tests/utils/prompt-templates.test.ts`        | 否     |
| `src/utils/resource-dir.ts`            | 无                                            | 否     |
| `src/types/index.ts`                   | 无                                            | **是** |
| `src/i18n/**`                          | 无                                            | **是** |
| `src/adapters/claude-code-adapter.ts`  | 无                                            | **是** |
| `src/adapters/codex-adapter.ts`        | 无                                            | **是** |

**优先补充无测试文件的模块**（覆盖率提升最快）：

1. `src/adapters/codebuddy-adapter.ts`
2. `src/adapters/platform-adapter.ts`（接口定义，简单）
3. `src/utils/platform.ts`
4. `src/utils/resource-dir.ts`
5. `src/cli-setup.ts`
6. `src/collectors/proxy-collector.ts`

其次增强已有测试但覆盖率不足的模块。

---

## 第 2 步：修复现有失败测试

在写新测试前，先确保现有测试全部通过：

```bash
pnpm test:run
```

若有失败：

1. 分析失败原因（断言错误 / 运行时错误 / 超时）
2. 修复测试或源码（优先修复源码，测试不应迁就错误代码）
3. 重新运行直到全部通过

---

## 第 3 步：为覆盖率最低的模块补充测试

按第 1 步的优先级顺序，每次选 1-2 个覆盖率最低的源文件补充测试。

**测试编写规范**：

- 测试文件路径：`tests/<模块>/<文件名>.test.ts`，与 `src/` 目录结构对应
- 使用 vitest 的 `describe` / `it` / `expect`
- 对已有 fixtures（`tests/fixtures/`）复用以减少冗余
- 对 `tinyexec` 等外部依赖使用 `vi.mock()` mock
- 对文件系统操作使用临时目录（`fs.mkdtempSync()` + `afterEach` 清理）
- 每个模块至少覆盖：正常路径、边界值、错误路径

**写完后立即验证**：

```bash
pnpm test:coverage 2>&1
```

---

## 第 4 步：循环直到达标

重复第 3 步，每次补充 1-2 个模块的测试后跑 `pnpm test:coverage`，直到：

- branches ≥ 60%
- functions ≥ 60%
- lines ≥ 60%
- statements ≥ 60%
- **所有测试通过**（无 FAIL）

四项阈值全部满足且无失败测试 → 结束，报告最终覆盖率和测试数量。

---

## 第 5 步：最终验证

```bash
pnpm typecheck && pnpm lint:fix
```

确保类型检查和 lint 都通过。如有问题则修复后重新验证。

---

## 关键约束

- **不修改源码逻辑**：仅补充测试，不重构、不改业务代码。除非测试发现真正的 bug。
- **不修改 vitest.config.ts**：覆盖率阈值已配置为 60%，不要调整。
- **不修改已有测试文件**：除非现有测试有错误需要修复。
- **不修改 fixtures**：测试数据文件保持不变。
- **优先补无测试的模块**：效果最大，避免在已有测试的模块上反复微调。
