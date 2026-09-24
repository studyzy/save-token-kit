# CLI 契约: stk rules 子命令

遵循章程 I（CLI 优先）：stdout 结果 / stderr 错误，`--json` 机器可读，`--help` 中文。

## stk rules update

拉取最新 `@studyzy/stk-rules` 安装到 `~/.stk/rules/`（FR-003）。

```text
用法: stk rules update [options]

选项:
  --check        仅检查新版本，不安装
  --json         机器可读输出
  -h, --help     帮助
```

**人类可读输出（成功）**:

```
规则库已更新: 1.2.0 -> 1.3.0
位置: ~/.stk/rules/1.3.0
```

**输出（已是最新）**: `规则库已是最新: 1.3.0`
**输出（--check 有新版）**: `发现新版本: 1.3.0 (当前 1.2.0)，运行 stk rules update 安装`
**退出码**: 0 成功/已是最新；1 网络/安装失败（stderr 给原因，本地状态不变）。

**--json 结构**:

```json
{ "action": "updated|up-to-date|checked", "from": "1.2.0", "to": "1.3.0", "latest": "1.3.0", "error": null }
```

## stk rules status

查看当前规则库状态（FR-010）。

```text
用法: stk rules status [--json] [-h]
```

**人类可读输出**:

```
生效规则库: 1.3.0 (project + user + library)
  project:  ./stk-rules/            ok
  user:     ~/.stk/rules.d/         ok (2 条自定义)
  library:  ~/.stk/rules/1.3.0      ok
  builtin:  @studyzy/stk-rules@1.1.0 (兜底, 未启用)
上次检查: 2026-09-24T08:00:00Z | 上次更新: 2026-09-23T10:00:00Z
自动检查: 开启 (24h)
```

**--json 结构**: `{ "activeVersion", "fallbackInUse", "sources": [{ "layer", "path", "result", "warnings[]" }], "lastCheckAt", "lastUpdatedAt", "autoCheckDisabled" }`

## 既有命令行为变更

- `stk diagnose` / `stk analyze` 前置加载：构建 `MergedRules` 快照（<50ms，不阻塞语义不变）；library 层 TTL 过期时后台异步检查（2s 超时，R5）。
- `stk diagnose` 报告：头部"数据来源"行追加 `规则库 vX.Y.Z`；`--json` 与落盘 JSON 增加 `rulesInfo`（FR-008）。降级时 stderr 输出一行警告（如 `警告: 规则包 2.0.0 不兼容当前 stk 0.6.0 (要求 >=1.0)，已回退内置兜底 1.1.0`）。
- `stk init`：模板渲染（见 prompt-render.md），并在产物头部注释标注来源版本。

## 错误输出规范

所有错误到 stderr，格式 `Error: <中文原因>`；降级警告格式 `警告: <原因>`。警告不改变退出码。
