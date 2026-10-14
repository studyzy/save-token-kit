# 贡献规范（提交 / PR / 测试约定，按需加载）

## Commit 规范

- 遵循 **Conventional Commits**：`<type>(<scope>): <subject>`。
- 示例：`feat(proxy): add stk proxy command`、`fix(collectors): scan Claude rules dirs`。
- 允许 type：`feat` / `fix` / `refactor` / `chore` / `docs` / `style` / `test` / `perf` / `build`。
- subject 中英文均可。

## PR 规范

- 需链接 `specs/` 下对应 spec，并概述行为变更。
- 涉及 Token 产出改动时，附 `stk diagnose` 报告的前后对比。

## 测试约定

- Vitest，配置在 `vitest.config.ts`，alias `@` -> `src`。
- 测试匹配 `tests/**/*.test.ts`，分支/函数/行/语句覆盖率均 ≥ 60%。
- 单元测试放在所覆盖模块的 `tests/unit/<module>/` 下。

## 命名约定

- 文件用 kebab-case；函数/变量用 camelCase；类型用 PascalCase。
