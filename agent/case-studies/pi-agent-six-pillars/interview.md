# Pi Agent 六大支柱面试速记

> 基于 Pi 源码基线 `36b60d2e8985899743c4cf5bd5f8929832a3f05d`。回答时先区分 Agent Core、Coding Agent 和 durable Harness。

## 1. 两分钟总回答

> 我会把 Pi 理解成三层。第一层是 `pi-agent-core`，它提供一个很薄的事件流 Agent Loop：流式调用模型、识别 tool call、校验并执行工具、把 tool result 回写，再继续下一轮；同时支持 steering、follow-up、turn hook 和串并行工具。
>
> 第二层是 `pi-coding-agent`，它把 Core 组装成终端编码产品，提供 read、bash、edit、write 等工具、结构化 system prompt、AGENTS 类项目上下文、Skills、Extensions、JSONL session tree 和 compaction。它的完整历史与模型上下文分离：磁盘保留树，当前 leaf 和 compaction boundary 决定模型本轮看到什么。
>
> 第三层是较新的 durable Harness，它不只是保存聊天记录，而是把任务建模为 branch、lane 和 operation，通过事务提交 total state、effect intent、checkpoint 和 terminal result，让进程崩溃后能识别从哪个阶段继续。工具按 `safe` 或 `never` 决定是否允许重放，但它仍不保证外部副作用 exactly-once。
>
> Pi 的核心价值是责任边界清晰、可扩展。和 Claude Code 相比，它更少内建产品策略；和 OpenClaw 相比，它缺少多渠道 Gateway 和完整运行时治理，但提供了非常适合学习和二次开发的 Loop、Session 与 Harness 基础。

## 2. 六大支柱短答

### 2.1 Agent Loop

Pi Core 是事件驱动的双层循环。内层处理 assistant、工具调用和 steering，外层在 Agent 原本结束时接收 follow-up。`prepareNextTurn`、`shouldStopAfterTurn` 和 `AbortSignal` 给上层插入压缩、换模型、终止和取消的能力。

### 2.2 Tool System

工具调用先查找工具，再做参数预处理、Schema 校验和 before hook，然后串行或并行执行，最后经过 after hook 按原调用顺序回写 tool result。token 截断的工具参数不会执行。默认 Coding Agent 有文件与 Shell 工具，但没有内建 MCP 或权限弹窗。

### 2.3 Context Engineering

上下文从 session tree 投影到 runtime messages，再经 `transformContext -> convertToLlm -> normalizeContext` 进入 provider。System Prompt 拆成 tools、rules、project context、skills、cwd 等 section；Skill 元数据常驻，正文按需读取；长会话通过 compaction summary 和 recent tail 控制 token。

### 2.4 Memory

传统 Pi 的 Memory 更准确叫 session memory：JSONL append-only entry tree 用 `id/parentId/leafId` 保存历史和分支，`buildSessionContext()` 重建当前模型上下文。它不是内建向量数据库或长期语义记忆。新 Harness 保存的是 lane/operation 运行状态，也不能等同于 RAG Memory。

### 2.5 Multi-Agent

传统 Pi README 明确说默认不内建 sub-agent。可以通过 Extension、启动多个 Pi 进程或宿主系统组装。新 Harness 的 branches 和 lanes 支持共享历史上的并行工作，但它们是执行与数据隔离原语，不应直接等同于完整 Supervisor/Worker 协作框架。

### 2.6 Harness Engineering

新 Harness 用 immutable entries、mutable values/lists 和 usage ledger 组织持久状态；每次状态迁移写完整 total state。执行外部 effect 前提交 intent，完成后 settlement；崩溃时根据 `safe/never` replay policy 恢复。它强调可恢复和不重复盲跑，而不是虚构 exactly-once。

## 3. 高频追问

### Q1：Pi 和普通的 `while(true)` Agent Loop 有什么区别？

