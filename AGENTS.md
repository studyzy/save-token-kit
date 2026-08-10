# Repository Guidelines

Contributor guide for **save-token-kit** (`stk`), a TypeScript CLI that helps AI agents save tokens by diagnosing and optimizing context usage.

## Project Structure & Module Organization

- `src/` — all source code (TS, ESM):
  - `cli.ts` — CLI entry, registers `diagnose`/`init`/`install`/`rollback`/`proxy`.
  - `commands/`, `collectors/`, `proxy/`, `adapters/`, `templates/`, `tools/`, `types/`, `utils/`.
- `tests/` — `unit/` (mirrors `src`) and `integration/`.
- `save-token/` — runtime outputs (reports, `proxy-raw-body.json`).
- `docs/` — architecture and optimization rules.
- `specs/`, `.github/`, `openspec/` — spec/agent workflow scaffolding.

Build artifacts land in `dist/`; the binary is `dist/cli.mjs`.

## Build, Test, and Development Commands

Uses **pnpm**; the `Makefile` wraps the same scripts:

- `make install` / `pnpm install` — install dependencies.
- `make build` / `pnpm build` — `unbuild` produces the ESM bundle `dist/cli.mjs`.
- `make test` / `pnpm test` — run all tests with `vitest run`.
- `make cover` / `pnpm coverage` — tests plus coverage (60% threshold).
- `make lint` / `pnpm lint` — `eslint .`.
- `make format` / `pnpm format` — `prettier --write .`.

Run a single test: `pnpm vitest run tests/unit/proxy/parser.test.ts -t "parseRequestBody"`.

## Coding Style & Naming Conventions

- TypeScript **strict**, ESM, Node >= 18. Use explicit `.js` extensions on relative imports (NodeNext).
- Prettier: no semicolons, single quotes, `printWidth` 100, `trailingComma: all`, 2-space indent (see `.prettierrc`).
- Lint with `typescript-eslint` recommended config (`.eslint.config.js`); `dist/`, `coverage/`, `node_modules/` are ignored.
- Prefer kebab-case for files and `camelCase` for functions/variables; types use `PascalCase`.

## Testing Guidelines

- Framework: **Vitest**; config in `vitest.config.ts` (alias `@` -> `src`).
- Tests match `tests/**/*.test.ts`. Maintain ≥ 60% branch/function/line/statement coverage.
- Keep unit tests beside the code they cover under `tests/unit/<module>/`.

## Commit & Pull Request Guidelines

- Follow **Conventional Commits**: `<type>(<scope>): <subject>` (e.g. `feat(proxy): add stk proxy command`, `fix(collectors): scan Claude rules dirs`). Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `perf`, `build`. Subject may be Chinese or English.
- PRs should link the relevant spec under `specs/` and summarize behavior changes; include before/after `stk diagnose` reports when touching token output.

## Agent-Specific Notes

- Token estimates use a `length/4` heuristic, not a real tokenizer.
- The proxy intercepts the live API request body; no extra agent calls are made.
- Optimization never auto-edits user configs; `rollback` only suggests manual recovery.
