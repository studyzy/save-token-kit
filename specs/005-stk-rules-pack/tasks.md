# 任务: 规则包 stk-rules 独立版本化，引擎只管执行

**输入**: 来自 `/specs/005-stk-rules-pack/` 的设计文档（plan.md / spec.md / research.md / data-model.md / contracts/ / quickstart.md）
**测试**: 章程 III（测试驱动质量）要求新功能必须含单元测试、关键 CLI 命令必须有集成测试——故各故事均含测试任务，先写失败再实现。

**组织结构**: 按用户故事分组：US1=数据外置+加载（P1/MVP）、US2=更新与自动检查（P1）、US3=多源叠加（P2）、US4=兼容护栏+报告标注（P2）、US5=提示词渲染（P3）

## 格式: `[ID] [P?] [Story] 描述`

- **[P]**: 可并行运行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1~US5）

## 阶段 1: 设置（规则包骨架）

**目的**: 建立 `rules/` 包作为唯一事实来源，主程序可引用

- [x] T00[1-6] 创建 `rules/` 包骨架：`rules/package.json`（name=@studyzy/stk-rules, version=1.0.0, 独立发版）、`rules/manifest.json`（schemaVersion=1, packVersion=1.0.0, engines.stk=">=0.6", datasets/prompts 清单，见 contracts/pack-manifest.md）
- [x] T00[1-6] [P] 迁移 `LOW_FREQUENCY_PLUGINS`（src/types/index.ts:239）→ `rules/data/low-frequency-plugins.json`（string[]，逐字保留现有条目）
- [x] T00[1-6] [P] 迁移 `MCP_CLI_ALTERNATIVES`（src/types/index.ts:248）→ `rules/data/mcp-alternatives.json`（Record<string,string>，逐字保留）
- [x] T00[1-6] [P] 从 `src/tools/registry.ts` 抽取纯数据字段（id/名称/描述/安装命令）→ `rules/data/tools.json`（ToolCatalogEntry[]，逻辑留引擎，见 research R7）
- [x] T00[1-6] [P] 创建 `rules/data/thresholds.json`（memoryMdMaxLines=150/userMemoryMaxLines=50/ruleFileMaxLines=30/totalMaxLines=250/impactHighBytes=5120/impactMediumBytes=1024 等集中阈值）与 `rules/data/levels.json`（现 SKILL 模板 level 判定表，含 `"*": "中级"` 兜底键）
- [x] T00[1-6] 主包接入：`package.json` dependencies 增加 `"@studyzy/stk-rules": "file:./rules"`，验证 `pnpm install` 后 `node -e "require('@studyzy/stk-rules/manifest.json')"` 可解析

**检查点**: 规则包可被主程序解析，数据集与现有硬编码逐字一致

---

## 阶段 2: 基础（阻塞前置）

**目的**: 类型契约、semver、兜底入口——所有故事共享

**⚠️ 关键**: 在此阶段完成之前，无法开始任何用户故事实现

- [x] T00[7-9] [P] 创建 `src/types/rules.ts`：PackManifest / RuleSource / MergedRules / RulesInfo / UpdateMeta / ToolCatalogEntry / Level 类型（严格按 data-model.md §实体 1-7）
- [x] T00[7-9] [P] 创建 `src/rules/semver.ts`：最小 semver 区间判断（仅 `>=X.Y.Z`/`<X.Y.Z`/`=X.Y.Z`，逗号 AND），导出 `satisfiesRange(version: string, range: string): boolean`
- [x] T00[7-9] [P] 创建 `tests/unit/rules/semver.test.ts`：边界用例（0.6.0 vs >=0.6 / <1.0.0 / 多段 AND / 非法 range 返回 false）
- [x] T01[0-6] 创建 `src/rules-data.ts`：从依赖包 `@studyzy/stk-rules` 读取 manifest + data/ 的兜底入口，导出 `loadBuiltinPack(): { manifest, datasets }`（fail-fast：包缺失即抛错，属安装损坏）

**检查点**: 基础就绪 - 现在可以开始并行实施用户故事

---

## 阶段 3: 用户故事 1 - 优化经验外置为规则包（优先级: P1）🎯 MVP

