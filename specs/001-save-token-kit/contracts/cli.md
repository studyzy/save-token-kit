# CLI 接口合同: stk

## 1. `stk diagnose`

诊断指定 AI Agent 环境的 Token 占用，通过 HTTP Proxy 拦截 LLM 请求。本期仅支持 CodeBuddy，其他 Agent 标记为"暂不支持"。

### 用法

```
stk diagnose [options]
```

### 选项

| 选项              | 类型   | 默认值      | 说明                                                                  |
| ----------------- | ------ | ----------- | --------------------------------------------------------------------- |
| `--agent <name>`  | string | `codebuddy` | 目标 AI Agent（`codebuddy` 可用；`claude`/`codex`/`cursor` 暂不支持） |
| `--port <number>` | number | 8899        | 代理监听端口                                                          |
| `--help`          | flag   | -           | 显示帮助信息                                                          |

### 行为

1. 解析 `--agent`（默认 `codebuddy`）；若指定非 `codebuddy` 的 Agent，直接报错退出（退出码 1，提示"暂不支持的 Agent"）
2. 启动本地 HTTP 代理服务器（默认端口 8899）
3. 设置 `CODEBUDDY_BASE_URL=http://127.0.0.1:{port}/v2`
4. 执行 `codebuddy -p "Hello" -y --max-turns 1` 触发请求捕获
5. 拦截 `POST /v2/*` 请求，解析请求体
6. 输出诊断数据：
   - `./save-token/proxy-raw-body.json` — 原始请求体
   - `./save-token/diagnosis-report.json` — 结构化 JSON 报告
   - 控制台 Markdown 输出（可通过 `>> ./save-token/diagnosis-report.md` 重定向）
7. 按 Ctrl+C 优雅关闭，已采集数据正常写入

### 输出

**stdout**: Markdown 格式的诊断摘要
**stderr**: 错误信息（如有）
**文件**: `./save-token/proxy-raw-body.json`, `./save-token/diagnosis-report.json`

### 退出码

| 码  | 说明                                                                                 |
| --- | ------------------------------------------------------------------------------------ |
| 0   | 成功                                                                                 |
| 1   | CodeBuddy 未安装或不在 PATH 中；或指定了暂不支持的 Agent（`--agent` 非 `codebuddy`） |
| 2   | 端口被占用                                                                           |
| 3   | Proxy 启动失败                                                                       |
| 4   | 请求捕获失败（无请求被拦截）                                                         |

### 示例

```bash
# 默认：针对 CodeBuddy 诊断
stk diagnose

# 显式指定 Agent
stk diagnose --agent codebuddy

# 指定端口
stk diagnose --port 9999

# 暂不支持的 Agent（报错退出）
stk diagnose --agent claude

# 保存 Markdown 报告
stk diagnose >> ./save-token/diagnosis-report.md
```

---

## 2. `stk init`

初始化 stk，将 Commands（默认）和 SKILL（可选）安装到目标 AI Agent。

### 用法

```
stk init [options]
```

### 选项

| 选项             | 类型   | 默认值 | 说明                                                |
| ---------------- | ------ | ------ | --------------------------------------------------- |
| `--agent <name>` | string | -      | 直接指定 AI Agent（跳过交互选择）                   |
| `--local`        | flag   | -      | 安装到项目级 `.codebuddy/` 而非全局 `~/.codebuddy/` |
| `--skills`       | flag   | -      | 额外安装 SKILL 文件（默认不安装）                   |
| `--force`        | flag   | -      | 覆盖已有文件而不提示确认                            |
| `--help`         | flag   | -      | 显示帮助信息                                        |

### 行为

1. 展示 AI Agent 选择列表（交互式，除非指定 `--agent`）
2. 默认：将 4 个 Command 文件安装到 `~/.codebuddy/commands/save-token-kit/`（全局）
3. `--local`：安装到项目级 `.codebuddy/commands/save-token-kit/`
4. `--skills`：额外安装 4 个 SKILL 文件到对应 skills 目录
5. 已有文件时提示确认覆盖（除非 `--force`）

### AI Agent 支持

| Agent       | 状态     | Commands 目录                                                                                        | Skills 目录                                                                       |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `codebuddy` | 可用     | `~/.codebuddy/commands/save-token-kit/`（全局）或 `.codebuddy/commands/save-token-kit/`（`--local`） | `~/.codebuddy/skills/`（`--skills`）或 `.codebuddy/skills/`（`--local --skills`） |
| `claude`    | 暂不支持 | -                                                                                                    | -                                                                                 |
| `codex`     | 暂不支持 | -                                                                                                    | -                                                                                 |
| `cursor`    | 暂不支持 | -                                                                                                    | -                                                                                 |

### 安装的文件

**Commands** (`.codebuddy/commands/save-token-kit/`):

- `diagnose.md`
- `analyze.md`
- `optimize.md`
- `report.md`

**Skills** (`.codebuddy/skills/`):

- `st-diagnose/SKILL.md`
- `st-analyze/SKILL.md`
- `st-optimize/SKILL.md`
- `st-report/SKILL.md`

### 输出

**stdout**: 安装结果摘要
**stderr**: 错误信息（如有）

### 退出码

| 码  | 说明         |
| --- | ------------ |
| 0   | 成功         |
| 1   | 用户取消操作 |
| 2   | 文件写入失败 |

### 示例

```bash
# 交互式安装（默认：全局 Commands，不装 SKILL）
stk init

# 直接指定 Agent
stk init --agent codebuddy

# 强制覆盖
stk init --agent codebuddy --force

# 项目级安装
stk init --local

# 安装 Commands + SKILL（全局）
stk init --skills

# 项目级安装 Commands + SKILL
stk init --local --skills
```

---

## 3. 本期范围说明

- 本期 CLI 仅实现 `stk diagnose` 与 `stk init` 两个命令。
- 分析与优化（`/stk-analyze`、`/stk-optimize`、`/stk-report`）完全由 AI Agent 通过已安装的 Commands/SKILL 驱动，Agent 按 data-model.md §2–§4 的 JSON 契约落盘 `analysis.json` / `tasks.json` / `save-token-report.json`。
- **不实现 `stk rollback`**：优化操作不支持自动备份与回滚，若需撤销由用户手动恢复。后续版本可补充备份/回滚能力。
