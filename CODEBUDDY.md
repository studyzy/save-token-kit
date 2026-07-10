# save-token-kit 开发指南

基于所有功能计划自动生成. 最后更新时间: 2026-07-10

## 活跃技术
- (001-save-token-kit)

## 项目结构
```
src/
  cli.ts                  CLI 入口 (cac)
  commands/               stk init / diagnose / rollback 实现
  adapters/               PlatformAdapter 抽象 + CodeBuddy 实现
  proxy/                  HTTP 代理服务器 + 请求体解析 + 报告构建
  collectors/             Token 估算工具
  templates/              Commands (4) 与 Skills (4) 模板
  types/                  契约类型定义
tests/
  unit/                   单元测试 (proxy / collectors / commands / cli)
  integration/            diagnose 集成测试
```

## 命令
```bash
make install     # 安装依赖
make build       # unbuild 构建 ESM 产物到 dist/
make test        # vitest 运行全部测试
make cover       # 测试 + 覆盖率 (阈值 60%)
make lint        # ESLint 检查
make format      # Prettier 格式化
make clean       # 清理 dist/ 与覆盖率
```

## 代码风格
- TypeScript strict 模式, ESM, 英文代码注释 + 中文文档
- 遵循标准 ESLint/Prettier 配置 (`.eslint.config.js` / `.prettierrc`)
- 单元测试覆盖率 ≥ 60% (`pnpm cover` 验证)

## 最近变更
- 001-save-token-kit: 实现 stk diagnose / init / rollback 及 4 Command + 4 SKILL 模板
- 新增 Makefile 统一常用开发命令

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
