---
alwaysApply: true
---
# 语言规则

## 代码注释使用英文

在编写、修改代码时，必要的注释一律使用英文书写（`//`、`/* */` 等），保持代码与注释语言一致，便于国际化协作与工具链处理。

```ts
// Calculate token estimate using length/4 heuristic
const estimate = Math.ceil(content.length / 4);
```

## 文档使用中文

在编写、修改文档（`*.md`、`docs/`、报告、模板、CLI 输出等用户可见文案）时，使用中文书写。

## 原因

- 项目 CODEBUDDY.md 约定：英文代码注释 + 中文文档/用户可见文案。
- 代码注释面向开发者与工具，英文避免混排；文档面向中文用户，中文更易理解。
