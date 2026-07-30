# 2026-07-30：LangGraph 多 Agent 如何协作与通信

> 创建时间：2026-07-30 23:35 GMT+8  
> 题目来源：用户每日面试题。  
> 原始题意：针对 LangGraph，多 Agent 协作时如何协作、如何通信、如何传递状态。  
> 适用目标：AI 应用开发 / Agent Runtime / LangGraph / Multi-Agent / RAG / Tool Calling 面试  
> 审核状态：待用户审核，审核通过后再同步到 `knowledge-base/interview/daily/` 并提交推送。

---

## 1. 面试官真正想问什么？

这道题表面是在问 LangGraph 的多 Agent 通信，本质考的是：

> 你是否理解多 Agent 不是“多个大模型互相聊天”，而是要有明确的协作拓扑、共享状态、路由机制、任务边界、冲突处理和可恢复能力。

面试官通常想听到这些点：

1. **协作模式**：是 Supervisor 调度、Agent handoff，还是并行 worker？
2. **通信机制**：Agent 之间到底通过什么传递信息，是 message、shared state、Command，还是工具结果？
3. **状态管理**：每个 Agent 是否共享同一个 State？哪些字段可读写？如何避免互相污染？
4. **路由控制**：谁决定下一个 Agent？模型决定、规则决定，还是混合决定？
5. **并发与冲突**：多个 Agent 并行写结果时如何合并？
6. **可恢复性**：长任务中断后，如何通过 checkpoint 恢复？
7. **工程边界**：LangGraph 负责图编排和状态流转，但不等于完整 Agent Runtime。

不要只说：

> LangGraph 可以把多个 Agent 连成图。

这太浅。更好的回答是：

> 在 LangGraph 里，多 Agent 协作本质上是“图 + 状态 + 路由”的协作。每个 Agent 可以被封装成一个 Node，Agent 之间不是随意互聊，而是通过 Graph State、messages、Command goto / update、条件边或 Send API 传递任务结果和控制权。Supervisor 负责拆解任务和路由，Worker Agent 负责专业子任务，最后由汇总节点做结果融合。这样协作过程可控、可观测、可 checkpoint 恢复，也能避免多个 Agent 在同一上下文里互相污染。

---

## 2. 1 分钟回答

如果放到业务里讲，我会把 LangGraph 多 Agent 理解成“把一个复杂业务流程拆成多个职责明确的 Agent 节点”，而不是让多个模型自由聊天。

比如在公共雨伞智能客服里，用户问题可能是活动咨询、借伞失败、归还异常、扣费争议、退款申请。我们可以用一个 Supervisor Agent 先做意图识别和路由：活动咨询交给 RAG Agent 查规则文档；借伞失败交给 User Agent、Device Agent、Station Agent 分别查用户状态、设备状态和网点库存；归还异常交给 Order Agent 和 Device Event Agent 查订单和设备上报；退款争议再交给 Refund Agent 和 Human Review 节点。

这些 Agent 之间不是直接互相发散聊天，而是通过 LangGraph 的共享 State 通信。State 里会结构化保存 `intent`、`orderInfo`、`deviceStatus`、`retrievedDocs`、`riskLevel`、`reviewResult`、`finalAnswer` 等字段。每个 Agent 只写自己负责的字段，节点执行完通过条件边或 Command 把控制权交给下一个 Agent。比如 Device Agent 查到柜机离线，就更新 `deviceStatus=offline`，然后路由到 SOP/RAG Agent 生成处理建议；如果涉及退款，就进入人工审核节点。

这样做的业务价值是：流程可控、职责清晰、状态可追溯，也方便 checkpoint 恢复。LangGraph 解决的是多分支业务流程编排和状态流转；但工具权限、审计日志、长期记忆、成本控制这些生产级能力，还是要放到外层 Runtime 或业务服务里治理。

---

## 3. 深入回答：LangGraph 多 Agent 如何协作？

### 3.1 本质：多 Agent = 多个节点 + 共享状态 + 路由策略

在 LangGraph 里，多 Agent 通常不是每个 Agent 起一个独立进程互相发消息，而是：

