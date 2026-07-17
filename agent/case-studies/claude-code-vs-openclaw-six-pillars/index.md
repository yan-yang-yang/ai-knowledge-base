# Claude Code vs OpenClaw：Agent 六大支柱对比

> 记录时间：2026-07-17 16:29 GMT+8  
> 用途：面试复习时横向比较 Claude Code 与 OpenClaw 在 Agent 六大支柱上的工程取舍。  
> 关联笔记：
> - `memory/notes/claude-code-six-pillars/`
> - `memory/notes/openclaw-six-pillars/`

---

## 0. 一句话总览

**Claude Code 是围绕本地代码开发场景深度优化的 Coding Agent；OpenClaw 是面向多渠道、多会话、多节点工具生态的 Agent Runtime。**

两者都覆盖 Agent 六大支柱：

1. Agent Loop
2. Tool System
3. Context Engineering
4. Memory
5. Multi-Agent
6. Harness Engineering

但侧重点不同：

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 核心定位 | 本地 CLI Coding Agent | 多渠道 Agent Runtime / Gateway |
| 主要场景 | 读代码、改代码、跑测试、提交变更 | WebChat、IM、节点、任务调度、多工具执行 |
| 架构风格 | 深度手写、强绑定 coding workflow | Pi 轻量 loop + Gateway/runtime 扩展 |
| 上下文治理 | 围绕代码仓库和文件操作优化 | 围绕会话、工具结果、记忆检索优化 |
| 记忆路线 | Markdown 文件派 | SQLite + 向量 + BM25 数据库派 |
| 多 Agent 核心 | 上下文隔离、Explore、Swarm | 子会话、Announce Queue、Lane 队列 |
| 安全重点 | 本地文件 / Bash / 权限审批 | 工具策略 / 多渠道权限 / 节点边界 |

---

## 1. Agent Loop 对比

### 1.1 Claude Code

Claude Code 的 Agent Loop 是一个手写的生产级 Coding Agent 循环。

它不是简单：

```ts
while (true) {
  think();
  act();
  observe();
}
```

真实循环要处理：

- 上下文组装
- 流式响应
- 工具调用解析
- 并发工具调度
- 权限审批
- 状态追踪
- 工具结果回写
- token / 成本预算
- 输出截断恢复
- API 重试、降级和流式 fallback
- 多种退出路径

Claude Code 的 Loop 服务于一个核心目标：

> 让 Agent 能在本地代码仓库里持续、安全、可恢复地完成开发任务。

### 1.2 OpenClaw

OpenClaw 底层以 Pi / `pi-agent-core` 提供轻量 Agent Loop，再通过上层 runtime 扩展成完整生产系统。

OpenClaw 更强调：

- 事件流驱动
- 多 Provider 流式适配
- Chunked Reply
- 多渠道消息输出
- 工具事件追踪
- 循环保险丝
- Provider fallback
- session / gateway / node 协同

OpenClaw 的 Loop 服务于：

> 把一次模型调用扩展成可跨渠道、跨工具、跨会话运行的 Agent Runtime。

### 1.3 对比表

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| Loop 形态 | 手写大型 Coding Agent Loop | Pi 轻量 loop + runtime 包装 |
| 主要输入 | 本地项目、终端、文件系统 | 用户消息、会话状态、节点/工具事件 |
| 流式体验 | CLI 终端边生成边执行 | 多渠道 Chunked Reply / event stream |
| 工具执行 | 读工具并发，写工具串行/审批 | 事件驱动工具管线 + Lane 调度 |
| 退出控制 | max turns、预算、用户中断、权限失败等 | loop fuse、工具超时、Provider fallback、session 状态 |
| 容错重点 | Retry-After、529 降级、流式转非流式 | 多 Provider fallback、长上下文/工具结果保护 |

### 1.4 面试表达

> Claude Code 的 Agent Loop 更像一个本地开发者工作流引擎，重点是让模型能连续读代码、改代码、跑命令，并通过预算、权限、截断恢复和 API 容错保证任务能完成。OpenClaw 的 Agent Loop 更像 Agent Runtime 的核心事件循环，重点是多渠道消息、多 Provider、多工具和多 session 场景下的稳定调度。两者都不是简单 while true，差别在于 Claude Code 优化本地 coding workflow，OpenClaw 优化通用 Agent Runtime。

