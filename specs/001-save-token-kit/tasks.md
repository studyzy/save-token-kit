# 任务: Save Token Kit (stk)

**输入**: 来自 `/specs/001-save-token-kit/` 的设计文档
**前置条件**: plan.md(必需), spec.md(用户故事必需), research.md, data-model.md, contracts/
**测试**: 功能规范明确要求 UT 覆盖度 60% 以上且 `stk diagnose` 有集成测试覆盖（SC-006），故包含测试任务。

**组织结构**: 任务按用户故事分组，以便每个故事能够独立实施和测试。

## 格式: `[ID] [P?] [Story] 描述`
- **[P]**: 可以并行运行(不同文件，无依赖关系)
- **[Story]**: 此任务属于哪个用户故事(US1~US4)
- 描述中包含确切的文件路径

## 路径约定
- 单一 TS 项目：仓库根目录下的 `src/`、`tests/`
- 模板文件：`src/templates/commands/`、`src/templates/skills/`

---

## 阶段 1: 设置 (项目初始化)

- [X] T001 在 `package.json` 中初始化项目：name `save-token-kit`、type `module`、bin `stk`，devDeps 包含 cac、ansis、@inquirer/prompts、tinyexec、typescript、unbuild、vitest、@vitest/coverage-v8、eslint、prettier
- [X] T002 创建 `tsconfig.json`：strict 模式、target ES2022、moduleResolution bundler、 declaration true
- [X] T003 创建 `build.config.ts` 配置 unbuild：entries `['src/cli']`、`declaration: true`、`clean: true`、rollup `emitCJS: false`、`inlineDependencies: true`
- [X] T004 创建 `vitest.config.ts`：include `tests/**/*.test.ts`、alias `@` → `./src`、coverage provider `@vitest/coverage-v8`、thresholds 60% (branches/functions/lines/statements)
- [X] T005 创建 `.eslintrc` / `.prettierrc` 及 `.gitignore`(补充 `save-token/`、`.output/`)，对齐项目代码规范
- [X] T006 [P] 在 `src/types/index.ts` 中定义全部契约类型：DiagnosisReport、AnalysisSuggestion、OptimizationTask、TasksFile、SaveTokenReport、TokenChange、ProxyDiagnosisData 等(源自 data-model.md §1-§6)

**检查点**: 项目可 `pnpm install` 且 `pnpm build`/`pnpm test` 骨架可运行。

---

## 阶段 2: 基础 (阻塞所有用户故事的先决条件)

- [X] T007 在 `src/cli.ts` 中用 cac 注册 3 个命令入口：`stk init`、`stk diagnose`、`stk rollback`(预留)，挂载 `--help` 与全局错误处理
- [X] T008 在 `src/adapters/platform-adapter.ts` 中定义 `PlatformAdapter` 抽象接口(路径解析、触发命令、环境变量名)，预留多平台
- [X] T009 [P] 在 `src/adapters/codebuddy-adapter.ts` 中实现 CodeBuddy 适配器：commands 目录 `.codebuddy/commands/save-token-kit/`(或 `~/.codebuddy` 全局)、skills 目录 `.codebuddy/skills/`、触发命令 `codebuddy -p`、环境变量 `CODEBUDDY_BASE_URL`
- [X] T010 [P] 在 `src/collectors/token-estimator.ts` 中实现 Token 估算工具(基于字符数启发式，含 10MB 截断 [TRUNCATED] 标记逻辑)
- [X] T011 在 `src/proxy/parser.ts` 中实现请求体解析：从 POST body 提取 messages/tools/skills/mcpServers，聚合为 `ProxyDiagnosisData`(多条请求的平均/最大/最小 Token 占用)

**检查点**: 基础类型、适配器、解析器可供 US1 使用。

---

## 阶段 3: 用户故事 1 - stk diagnose 诊断 Token 占用 (优先级: P1)

**目标**: 通过 HTTP 代理拦截 CodeBuddy 的 LLM 请求，生成 `proxy-raw-body.json` 与 `diagnosis-report.json`，控制台输出 Markdown 摘要。
**独立测试**: 运行 `stk diagnose` 启动代理并执行一次 `codebuddy -p` 触发请求，检查 `./save-token/` 下生成两个 JSON 文件且控制台有 Markdown 输出。

### 用户故事 1 的测试 (要求测试 ⚠️)
- [X] T012 [P] 在 `tests/unit/proxy/parser.test.ts` 中编写解析器单测：正常 body 解析、超大 body 截断 [TRUNCATED]、多请求聚合(平均/最大/最小)
- [X] T013 [P] 在 `tests/unit/proxy/server.test.ts` 中编写代理单测：端口冲突回退随机端口、SIGTERM 优雅关闭、错误响应不中断
- [X] T014 [P] 在 `tests/unit/collectors/token-estimator.test.ts` 中编写 Token 估算单测：各分类估算、截断阈值
- [X] T015 在 `tests/integration/diagnose.test.ts` 中编写 `stk diagnose` 集成测试：mock 触发命令，验证两个文件落盘与 Markdown 输出(覆盖 SC-006)

