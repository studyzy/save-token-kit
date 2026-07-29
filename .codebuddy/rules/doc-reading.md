---
alwaysApply: false
description: 文档读取约定，减少大体积 markdown 的上下文占用
---

# 上下文节省（文档读取约定）

本仓库含大量文档类 markdown（约 84 个）。为减少不必要的上下文占用：

- **不要主动读取** `CHANGELOG*`、`**/changelog*`、纯文档目录（如 `docs/`、`examples/` 下的说明文档）等大体积 markdown，除非用户明确指向或任务确实需要。
- 需要了解项目用法时，优先参考本 CODEBUDDY.md 与 `src/types/index.ts` 契约定义，而非回读全部文档。
- skill 描述与插件说明已自动注入上下文，无需为“了解某个 skill 做什么”而额外读取其 SKILL.md。