```txt
Agent A Node
  ↓ update state / goto
Agent B Node
  ↓ update state / goto
Agent C Node
  ↓ update state
Aggregator Node
```

核心组件是：

- **State**：整个图的共享状态，保存任务目标、messages、阶段结果、工具结果、错误信息等。
- **Node**：一个 Agent 或一个确定性函数，比如 planner、retriever、reviewer。
- **Edge / Conditional Edge**：决定节点之间怎么流转。
- **Command**：节点返回时可以同时更新状态并指定跳转目标。
- **Checkpoint**：保存每一步状态，支持中断恢复。
- **Send**：适合动态并行分发任务，比如 map-reduce 型多 Agent 协作。

所以 LangGraph 的多 Agent 通信，主要不是靠网络消息队列，而是靠图运行时里的 State 和控制流。

---

### 3.2 协作模式一：Supervisor 调度模式

这是最常见的多 Agent 模式。

```txt
User Request
   ↓
Supervisor
   ├── Retriever Agent
   ├── SQL / Tool Agent
   ├── Domain Expert Agent
   ├── Reviewer Agent
   └── Final Writer
```

Supervisor 负责：

- 理解用户意图；
- 拆解任务；
- 判断下一步需要哪个 Agent；
- 根据子 Agent 结果决定继续、重试、补充信息或结束；
- 控制整体流程不跑偏。

Worker Agent 负责：

- 检索知识；
- 查询业务数据；
- 调用工具；
- 做专项分析；
- 校验答案质量。

面试表达：

> Supervisor 模式的好处是控制权集中，不会让多个 Agent 自由发散。它适合客服、运营助手、数据分析助手这类需要动态路由的场景。但 Supervisor 不能只靠模型拍脑袋路由，最好结合规则、状态字段和工具结果做约束。

---

### 3.3 协作模式二：Handoff 交接模式

Handoff 是指当前 Agent 完成自己的阶段后，把任务交给另一个 Agent。

例如：

```txt
Planner Agent → Research Agent → Writer Agent → Reviewer Agent
```

Planner 只负责任务拆解，不直接回答；Research 只负责查资料；Writer 负责组织答案；Reviewer 负责检查事实和格式。

在 LangGraph 里可以通过：

- 条件边决定下一步；
- Command 返回 `goto` 指定下一个 Agent；
- State 中写入 `next_agent`、`task_status`、`handoff_reason` 等字段。

面试表达：

> Handoff 的关键不是“把完整上下文全部塞给下一个 Agent”，而是把交接协议结构化，比如当前目标、已完成步骤、待处理问题、引用资料和失败原因。这样下一个 Agent 接手时更稳定，也能减少上下文污染。

---

### 3.4 协作模式三：并行 Worker / Map-Reduce 模式

如果任务可以拆成多个互不依赖的子任务，可以让多个 Agent 并行处理。

例如用户问：

> 对比 LangGraph、OpenClaw、Claude Code 的多 Agent 协作方式。

可以拆成：

```txt
Worker A：整理 LangGraph
Worker B：整理 OpenClaw
Worker C：整理 Claude Code
      ↓
Aggregator：汇总对比
      ↓
Reviewer：检查结论
```

LangGraph 里可以用 Send 动态创建多个并行分支，最后把结果汇总到一个 reducer / aggregator 节点。

并行模式要注意：

- 子任务输入要明确；
- 每个 Worker 只能写自己的结果字段；
- 聚合节点负责冲突处理和去重；
- 不要让多个 Agent 同时改同一个 `final_answer`；
- 失败分支要能降级，不要因为一个 Worker 失败导致整个任务不可用。

---

## 4. Agent 之间怎么通信？

### 4.1 通过 messages 通信

最简单的方式是把对话历史放到 State 的 `messages` 里，多个 Agent 都读写 messages。

优点：

- 实现简单；
- 符合 LLM chat 模型习惯；
- 适合短流程。

问题：

- 上下文容易膨胀；
- 多个 Agent 的思考和结果混在一起；
- 容易污染后续 Agent 判断；
- 不利于权限隔离和结果审计。

