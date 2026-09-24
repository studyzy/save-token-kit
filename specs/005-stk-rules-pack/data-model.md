# 数据模型: 005-stk-rules-pack

日期: 2026-09-24 | 上游: [spec.md](./spec.md) FR-001~FR-012, [research.md](./research.md)

## 实体

### 1. PackManifest（规则包版本清单）

`rules/manifest.json` —— 规则包自描述，compat 校验的依据（FR-006）。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | `number` | 整数，引擎已知最大值 = 1 | 数据格式版本；高于引擎已知值 → 整包拒载（R4） |
| `packVersion` | `string` | SemVer，与 npm 包版本一致 | 规则库版本号，写入诊断报告（FR-008） |
| `releasedAt` | `string` | ISO 8601 | 发布时间 |
| `engines.stk` | `string` | 最小区间语法：`>=X` / `<X` / `=X`，逗号 AND | 兼容引擎区间 |
| `datasets` | `string[]` | 非空 | 包含的数据集文件名清单 |
| `prompts` | `string[]` | 可为空 | 包含的提示词片段文件名清单 |

**校验规则**：缺任一必填字段或类型非法 → 按"声明非法"处理，整包拒载（spec US4 场景 2）。

### 2. 数据集（RulesPack.datasets）

| 文件 | 形态 | 条目键 | 来源（迁移自） |
| --- | --- | --- | --- |
| `low-frequency-plugins.json` | `string[]` | 元素即键（插件名） | `LOW_FREQUENCY_PLUGINS` |
| `mcp-alternatives.json` | `Record<string, string>` | server 名 → 替代 CLI 名 | `MCP_CLI_ALTERNATIVES` |
| `tools.json` | `ToolCatalogEntry[]` | `id` | registry 纯数据字段（R7） |
| `thresholds.json` | `Record<string, number>` | 阈值键（如 `memoryMdMaxLines`） | 报告/子 Agent 中散落的硬编码阈值 |
| `levels.json` | `Record<string, "初级" \| "中级" \| "高级">` | target 名或 `*` 通配 | SKILL 模板中写死的 level 判定表 |

**校验规则**：JSON 解析失败或形态不符 → 该源该数据集拒载并警告；同层同数据集出现重复键 → 格式错误，拒载该层（R3）。

### 3. PromptFragment（提示词片段）

`rules/prompts/<name>.md`，name 形如 `tool-opt.codebuddy`（平台维度后缀，R7）。整文件为内容单元，按文件名覆盖合并。无结构字段；首行 HTML 注释 `<!-- stk:prompt-version: N -->` 可选，用于片段级演进。

### 4. RuleSource（规则源）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `layer` | `'builtin' \| 'library' \| 'user' \| 'project'` | 四个物理层；逻辑三层映射：内置兜底 = builtin，全局用户 = library + user，项目级 = project（R1/R3） |
| `path` | `string` | 来源路径（builtin 为依赖包标识） |
| `packVersion?` | `string` | 有 manifest 的层才有 |
| `result` | `'ok' \| 'rejected-incompatible' \| 'rejected-corrupted' \| 'empty'` | 加载结果（FR-007/FR-010） |
| `warnings` | `string[]` | 逐条警告（含未知条目忽略记录，FR-012） |

### 5. MergedRules（合并结果，引擎消费的唯一视图）

| 字段 | 类型 | 合并语义 |
| --- | --- | --- |
| `lowFrequencyPlugins` | `Set<string>` | 条目并集，上层覆盖同名判定（名单类语义为"存在即命中"，覆盖=无可覆盖差异，取并集后由上层显式移除条目 `!name` 语法表达排除） |
| `mcpAlternatives` | `Record<string, string>` | 按键覆盖 |
| `tools` | `Record<string, ToolCatalogEntry>` | 按 id 覆盖 |
| `thresholds` | `Record<string, number>` | 按键覆盖 |
| `levels` | `Record<string, Level>` | 按键覆盖，支持 `*` 兜底键 |
| `prompts` | `Record<string, string>` | 按文件名覆盖 |
| `rulesInfo` | `RulesInfo` | 见下 |

**优先级**：`project > user > library > builtin`（FR-005）。
**快照语义**：合并结果在进程启动时一次性构建，单次诊断全程复用（spec 边界情况第 6 条）。

> 移除语法说明：名单类并集 + 上层排除用 `!` 前缀条目表达（如 `!"some-plugin"` 表示上层明确移除该条目）。覆盖优先级仍按层。

### 6. RulesInfo（规则库快照信息，写入诊断报告）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `packVersion` | `string` | 生效规则包版本（无 library 层时为 `builtin` + 主程序版本） |
| `fallbackInUse` | `boolean` | FR-002 对外可见性 |
| `sources` | `RuleSource['layer' \| 'result'][]` | 各层加载摘要（FR-010） |

### 7. UpdateMeta（更新元数据）

`~/.stk/rules/meta.json`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `lastCheckAt` | `string?` | 最近一次自动/手动检查时间（TTL 24h 判定，FR-004） |
| `lastUpdatedAt` | `string?` | 最近一次成功安装时间 |
| `installedVersion` | `string?` | `~/.stk/rules/` 内已装版本 |
| `autoCheckDisabled` | `boolean` | FR-011 配置开关 |

## 状态转换

### 规则源加载状态机

```
[发现层] → 无文件 → empty
        → 有文件 → manifest/格式校验 ── 失败 → rejected-corrupted
                 → compat 校验 ──────── 失败 → rejected-incompatible
                 → 通过 → ok（记录逐条未知条目警告）
```

### 更新状态机（`stk rules update`）

```
idle → checking（npm view, ≤2s）→ up-to-date → idle（提示已是最新）
                                → newer found → installing（npm install 到 ~/.stk/rules/）
                                              → 成功 → 写 meta（installedVersion/lastUpdatedAt）→ idle
                                              → 失败 → idle（保留旧版，报告原因，FR-003 场景 4）
任一网络环节超时/失败 → 降级提示，不改变已装状态
```

## 类型落点

新增 `src/types/rules.ts` 承载上述契约（PackManifest / RuleSource / MergedRules / RulesInfo / UpdateMeta / ToolCatalogEntry / Level）。`src/types/index.ts` 的 `DiagnosisReport` 增加 `rulesInfo?: RulesInfo` 可选字段；删除 `LOW_FREQUENCY_PLUGINS` / `MCP_CLI_ALTERNATIVES` 常量（消费方改读 `MergedRules`）。
