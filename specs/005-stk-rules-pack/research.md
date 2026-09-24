# 研究报告: 005-stk-rules-pack

日期: 2026-09-24 | 状态: 全部未知项已解决

## R1. 规则包载体与分发渠道

**Decision**: 规则包为独立 npm 包 `@studyzy/stk-rules`（源码置于本仓库 `rules/` 目录）；主程序以 npm 依赖引用它作为内置兜底层（开发期 `file:./rules`，发布后 registry 版本）。`stk rules update` 通过 tinyexec 调用用户机器上的 npm，将最新规则包装到 `~/.stk/rules/`。

**Rationale**:
- stk 用户 100% 经由 npm/pnpm 安装主程序，npm 渠道零新增心智；
- npm 自带版本化/原子安装/registry 可用性，免去手写"版本比较 + 下载 + 校验和 + 原子替换"一整套脆弱逻辑（章程 IV）；
- 兜底与规则包同构（同一个包），天然满足 FR-001"无第二份事实来源"——兜底不是副本，就是规则包本身。

**Alternatives considered**:
- GitHub Release tarball + 手写下载器：需自研版本查询/原子写/校验，脆弱且依赖 gh 网络 API 形态；
- git clone 更新：慢、Windows 路径问题多；
- 纯 GitHub raw JSON：无版本清单语义，TTL 检查需额外 API 调用。

## R2. 数据格式

**Decision**: 数据集用 JSON，提示词片段用 Markdown。清单（manifest）用 JSON。

**Rationale**: 项目已有 `readJsonSafe` 等文件工具与 TypeScript 类型体系，JSON 可直接对齐类型定义（编译期校验 + `stk verify` 思路一致）；不引入 YAML 解析依赖。

**Alternatives considered**: YAML（Semgrep 同款，表达力强但需新增依赖，且本包数据是平铺名单/映射，JSON 足够）。

## R3. 多源合并语义：按条目覆盖，非整包替换

**Decision**: 每个数据集内部按条目键（插件名 / MCP server 名 / 工具 id / 阈值键）做"上层覆盖下层"的合并；提示词片段按文件名整体覆盖。同一层内多个文件冲突视为格式错误（拒载该层）。

**Rationale**: 用户自定义通常只想改一条（如"我要保留某插件"），整包替换会迫使用户复制全量数据、随官方更新漂移。条目级覆盖让自定义层保持极小。

**Alternatives considered**: 整层替换（简单但用户体验差）；深合并（对象递归合并——对名单类语义不清，拒绝）。

## R4. 版本兼容护栏实现

**Decision**: manifest 声明 `engines: { "stk": ">=0.6" }`；引擎手写最小 semver 区间判断（仅 `>=`、`<`、`=`，逗号分隔 AND）。规则包同时声明 `schemaVersion`（数据格式版本），引擎只实现自己认识的 schemaVersion，更高则整包拒载。层 2/3（用户裸数据文件）无 manifest，仅做格式校验，失败拒载该层。

**Rationale**: 覆盖 stk 自身 0.x 阶段所需；避免引入 semver 依赖（章程 IV）。向前兼容读取（FR-012）只作用于"条目级未知类型忽略"，manifest 级不兼容必须整包拒载（过期经验比没有经验危险，spec US4）。

**Alternatives considered**: 引入 `semver` npm 包（功能过剩）；只校验 schemaVersion 不校验引擎区间（无法表达"逆向经验适用于某平台版本"场景）。

## R5. 自动检查不阻塞主流程

**Decision**: 诊断/分析启动时**同步只读** `~/.stk/rules/meta.json` 判断 TTL（<1ms）；过期则**后台异步**发起检查（`npm view @studyzy/stk-rules version`，超时 2s），结果写回 meta 并在下一次运行生效或仅打印一行提示；绝不阻塞诊断主流程，单次诊断使用的规则在启动时已快照（spec 边界情况第 6 条）。

**Rationale**: 诊断时长与确定性是 stk 的核心卖点，网络抖动不能污染它；`npm view` 比完整 `npm install` 轻量得多，适合检查语义。

**Alternatives considered**: 同步检查（阻塞，违反 FR-004）；完全不做自动检查（违反 FR-004）。

## R6. 提示词片段渲染机制

**Decision**: 模板骨架中放置极简占位注释 `<!-- stk:rules:prompts/<name>.md -->`；`stk init` 写模板时将占位符替换为当前生效规则源中对应片段的内容；无任何规则源可提供时保留骨架内置默认段（兜底）。渲染为一次性（初始化时），不做运行时动态注入（spec 假设章节已声明）。

**Rationale**: 现有模板是静态文件 + `stk init` 复制模型，占位符替换是最小改动路径；产物自包含，不要求运行时能找到规则库。

**Alternatives considered**: 模板内 `@引用` 片段路径（产物不自包含，AI 运行时可能找不到文件）；运行时 hook 注入（复杂度高，本期范围外）。

## R7. 工具目录（registry）外置边界

**Decision**: 仅外置**纯数据字段**（id、名称、描述、安装命令、启用手册路径）；探测/安装的**可执行逻辑**留在引擎代码（`src/tools/impl/*`）。

**Rationale**: "数据归病毒库、行为归引擎"是本功能的分界线；把逻辑塞进 JSON 会催生脚本解释器（违反章程 IV）。Suggestion level 判定表（初级/中级/高级 → target 规则）属于数据，外置到 `thresholds.json` 同目录的 `levels.json`。

**Alternatives considered**: 全量外置含执行逻辑（需 DSL 引擎，范围外，spec 已排除声明式引擎）。

## R8. 规则包发布流（开发工作流）

**Decision**: `rules/package.json` 独立版本号；规则变更 = 改 `rules/` + 独立发版（patch/minor）；主程序发版不携带规则内容变更。CI 中主程序测试使用 `file:./rules` 本地依赖，保证仓内一致性。

**Rationale**: 解耦是本功能的成功标准 SC-001；pnpm `file:` 协议在开发期让两包如同 monorepo，发布后 npm 自动按 registry 解析。

**Alternatives considered**: 独立仓库（维护成本翻倍，首期单人维护不必要）。

## R9. 诊断报告版本标注

**Decision**: `DiagnosisReport` 增加可选 `rulesInfo` 字段（生效版本、来源摘要、是否兜底）；Markdown 报告头部"数据来源"行追加"规则库 vX.Y.Z"。旧报告无此字段（向后兼容，仅新增可选字段）。

**Rationale**: 复用既有报告结构与渲染入口，最小 diff；字段可选保证旧 JSON 消费方不受影响。