---

## 2. Tool System 对比

### 2.1 Claude Code

Claude Code 的工具系统围绕代码编辑场景定制。

典型工具包括：

- Read
- Edit
- Write
- Bash
- Grep
- Glob
- WebSearch
- WebFetch
- MCP tools
- Skills

关键设计：

- 每个工具独立 TypeScript 文件
- Zod 做参数格式校验
- `validateInput` 做业务校验
- 工具输入补全但不污染原始模型输入，保护 Prompt Cache
- 大工具结果截断并落盘
- Deferred Tool Loading 延迟加载工具 schema
- `ToolSearch` 按需发现工具
- MCP 工具三段式命名：`mcp__server__tool`
- Skills 作为“知识 + 工具说明”分发机制

### 2.2 OpenClaw

OpenClaw 的工具系统更偏 runtime 策略和权限治理。

重点包括：

- Pi 薄工具接口
- 装饰器模式扩展工具行为
- 事件驱动工具管线
- Tool Profile / Tool Group
- 工具按场景注入，不是全量暴露
- 五层权限过滤
- 两阶段审批
- MCP 与 Skills 集成
- Skill Scanner 检查危险脚本

OpenClaw 的工具系统重点不是“有哪些代码编辑工具”，而是：

> 如何在多渠道、多用户、多节点环境里安全地选择、暴露、审批和执行工具。

### 2.3 对比表

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 工具定位 | Coding Agent 行动能力 | Runtime 能力边界和执行管线 |
| 工具定义 | TypeScript + Zod + validateInput | Pi tool interface + schema/policy |
| 工具选择 | Deferred Tool Loading + ToolSearch | Tool Profile / Tool Group / 按需注入 |
| 缓存优化 | 保留原始输入，补全副本执行 | 更强调上下文转换与工具结果控制 |
| MCP | 一等公民，三段式命名 | MCP 接入 + 工具策略治理 |
| Skills | 项目/用户/官方技能说明 | ClawHub + 本地/远程技能 + scanner |
| 安全重点 | 工具参数、Bash、文件修改 | 权限策略、profile、审批、节点边界 |

### 2.4 面试表达

> Claude Code 的 Tool System 是面向代码编辑的自研工具管线，重点是 Zod 参数校验、业务级 validateInput、工具结果截断、Deferred Tool Loading 和 MCP/Skills 扩展。OpenClaw 的 Tool System 更像运行时能力治理系统，重点是 Tool Profile、Tool Group、权限过滤、审批和事件驱动管线。Claude Code 解决的是“Coding Agent 怎样高效调用开发工具”，OpenClaw 解决的是“多场景 Agent 怎样安全暴露和执行工具”。

---

## 3. Context Engineering 对比

### 3.1 Claude Code

Claude Code 的 Context Engineering 目标是：

> 让模型在正确时间看到正确代码和任务信息。

核心机制：

- `CLAUDE.md` 三层加载
  - 用户全局
  - 项目级
  - 本地私有
- Agentic Search
  - Grep
  - Glob
  - Read
  - 多轮搜索 query 调整
- Explore 子 Agent 隔离大范围搜索
- Microcompact → Snip → Auto-compact 三层压缩
- PreCompact Hook
- Prompt Cache 友好设计
- Auto-compact 后重新附加最近文件
- 摘要必须保留错误和修复方式

Claude Code 不把代码理解主要建在向量 RAG 上，因为代码有明确结构，确定性搜索通常更准。

### 3.2 OpenClaw

OpenClaw 的 Context Engineering 更偏多轮会话和运行时上下文治理。

核心机制：

- runtime context 注入
- `AGENTS.md` / `SOUL.md` / `MEMORY.md` 等上下文文件
- `transformContext`
- 工具结果实时截断
- 老 tool result 替换
- 最近 N 轮保护
- 结构化摘要
- Identifier Preservation
- Memory Flush
- 多渠道上下文适配

OpenClaw 面对的不只是代码仓库，而是：

- 用户长期对话
- 多渠道消息上下文
- 工具调用结果
- 节点状态
- memory 检索结果
- runtime metadata

