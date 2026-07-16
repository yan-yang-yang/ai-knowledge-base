# OpenClaw Agent Loop：3 分钟精讲版

如果面试官问我：**OpenClaw 的 Agent Loop 是怎么设计的？**

我会先说结论：

**OpenClaw 的 Agent Loop 底层不是自己从零写的重框架，而是基于 Pi / `pi-agent-core` 这个轻量 Agent 引擎。Pi 负责最小循环，OpenClaw 在上面补齐流式响应、工具事件、循环保险丝、Provider fallback、可观测性这些生产级能力。**

---

最小 Agent Loop 其实很简单：

```ts
while (true) {
  think();
  act();
  observe();
}
```

也就是模型先思考，然后决定要不要调用工具，工具执行完之后把结果放回上下文，再进入下一轮。

但真实生产环境里的 Agent Loop 远不止这个。因为你会遇到很多问题：

- 模型输出是流式的，怎么实时展示？
- 工具调用什么时候开始执行？
- 工具执行状态怎么通知用户？
- 模型死循环怎么办？
- API 限流或挂了怎么办？
- 不同模型 Provider 的流式协议不一样怎么办？

OpenClaw 的设计就是围绕这些问题展开。

---

## 1. OpenClaw 的 Loop 是事件流模型

Pi 的 `agentLoop()` 返回的不是一个普通结果，而是类似：

```ts
EventStream<AgentEvent, AgentMessage[]>
```

可以理解成 async generator。

它在执行过程中不断抛事件，比如：

- `agent_start`
- `turn_start`
- `message_update`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`

这就让 OpenClaw 可以在每个关键节点插入自己的逻辑，比如 UI 更新、日志记录、Hook、结果清洗、错误处理、成本统计和可观测性采集。

所以它不是一个黑盒循环，而是一个**可观察、可扩展的事件驱动循环**。

---

## 2. OpenClaw 支持边说边执行

普通实现可能会等模型整段输出结束后，再解析工具调用、执行工具。

但 OpenClaw 在流式过程中，只要工具调用块已经完整，底层 `pi-agent-core` 就会触发：

```txt
tool_execution_start
```

工具可以立刻开始执行，不用等 assistant message 全部生成完。

同时，OpenClaw 会先把已经缓存的文字推给用户，避免工具执行打断可见输出。

这个设计解决两个问题：

1. 用户不用等很久，能更早看到 Agent 在做什么。
2. 工具执行和文本生成不用完全串行，整体响应更快。

这就是生产级 Agent 常说的 **streaming + early tool execution**。

---

## 3. OpenClaw 做了 Chunked Reply 智能分段推送

模型是一个 token 一个 token 输出的，但 OpenClaw 不会每个 token 都推给前端或消息平台。

因为这样会导致：

- UI 闪烁
- 消息平台 API 限流
- Markdown 被切坏
- 代码块显示异常

所以 OpenClaw 会设置缓冲区，攒够一定内容后在自然边界切分。

切分优先级是：

1. 段落边界
2. 句子边界
3. 空白字符
4. 超过上限强制切分

如果切到代码块中间，它还会临时关闭代码块，下一段再重新打开，保证 Markdown 渲染正常。

这个点看起来像体验优化，但在 Slack、Telegram、Discord 这类平台上很关键。

---

## 4. OpenClaw 抹平了多 Provider 的流式协议差异

不同模型厂商流式协议不一样：

- Anthropic 的 SSE 有明确 event 类型
- OpenAI 需要从 JSON 里判断事件
- Gemini 的数据块和 safety 信息又不一样
- 工具调用的 JSON delta 字段路径也不同

OpenClaw 的做法是写一层**流适配器**，把不同 Provider 的协议统一成内部事件格式。

这样上层 Agent Loop 不需要关心底层到底是 Anthropic、OpenAI、Gemini 还是本地模型。

这就是典型的适配层设计：**复杂性下沉，Loop 逻辑保持稳定。**

---

## 5. OpenClaw 有循环保险丝

生产级 Agent 不能相信模型自己一定会停。

OpenClaw 设计了几类死循环检测：

- **Generic Repeat**：同一个工具反复调用
- **Known Poll**：无进展轮询
- **Ping-Pong**：两个工具来回交替调用
- **全局熔断**：重复次数过多，直接强制停止

它会对工具名和参数生成调用指纹，也会对工具结果生成结果指纹。

为什么要结果指纹？

因为有些轮询工具参数一样，但结果可能在变化。只有“同样的调用 + 同样的结果”，才说明更可能是无进展。

这体现了一个核心原则：

> Agent Loop 的退出不能完全依赖模型的 stop signal，系统外层必须有安全网。

---

## 6. OpenClaw 有 API 容错和 Provider fallback

真实环境里模型 API 会出问题，比如：

- 429 限流
- 5xx 服务错误
- 流式中断
- 上下文超限
- Provider 不可用
- 模型不可用

OpenClaw 不是简单 sleep 然后 retry，而是会根据错误类型决定策略。

比如：

1. 先尝试同 Provider 的其他模型
2. 再尝试其他 Provider
3. 根据错误类型决定是否 fallback
4. 在重试预算内多次尝试

所以它的 Loop 稳定性不是靠“模型稳定”，而是靠外层系统工程兜底。

---

## 收束表达

最后可以收束成一句话：

**OpenClaw 的 Agent Loop 不是一个简单 `while(true)`，而是一个基于 Pi 的事件流运行时。Pi 提供最小循环，OpenClaw 在上层实现边说边执行、智能分段推送、多 Provider 流式适配、工具状态追踪、循环保险丝和 API fallback。它的核心思想是：Agent Loop 不只是让模型一轮轮跑，而是让这个循环在真实生产环境里可观察、可控制、可恢复。**
