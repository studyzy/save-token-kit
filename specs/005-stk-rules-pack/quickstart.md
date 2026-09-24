# 快速上手: 005-stk-rules-pack

面向实现者与评审者：如何在本地跑通并验证本功能。

## 前置

```bash
make install   # pnpm install（含 file:./rules 链接规则包）
make build     # unbuild → dist/cli.mjs
make test      # vitest run
```

## 核心验证场景（对应成功标准）

### SC-001 改经验不发版

```bash
# 1. 修改 rules/data/low-frequency-plugins.json 加一个条目，rules/package.json 升 patch 版本
# 2. 模拟"更新"：把改后的包内容复制到 ~/.stk/rules/<newver>/（或发布后 stk rules update）
# 3. 不重新构建主程序，直接运行:
stk diagnose --agent codebuddy --report-path=./save-token/diagnosis-report.md
# 预期: 报告头部显示"规则库 vX.Y.Z"，新条目已参与判定
```

### SC-002 离线兜底

```bash
mv ~/.stk/rules ~/.stk/rules.bak   # 移除已装规则库
stk diagnose --agent codebuddy --report-path=/tmp/offline-report.md   # 断网状态
# 预期: 诊断正常完成；报告标注 builtin 兜底；stderr 一行警告
```

### SC-005 降级与警告定位

```bash
mkdir -p ./stk-rules && echo '{ broken' > ./stk-rules/thresholds.json
stk diagnose --agent codebuddy --report-path=/tmp/broken-report.md
# 预期: project 层 rejected-corrupted，其余层正常，警告含 ./stk-rules/thresholds.json
```

### SC-006 三层叠加

```bash
# 内置 < library < user < project，同键覆盖:
echo '{"mcp-server-tapd": "my-cli"}' > ~/.stk/rules.d/mcp-alternatives.json 2>/dev/null || mkdir -p ~/.stk/rules.d && echo '{"mcp-server-tapd": "my-cli"}' > ~/.stk/rules.d/mcp-alternatives.json
stk rules status --json | jq '.sources'
# 预期: 4 层结果齐全; 诊断中 mcp-server-tapd 的替代建议为 my-cli
```

### 更新与状态

```bash
stk rules update          # 正常网络: 输出 "规则库已更新: a.b.c -> x.y.z"
stk rules update --check  # 仅检查
stk rules status          # 各层加载结果 + 时间戳
```

## 单元测试

```bash
pnpm vitest run tests/unit/rules/            # loader/semver/update/render
pnpm vitest run tests/integration/rules-stack.test.ts   # 叠加 + 降级
pnpm vitest run tests/unit/types/            # DiagnosisReport.rulesInfo 兼容
```

## 评审关注点

- `rules/` 与 `src/` 之间无数据副本（FR-001）：grep 确认 `LOW_FREQUENCY_PLUGINS` / `MCP_CLI_ALTERNATIVES` 已从 `src/types/index.ts` 移除且消费方改读 `MergedRules`
- 兼容性拒载必整包、条目级未知仅警告（data-model.md 校验顺序）
- 自动检查绝不阻塞诊断主流程（R5：同步仅读 meta，网络全异步）