**目标**: 引擎从规则包读取全部判定数据，删除断第二份事实来源；改规则包数据 → 诊断立即生效，主程序不发版

**独立测试**: 修改 `rules/data/low-frequency-plugins.json` 新增条目并升 patch 版本 → 复制到 `~/.stk/rules/<ver>/` → 不重建主程序运行 `stk diagnose` → 新条目生效（quickstart SC-001）

### 用户故事 1 的测试 ⚠️（先写，确保失败）

- [x] T01[0-6] [P] [US1] 创建 `tests/unit/rules/loader.test.ts` + fixtures（`tests/unit/rules/fixtures/` 内置 pack/user/project 三层样例目录）：覆盖 ok 加载、corrupted（坏 JSON/缺 manifest 字段）、incompatible（schemaVersion 过高/engines 不含当前版本）、逐条未知条目警告
- [x] T01[0-6] [P] [US1] 创建 `tests/unit/rules/data-parity.test.ts`：断言规则包数据集与迁移前快照一致（防迁移丢条目）

### 用户故事 1 的实施

- [x] T01[0-6] [US1] 创建 `src/rules/loader.ts`：按 contracts/pack-manifest.md 7 步校验序实现 `loadRules(): MergedRules`——builtin（T010）→ library（`~/.stk/rules/` 取兼容最新版）两层；按条目键覆盖合并（data-model.md §5）；加载结果/警告记录进 `RuleSource[]`
- [x] T01[0-6] [US1] 消费方切换：删除 `src/types/index.ts` 的 `LOW_FREQUENCY_PLUGINS`/`MCP_CLI_ALTERNATIVES` 常量，`src/proxy/report.ts` 等消费方（rg 定位全部引用）改为接收 `MergedRules` 参数
- [x] T01[0-6] [US1] `src/tools/registry.ts` 纯数据字段改读 `MergedRules.tools`（探测/安装逻辑不动）
- [x] T01[0-6] [US1] `tests/unit/rules/data-parity.test.ts`、`loader.test.ts` 转绿；运行 `make test` 确认既有测试零回归（SC-007）

**检查点**: US1 可独立演示——改规则包数据、不重建主程序、诊断生效

---

## 阶段 4: 用户故事 2 - 更新命令与自动检查（优先级: P1）

**目标**: `stk rules update` 一条命令更新；诊断启动 TTL 过期时后台检查；可完全关闭

**独立测试**: 有新版时 update 输出版本变迁；断网时有限时间失败且诊断不受影响（quickstart「更新与状态」）

### 用户故事 2 的测试 ⚠️

- [x] T01[7-9] [P] [US2] 创建 `tests/unit/rules/update.test.ts`：mock npm 调用（tinyexec mock）——新版安装成功/已是最新/网络超时 2s 放弃/meta 读写
- [x] T01[7-9] [P] [US2] 创建 `tests/unit/proxy/rules-cmd.test.ts`：`stk rules update --check/--json` 输出契约（对照 contracts/cli-rules.md）

### 用户故事 2 的实施

- [x] T01[7-9] [US2] 创建 `src/rules/update.ts`：`checkLatest()`（tinyexec 调 `npm view @studyzy/stk-rules version`，超时 2s）、`installLatest()`（npm install 到 `~/.stk/rules/`）、`UpdateMeta` 读写（`~/.stk/rules/meta.json`，data-model.md §7）
- [x] T02[0-2] [US2] 创建 `src/commands/rules.ts`：`runRulesUpdate`（update/--check/--json，输出对照 contracts/cli-rules.md，退出码 0/1）
- [x] T02[0-2] [US2] `src/cli.ts` 注册 `stk rules update` 命令 + 中文 help；`src/commands/diagnose.ts` 启动处接入：同步读 meta 判 TTL（<1ms）→ 过期且未关闭则 `void` 异步检查（不 await，2s 超时，结果写 meta，R5）
- [x] T02[0-2] [US2] FR-011：meta.json `autoCheckDisabled` 开关生效（关闭后 diagnose 跳过检查，仅用本地/兜底）；测试转绿

