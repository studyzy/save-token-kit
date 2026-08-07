---
name: new-feature
description: '端到端新功能开发流水线。当用户想要从需求到完整实现一站式完成新功能开发时使用。调用时需附带功能需求描述。自动串联：需求澄清 → 代码实现 → UT（委托 ut-writer SKILL）→ Lint（委托 lint-check-fix Agent）→ 构建测试验证。'
argument-hint: '[功能需求描述]'
---

# 端到端新功能开发流水线

从一句需求描述出发，自动完成：需求澄清 → 代码实现 → 单元测试补充 → Lint 检查修复 → 构建/测试验证 → 提交代码。

---

## 流程总览

```
用户输入需求描述
        |
        v
[阶段 1] 需求澄清
        |
        v
  记录明确的需求描述
        |
        v
[阶段 2] 代码实现
        |
        v
[阶段 3] 补充单元测试（委托 ut-writer SKILL）
        |
        v
[阶段 4] Lint 检查修复（委托 lint-check-fix Agent）
        |
        v
[阶段 5] 构建 & 测试验证（build / lint / test:coverage，并行）
        |  ← 失败则修复代码并重新验证
        v
[阶段 6] 提交代码
        |
        v
  完成 ✓
```

---

## 步骤

### 阶段 1：需求澄清

1. **获取需求输入**

   - 如果用户直接提供了需求描述，直接使用
   - 如果未提供任何信息，使用 **AskUserQuestion tool** 询问：
     > "请描述您想要开发的新功能。"

2. **阅读项目上下文**

   阅读 `CODEBUDDY.md` 获取项目架构和开发规范。

3. **需求分析与澄清**

   使用 **Agent tool**（subagent_type=Explore）深入理解需求：
   - 探索现有代码结构
   - 确认需求涉及的模块和文件
   - 评估技术可行性和影响范围

4. **确认需求方案**

   使用 **AskUserQuestion tool** 向用户确认：
   - 功能概述
   - 涉及的模块和文件
   - 实现方案（如有多种方案，列出各方案的优缺点）
   - 可能的影响范围

   等待用户确认后再继续。

### 阶段 2：代码实现

5. **创建任务列表**

   使用 **TaskCreate tool** 根据确认的需求创建详细的任务列表，将实现工作拆分为可跟踪的小任务。

6. **实现代码**

   按照任务列表逐一实现：
   - 使用 **Read tool** 阅读需要修改的文件
   - 使用 **Edit tool** 进行精确修改
   - 遵循项目编码规范（CODEBUDDY.md）
   - 每完成一个任务，使用 **TaskUpdate tool** 标记为完成

   注意：
   - 保持实现范围最小化，仅实现需求本身
   - 确保修改不引入新的问题

### 阶段 3：补充单元测试

7. **委托 ut-writer SKILL 补充单元测试**

   使用 **Skill tool** 调用 `ut-writer` SKILL：

   ```
   Skill tool, skill: "ut-writer"
   ```

   ut-writer 会自动：
   - 评估当前覆盖率基线
   - 分析覆盖率缺口
   - 为新功能涉及的模块补充或增强测试
   - 循环「写测试 → 跑测试 → 修复失败」直到覆盖率达 60% 且全部通过

   等待 ut-writer 完成后再继续。

### 阶段 4：Lint 检查修复

8. **委托 lint-check-fix Agent 检查并修复 lint 错误**

   使用 **Agent tool**（subagent_type="lint-check-fix"）进行 lint 检查与修复：

   ```
   Agent tool, subagent_type: "lint-check-fix"
   prompt: "请对项目进行 lint 检查并自动修复所有可修复的问题。"
   ```

   lint-check-fix 会自动：
   - 执行 lint 检查
   - 分类问题（可自动修复 / 需手动修复 / 需用户确认）
   - 自动修复可修复的问题
   - 输出修复报告

   等待 lint-check-fix 完成后再继续。

### 阶段 5：构建 & 测试验证

9. **并行运行 build、lint、测试**

   以下验证任务相互独立，**必须并行执行**（使用多个 Bash tool 并行调用）：

   ```bash
   pnpm build              # 构建
   pnpm lint               # Lint 检查
   pnpm test:coverage      # 测试 + 覆盖率
   ```

   收集全部结果后统一分析。如果任何一项失败，分析错误并修复代码/测试。

10. **验证循环**

    如果步骤 9 中任何一项失败：
    - 分析错误日志
    - 修复代码或测试
    - 重新并行运行全部验证（build / lint / test:coverage）
    - 最多重试 3 轮。如果 3 轮后仍有失败，暂停并报告问题，等待用户指导。

### 阶段 6：提交代码

11. **提交代码**

    仅在阶段 5 的所有验证步骤全部通过后才执行此步骤。

    - 使用 `git status` 和 `git diff` 查看所有变更
    - 使用 `git add` 添加相关文件（不要添加无关文件）
    - 使用 `git commit` 提交，commit message 格式：
      ```
      feat: <功能简述>

      <详细描述实现内容和设计决策>
      ```

---

## 完成时的输出

```
## 新功能开发完成

**功能：** <功能名称>
**实现方案：** <方案简述>

### 修改的文件
- <文件列表及修改说明>

### 验证结果
- ✓ 构建通过（pnpm build）
- ✓ Lint 通过（pnpm lint）
- ✓ 测试通过（pnpm test:coverage）

### Git 信息
- commit: <commit hash>
- message: <commit message>

功能开发全流程已完成！
```

---

## 护栏

- **严格按阶段顺序执行**：每个阶段必须完成后才能进入下一阶段
- **需求必须先澄清**：不得跳过需求澄清阶段直接进入实现
- **实现范围最小化**：仅实现需求本身，不做无关的功能增强
- **UT 必须委托 ut-writer**：单元测试统一通过 ut-writer SKILL 补充
- **Lint 必须委托 lint-check-fix**：Lint 检查与修复统一通过 lint-check-fix Agent 处理
- **验证必须全部通过**：build、lint、test:coverage 全部通过后才能提交代码
- **失败时修复而非跳过**：验证失败时必须修复代码并重新验证
- **重试有上限**：验证循环最多 3 轮，超过后暂停等待用户指导
- **使用 Task tool 跟踪进度**：创建任务跟踪每个阶段的进度
- **遵循项目编码规范**：遵循 CODEBUDDY.md 中的约定