所以生产里不建议所有内容都塞进同一个 messages。

---

### 4.2 通过结构化 State 通信

更推荐的方式是设计清晰的 State Schema。

示例：

```ts
type AgentState = {
  userQuery: string;
  intent?: string;
  plan?: string[];
  retrievedDocs?: RetrievedDoc[];
  toolResults?: ToolResult[];
  workerOutputs?: Record<string, string>;
  reviewResult?: {
    passed: boolean;
    issues: string[];
  };
  finalAnswer?: string;
  nextAgent?: string;
};
```

不同 Agent 只读写自己负责的字段：

- Planner 写 `plan`；
- Retriever 写 `retrievedDocs`；
- Tool Agent 写 `toolResults`；
- Reviewer 写 `reviewResult`；
- Writer 写 `finalAnswer`。

面试表达：

> 多 Agent 通信最好从“聊天记录”升级成“结构化状态协议”。每个 Agent 读哪些字段、写哪些字段要有边界，否则多 Agent 很容易变成上下文互相污染。

---

### 4.3 通过 Command 控制通信和跳转

Command 的价值是：一个节点可以同时做两件事：

1. update：更新 State；
2. goto：决定下一个节点。

例如：

```txt
当前节点判断问题需要查知识库：
update: { intent: "knowledge_query" }
goto: "retriever_agent"
```

或者：

```txt
Reviewer 发现答案缺少来源：
update: { reviewResult: { passed: false, issues: ["缺少引用"] } }
goto: "retriever_agent"
```

这样 Agent 之间的通信不仅包含内容，还包含控制权转移。

---

### 4.4 通过工具结果通信

有些 Agent 不直接和其他 Agent 说话，而是通过工具结果影响状态。

例如：

- SQL Agent 查询订单；
- RAG Agent 召回 SOP；
- Device Agent 查询设备状态；
- Refund Agent 检查退款规则。

这些工具结果写入 State 后，后续 Agent 再基于这些事实判断。

面试表达：

> 工具结果应该作为事实进入 State，而不是作为自然语言混在聊天记录里。这样后续 Agent 可以明确知道哪些是用户输入、哪些是模型推理、哪些是外部系统事实。

---

## 5. 状态与上下文隔离怎么做？

多 Agent 最大的问题不是“能不能协作”，而是协作后容易乱。

常见风险：

- 所有 Agent 共享完整 messages，导致上下文污染；
- Worker Agent 越权修改最终答案；
- 多个 Agent 同时写同一字段，结果互相覆盖；
- Supervisor 被 Worker 的错误结论带偏；
- 中间推理过程过多，导致 token 成本失控；
- 并行任务结果无法追溯来源。

解决方式：

1. **State Schema 明确字段归属**：每个 Agent 只写自己负责的字段。
2. **只传必要上下文**：不要把所有历史都传给每个 Agent。
3. **中间结果结构化**：区分 `facts`、`assumptions`、`toolResults`、`finalAnswer`。
4. **聚合节点统一合并**：并行 Worker 不直接写最终答案。
5. **Reviewer 做二次校验**：检查事实、引用、格式和风险。
6. **Checkpoint 保存关键状态**：中断后可以从最近状态恢复。

---

## 6. 业务落地：公共雨伞智能客服怎么设计？

### 6.1 业务场景

以公共雨伞智能客服为例，用户问题不是单一问答，而是多分支业务处理：

- **活动 / 价格咨询**：只需要查规则文档，用 RAG 回答。
- **借伞失败**：可能和用户押金、账号状态、柜机在线状态、伞槽库存有关。
- **归还异常**：需要查订单状态、柜机上报事件、归还记录和异常 SOP。
- **扣费争议**：需要查订单、计费规则、逾期时长、优惠券或活动规则。
- **退款申请**：涉及资金操作，通常需要风险判断和人工审核。

如果用一个 Agent 硬做所有事情，问题是：上下文会很长，工具选择容易乱，业务判断链路不清楚，也很难解释为什么给出某个处理建议。

所以更适合用 LangGraph 把它拆成多 Agent 协作图。