**检查点**: US1+US2 构成"病毒库"最小闭环，可独立演示更新

---

## 阶段 5: 用户故事 3 - 多源叠加（优先级: P2）

**目标**: 项目级 `./stk-rules/` > 全局用户 `~/.stk/rules.d/` > library > builtin，条目级覆盖合并

**独立测试**: 三层放同名规则不同值 → 生效 project 层；删 project → user 层；格式损坏的层被跳过且其余生效（quickstart SC-006 / SC-005）

### 用户故事 3 的测试 ⚠️

- [x] T02[3-9] [P] [US3] 创建 `tests/unit/rules/merge.test.ts`：四层同键覆盖顺序、`!name` 移除语法、`"*"` 兜底键、损坏层跳过、层内重复键拒载该层
- [x] T02[3-9] [P] [US3] 创建 `tests/integration/rules-stack.test.ts`：临时目录搭三层 fixtures，端到端断言 `loadRules()` 合并结果与 `rulesInfo.sources`

### 用户故事 3 的实施

- [x] T02[3-9] [US3] 扩展 `src/rules/loader.ts`：user 层（`~/.stk/rules.d/*.json`）与 project 层（`./stk-rules/*.json`）发现与裸数据校验（无 manifest，仅格式校验）；实现 `!name` 移除与 `*` 兜底键合并语义（data-model.md §5）
- [x] T02[3-9] [US3] loader 输出 `rulesInfo`（packVersion/fallbackInUse/sources[]，data-model.md §6）；集成测试转绿

**检查点**: US1~US3 独立可测：自定义层覆盖官方默认

---

## 阶段 6: 用户故事 4 - 兼容护栏与报告标注（优先级: P2）

**目标**: 不兼容/损坏整包拒载、清晰降级、报告可追溯规则库版本

**独立测试**: 注入 engines 不含当前版本的规则包 → 拒载 + 警告含两侧版本号 + 诊断正常；报告头部出现 `规则库 vX.Y.Z`（quickstart SC-005 / spec US4）

### 用户故事 4 的测试 ⚠️

- [x] T02[3-9] [P] [US4] 创建 `tests/unit/rules/compat.test.ts`：engines 区间不含当前版本/schemaVersion 过高/manifest 缺字段/packVersion 与 package.json 不一致 → 分别断言拒载原因与警告文案（含两侧版本号）

### 用户故事 4 的实施

- [x] T02[3-9] [US4] 完善 `src/rules/loader.ts` 降级链：library 拒载 → 警告 + builtin 兜底（`fallbackInUse=true`）；按层独立 `rejected-*` 状态（data-model.md §加载状态机）；stderr 警告格式对照 contracts/cli-rules.md「错误输出规范」
- [x] T02[3-9] [US4] `src/types/index.ts` 的 `DiagnosisReport` 增加可选 `rulesInfo?: RulesInfo`；`src/proxy/report.ts` 头部"数据来源"行追加 `规则库 vX.Y.Z`，`--json` 与落盘 JSON 携带 `rulesInfo`（FR-008）；`tests/unit/proxy/report.test.ts` 补断言

**检查点**: US1~US4 完整——护栏 + 追溯闭环

---

## 阶段 7: 用户故事 5 - 提示词片段外置与渲染（优先级: P3）

**目标**: 模板骨架与经验内容分离；`stk init` 从规则源渲染提示词片段

**独立测试**: 更新 `rules/prompts/tool-opt.claude.md` 后重新 `stk init`，安装产物包含新内容且头部标注规则库版本（spec US5）

### 用户故事 5 的测试 ⚠️

- [x] T03[0-7] [P] [US5] 创建 `tests/unit/rules/render.test.ts`：占位符替换（命中 user 层覆盖 builtin）、纯兜底保留默认段、双缺失保留占位符 + 警告、同输入渲染幂等（字节一致）、产物头注释版本标注（contracts/prompt-render.md）

### 用户故事 5 的实施

