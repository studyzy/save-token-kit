# 契约: 规则文件结构（单文件形态，替代原 multi-file pack 布局）

> **2026-09-24 变更**：发布形态简化为单文件 `rules/stk-rules.json`（version/engines/data/prompts 全含）；`update` 改为 URL 下载（STK_RULES_URL 可覆盖）；library 层路径为 `~/.stk/rules/stk-rules.json`。校验序不变。

`@studyzy/stk-rules` 包的物理布局与校验规则。本契约同时是"规则包生产方"（rules/ 目录）与"消费方"（loader）之间的协议。

## 物理布局

```
@studyzy/stk-rules/
├── package.json          # npm 包元数据, version 即 packVersion（单一来源）
├── manifest.json         # 引擎兼容性清单（schemaVersion/engines/datasets/prompts）
├── data/
│   ├── low-frequency-plugins.json
│   ├── mcp-alternatives.json
│   ├── tools.json
│   ├── thresholds.json
│   └── levels.json
└── prompts/
    └── <name>.md         # 如 tool-opt.codebuddy.md
```

## manifest.json Schema

```json
{
  "schemaVersion": 1,
  "packVersion": "1.3.0",
  "releasedAt": "2026-09-24T00:00:00Z",
  "engines": { "stk": ">=0.6" },
  "datasets": ["low-frequency-plugins", "mcp-alternatives", "tools", "thresholds", "levels"],
  "prompts": ["mcp-opt", "tool-opt.codebuddy", "tool-opt.claude"]
}
```

**约束**:
- `packVersion` MUST 与 `package.json#version` 一致，不一致视为 `rejected-corrupted`
- `schemaVersion` 为整数；引擎仅实现已知值（当前 1），更高 → `rejected-incompatible`
- `engines.stk` 语法：逗号分隔的 `>=X.Y.Z` / `<X.Y.Z` / `=X.Y.Z`（AND 语义）
- `datasets`/`prompts` 列出的文件 MUST 存在，缺失 → `rejected-corrupted`
- 未在 `datasets` 列出的 data/ 文件被忽略（不产生警告，向前兼容）

## 数据集条目语法

- 名单类（`low-frequency-plugins.json`）：字符串数组；上层可用 `"!name"` 条目显式移除下层条目（见 data-model.md §5）
- 映射/阈值/等级类：扁平对象，键为条目键，值为标量；禁止嵌套对象值（校验失败拒载）
- `levels.json` 支持保留键 `"*"` 作为兜底等级
- 用户层（`~/.stk/rules.d/`）与项目层（`./stk-rules/`）文件名与 data/ 数据集同名，内容为**部分条目**（增量覆盖语义）；无 manifest、无 manifest 校验，仅做格式校验

## 校验顺序（loader 执行序）

1. 读 manifest → 缺失/非法 JSON → `rejected-corrupted`
2. `schemaVersion` > 引擎已知 → `rejected-incompatible`
3. `engines.stk` 区间不含当前版本 → `rejected-incompatible`
4. `packVersion` vs `package.json#version` 一致性 → 不一致 `rejected-corrupted`
5. datasets/prompts 文件存在性 → 缺失 `rejected-corrupted`
6. 各数据集解析 + 形态校验 → 失败 `rejected-corrupted`（该源整体拒载，不部分加载）
7. 通过 → `ok`；条目级未知类型 → 保留其余 + 逐条 warnings（FR-012）
