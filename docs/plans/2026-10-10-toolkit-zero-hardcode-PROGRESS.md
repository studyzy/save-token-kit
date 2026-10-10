# 第三方工具零写死重构——进度交接（2026-10-10 下班前）

> 继续方式：新会话读本文件 + 完整计划 `docs/plans/2026-10-10-toolkit-zero-hardcode.md`，从「剩余工作」第 1 项开始。
> 执行模式：Subagent-Driven（每 Task 独立子 Agent 实现 + 规格合规审查），前 7 个 Task 均已按此完成并通过审查。

## 已完成（提交序列，基线 6f13fe3）

| 提交 | Task | 内容 | 审查结论 |
| ---- | ---- | ---- | ---- |
| `dd8b16a` | Z1 | 类型层：`ToolkitSpec`/`ToolkitInstallSpec`，`ToolkitCatalogEntry` 扩展 detect/enabled/description/saving/level/estTokens/category，`ToolkitId`→string | diff 逐行核对 ✅ |
| `af73077` | Z2 | loader `validateToolkitSpec` 宽松校验（10 用例，TDD） | 规格审查 ✅（裁决：组合器节点不要求 kind） |
| `7832bca` | Z3 | fallback.json 13 工具落 detect/enabled/install/description/saving/level/estTokens/category，packVersion 1.2.0，parity 双写 | 规格审查 ✅（13 项逐项对照旧 impl 行为等价） |
| `cdef3a6` | Z4 | `src/toolkits/spec.ts` `evaluateSpec`：7 原语 + all/any 组合器（35 用例，TDD） | 规格审查 ✅（13 条规格纸面推演等价） |
| `7175e7e` | Z5+Z6 | **核心**：`data-registry.ts` 运行时注册表 + generic install；`handlers/rtk-native.ts` 移植 rtk 特例流；**删除 `src/toolkits/impl/` 13 文件**；`diagnose.ts` 7 处特例清除、`isHeadroomProxyRunning` 沉入 process 原语 | 联合审查 ✅（裁决 A：`install.byAgent` 实际值为说明文字、仅展示不执行正确；裁决 B：proxy-plugin 通用覆盖 installed 等价旧语义） |
| `026962f` | Z7 | render.ts：TOOLKIT_RE 视图扩为 links/agents/levels/est/names + `category=`/`exclude-category=` 过滤 | 规格审查 ✅ |
| `05a3e7a` | Z8 | 模板零写死：toolkit-enable level 表→`levels` 占位对、est 清单→`est` 占位对、知识库枚举→`names category=knowledge-base`；knowledge-base 同改 + 删展示名映射表；smoke 测试改为行级白名单扫描 | **实现完成、审查未做** |

当前测试基线：**452/452 通过（50 文件）、lint 干净、build 成功**（Z8 实现者自验）。

## 关键裁决记录（后续任务不得推翻）

1. **行为等价红线**：13 工具重构后检测结果与旧实现一致，已通过逐项对照 + 纸面推演双重验证。
2. **rtk 双轨合并**：enabled 统一走 spec 的 hook 原语单轨（旧 diagnose 特例与 impl `_hookEnabled` 双轨已消失）。
3. **ponytail/i-have-adhd**：proxy 标记从旧「覆盖 installed」收编为 spec `any[plugin-enabled, proxy-plugin]` 覆盖 enabled——规格映射表批准的偏差。
4. **generic install**：`install.byAgent`（平铺，上一轮引入）为展示字段不执行（其值为说明文字）；实际执行 `install.default` + `config.byAgent[agent] ?? config.default`（`{agent}` 替换、非 global 剥离 `-g`）；`verify` 仅存档不执行（旧行为等价）。
5. **headroom process pattern**：双 lookahead 单 pattern，依赖逐行 ps 匹配语义（spec.ts 已实现并有正反用例）。
6. **graphify/codegraph enabled**：cwd 相对 path 原语（`graphify-out` / `.codegraph`），spec 按 `deps.cwd ?? process.cwd()` resolve。
7. **agentCell ✗ 带 note**（上一轮 toolkit-meta 迁移的有意偏差，tokenlint 仅 ✓ 带）。
8. **names 视图门槛**：`inField = category 在场`，故 `names exclude-category=knowledge-base` 渲染不出非分类工具（Z8 因此删枚举而非渲染名单）——若未来需要放开属引擎行为变更。

## 剩余工作（按序）

1. **Z8 规格合规审查**（未做）——审查 `05a3e7a`：模板 8 章节结构完好、占位对语法与 TOOLKIT_RE 兼容、兜底表逐字保留、smoke 行级白名单断言合理性（宁窄勿误报）、自跑 `pnpm test`/`pnpm lint`。发现问题→派原实现者修→复审。
2. **Z9 收尾验证**：
   - `make build && make cover && make lint`
   - 真实环境冒烟：`node dist/cli.mjs diagnose --agent codebuddy`（toolkitDetection 13 项正常）；`node dist/cli.mjs init --force --agent codebuddy` 刷新本机 SKILL（渲染产物无占位残留）
   - `graphify update .`
   - **写死残留 grep 证明**：`grep -rn "rtk\|caveman\|headroom\|ponytail\|caveman" src/ --include="*.ts"` 预期仅剩 `handlers/rtk-native.ts` 与类型注释；模板残留由 Z8 smoke 断言覆盖
   - 最终整体 code review（对照计划逐 Task 验收，跨任务一致性 + 无关文件检查）
3. **收尾汇报**：删除/新增行数统计、grep 证明、测试结果。
4. （可选）本机验证通过后确认是否需要把 `docs/plans/` 两份计划文档提交或删除（当前均为 untracked：`2026-10-10-toolkit-zero-hardcode.md` 本文件之外还有已完成的 `2026-10-10-toolkit-meta-migration.md` 已在上轮被用户要求删除，本文件待用户裁决）。

## 环境备注

- 本会话因跨机器中断，新会话直接读本文件即可恢复全部上下文；子 Agent 审查 prompt 模板可参考 git 历史中的会话记录或按上述「审查结论」要点重建。
- hook 提醒：上下文占用高时新需求应开新会话（本文件即为跨会话交接设计）。