---

### 6.2 Agent 拆分

可以这样拆：

```txt
Supervisor Agent
  - 识别意图
  - 判断风险等级
  - 决定路由

RAG Agent
  - 查询活动规则、计费规则、异常处理 SOP

User Agent
  - 查询用户状态、押金、黑名单、会员权益

Order Agent
  - 查询当前订单、历史订单、扣费记录、退款状态

Device Agent
  - 查询柜机在线状态、伞槽状态、设备上报事件

Refund Agent
  - 判断是否满足退款条件
  - 生成退款建议，不直接执行高风险操作

Reviewer / Human Review Node
  - 对退款、补偿、异常关单等高风险动作做人审

Writer Agent
  - 汇总事实，生成客服可读回复
```

这里的重点是：Agent 按业务职责拆，而不是为了炫技拆。每个 Agent 只负责一个稳定边界，工具权限也更容易控制。

---

### 6.3 图流程怎么走？

一个简化流程可以是：

```txt
用户问题
  ↓
Supervisor：识别 intent 和 riskLevel
  ├── 活动咨询 → RAG Agent → Writer
  ├── 借伞失败 → User Agent + Device Agent + Station Agent → Aggregator → Writer
  ├── 归还异常 → Order Agent + Device Agent + RAG Agent → Aggregator → Reviewer → Writer
  └── 退款争议 → Order Agent + Refund Agent + RAG Agent → Human Review → Writer
```

举个具体例子：

> 用户说：“我明明还伞了，为什么还在扣费？”

流程可以是：

1. Supervisor 判断 intent = `return_exception`，riskLevel = `medium`。
2. Order Agent 查询订单，发现订单仍是 `renting`。
3. Device Agent 查询设备事件，发现用户扫码后柜机有一次 `slot_closed` 上报，但订单系统没有收到归还成功回调。
4. RAG Agent 查询 SOP，找到“设备已上报但订单未关单”的处理规则。
5. Aggregator 合并事实：用户可能已归还，但订单状态未同步。
6. Reviewer 判断是否需要人工确认；如果只是建议客服处理，可以生成“请稍等，我们为你核实归还记录”的回复；如果要直接关单或退款，进入 Human Review。
7. Writer Agent 生成最终客服话术。

这样回答时就不是空泛说“多个 Agent 协作”，而是能把业务链路讲出来。

---

### 6.4 State 怎么设计？

业务落地时，State 不能只放 `messages`，需要结构化字段。

示例：

```ts
type UmbrellaSupportState = {
  userQuery: string;
  intent?: 'pricing' | 'borrow_failed' | 'return_exception' | 'billing_dispute' | 'refund';
  riskLevel?: 'low' | 'medium' | 'high';

  userInfo?: {
    userId: string;
    depositStatus?: string;
    accountStatus?: string;
  };

  orderInfo?: {
    orderId?: string;
    status?: string;
    rentStartTime?: string;
    billingAmount?: number;
  };

  deviceStatus?: {
    deviceId?: string;
    online?: boolean;
    slotStatus?: string;
    recentEvents?: string[];
  };

  retrievedDocs?: Array<{
    title: string;
    content: string;
    source: string;
  }>;

  refundDecision?: {
    eligible: boolean;
    reason: string;
    needHumanReview: boolean;
  };

  reviewResult?: {
    approved: boolean;
    reviewer?: string;
    reason?: string;
  };

  finalAnswer?: string;
};
```

这样设计有几个好处：

- Supervisor 可以根据 `intent` 和 `riskLevel` 路由。
- 每个 Agent 只写自己的字段，比如 Device Agent 只写 `deviceStatus`。
- Writer Agent 只读结构化事实生成回复，不需要重新猜业务状态。
- Reviewer 可以只看高风险字段，不需要翻完整聊天记录。
- checkpoint 恢复时，可以明确知道任务走到哪一步。

---

### 6.5 Agent 之间如何通信？

以“归还异常”为例：

