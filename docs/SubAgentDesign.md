在**复杂任务的多 Agent 调度**中，最重要的设计原则其实不是“拆出越多 Agent 越好”，而是：

> **让每个子 Agent 拥有清晰、有限、可验证的职责，并尽量减少 Agent 之间的自由对话。**

一个比较成熟的模式通常是：

```text
                    ┌──────────────┐
                    │ Orchestrator │
                    │  主控/调度器  │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     ┌─────────┐      ┌─────────┐      ┌─────────┐
     │ Planner │      │Research │      │ Executor│
     │ 规划拆解 │      │ 信息收集 │      │ 任务执行 │
     └────┬────┘      └────┬────┘      └────┬────┘
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                    ┌──────────────┐
                    │ Reviewer /   │
                    │ Verifier     │
                    │ 验证/评审     │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ Orchestrator │
                    │ 汇总/决策     │
                    └──────────────┘
```

---

# 一、首先要明确：子 Agent 不等于“一个不同人格的 LLM”

很多早期多 Agent 系统喜欢这样设计：

* 架构师 Agent
* 程序员 Agent
* 测试 Agent
* 安全专家 Agent
* 产品经理 Agent
* Reviewer Agent

然后让它们互相聊天。

这种方式**看起来很智能，但实际通常效率不高**：

1. Token 消耗大
2. Agent 之间反复重复上下文
3. 聊天产生大量无效信息
4. 容易形成“讨论而不是执行”
5. 最终责任边界不清楚

更好的理解是：

> **Agent = LLM + 专属 Context + Tool 权限 + 明确目标 + 输入/输出契约 + 生命周期。**

例如一个 `TestAgent` 不应该只是 Prompt：

```text
你是一名专业测试工程师……
```

而应该是：

```text
目标：
验证 task-123 实现是否符合验收标准。

输入：
- TaskSpec
- CodeDiff
- AcceptanceCriteria

允许工具：
- read_file
- grep
- run_tests

禁止：
- 修改业务代码
- 修改任务定义

输出：
TestResult {
    passed: boolean
    failed_cases: []
    coverage: ...
    evidence: []
}
```

这才是一个真正有工程意义的子 Agent。

---

# 二、最佳实践：按“任务能力”拆，而不是按“人类角色”拆

我更推荐将子 Agent 分成下面几类。

## 1. Planner：负责理解和拆解

职责：

```text
复杂目标
    ↓
分析依赖
    ↓
生成 DAG / Task Graph
    ↓
定义每个 Task 的：
    - 输入
    - 输出
    - 成功条件
    - 依赖
    - 推荐执行方式
```

例如：

```json
{
  "tasks": [
    {
      "id": "task-1",
      "goal": "分析现有认证模块",
      "dependencies": [],
      "output": "AuthAnalysis"
    },
    {
      "id": "task-2",
      "goal": "设计JWT刷新机制",
      "dependencies": ["task-1"],
      "output": "DesignSpec"
    },
    {
      "id": "task-3",
      "goal": "实现刷新机制",
      "dependencies": ["task-2"],
      "output": "CodePatch"
    },
    {
      "id": "task-4",
      "goal": "验证实现",
      "dependencies": ["task-3"],
      "output": "TestResult"
    }
  ]
}
```

### 注意

Planner **最好不要直接执行任务**。

否则容易变成：

```text
分析一下
↓
顺手写代码
↓
发现问题重新分析
↓
继续写
↓
上下文越来越大
```

复杂任务中最好分离：

```text
Think → Plan
Plan → Execute
Execute → Verify
Verify → Decide
```

---

# 三、Executor 最好不是一个 Agent，而是一组能力 Agent

例如 Coding Agent 场景：

```text
                    Executor
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Code Agent      Search Agent    Test Agent
```

但是不一定需要同时启动三个。

Orchestrator 根据 Task 类型选择：

```go
type TaskType string

const (
    ResearchTask TaskType = "research"
    CodeTask     TaskType = "code"
    TestTask     TaskType = "test"
    ReviewTask   TaskType = "review"
)
```

然后：

```text
Task
 ↓
Router
 ↓
┌──────────────┐
│ Research?    │ → ResearchAgent
├──────────────┤
│ Coding?      │ → CodeAgent
├──────────────┤
│ Testing?     │ → TestAgent
├──────────────┤
│ Review?      │ → ReviewAgent
└──────────────┘
```

这比固定启动 10 个 Agent 更合理。

---

# 四、子 Agent 最重要的是 Context Isolation

这是多 Agent 系统里非常关键的一点。

假设主任务：

```text
给一个大型 Go 项目增加 OAuth2 登录
```

不要把完整历史直接全部传给每个 Agent：

```text
System Prompt
+ 用户全部历史
+ Planner全部思考
+ 所有Agent输出
+ 当前任务
```

这样很快 Context 就爆炸。

推荐：

```text
Global Task
    │
    ▼
Task Spec
    │
    ├── Agent A
    │   ├── 必要代码
    │   ├── 必要任务信息
    │   └── 专属工具
    │
    ├── Agent B
    │   ├── Task A 的结构化结果
    │   └── 必要代码
    │
    └── Agent C
        ├── 最终 Diff
        └── 验收标准
```

