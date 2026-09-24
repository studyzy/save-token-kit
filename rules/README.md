# stk-rules.json — stk 单文件规则库

stk（save-token-kit）的优化经验库：**一个 JSON 文件承载全部规则**，引擎（stk 主程序）只负责加载、校验与合并。改经验 = 改这个文件 + 递增 `packVersion` + git push，无需升级 stk 主程序。

## 文件结构

```jsonc
{
  "schemaVersion": 1,          // 数据格式版本；高于引擎支持值 → 整包拒载
  "packVersion": "1.0.0",      // 语义化版本；发布新经验时递增（与内容变更同步）
  "releasedAt": "2026-09-24T00:00:00Z",
  "engines": { "stk": ">=0.6" },  // 兼容的 stk 版本区间；当前引擎不在区间内 → 拒载并回退兜底
  "data": {
    "low-frequency-plugins": [          // 低频插件名单（元素为 pluginId@marketplace）
      "pptx@codebuddy-plugins-official"
    ],
    "mcp-alternatives": {               // MCP server → 更省 Token 的 CLI 替代
      "mcp-server-tapd": "tapd-cli"
    },
    "tools": [                          // 第三方省 Token 工具目录（纯数据；探测/安装逻辑在引擎）
      { "id": "rtk", "type": "cli" }   // type: cli | plugin | mcp
    ],
    "thresholds": {                     // 判定阈值（数值映射）
      "memoryMdMaxLines": 150,
      "userMemoryMaxLines": 50,
      "ruleFileMaxLines": 30,
      "totalMaxLines": 250,
      "impactHighBytes": 5120,
      "impactMediumBytes": 1024
    },
    "levels": {                         // 建议分级：初级 | 中级 | 高级；"*" 为兜底键
      "rtk": "初级",
      "headroom": "高级",
      "*": "中级"
    }
  },
  "prompts": {                          // 平台经验片段（Markdown 字符串），stk init 时渲染进技能模板
    "tool-opt.codebuddy": "...",
    "tool-opt.claude": "..."
  }
}
```

## 加载与叠加（四层，按条目覆盖）

```
内置兜底(src/rules/fallback.json) < 已装文件(~/.stk/rules/stk-rules.json)
                                < 全局用户(~/.stk/rules.d/*.json) < 项目级(./stk-rules/*.json)
```

- 上层同名条目覆盖下层；名单类可用 `"!条目"` 显式移除下层条目
- `~/.stk/rules.d/` 与 `./stk-rules/` 为裸数据文件（`<数据集名>.json`，无 manifest），仅支持 data 五类，不支持 prompts
- 任一层损坏/不兼容 → 该层整体拒载并回退下一层，stderr 给出定位警告；诊断永不因规则问题中断
- 每份诊断报告头部标注生效的 `packVersion`，历史报告可追溯经验基线

## 如何修改/发布

1. 修改 `stk-rules.json`（改条目/阈值/提示词），递增 `packVersion`（patch = 改数据，minor = 加数据集）
2. 更新 `src/rules/fallback.json` 为相同内容（**必须逐字节一致**，`tests/unit/rules/data-parity.test.ts` 会强制校验）
3. git push——`stk rules update` 即可拉到新版（默认 URL 指向本仓库 raw 地址）

## 用户侧使用

```bash
stk rules update            # 下载最新文件到 ~/.stk/rules/stk-rules.json（原子写入）
stk rules update --check    # 仅检查
stk rules status [--json]   # 生效版本、各层加载结果、更新时间
STK_RULES_URL=https://... stk rules update   # 自定义更新源
```

自动检查：诊断启动时若距上次检查 >24h 会后台检查新版（不打断诊断）；`~/.stk/rules/meta.json` 写 `"autoCheckDisabled": true` 可关闭。

## 校验规则（引擎加载时执行）

1. JSON 合法性 → 失败 `rejected-corrupted`
2. `schemaVersion` ≤ 引擎支持值，否则 `rejected-incompatible`
3. `engines.stk` 区间含当前引擎版本，否则 `rejected-incompatible`（警告含两侧版本号）
4. `data` 各数据集形态校验（名单=字符串数组、映射=扁平对象、阈值=数值、levels=三值枚举），失败整包 `rejected-corrupted`，不部分加载