普通循环只表达控制流。Pi 还提供事件流、动态工具声明、参数校验、并发工具、steering/follow-up、上下文转换和可插拔 turn hook，上层可以在不改 Loop 的情况下实现产品策略。

### Q2：Pi 为什么被称为轻量？

因为 Core 不绑定复杂工作流、MCP、权限 UI、多 Agent 协议或长期记忆。能力主要通过 Coding Agent 和 Extension 组合，而不是全部固化在内核。

### Q3：Pi 如何避免写工具并发冲突？

Core 允许工具标记 `executionMode: "sequential"`，Coding Agent 还有文件修改队列。但业务级依赖、跨进程锁和数据库并发控制仍需上层负责。

### Q4：Pi 的 compaction 会删除历史吗？

不会把 JSONL 原历史当场删除。它生成摘要和保留边界，后续模型上下文使用摘要加 recent tail。存储历史还在，但模型已经看不到被压缩原文，所以压缩仍是有损的。

### Q5：Session branch 和 sub-agent 有什么区别？

Branch 是历史路径和上下文选择；sub-agent 还需要任务分派、独立执行、结果返回、生命周期、并发限制和权限隔离。只有 branch 不能说明具备完整多 Agent 系统。

### Q6：durable Harness 为什么要保存完整 total state？

如果只记事件增量，恢复时要猜测哪些步骤已完成。每次提交完整当前状态，重启后可直接进入负责该状态的 procedure，降低恢复歧义。

### Q7：为什么工具执行不能保证 exactly-once？

进程可能在外部副作用成功之后、内部 settlement 提交之前崩溃。Harness 无法原子提交本地状态和任意外部系统，所以仍需幂等键、查询确认或补偿事务。

### Q8：`replay: safe` 和 `replay: never` 怎么选？

纯读取、确定性查询通常可选 `safe`；发送消息、扣款、删除文件等副作用通常应选 `never`。即使是 `safe`，也要确认重试不会改变业务状态或造成不可接受成本。

### Q9：Pi 是否支持长期向量记忆？

当前核心没有内建 embedding、向量库、混合检索或时间衰减。可以通过 Extension 或外部服务接入，但不能表述为 Pi 默认能力。

### Q10：Pi、Claude Code、OpenClaw 如何选？

要最小可改造的 Coding Harness 或研究 Loop/Harness，选 Pi；要成熟的本地编码体验，选 Claude Code；要多渠道、调度、长期运行和多 Agent 管理，OpenClaw 更匹配。

## 4. 关键边界

面试时避免以下错误：

- 不把 Coding Agent 的 JSONL SessionManager 和 durable Harness Session 混成一套实现。
- 不把 branch/lane 直接说成完整多 Agent 协议。
- 不把 compaction 说成长期语义记忆。
- 不把 Extension 能实现的功能说成 Pi 默认内建。
- 不把设计文档和 Pico 路线图说成稳定生产能力。
- 不声称恢复机制能保证任意外部副作用 exactly-once。
- 不说 Pi 原生内建 MCP、权限弹窗或 sub-agent，README 明确给出了相反边界。

## 5. 表格速记

| 支柱 | 核心机制 | 一句话边界 |
|---|---|---|
| Loop | 事件流、双层循环、steering/follow-up | Core 不负责产品级调度 |
| Tool | Schema、Hook、串并行、增量事件 | 权限和业务幂等在上层 |
| Context | section、tree projection、compaction | 存储全量不等于模型全量可见 |
| Memory | JSONL tree、branch/fork、summary | 不是向量长期记忆 |
| Multi-Agent | Extension/多进程、branch/lane 原语 | 默认不内建 sub-agent |
| Harness | total state、intent、checkpoint、recovery | 不保证 exactly-once |

## 6. 记忆口诀

**Core 跑循环，Coding Agent 做产品；树保存历史，摘要控制上下文；多 Agent 靠组装，Harness 管恢复；副作用不迷信 exactly-once。**
