# Changelog

## 0.7.2 (2026-10-09)

### 新增：stk uninstall 卸载命令

- **`stk uninstall`**：删除 `stk init` 安装的 5 个 SKILL 目录（`stk` / `stk-diagnose` / `stk-analyze` / `stk-optimize` / `stk-report`），选项与 init 对齐（`--agent` / `--local`）
- **安全护栏**：只删除 stk 自有的 5 个 SKILL 目录，不触碰同目录下用户其他 SKILL；TTY 下交互确认，非交互环境（脚本/CI）必须显式 `--force` 才执行
- **README**：命令参考新增 `stk uninstall` 小节；新增「卸载」章节（SKILL → 全局包 → `~/.stk/` 规则库缓存与 `./save-token/` 报告产物清理）

### 质量

- 369 测试全绿；lint 0 错误

## 0.7.1 (2026-10-09)

### 新增：i-have-adhd 工具检测与推荐

- **新工具注册**：接入 [i-have-adhd](https://github.com/ayghri/i-have-adhd)（ADHD 友好输出风格：行动优先、步骤编号、去冗余），与 Ponytail / Caveman 同为输出压缩类 plugin，`stk diagnose` 报告与 `/stk` 推荐流程自动覆盖
- **检测**：`~/.codebuddy/plugins/marketplaces/i-have-adhd/` 目录 + `settings.json` 的 `enabledPlugins['i-have-adhd@i-have-adhd']`
- **Proxy 标记**：codebuddy / codex parser 识别 `ADHD MODE ACTIVE` 标记，命中时覆盖 installed 状态
- **推荐接入**：规则包 `stk-rules.json` / 内置兜底新增条目；tool-enable / install-tool 子 Agent 模板与 `docs/优化规则.md` 同步

### 质量

- 358 测试全绿；lint 0 错误

## 0.7.0 (2026-09-24)

### 新增：规则包 stk-rules（specs/005-stk-rules-pack）

- **规则与引擎分离（单文件）**：优化经验（低频插件名单、MCP 替代映射、工具目录、阈值、分级表、平台提示词片段）收敛为单个规则文件 `rules/stk-rules.json`（版本/engines/data/prompts 全含），推文件即发布，改经验不再需要升级 stk 主程序
- **`stk rules update`**：从 URL 下载单文件到 `~/.stk/rules/stk-rules.json`（STK_RULES_URL 可覆盖源），支持 `--check` 与 `--json`
- **`stk rules status`**：查看生效版本、四层加载结果与更新时间
- **多源叠加**：项目级 `./stk-rules/` > 全局用户 `~/.stk/rules.d/` > 已装规则库 > 内置兜底，条目级覆盖合并，支持 `"!条目"` 移除语法
- **兼容护栏**：规则包 manifest 声明 schemaVersion 与 engines.stk 区间，不兼容整包拒载并回退兜底，警告含两侧版本号
- **可追溯**：诊断报告新增 `rulesInfo` 字段并在 Markdown 头部标注规则库版本
- **提示词外置**：技能模板中的平台经验章节外置为规则包片段，`stk init` 渲染注入（占位符 + 兜底）

### 变更

- 移除 `LOW_FREQUENCY_PLUGINS` / `MCP_CLI_ALTERNATIVES` 硬编码常量（迁入规则包，附 data-parity 测试防回归）
- `stk init` 产物头部插入规则库版本注释

### 质量

- 280 测试全绿；覆盖率 80%（门槛 60%）；lint 0 错误