核心原则：

> **不要传递 Conversation，尽量传递 Artifact。**

例如不要这样：

```text
Agent A 和 Agent B 讨论了 5000 Token，
把完整聊天记录给 Agent C。
```

而是：

```json
{
  "artifact": "ArchitectureDecision",
  "decision": "OAuth2 authorization code flow",
  "constraints": [
    "保持现有JWT兼容"
  ],
  "interfaces": [
    "POST /auth/oauth/callback"
  ]
}
```

这会大幅降低 Token 消耗。

---

# 五、Agent 之间最好通过“结构化 Artifact”通信

我认为这是最值得实践的一条。

不要：

```text
Agent A:
我分析了一下，我认为这个项目应该……
……
大概有以下几个问题……
```

Agent B 再阅读自然语言。

而应该：

```go
type AgentResult struct {
    Status    Status
    Summary   string
    Artifacts []Artifact
    Evidence  []Evidence
    NextTasks []TaskSuggestion
}
```

例如：

```json
{
  "status": "success",
  "artifacts": [
    {
      "type": "code_analysis",
      "files": [
        "auth/service.go",
        "auth/router.go"
      ],
      "findings": [
        {
          "id": "AUTH-001",
          "description": "JWT签发逻辑位于AuthService"
        }
      ]
    }
  ]
}
```

这样 Orchestrator 才能可靠地进行：

```text
读取结果
↓
判断成功？
↓
判断是否满足条件？
↓
继续下一任务
```

而不是让另一个 LLM 去猜：

> “这个 Agent 好像已经完成了吧？”

---

# 六、Verifier/Reviewer 应该独立于 Executor

一个非常常见的问题是：

```text
Agent
  ↓
写代码
  ↓
自己测试
  ↓
自己说：测试通过
```

LLM 很容易产生 Confirmation Bias。

更好的模式：

```text
CodeAgent
    │
    ▼
CodePatch
    │
    ▼
TestAgent
    │
    ├── PASS ──→ 完成
    │
    └── FAIL ──→ Feedback
                     │
                     ▼
                 CodeAgent
```

即：

```text
Generate
   ↓
Independent Verify
   ↓
Pass / Fail
```

如果任务风险高，还可以：

```text
Executor
    ↓
Verifier A
    ↓
Verifier B
    ↓
Judge
```

不过一般没必要无限增加 Agent。

---

# 七、不要把所有 Agent 都设计成“自主循环”

这是很多 Agent Framework 容易出现的问题。

例如：

```text
while true:
    LLM 决定下一步
    调工具
    LLM 决定下一步
    调工具
```

如果 10 个 Agent 都这样运行，会非常难控制。

推荐区分两种：

### 1. Workflow Agent

生命周期短：

```text
Input
 ↓
Execute
 ↓
Output
 ↓
Exit
```

例如：

```text
CodeReviewAgent
TestAgent
ResearchAgent
```

这是最推荐的默认模式。

### 2. Autonomous Agent

适用于确实需要探索的问题：

```text
Goal
 ↓
Observe
 ↓
Think
 ↓
Act
 ↓
Observe
 ↓
...
```

例如：

```text
复杂代码库调研
自动 Debug
长时间 Research
```

我的建议：

> **80% 的子 Agent 应该是 Workflow Agent，只有少量使用 Autonomous Loop。**

否则整个系统会变成不可预测的“Agent 群聊”。

---

# 八、调度层最好由程序控制，而不是全部交给 LLM

这是一个很重要的架构选择。

不推荐：

```text
LLM Orchestrator
    ↓
自由决定：
调用谁
什么时候调用
调用几次
什么时候结束
```

更推荐：

```text
                LLM Planner
                     │
                     ▼
                 Task DAG
                     │
                     ▼
           Deterministic Scheduler
                │           │
                ▼           ▼
             Ready Queue  Retry Queue
                │
                ▼
             Agent Pool
```

也就是说：

### LLM 擅长：

```text
任务理解
任务拆分
动态决策
异常处理建议
```

### 程序擅长：

```text
DAG调度
并发控制
超时
重试
状态管理
权限控制
资源限制
幂等
结果持久化
```

这是一种很实用的边界。

---

# 九、复杂任务建议使用 DAG，而不是固定 Pipeline

简单任务：

```text
Plan
 ↓
Code
 ↓
Test
 ↓
Done
```

可以。

但复杂任务：

```text
              ┌── Research A ──┐
              │                │
Goal → Plan ──┼── Research B ──┼── Design
              │                │      │
              └── Research C ──┘      │
                                      ▼
                               ┌─────────────┐
                               │             │
                               ▼             ▼
                            Code A         Code B
                               │             │
                               └──────┬──────┘
                                      ▼
                                    Test
                                      │
                                      ▼
                                    Review
```

此时应该建模：

```go
type Task struct {
    ID           string
    Dependencies []string
    Priority     int
    AgentType    string
    Input        ArtifactRef
    Output       ArtifactRef
}
```

