# 契约: 模板提示词渲染（prompt-render）

`stk init` 安装技能模板时，从生效规则源渲染经验性内容（FR-009，R6）。

## 占位符语法

模板骨架中：

```markdown
<!-- stk:rules:prompts/<name> -->
<默认内容（兜底）>
<!-- /stk:rules:prompts/<name> -->
```

- `<name>` 为提示词片段名（如 `tool-opt.claude`），与规则包 `prompts/<name>.md` 对应
- 默认内容 = 内置兜底片段（来自 builtin 层同名文件），骨架本身保持可读、自包含

## 渲染规则

1. `stk init` 按 loader 优先级解析各占位符对应片段：`project > user > library > builtin`，取**最高优先级的命中片段全文**
2. 命中非 builtin 层 → 整段替换为该片段内容；仅 builtin 命中 → 保留骨架默认内容（即兜底，无需替换）
3. 产物头部插入注释：`<!-- stk-rules: vX.Y.Z (sources: project+library) -->`；纯兜底时标注 `builtin`
4. 片段缺失（无任何层提供且骨架无默认段）→ 保留占位符对并输出警告 `警告: 提示词片段 <name> 在规则库与骨架中均不存在`

## 幂等性

- 渲染只作用于 `stk init` 写盘时；已安装的模板不受规则库更新影响，重新 `stk init` 才获得新经验（spec 假设：一次性渲染）
- 同一输入（模板 + 规则快照）多次渲染结果字节级一致（便于测试与 diff）

## 校验

- 渲染后产物 MUST 不含未解析的 `stk:rules:` 占位符标记（除非命中"双缺失"警告场景）
- `stk verify` 不校验渲染内容（经验性文本无格式契约），仅校验占位符闭合结构