- [x] T03[0-7] [P] [US5] 从 `src/templates/skills/stk-analyze/agents/tool-opt.md`、`mcp-opt.md` 等抽取经验性章节 → `rules/prompts/tool-opt.codebuddy.md` / `tool-opt.claude.md` / `mcp-opt.md`，原位置替换为 `<!-- stk:rules:prompts/<name> -->默认内容<!-- /stk:rules:prompts/<name> -->`（默认内容=兜底片段），manifest.json prompts 清单同步
- [x] T03[0-7] [US5] 创建 `src/rules/render.ts`：`renderTemplate(tpl: string, merged: MergedRules): { content, warnings }`（占位符解析、按优先级取片段、头注释插入，contracts/prompt-render.md 渲染规则 1-4）
- [x] T03[0-7] [US5] `src/commands/init.ts` 写盘前接入 `renderTemplate`；渲染测试转绿

**检查点**: 全部故事完成——改经验（数据或提示词）均不发版生效

---

## 阶段 8: 完善与横切关注点

- [x] T03[0-7] [US2] `src/commands/rules.ts` 补 `stk rules status [--json]`（FR-010，输出对照 contracts/cli-rules.md，含各层加载结果——依赖 US3 层发现就绪故置此）
- [x] T03[0-7] [P] 更新 `README.md` 与 `CHANGELOG.md`（中文）：rules 命令用法、规则包结构、自定义层说明
- [x] T03[0-7] 运行 `quickstart.md` 全场景验证（SC-001~SC-006 逐条）+ `make cover` 确认覆盖率 ≥ 60%
- [x] T03[0-7] `graphify update .` 同步知识图谱（项目规则）

---

## 依赖关系与执行顺序

### 阶段依赖

- **阶段 1（设置）**: 无依赖，立即开始
- **阶段 2（基础）**: 依赖 T001/T006（包可解析）→ T007-T010
- **US1（阶段 3）**: 依赖阶段 2 → **MVP 交付点**
- **US2（阶段 4）/ US3（阶段 5）**: 均仅依赖阶段 2 + US1 的 loader 骨架（T013），二者可并行
- **US4（阶段 6）**: 依赖 US1（loader）+ US3（层状态完整）
- **US5（阶段 7）**: 依赖 US3（多源片段取值）与 T013
- **阶段 8**: 依赖全部故事完成

### 用户故事依赖

- US1: 阻塞所有其他故事（loader 是公共底座）
- US2 ∥ US3: 互相独立，可两人并行
- US4: 依赖 US1+US3
- US5: 依赖 US3（渲染按层取片段）

### 每个故事内部

测试（先失败）→ 实现 → 转绿 + 零回归

### 并行机会

- 阶段 1: T002-T005 四个数据迁移互不依赖，可全部并行
- 阶段 2: T007/T008+T009/T010 三组并行
- US2 与 US3 整阶段可并行（不同文件域）
- 各故事测试任务（T011/T017/T018/T023/T024/T027/T030）均 [P]

---

## 并行示例: 阶段 1 数据迁移

```bash
# 四个迁移任务一起启动（不同文件，互不依赖）:
任务: "迁移 LOW_FREQUENCY_PLUGINS → rules/data/low-frequency-plugins.json"
任务: "迁移 MCP_CLI_ALTERNATIVES → rules/data/mcp-alternatives.json"
任务: "registry 纯数据 → rules/data/tools.json"
任务: "创建 thresholds.json 与 levels.json"
```

---

## 实施策略

### 仅 MVP（推荐首切）

1. 阶段 1 设置 + 阶段 2 基础
2. 阶段 3 US1 → **停止并验证**：改规则包数据不发版即生效（SC-001）
3. 此刻已兑现本功能的核心价值主张

### 增量交付

MVP(US1) → +US2（更新闭环）→ +US3（自定义生态）→ +US4（护栏追溯）→ +US5（提示词外置）——每个故事独立可演示，不破坏先前交付。

---

## 注意事项

- 测试先于实现编写并确认失败（章程 III / TDD）
- 迁移类任务（T002-T005/T031）必须逐字保留现有内容，data-parity 测试兜底
- 每个故事完成后提交一次（Conventional Commits 中文）
- 禁止：跨故事共享未完成产物、把探测/安装逻辑塞进规则包（R7 分界）