```txt
Supervisor Agent
  update: { intent: 'return_exception', riskLevel: 'medium' }
  goto: 'order_agent'

Order Agent
  update: { orderInfo: { status: 'renting', orderId: 'xxx' } }
  goto: 'device_agent'

Device Agent
  update: { deviceStatus: { recentEvents: ['slot_closed'], online: true } }
  goto: 'rag_agent'

RAG Agent
  update: { retrievedDocs: [归还异常 SOP] }
  goto: 'aggregator'

Aggregator
  update: { diagnosis: '疑似设备事件已上报但订单未关单' }
  goto: 'reviewer'

Reviewer
  update: { reviewResult: { approved: false, reason: '需要人工确认后关单' } }
  goto: 'writer'
```

通信方式不是“Agent A 给 Agent B 发一句自然语言”，而是：

- 通过 State 传递业务事实；
- 通过 Command / 条件边传递控制权；
- 通过 checkpoint 保留中间状态；
- 通过 Reviewer / Human Review 控制高风险动作。

---

### 6.6 为什么这样拆有业务价值？

可以从四个角度讲：

1. **准确性**：不同 Agent 查询不同事实来源，减少一个 Agent 同时理解业务、查工具、写回复带来的混乱。
2. **可解释性**：最终回答能追溯到订单状态、设备事件、SOP 文档和审核结果。
3. **安全性**：退款、关单、补偿这类高风险动作不会由模型直接执行，而是进入 Reviewer / Human Review。
4. **可维护性**：后续新增“优惠券 Agent”或“网点库存 Agent”，只需要加节点和路由，不必重写整个 Agent Loop。

面试里可以总结成一句：

> 我们不是为了多 Agent 而多 Agent，而是因为业务本身存在多事实源、多风险等级和多处理分支，所以用 LangGraph 把它显式建模成可追踪、可恢复、可审核的协作图。

---

## 7. 项目中怎么讲？

如果面试官问：

> 你们在项目里如果用 LangGraph 做多 Agent，是怎么协作和通信的？

可以这样答：

> 我们会先按业务职责拆 Agent，而不是让多个模型自由聊天。比如公共雨伞客服里，用户可能问活动规则、借伞失败、归还异常、扣费争议或退款申请。Supervisor Agent 先识别 intent 和 riskLevel，然后路由到不同专业 Agent：RAG Agent 查规则和 SOP，User Agent 查用户状态，Order Agent 查订单，Device Agent 查柜机和伞槽事件，Refund Agent 判断退款条件，高风险动作进入 Human Review。  
> Agent 之间主要通过 LangGraph 的共享 State 通信。State 里会结构化保存用户问题、意图、订单状态、设备状态、召回文档、退款判断、审核结果和最终回复。每个 Agent 只写自己负责的字段，执行完后通过 Command 或条件边把控制权交给下一个节点。比如归还异常时，Order Agent 发现订单还在 renting，Device Agent 查到 slot_closed 事件，RAG Agent 找到 SOP，Aggregator 合并为“疑似订单未关单”，Reviewer 判断是否需要人工确认，最后 Writer 生成客服话术。  
> 这样做的好处是业务链路清晰、事实来源可追溯、可以 checkpoint 恢复，也能避免所有 Agent 共享完整上下文造成污染。LangGraph 负责图编排和状态流转；但工具权限、审计日志、长期记忆和高风险动作审批，还是要放到外层 Runtime 或业务服务里治理。

---

## 8. 高频追问

### Q1：LangGraph 多 Agent 和普通 Workflow 有什么区别？

普通 Workflow 的节点通常是确定性函数；LangGraph 多 Agent 的节点可以是 LLM Agent，会根据上下文做判断、调用工具或生成结果。但工程上仍然要用图和 State 限制它，不能让 Agent 完全自由发挥。

### Q2：Agent 之间是直接发消息吗？

不一定。最简单可以通过 messages，但更推荐通过结构化 State 通信。比如一个 Agent 写入 `retrievedDocs`，另一个 Agent 读取后生成答案；Reviewer 写入 `reviewResult`，Supervisor 根据结果决定结束还是返工。

### Q3：Supervisor 是固定规则还是 LLM？