Scheduler 只关心：

```text
Dependencies 是否全部完成？
       ↓
是
       ↓
进入 Ready Queue
       ↓
分配 Agent
```

这样天然支持并行。

---

# 十、给每个 Agent 设置“最小权限”

这点在 Coding Agent 特别重要。

例如：

| Agent    | 权限                      |
| -------- | ----------------------- |
| Planner  | Read                    |
| Research | Read + Search           |
| Code     | Read + Write            |
| Test     | Read + Execute          |
| Reviewer | Read + Execute          |
| Deploy   | Read + Execute + Deploy |

不要：

```text
所有 Agent 都拥有：
Read
Write
Delete
Shell
Network
Deploy
```

例如 TestAgent 理论上根本不应该修改核心代码。

这样不仅更安全，也能减少 Agent 的决策空间。

> **工具越少，Agent 的行为通常越稳定。**

---

# 十一、对子 Agent 设置明确的“完成条件”

不要让 Agent 自己判断：

> “我觉得应该差不多完成了。”

Task 应该定义：

```json
{
  "goal": "增加用户登录接口",
  "acceptance": [
    "POST /login 存在",
    "支持用户名密码认证",
    "错误密码返回401",
    "成功返回JWT",
    "go test ./... 通过"
  ]
}
```

最终：

```text
Verifier
   │
   ├── /login存在？        PASS
   ├── 用户名密码？         PASS
   ├── 错误密码401？        PASS
   ├── JWT？               PASS
   └── go test？           PASS
          │
          ▼
        SUCCESS
```

这叫 **Outcome-based Agent**，而不是 Conversation-based Agent。

---

# 十二、失败处理不要直接“重跑同一个 Agent”

推荐失败分类：

```text
Failure
   │
   ├── Tool Error
   │      ↓
   │    Retry
   │
   ├── Context Missing
   │      ↓
   │    Fetch Context
   │
   ├── Implementation Error
   │      ↓
   │    Return Feedback to Executor
   │
   ├── Plan Error
   │      ↓
   │    Replan
   │
   └── Unknown
          ↓
       Escalate
```

例如测试失败：

```text
TestAgent
   ↓
{
  "failure_type": "implementation_error",
  "evidence": "...",
  "failed_tests": [...]
}
   ↓
CodeAgent 修复
```

如果连续修 3 次还失败：

```text
Implementation Error?
       ↓
No
       ↓
Plan Re-evaluation
       ↓
Planner重新分析
```

**不要无限 retry。**

---

# 我最推荐的整体架构

如果你现在自己实现一个多 Agent 调度系统，我建议从下面这个模型开始：

```text
                    ┌────────────────────┐
                    │       User         │
                    └─────────┬──────────┘
                              ▼
                    ┌────────────────────┐
                    │   Orchestrator     │
                    │                    │
                    │ State / Budget     │
                    │ DAG / Scheduling   │
                    └─────────┬──────────┘
                              ▼
                    ┌────────────────────┐
                    │      Planner       │
                    │                    │
                    │ Goal → Task DAG    │
                    └─────────┬──────────┘
                              ▼
              ┌───────────────────────────────┐
              │      Deterministic Scheduler   │
              └───────────────┬───────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌────────────┐      ┌────────────┐      ┌────────────┐
   │ Research   │      │ Execution  │      │  Analysis  │
   │ Agent      │      │ Agent      │      │  Agent     │
   └─────┬──────┘      └─────┬──────┘      └─────┬──────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
                     ┌──────────────┐
                     │ Artifact Store│
                     └──────┬───────┘
                            ▼
                     ┌──────────────┐
                     │   Verifier   │
                     └──────┬───────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
              Success               Failure
                                      │
                                      ▼
                                Repair/Replan
```

## 核心组件

我建议至少有：

```text
1. Orchestrator
   总体状态和预算控制

2. Planner
   Goal → Task DAG

3. Scheduler
   确定性执行 DAG

4. Agent Registry
   Agent 能力注册

5. Artifact Store
   Agent 不直接靠聊天传递信息

6. Verifier
   独立验证结果

7. State Machine
   控制：
   PENDING
   READY
   RUNNING
   SUCCESS
   FAILED
   RETRYING
   CANCELLED
```

---

## 最后给你一个我认为最实用的原则

如果是你这种偏工程实现的场景，我会总结成：

> **复杂性应该放在 Orchestrator 和 Task/Artifact 模型中，而不是放在 Prompt 里。**

也就是说，不要追求：

```text
写一个超级 Prompt
让超级 Agent
自己管理一切
```

而应该追求：

```text
明确任务模型
+ 明确状态机
+ 明确输入输出
+ 最小 Context
+ 最小工具权限
+ DAG 调度
+ 独立验证
+ LLM 负责智能决策
+ 程序负责确定性控制
```

如果是进一步落地，我认为你可以重点研究 **“Supervisor + Worker + Artifact Store + Verifier”** 这个四层模型。它比常见的“多个 Agent 自由对话”更适合生产级复杂任务，也尤其适合你熟悉的 **Golang 后端/Agent 框架**去实现。
