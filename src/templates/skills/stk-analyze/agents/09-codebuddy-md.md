# 子 Agent 9: CODEBUDDY.md 审查 (codebuddy-md)

**输入**：项目级 `CODEBUDDY.md`（存在即启动，`repo-scan.json.hasCodebuddyMd` 已标记）+ `context.json`

> 机制依据（渐进式披露 / 索引式主文件最佳实践，2026 社区共识）：
> - 主文件每次会话全量注入上下文；**官方建议精简、不超过 200 行**，更强实践主张 ≤ 150 指令（Boris Cherny，超此 AI 遵从率跌破 ~80%）或 ≤ 50 行。
> - 主文件应作**索引/资源地图**：项目描述 + 常用命令 + 关键文件指针；细节（架构、数据流、契约、长文档）下沉到 `@引用` 文件或 Skills，**按需加载**。
> - 判定标准：逐行问"删掉这行 AI 会犯错吗？"不会则删。读代码能推断的、仅特定场景相关的、长篇解释/教程，都不该写进主文件。

基于上述知识对 `CODEBUDDY.md` 做 Review，逐项检查并产出建议（可多条）：

| 检查维度 | 判定条件 | 输出 |
| --- | --- | --- |
| 行数/体量 | 行数 > 200，或估算 token 远超 ~150 指令阈值 | 建议精简并下沉细节。`action`: "精简 CODEBUDDY.md 至 ≤200 行"，`reason`: "主文件每次会话全量注入，过长淹没关键指令" |
| 全量写入可推断内容 | 含读代码即可得的架构/数据流/文件职责描述（如逐文件说明、调用链） | 建议下沉为 `@引用` 文件或 Skills。`action`: "将 <章节名> 下沉为 @docs/xxx.md 或 skill"，`reason`: "AI 可读代码推断，无需每轮注入" |
| 缺索引/资源地图 | 无"关键文件"指针或目录组织，AI 需自行探索文件系统 | 建议补 Resource Map。`action`: "为 CODEBUDDY.md 增加关键文件/目录索引"，`reason`: "索引式主文件省去探索 token" |
| 含长篇解释/教程 | 大段说明、示例、推理过程而非可执行指令 | 建议删除冗余，仅留指令；参考移至独立文件。`action`: "精简 CODEBUDDY.md <章节名> 冗余内容" |
| 缺按需加载机制 | 项目级细节（如文档读取约定、特定规则）未拆为 `.codebuddy/rules/*.md`（`alwaysApply:false`+`paths`）或 Skills | 建议拆分。`action`: "将 CODEBUDDY.md <章节名> 拆分为按需 rules/skill"，`reason`: "细节按需加载降低常驻占用" |

每条 `suggestion` 须填 `target: "CODEBUDDY.md"`，`detail` 引用具体行号/章节与对应最佳实践条款；`estimatedSavingTokens` 取该章节估算 token 量级或 0；`risk`: "low"，`reversible`: true，`scenario` 取 `code` 或阶段 2 结论，`evidence` 填如 `lines=73, 超 200 行阈值` / `含可推断数据流描述`。

**输出 category**：`CODEBUDDY.md 审查`
**`level`**：初级（配置优化类）
