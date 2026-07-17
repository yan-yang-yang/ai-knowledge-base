# Agent 框架与技术选型

> 来源：`/root/ai-text/1/2026-年了，你的-Agent-架构还停留在-LangChain.md`、`/root/ai-text/7/` Sitor「吃透 AI Agent 开发」课程材料。  
> 用途：用六大支柱评估 Agent 框架，而不是只比较 API 风格。

---

## 0. 一句话总结

**Agent 框架选型不能只看“有没有封装 LLM 调用”，而要看它在 Agent Loop、Tool System、Context Engineering、Memory、Multi-Agent、Harness 六大支柱上分别提供了多少生产能力。**

---

## 1. LangChain：链条模型的历史价值与局限

课程对 LangChain 的态度不是全盘否定。

LangChain 做对的事：

- 早期降低了 LLM 应用开发门槛。
- 把 Prompt、Model、Tool、Retriever 等概念模块化。
- 带动了生态和教程传播。

但问题在于：

- Chain 模型更适合固定流程。
- Agent 的下一步由模型动态决定，不适合被静态链条约束。
- 抽象层多，真实生产问题仍要自己处理。
- 从 prototype 到 production 有鸿沟。

课程的核心判断：**Agent 更像运行时循环，不是固定链条。**

---

## 2. LangGraph：用图重新理解 Agent Loop

LangGraph 的方向更接近 Agent。

课程实战里用 StateGraph 展开：

- State：保存当前任务状态。
- Node：模型节点、工具节点等。
- Edge：节点之间的流转关系。
- Router：根据模型输出决定下一步。
- checkpoint / interrupt：支持人工审核和恢复。
- streaming：逐 token 返回。
- max turns：加入保险丝。

LangGraph 解决了：

- 状态显式化。
- 分支和循环表达。
- 审批和 checkpoint。

但课程也提示：LangGraph 仍然比较重，适合复杂、可建模成图的流程；如果是高度定制的 Coding Agent 或多渠道 runtime，很多团队会选择更薄的内核或手写。

---

## 3. Claude Code：深度手写 Coding Agent

Claude Code 的特点：

- 核心逻辑高度自研/手写。
- 重点服务本地代码开发。
- Agent Loop、Tool System、Context Engineering、Memory、Multi-Agent、Harness 都围绕 coding workflow 优化。
- 工具包括 Read/Edit/Write/Bash/Grep/Glob 等。
- 上下文管理重视 CLAUDE.md、Agentic Search、压缩和 Prompt Cache。
- Harness 强调权限、Bash 风险、Hook、JSONL transcript。

适合学习的点：

> 生产级 Agent 的复杂度不在“调模型”，而在模型外面的工具、上下文、安全、状态和恢复。

---

## 4. OpenClaw：Pi 薄内核 + Agent Runtime

课程把 OpenClaw 归为“薄框架 + 自研 runtime”路线。

特点：

- 底层 Pi 提供轻量 Agent Loop。
- 上层扩展多渠道、多 session、多工具 runtime。
- Tool Profile / Tool Group 做工具治理。
- Context Engineering 处理长会话、工具结果和结构化摘要。
- Memory 使用 SQLite + sqlite-vec + FTS5 混合检索。
- Multi-Agent 使用 subagents、Announce Queue、Lane 调度。
- Harness 关注 Gateway、权限、Hook、调度、节点边界。

适合场景：

- 私人 Agent
- 多渠道消息入口
- 需要调度、节点、浏览器、文件、消息等工具系统

---

## 5. OpenAI Agents SDK / Mastra / Pi 等

课程在框架全景里建议用六大支柱透视任何框架。

### 5.1 OpenAI Agents SDK

课程提到它可以理解为 Swarm 思路的生产版，关键词包括：

- Agent：带指令和工具的 LLM 实例。
- Handoff：Agent 之间控制权转交。
- Guardrail：安全护栏。

### 5.2 Mastra

课程把 Mastra 归为 TypeScript 领域的全栈选择，适合关注 TS 生态、工程集成和应用开发体验的场景。

### 5.3 Pi

Pi 是 OpenClaw 底层的 Agent 引擎，代表“薄 Agent Loop 内核”路线：底层保持简单，上层 runtime 自己扩展工具、上下文、权限和调度。

---

## 6. 框架评估清单：六个问题 + 一条红线

评估一个 Agent 框架时，可以问：

1. **Agent Loop**：是否支持循环、工具调用、流式、退出路径和保险丝？
2. **Tool System**：工具 schema、校验、权限、MCP、工具选择机制是否完整？
3. **Context Engineering**：是否支持压缩、检索、缓存、上下文隔离？
4. **Memory**：是否有长期记忆、检索、清理、冲突处理？
5. **Multi-Agent**：是简单角色扮演，还是有真正的上下文隔离和协调机制？
6. **Harness**：权限、Hook、观测、沙箱、调度、成本控制是否生产可用？

一条红线：

> 如果框架让模型输出直接进入高风险工具执行，而没有权限、审批和审计机制，不适合生产使用。

---

## 7. 面试表达

### 7.1 两分钟回答版

> 我不会只按 API 简洁程度选 Agent 框架，而会按六大支柱评估。LangChain 的历史价值是降低 LLM 应用开发门槛，但 Chain 模型更适合固定流程，不太适合下一步由模型动态决定的 Agent。LangGraph 用 StateGraph、Node、Edge、Router、checkpoint 和 interrupt 把 Agent Loop 显式图建模，方向更接近 Agent，但对一些高度定制场景仍然偏重。Claude Code 代表深度手写 Coding Agent，围绕本地代码开发把 Loop、工具、上下文、记忆、多 Agent 和 Harness 都做深。OpenClaw 代表薄内核加 runtime 的路线，底层 Pi 提供 Agent Loop，上层做多渠道、多 session、工具治理、记忆检索和调度。选型时我会看框架是否提供生产级 Loop、工具权限、上下文治理、长期记忆、多 Agent 协调和 Harness 安全网，而不是只看 demo 写起来快不快。

### 7.2 高频追问

#### Q1：LangGraph 什么时候适合？

适合流程可以建模成图、需要显式状态、分支、checkpoint、人工审核的任务，比如 Research Agent、审批流、多步骤业务流程。

#### Q2：什么时候不该用重框架？

如果产品需要深度定制工具管线、权限系统、上下文压缩、UI 流式体验或多渠道 runtime，重框架可能挡路，薄内核或手写更灵活。

#### Q3：为什么说学习六大支柱比学习某个框架更重要？

因为框架会变，但 Agent 的核心问题稳定存在：循环、工具、上下文、记忆、协作、安全运行。掌握六大支柱才能迁移到任何框架。

---

## 8. 关键词速记

- LangChain
- LangGraph
- StateGraph
- checkpoint / interrupt
- Claude Code
- OpenClaw
- OpenAI Agents SDK
- Handoff
- Guardrail
- Mastra
- Pi
- 六大支柱评估法