### 3.3 对比表

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 上下文入口 | CLAUDE.md 三层加载 | AGENTS/SOUL/MEMORY + runtime context |
| 检索方式 | Agentic Search，确定性代码搜索 | memory search + 工具检索 + 会话上下文 |
| 大范围探索 | Explore 子 Agent | subagent / sessions_spawn |
| 压缩策略 | Microcompact → Snip → Auto-compact | 工具截断 → 老结果替换 → 最近轮保护 → 结构化摘要 |
| 摘要恢复 | 重新附加最近文件，保留错误修复路径 | 标识符保留、结构化摘要、Memory Flush |
| 主要风险 | 压缩后忘记当前代码状态 | 长会话膨胀、工具结果噪声、跨渠道上下文污染 |

### 3.4 面试表达

> Claude Code 的 Context Engineering 更贴近代码仓库：用 CLAUDE.md 冷启动项目规则，用 Grep/Glob/Read 做 Agentic Search，用 Explore 子 Agent 隔离大范围探索，再通过 Microcompact、Snip、Auto-compact 逐级压缩。OpenClaw 的 Context Engineering 更贴近多会话 runtime：它要处理历史消息、工具结果、记忆检索和渠道元数据，所以更强调 transformContext、工具结果截断、最近轮保护和结构化摘要。Claude Code 优化“代码上下文”，OpenClaw 优化“运行时上下文”。

---

## 4. Memory 对比

### 4.1 Claude Code

Claude Code 的记忆系统是文件派：

- `MEMORY.md`
- 独立 Markdown 文件
- Agent 自己用 Write/Edit 读写记忆
- user / feedback / project / reference 四类记忆
- 不存清单
- 手动记忆优先于自动提取
- Sonnet 异步相关性选择
- AutoDream 记忆整理
- 200 行物理上限

优点：

- 简单
- 透明
- 人类可读
- 可 git diff
- 易审查

缺点：

- 扩展性有限
- 大规模检索能力弱
- 更适合个人开发场景

### 4.2 OpenClaw

OpenClaw 的记忆系统是数据库派：

- SQLite
- sqlite-vec
- FTS5
- chunks / chunks_vec / chunks_fts
- 向量 + BM25 混合检索
- MMR 去重
- 时间衰减
- Memory Flush
- hash 增量索引
- 原子重建

优点：

- 更适合大量记忆
- 支持语义检索和关键词检索
- 更适合长期多会话系统

缺点：

- 透明性弱于 Markdown 文件
- 需要检索、索引、清理机制

### 4.3 对比表

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 路线 | 文件派 | 数据库派 |
| 存储 | MEMORY.md + Markdown | SQLite + sqlite-vec + FTS5 |
| 检索 | Sonnet 异步相关性选择 | 向量 + BM25 混合检索 |
| 清理 | AutoDream + 200 行限制 | MMR + 时间衰减 + Memory Flush |
| 可审查性 | 极强 | 依赖工具查看 |
| 扩展性 | 单用户、小规模记忆 | 多会话、大规模记忆 |

### 4.4 面试表达

> Claude Code 的 Memory 走文件派，用 MEMORY.md 和 Markdown 管理长期记忆，靠 Agent 自己读写，优点是透明、可审查、可 git diff，适合个人 Coding Agent。OpenClaw 走数据库派，用 SQLite、sqlite-vec 和 FTS5 做向量 + BM25 混合检索，再配合 MMR、时间衰减和 Memory Flush，适合长期、多会话、大规模记忆。两者不是谁绝对更好，而是场景不同：Claude Code 重透明和简单，OpenClaw 重检索和扩展性。

---

## 5. Multi-Agent 对比

### 5.1 Claude Code

Claude Code 的 Multi-Agent 核心不是角色扮演，而是上下文隔离。

主要模式：

- Parent-Child 子 Agent
- Explore Agent
- AsyncLocalStorage 进程内隔离
- git worktree 文件系统隔离
- 只读工具并发，写工具串行
- Swarm 团队模式
- Mailbox
- 共享任务列表
- 权限请求转发
- Leader 审批制关闭
- in-process / tmux / iTerm2 多后端

它解决的是：