### 用户故事 1 的实施
- [X] T016 [P] [US1] 在 `src/proxy/server.ts` 中实现 HTTP 代理服务器：默认端口 8899、端口冲突回退随机端口、拦截 `POST /v2/*`、捕获原始 body 写入 `proxy-raw-body.json`、SIGTERM 优雅关闭、拦截错误响应不中断
- [X] T017 [US1] 在 `src/commands/diagnose.ts` 中实现 `stk diagnose`：解析 `--agent`(非 codebuddy 报错退出码 1)、设置 `CODEBUDDY_BASE_URL`、用 tinyexec 执行 `codebuddy -p "Hello" -y --max-turns 1`、调用 parser 生成 `diagnosis-report.json`、控制台打印 Markdown 摘要
- [X] T018 [US1] 在 `src/commands/diagnose.ts` 中补充诊断报告 Markdown 渲染(基于 `DiagnosisReport`，含 Token 总览与各分类占比)

**检查点**: `stk diagnose` 可独立运行并产出诊断文件，US1 交付完成。

---

## 阶段 4: 用户故事 2 - AI Agent 分析优化空间 (优先级: P2)

**目标**: 提供 `/stk-analyze` Command 与 `st-diagnose`/`st-analyze` SKILL 模板，让 AI Agent 基于 `diagnosis-report.json` 生成 `analysis.json` 优化建议。
**独立测试**: 已有 `diagnosis-report.json` 时，CodeBuddy 中运行 `/stk-analyze`，AI Agent 产出按节省量排序的建议并写入 `./save-token/analysis.json`。

### 用户故事 2 的实施
- [X] T019 [P] [US2] 在 `src/templates/commands/diagnose.md` 中编写 `/stk-diagnose` Command 模板(含 frontmatter `name: stk-diagnose`、采集/展示逻辑、警告高亮)
- [X] T020 [P] [US2] 在 `src/templates/commands/analyze.md` 中编写 `/stk-analyze` Command 模板(读取诊断数据、5 类优化识别规则、落盘 `analysis.json`、输出总节省量)
- [X] T021 [P] [US2] 在 `src/templates/skills/st-diagnose/SKILL.md` 中编写诊断 SKILL 指令
- [X] T022 [P] [US2] 在 `src/templates/skills/st-analyze/SKILL.md` 中编写分析 SKILL 指令(Skill>500 且非高频→禁用、MCP 有 CLI 等价→替代、CODEBUDDY.md>200 行→精简、未装省 Token 工具→安装推荐)

**检查点**: US1+US2 组合可完成"诊断→分析"闭环。

---

## 阶段 5: 用户故事 3 - AI Agent 执行优化操作 (优先级: P3)

**目标**: 提供 `/stk-optimize` Command 与 `st-optimize` SKILL 模板，AI Agent 依据 `analysis.json` 执行修改并写入 `tasks.json`(本期无回滚)。
**独立测试**: 已有 `analysis.json` 时运行 `/stk-optimize`，AI Agent 逐条确认后执行并写 `tasks.json`，失败任务标记 `failed`。

### 用户故事 3 的实施
- [X] T023 [P] [US3] 在 `src/templates/commands/optimize.md` 中编写 `/stk-optimize` Command 模板(读取 analysis.json、展示 before/after、逐条确认、落盘 tasks.json、提示重诊断)
- [X] T024 [P] [US3] 在 `src/templates/skills/st-optimize/SKILL.md` 中编写优化 SKILL 指令(禁用 Skill→settings.json enabledPlugins false 并备份；MCP→.mcp.json 禁用并提示 CLI；精简 CODEBUDDY.md 先备份；失败标记 failed)

**检查点**: US1-US3 组合可完成"诊断→分析→优化"闭环。

---

## 阶段 6: 用户故事 4 - AI Agent 生成对比报告 (优先级: P4)

**目标**: 提供 `/stk-report` Command 与 `st-report` SKILL 模板，AI Agent 读取前后 `.md` 与 `tasks.json` 生成 `save-token-report.json`。
**独立测试**: 已有 `diagnosis-report.md`/`diagnosis-report2.md`/`tasks.json` 时运行 `/stk-report`，产出 `save-token-report.json` 与类别变化明细。

### 用户故事 4 的实施
- [X] T025 [P] [US4] 在 `src/templates/commands/report.md` 中编写 `/stk-report` Command 模板(读取前后 .md + tasks.json、计算差值与归因、落盘 save-token-report.json、缺失前置数据给出提示)
- [X] T026 [P] [US4] 在 `src/templates/skills/st-report/SKILL.md` 中编写对比报告 SKILL 指令(前后总 Token 差值、分类变化表、任务执行状态、偏差标注、JSON 解析失败报具体文件行号不崩溃)

**检查点**: 完整工作流 US1-US4 闭环可独立测试。

---

## 阶段 7: 用户故事 0 - stk init 安装 Commands/SKILL (跨故事基础能力)

