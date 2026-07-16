# Save Token Kit (stk)

帮助 AI Agent 节省 Token 的 CLI 工具。效仿 OpenSpec 架构：**CLI（stk）负责数据采集，AI Agent 通过 Commands 与 SKILL 驱动优化工作流**。

## 安装

```bash
npm install -g save-token-kit
# 或
pnpm add -g save-token-kit
```

## 初始化

在项目根目录运行：

```bash
stk init
```

选择 CodeBuddy 作为目标 AI Agent。完成后，CodeBuddy 对话中即可使用：

- `/stk-diagnose` 诊断 Token 占用
- `/stk-analyze` 分析 Token 优化空间
- `/stk-optimize` 执行优化操作
- `/stk-report` 生成优化结果对比报告

### 安装选项

| 选项             | 说明                                                   |
| ---------------- | ------------------------------------------------------ |
| `--local`        | 安装到项目级 `.codebuddy/`（默认全局 `~/.codebuddy/`） |
| `--skills`       | 额外安装 4 个 SKILL 文件                               |
| `--force`        | 覆盖已存在的文件                                       |
| `--agent <name>` | 目标 Agent（本期仅 `codebuddy`）                       |

## 完整工作流

### 步骤 1：诊断

```bash
stk diagnose                    # 默认 --agent codebuddy
stk diagnose --agent codebuddy
stk diagnose >> ./save-token/diagnosis-report.md   # 保存首次报告
```

`stk diagnose` 在 `./save-token/` 下生成：

- `proxy-raw-body.json` 原始请求体
- `diagnosis-report.json` 结构化 JSON 报告（每次覆盖）

控制台输出 Markdown 摘要，可用 `>>` 重定向保存为 `.md`。

### 步骤 2-4：分析 / 优化 / 报告（由 AI Agent 完成）

在 CodeBuddy 对话中依次运行 `/stk-diagnose` → `/stk-analyze` → `/stk-optimize` → `/stk-report`。
各阶段产物：

| 文件                     | 阶段          | 说明                 |
| ------------------------ | ------------- | -------------------- |
| `analysis.json`          | /stk-analyze  | 优化建议（机器可读） |
| `save-token-report.json` | /stk-report   | 前后 Token 对比报告  |

优化后重新诊断：`stk diagnose >> ./save-token/diagnosis-report2.md`。

## 命令参考

### `stk diagnose`

| 选项              | 默认值      | 说明                                             |
| ----------------- | ----------- | ------------------------------------------------ |
| `--agent <name>`  | `codebuddy` | 目标 Agent（`claude`/`codex`/`cursor` 暂不支持） |
| `--port <number>` | `8899`      | 代理端口（占用时自动回退随机端口）               |

### `stk rollback`

预留命令。本期优化操作不自动备份，故 rollback 仅提示手动恢复。

## 开发

```bash
pnpm install
pnpm build      # unbuild 产出 ESM 单文件 dist/cli.mjs
pnpm test       # vitest 运行测试
pnpm coverage   # 测试 + 覆盖率（阈值 60%）
```

也可用 Makefile 统一入口：

```bash
make install    # 安装依赖
make build      # 构建
make test       # 运行测试
make cover      # 测试 + 覆盖率
make lint       # ESLint 检查
make format     # Prettier 格式化
make clean      # 清理 dist/ 与覆盖率
```

## 本期不包含

- Plugin 封装
- `stk analyze`/`optimize`/`report` 等 CLI 命令（由 AI Agent 完成）
- 其他 AI Agent 平台安装支持
- 实时持续监控、云端同步、GUI、自动回滚