> 主 Agent 不应该被大量搜索、探索和试错过程污染上下文。

### 5.2 OpenClaw

OpenClaw 的 Multi-Agent 更偏任务系统和会话运行时。

主要机制：

- subagents-tool
- sessions_spawn
- isolated / fork context
- Announce Queue
- Lane 队列模型
- session queue + global lane queue
- AbortController 传播
- `maxSpawnDepth = 1`
- 上下文隔离
- 异步完成事件

它解决的是：

> 多个 Agent 任务如何在多会话、多渠道、多工具环境里安全调度和回传。

### 5.3 对比表

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 核心目的 | 上下文隔离、代码探索 | 任务调度、会话隔离、异步回传 |
| 常见模式 | Explore Agent / Swarm | subagent / sessions_spawn |
| 回传方式 | 子 Agent 结果作为工具结果 | Announce Queue / completion event |
| 隔离手段 | AsyncLocalStorage / git worktree / tmux | isolated session / fork context / lane |
| 深度控制 | token 预算软限制 | `maxSpawnDepth = 1` 硬限制 |
| 适用场景 | 本地代码库探索和团队式开发 | 多渠道长期任务、后台任务、协作运行时 |

### 5.4 面试表达

> Claude Code 的 Multi-Agent 主要是为了上下文隔离：主 Agent 派 Explore Agent 去读大量代码，最后只拿压缩结论；更复杂时用 Swarm、Mailbox、任务列表和 Leader 审批协作。OpenClaw 的 Multi-Agent 更像运行时任务系统，通过 sessions_spawn、Announce Queue、Lane 队列和 maxSpawnDepth 控制，把子任务放到隔离会话里执行并异步回传。Claude Code 重点是“别污染主代码上下文”，OpenClaw 重点是“多会话任务如何安全调度”。

---

## 6. Harness Engineering 对比

### 6.1 Claude Code

Claude Code 的 Harness 是它最强的部分之一。

包含：

- 权限系统
- Bash 风险分类器
- Hook 体系
- Token / 成本保险丝
- 上下文压缩
- Memory
- Sub-agent
- JSONL transcript
- 沙箱和文件权限
- Routines 定时任务
- Claude Agent SDK

重点是：

> 给本地 Coding Agent 套上一层安全、可观测、可恢复的运行环境。

关键细节：

- 权限支持 allow / deny / ask
- Bash 命令风险分类
- Hook 覆盖 Agent 生命周期约 27-28 种事件
- Agent 会话期间不能修改 Hook 配置
- HTTP Hook 有环境变量白名单
- JSONL append-only transcript 方便复盘、恢复、审计
- OS 文件权限 / worktree 做安全边界
- Routines 支持定时、HTTP、GitHub webhook 触发

### 6.2 OpenClaw

OpenClaw 的 Harness 更偏 Agent Runtime 和 Gateway。

包含：

- Agent Runtime Harness
- Gateway
- 权限系统
- Profile Policy
- Owner-only
- Exec Approval
- Hook
- 可观测性
- Compaction
- Loop fuse
- Lane 调度
- Skill Scanner
- cron
- session queue
- node / browser / message 等工具边界

重点是：

> 在多渠道、多工具、多节点环境下，让 Agent 可控、可审计、可恢复地运行。

### 6.3 对比表

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| Harness 重点 | 本地 Coding Agent 安全与体验 | 多渠道 Agent Runtime / Gateway |
| 权限 | allow/deny/ask、Bash classifier、alwaysAllow | Profile policy、Owner-only、Exec Approval、工具白名单 |
| Hook | 生命周期 Hook 很完整 | runtime / tool / gateway 事件扩展 |
| 可观测性 | JSONL transcript | event stream、tool tracking、session/runtime 状态 |
| 调度 | Routines | cron、Lane、session queue |
| 沙箱 | OS 权限、worktree、tmux | Gateway/node/tool policy/session isolation |
| SDK | Claude Agent SDK `query()` | OpenClaw runtime / API / skills / tools |

### 6.4 面试表达