> 注：`stk init` 是安装 US2-US4 模板的前置命令，独立于诊断数据，单独成阶段。

**目标**: 实现 `stk init`，默认全局安装 4 个 Command 模板，通过 `--local`/`--skills`/`--force` 控制安装范围。
**独立测试**: 运行 `stk init` 选择 CodeBuddy，检查 `~/.codebuddy/commands/save-token-kit/` 下生成 4 个 .md；`--local` 落项目级；`--skills` 额外装 4 个 SKILL。

### 用户故事 0 的测试 (要求测试 ⚠️)
- [X] T027 [P] 在 `tests/unit/commands/init.test.ts` 中编写 init 单测：默认全局路径、--local 项目路径、--skills 装 SKILL、--force 覆盖、同名文件提示确认、非 codebuddy Agent 报错

### 用户故事 0 的实施
- [X] T028 [US0] 在 `src/commands/init.ts` 中实现 `stk init`：用 @inquirer/prompts 展示 Agent 列表(CodeBuddy 可选，其余标记"暂不支持")、按标志选择安装目录、从 `src/templates/` 拷贝文件、已有文件确认覆盖、退出码(0/1/2)

**检查点**: 首次使用可通过 `stk init` 安装完整 4 命令工作流 (SC-007)。

---

## 阶段 8: 完善与横切关注点

- [X] T029 在 `src/commands/rollback.ts`(预留)中实现从 `~/.codebuddy/` 备份恢复配置(本期可选，按 research.md 备份目录设计)
- [X] T030 在 README/中文文档中补充安装、工作流、各命令用法(中文文档，英文代码注释已完成)
- [X] T031 运行 `pnpm test --coverage` 确认覆盖率 ≥60% 且 `stk diagnose` 集成测试通过(验证 SC-006)
- [X] T032 运行 `pnpm build` 确认 unbuild 产出 ESM 单文件 `stk` bin 可全局执行

**检查点**: 全部用户故事完成，覆盖率达标，可交付。

---

## 依赖关系

```text
阶段 1 (设置)
  └─> 阶段 2 (基础: 类型/适配器/解析器/估算)
        ├─> 阶段 3 (US1: diagnose)  ── MVP
        ├─> 阶段 7 (US0: init)      ── 可并行于 US1 之后
        └─> 阶段 4 (US2: analyze)   ── 依赖 US1 产出 diagnosis-report.json
              └─> 阶段 5 (US3: optimize) ── 依赖 US2 产出 analysis.json
                    └─> 阶段 6 (US4: report) ── 依赖 US3 产出 tasks.json + 两次诊断 .md
阶段 8 (完善) ── 最后
```

**完成顺序**: US1(诊断) → US0(init 安装) → US2(分析) → US3(优化) → US4(报告)。
US2/US3/US4 的 Command/SKILL 模板彼此独立编写，但其工作流需按顺序串联。

---

## 并行执行示例

**阶段 2 基础(可并行启动)**:
```bash
# 适配器与估算器互不依赖，可并行编写
任务: "在 src/adapters/codebuddy-adapter.ts 中实现 CodeBuddy 适配器"
任务: "在 src/collectors/token-estimator.ts 中实现 Token 估算"
任务: "在 src/proxy/parser.ts 中实现请求体解析"
```

**阶段 4-6 模板编写(可并行启动)**:
```bash
# 4 个 Command 模板 + 4 个 SKILL 模板分属不同文件，可并行
任务: "在 src/templates/commands/diagnose.md 中编写 /stk-diagnose"
任务: "在 src/templates/commands/analyze.md 中编写 /stk-analyze"
任务: "在 src/templates/commands/optimize.md 中编写 /stk-optimize"
任务: "在 src/templates/commands/report.md 中编写 /stk-report"
任务: "在 src/templates/skills/st-diagnose/SKILL.md 中编写诊断 SKILL"
任务: "在 src/templates/skills/st-analyze/SKILL.md 中编写分析 SKILL"
任务: "在 src/templates/skills/st-optimize/SKILL.md 中编写优化 SKILL"
任务: "在 src/templates/skills/st-report/SKILL.md 中编写对比报告 SKILL"
```

---

## 实施策略

### 仅 MVP (仅用户故事 1)
1. 完成阶段 1：项目初始化
2. 完成阶段 2：基础(类型/适配器/解析器/估算器)
3. 完成阶段 3：用户故事 1 (diagnose)
4. **停止并验证**：运行 `stk diagnose` 生成诊断文件，集成测试通过
5. 演示/部署

### 增量交付
1. 基础就绪 → 2. US1 独立测试部署 (MVP!) → 3. US0 init 安装 → 4. US2 分析 → 5. US3 优化 → 6. US4 报告，每步独立测试不破坏前序。

### 并行团队策略
1. 团队一起完成设置+基础
2. 基础完成后：一人做 US1 diagnose 实现+测试；一人并行编写 US2-US4 的 8 个模板文件(纯 Markdown，无运行依赖)
3. 最后一人做 US0 init 与阶段 8 完善