可以是规则、LLM，也可以混合。生产里我更倾向混合：简单意图用规则保证稳定，复杂判断交给 LLM，但 LLM 输出要结构化，并经过条件边或 schema 校验后再路由。

### Q4：多个 Agent 并行时怎么避免冲突？

不要让多个 Agent 同时写同一个最终字段。每个 Worker 写自己的命名空间，比如 `workerOutputs.agentA`、`workerOutputs.agentB`，最后由 aggregator 统一合并。必要时 Reviewer 再做一致性检查。

### Q5：多 Agent 会不会增加成本和延迟？

会。所以不是 Agent 越多越好。只有任务确实需要专业分工、并行处理、审核校验或复杂路由时才拆 Agent。简单问答用单 Agent + 工具调用就够了。

### Q6：checkpoint 在多 Agent 协作里解决什么问题？

checkpoint 保存每一步图状态。长任务中断后，可以恢复到某个 thread 的最近状态，知道当前走到哪个 Agent、已经拿到哪些工具结果、下一步应该继续还是等待人工确认。但 checkpoint 不是长期记忆，长期偏好和知识沉淀要靠额外 Memory / RAG 系统。

### Q7：LangGraph 多 Agent 的局限是什么？

LangGraph 主要解决图编排、状态传递、checkpoint 和 interrupt。它不直接提供完整的权限审批、工具治理、长期记忆、多租户隔离、成本预算和审计平台。所以生产系统里通常要在外层加 Runtime 治理。

### Q8：什么时候不建议用多 Agent？

任务很简单、链路很短、工具很少、没有并行和审核需求时，不建议拆多 Agent。拆太细会增加 token 成本、延迟和调试复杂度，还可能让责任边界变模糊。

---

## 9. 背诵版

LangGraph 做多 Agent，我不会理解成多个模型随便聊天，而是一个有状态的业务协作图。业务上先按职责拆 Agent，比如公共雨伞客服里，可以拆 Supervisor、RAG、User、Order、Device、Refund、Reviewer 和 Writer。Supervisor 先识别用户是活动咨询、借伞失败、归还异常、扣费争议还是退款申请，再路由给对应专业 Agent。

Agent 之间主要通过共享 State 通信，而不是靠自然语言互聊。State 里结构化保存 intent、riskLevel、orderInfo、deviceStatus、retrievedDocs、refundDecision、reviewResult 和 finalAnswer。每个 Agent 只读写自己的字段，执行后通过 Command 或条件边更新状态并交接控制权。比如用户说“我已经还伞了为什么还在扣费”，Order Agent 查到订单仍是 renting，Device Agent 查到 slot_closed 事件，RAG Agent 查到异常 SOP，Aggregator 合并事实，Reviewer 判断是否需要人工确认，最后 Writer 生成客服回复。

这样拆的价值是业务链路清晰、事实来源可追溯、状态可以 checkpoint 恢复，也能避免所有 Agent 共享完整上下文导致污染。并行场景下，每个 Worker 写自己的结果字段，由 Aggregator 统一合并，避免多个 Agent 抢写 finalAnswer。

但 LangGraph 主要解决图编排和状态流转，不等于完整 Agent Runtime。权限审批、工具治理、长期记忆、成本预算、多入口接入和审计日志，仍然需要外层 Runtime 或业务服务来治理。所以我的结论是：LangGraph 适合把确定性较强的多分支业务流程显式建模，多 Agent 要围绕业务职责拆，而不是为了炫技堆 Agent。

---

## 10. 事实来源

- `memory/notes/daily-interview/2026-07-21-langgraph-pros-cons-replacement.md`：LangGraph 的 StateGraph、条件边、checkpoint、interrupt、stream，及其和 Agent Runtime 的边界。
- `memory/notes/agentloop-architecture.md`：Agent Loop、Tool Pipeline、Gateway、幂等恢复、工具治理等生产级 Agent Runtime 设计。
- `memory/notes/claude-code-vs-openclaw-six-pillars.md`：OpenClaw 在多工具、多会话、多渠道、权限、记忆、调度和多 Agent Runtime 上的定位。