> Harness 是模型外面的安全和运行环境。Claude Code 的 Harness 更偏本地开发，重点是权限、Bash 风险分类、Hook、JSONL transcript、沙箱、Routines 和 SDK，把 Coding Agent 包成安全可恢复的开发工具。OpenClaw 的 Harness 更偏多渠道 runtime，重点是 Gateway、Profile Policy、Exec Approval、Lane 调度、cron、工具边界和节点边界。Claude Code 保护的是本地代码和终端，OpenClaw 保护的是跨渠道、跨工具、跨节点的运行时系统。

---

## 7. 六大支柱总对比速查表

| 支柱 | Claude Code | OpenClaw | 本质差异 |
|---|---|---|---|
| Agent Loop | 手写生产级 Coding Loop | Pi Loop + Runtime 事件流 | 本地开发 workflow vs 多渠道 runtime |
| Tool System | Zod、validateInput、Deferred Tool Loading、MCP、Skills | Tool Profile、Tool Group、权限过滤、两阶段审批、Skill Scanner | 工具调用效率 vs 工具治理边界 |
| Context Engineering | CLAUDE.md、Agentic Search、Explore、Microcompact/Snip/Auto-compact | transformContext、工具截断、最近轮保护、结构化摘要、Memory Flush | 代码上下文 vs 会话运行时上下文 |
| Memory | Markdown 文件派、AutoDream、200 行上限 | SQLite + sqlite-vec + FTS5、混合检索、MMR、时间衰减 | 透明简单 vs 检索扩展 |
| Multi-Agent | Explore、Swarm、Mailbox、worktree、Leader | sessions_spawn、Announce Queue、Lane、maxSpawnDepth | 上下文隔离 vs 任务调度 |
| Harness | 权限、Bash classifier、Hook、JSONL、沙箱、Routines | Gateway、Policy、Exec Approval、cron、Lane、node/tool boundary | 本地安全壳 vs Runtime 安全壳 |

---

## 8. 最适合面试的总回答

如果面试官问：**“Claude Code 和 OpenClaw 在 Agent 六大支柱上有什么区别？”**

可以这样回答：

> 我会从定位上先区分：Claude Code 是面向本地代码开发的 Coding Agent，OpenClaw 是面向多渠道、多会话、多工具的 Agent Runtime。  
> 在 Agent Loop 上，Claude Code 是手写生产级 Coding Loop，重点处理流式输出、工具调用、权限、预算、截断恢复和 API 容错；OpenClaw 是 Pi Loop 加事件驱动 runtime，更强调多 Provider、多渠道和 session 调度。  
> 在 Tool System 上，Claude Code 用 Zod、validateInput、Deferred Tool Loading、MCP 和 Skills 提升代码工具调用效率；OpenClaw 用 Tool Profile、Tool Group、权限过滤和审批机制治理工具边界。  
> 在 Context Engineering 上，Claude Code 用 CLAUDE.md、Agentic Search、Explore Agent 和三层压缩管理代码上下文；OpenClaw 用 transformContext、工具结果截断、最近轮保护和结构化摘要治理长会话上下文。  
> 在 Memory 上，Claude Code 走 Markdown 文件派，透明可审查；OpenClaw 走 SQLite + 向量 + BM25 的数据库派，更适合大规模长期记忆。  
> 在 Multi-Agent 上，Claude Code 的核心是上下文隔离，比如 Explore 和 Swarm；OpenClaw 的核心是任务调度和异步回传，比如 sessions_spawn、Announce Queue 和 Lane。  
> 在 Harness 上，Claude Code 保护本地文件和终端，重点是权限、Bash 分类器、Hook、JSONL transcript；OpenClaw 保护 runtime 边界，重点是 Gateway、Policy、Exec Approval、cron 和节点工具边界。  
> 所以两者不是谁替代谁，而是面向不同场景的 Agent 工程化实现。

---

## 9. 记忆口诀

**Claude Code：代码仓库里的开发者。**

- Loop：会持续干活
- Tool：会读写跑搜
- Context：会找代码、会压缩
- Memory：用 Markdown 记事
- Multi-Agent：派人探索代码
- Harness：保护本地终端和文件

**OpenClaw：多渠道里的 Agent Runtime。**

- Loop：事件流
- Tool：策略治理
- Context：会话治理
- Memory：混合检索
- Multi-Agent：队列调度
- Harness：Gateway 安全壳
