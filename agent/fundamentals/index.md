# Agent 基础认知

> 来源：`/root/ai-text/1/`、`/root/ai-text/8/` Sitor「吃透 AI Agent 开发」课程材料。  
> 用途：建立 Agent 工程学习的底层认知：Agent 到底比 ChatBot 多了什么，以及为什么六大支柱是主线。

---

## 0. 一句话总结

**Agent 的本质不是“会聊天的模型”，而是一个围绕模型构建的执行循环：模型在循环中观察上下文、决定动作、调用工具、接收结果，并持续推进任务。**

---

## 1. 从 ChatBot 到 Agent：谁在开车

课程里把 AI 产品形态分成三类：

| 形态 | 决策方式 | 用户角色 | 典型特点 |
|---|---|---|---|
| ChatBot | 用户问，模型答 | 提问者 | 一问一答，不主动推进任务 |
| Copilot | AI 给建议，人类拍板 | 驾驶员 | AI 辅助，人类控制关键动作 |
| Agent | AI 自己规划和执行，人类监督 | 副驾/监督者 | 可以多轮调用工具并推进目标 |

Agent 和 ChatBot 的关键差别不在模型本身，而在外层系统是否有：

- 循环
- 状态
- 工具
- 反馈
- 退出条件
- 权限和安全边界

---

## 2. Agent 的最小模型：while 循环

最小 Agent 可以抽象成：

```ts
while (true) {
  const response = await llm.chat(messages)

  if (!response.toolCalls?.length) {
    return response.text
  }

  for (const call of response.toolCalls) {
    const result = await runTool(call)
    messages.push(result)
  }
}
```

这段循环说明了 Agent 的核心机制：

1. 模型读取当前上下文。
2. 模型决定是否调用工具。
3. 应用层执行工具。
4. 工具结果回写上下文。
5. 模型基于新观察继续下一轮。

但真实生产系统不会只有这几行。课程强调：真实 Agent Loop 会扩展出流式响应、工具解析、权限审批、状态追踪、上下文压缩、死循环检测、Token 预算、API 容错等能力。

---

## 3. 六大支柱：学习 Agent 的主线

课程把 Agent 工程拆成六大支柱：

| 支柱 | 解决的问题 | 典型关键词 |
|---|---|---|
| Agent Loop | Agent 如何持续行动、何时停止 | while loop、tool call、exit path、fuse |
| Tool System | Agent 如何获得行动能力 | Function Calling、MCP、Skills、权限 |
| Context Engineering | Agent 如何看到正确的信息 | prompt、compression、JIT context、cache |
| Memory | Agent 如何跨会话保留经验 | MEMORY.md、向量库、混合检索、记忆失效 |
| Multi-Agent | 复杂任务如何拆分上下文 | parent-child、swarm、worktree、queue |
| Harness Engineering | 模型外面的安全和运行环境 | hook、observability、sandbox、scheduler、ACP |

这六大支柱不是互相孤立的。比如：

- Tool System 会影响 Context，因为工具 schema 会占 token。
- Memory 是 Context Engineering 的长期化版本。
- Multi-Agent 本质上是一种 Context Isolation。
- Harness 会包住 Loop、Tool、Memory、Multi-Agent，提供权限、安全、观测和调度。

---

## 4. 大模型底层机制为什么重要

课程在认知校准里强调，做 Agent 不能只会调 API，还要知道模型底层机制对工程设计的影响：

- Tokenization：中文 prompt 会被拆成 token，影响成本和上下文长度。
- 自回归生成：模型是一个 token 一个 token 生成，因此天然适合流式输出。
- Attention / KV Cache：上下文越长，计算和缓存压力越大，不是越长越好。
- Logits / Softmax / Sampling：模型输出有概率性，因此工具参数、结构化输出和权限系统不能完全相信模型。

这些机制会直接影响 Agent 设计：

- 要做流式响应，而不是等整段生成完。
- 要控制上下文长度，不能无限塞材料。
- 要用 schema / validator 约束工具调用。
- 要有重试、截断恢复和退出条件。

---

## 5. 框架认知：不要把 Agent 理解成链条

课程对 LangChain / LangGraph / Claude Code / OpenClaw 的讨论给出一个判断：

- 传统 Chain 思路适合确定流程，不适合动态 Agent。
- Agent 更像运行时循环，不是固定 DAG。
- LangGraph 用图重新表达 Agent Loop，方向更接近 Agent，但抽象仍较重。
- Claude Code 选择深度手写，适合本地 Coding Agent。
- OpenClaw 用 Pi 做薄内核，上层自研 runtime，适合多渠道 Agent Runtime。

所以学习重点不应该是“背某个框架 API”，而应该是用六大支柱理解任何 Agent 框架。

---

## 6. 面试表达

### 6.1 两分钟回答版

> 我理解 Agent 和 ChatBot 最大的区别是外层系统。ChatBot 基本是一问一答，而 Agent 有一个持续执行的循环：模型读取上下文，决定是否调用工具，应用层执行工具，把结果写回上下文，再进入下一轮，直到完成、超时、预算不足或被用户中断。这个最小循环看起来像 while true，但生产级 Agent 会复杂很多，需要流式响应、工具校验、权限审批、上下文压缩、死循环检测、Token 预算、API 容错和可观测性。所以我会用六大支柱理解 Agent：Agent Loop 负责行动闭环，Tool System 负责行动能力，Context Engineering 负责让模型看到正确的信息，Memory 负责长期经验，Multi-Agent 负责上下文隔离和协作，Harness Engineering 负责安全、观测、调度和运行环境。

### 6.2 高频追问

#### Q1：Agent Loop 为什么不是普通业务循环？

因为每一轮的下一步由模型动态决定，工具调用次数、顺序和退出时机都不固定。应用层必须处理模型输出的不确定性、工具副作用、上下文膨胀和异常恢复。

#### Q2：为什么说 Multi-Agent 不是简单分角色？

课程强调 Multi-Agent 的核心是分上下文。拆子 Agent 的价值在于让探索过程、试错过程和长任务状态不污染主上下文，而不是让多个角色互相聊天。

---

## 7. 关键词速记

- ChatBot / Copilot / Agent
- while loop
- tool call / tool result
- 六大支柱
- Context Engineering
- Harness
- 状态追踪
- 退出条件
- 权限和安全边界

---

## 8. 继续阅读

- [OpenClaw 六大支柱技术细节](../case-studies/openclaw-six-pillars/)
- [Claude Code 六大支柱技术细节](../case-studies/claude-code-six-pillars/)
- [Claude Code vs OpenClaw 六大支柱横向对比](../case-studies/claude-code-vs-openclaw-six-pillars/)
