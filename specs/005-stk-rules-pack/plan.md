# 实施计划: 规则包 stk-rules 独立版本化，引擎只管执行

**分支**: `005-stk-rules-pack` | **日期**: 2026-09-24 | **规范**: [spec.md](./spec.md)
**输入**: 来自 `/specs/005-stk-rules-pack/spec.md` 的功能规范

## 摘要

将 stk 内置的优化经验（低频插件名单、MCP 替代映射、第三方工具目录、判定阈值）外置为独立版本化的规则包 `@studyzy/stk-rules`，引擎（stk 主程序）只负责加载、校验、合并与执行。支持手动更新命令与受控自动检查（24h TTL、可关闭）、三层规则源叠加（内置兜底 < 全局用户 < 项目级）、双向版本兼容护栏；诊断报告标注规则库版本；技能模板初始化时从规则包渲染提示词片段。优化经验的迭代从此与主程序发版解耦（杀毒软件病毒库模式）。

## 技术背景

**语言/版本**: TypeScript（strict, ESM, NodeNext）, Node.js >= 18 LTS
**主要依赖**: 现有 cac / ansis / tinyexec；规则包获取复用用户机器上的 npm/pnpm（经 tinyexec 调用），不新增运行时依赖；semver 区间判断手写最小实现（章程 IV）
**存储**: 文件系统——本地规则库 `~/.stk/rules/`、用户自定义 `~/.stk/rules.d/`、项目级 `./stk-rules/`、检查元数据 `~/.stk/rules/meta.json`
**测试**: Vitest（单元 + 集成），覆盖率门槛 60% 保持
**目标平台**: macOS / Linux / Windows CLI
**项目类型**: CLI（单仓双包：主程序 + 规则包）
**性能目标**: 规则更新 < 10s（正常网络）；加载 < 50ms；自动检查不阻塞主流程（后台异步 + 短超时）
**约束条件**: 离线 100% 可用（兜底规则随主程序分发）；单次诊断全程使用启动时加载的规则快照
**规模/范围**: 4 类数据集（约几十条条目）+ 十余个提示词片段；单人维护起步，结构预留社区贡献

## 章程检查

*门控: 必须在阶段 0 研究前通过. 阶段 1 设计后重新检查.*

| 原则 | 检查 | 结论 |
| --- | --- | --- |
| I. CLI 优先 | 新增 `stk rules update` / `stk rules status` 命令，支持 `--json`、`--help`，stdout/stderr 文本协议 | ✅ 通过 |
| II. Token 效率 | 规则外置使模板去除写死经验，输出紧凑；规则包本身即 Token 优化经验的载体 | ✅ 通过 |
| III. 测试驱动 | loader/semver/update/render 均有单元测试；三层叠加与 compat 降级有集成测试；既有测试零回归（SC-007） | ✅ 通过 |
| IV. 简洁至上 | 不引入 YAML/semver 框架依赖；semver 手写仅覆盖 `>=` `<` `=`；无预留抽象（本期不做声明式 match/estimate 引擎） | ✅ 通过 |
| V. 文档即产品 | 新命令中文 `--help`；本计划及 research/data-model 记录于 `.specify` 对应 specs 目录 | ✅ 通过 |

设计后复检（阶段 1 完成）：✅ 无违规。三层按条目覆盖合并是需求本身（spec FR-005），非额外抽象；复杂度跟踪表无需填写。

## 项目结构

### 文档(此功能)

```
specs/005-stk-rules-pack/
├── plan.md              # 此文件
├── research.md          # 阶段 0 输出
├── data-model.md        # 阶段 1 输出
├── quickstart.md        # 阶段 1 输出
├── contracts/           # 阶段 1 输出（CLI 命令契约 + 规则包清单 schema + 渲染契约）
│   ├── cli-rules.md
│   ├── pack-manifest.md
│   └── prompt-render.md
└── tasks.md             # 阶段 2 输出（/speckit.tasks 创建）
```

### 源代码(仓库根目录)

```
rules/                            # 规则包源（独立 npm 包 @studyzy/stk-rules，唯一事实来源）
├── package.json                  # 独立版本号，独立发版（与主程序解耦）
├── manifest.json                 # schemaVersion / packVersion / releasedAt / engines.stk
├── data/
│   ├── low-frequency-plugins.json
│   ├── mcp-alternatives.json
│   ├── tools.json
│   └── thresholds.json
└── prompts/                      # 提示词片段（经验性判定知识，模板渲染用）
    ├── mcp-opt.md
    ├── tool-opt.codebuddy.md
    ├── tool-opt.claude.md
    └── ...

src/rules/
├── loader.ts                     # 四层加载 + compat 校验 + 按条目覆盖合并 → MergedRules
├── semver.ts                     # 最小 semver 区间判断（>=, <, =）
├── update.ts                     # stk rules update / 受控自动检查（TTL meta、后台异步、短超时）
└── render.ts                     # stk init 模板占位符渲染（规则包 prompts → 模板产物）

src/rules-data.ts                 # 兜底入口：从依赖包 @studyzy/stk-rules 读取（随主程序分发）
src/commands/rules.ts             # stk rules 子命令
src/types/rules.ts                # 规则领域类型（数据契约）

tests/unit/rules/                 # loader / semver / update / render 单测
tests/integration/rules-stack.test.ts   # 三层叠加 + 降级场景集成测试
```

**结构决策**: 采用仓库内双包布局。`rules/` 是唯一事实来源（满足 FR-001 无第二份可变事实），主程序以 npm 依赖（开发期 `file:./rules`，发布后 registry 版本）引用它作为"内置兜底层"——兜底与规则包天然同构，不产生数据副本。引擎侧新增 `src/rules/` 模块（loader/semver/update/render 四个内聚文件，符合章程 IV 单一职责）。既有 `LOW_FREQUENCY_PLUGINS`/`MCP_CLI_ALTERNATIVES`（src/types/index.ts）与 registry 纯数据字段迁移为从 `MergedRules` 读取，删除原硬编码常量。

## 复杂度跟踪

> 仅在章程检查有必须证明的违规时填写——本期无违规。
