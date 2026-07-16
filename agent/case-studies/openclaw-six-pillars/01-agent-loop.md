# OpenClaw 六大支柱技术细节：01 Agent Loop

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：OpenClaw 在 Agent Loop 层的原理与工程细节

---

## 1. 核心定位

Agent Loop 是 Agent 的心跳。最小模型是：

```ts
while (true) {
  think();
  act();
  observe();
}
```

OpenClaw 没有从零写一个重型 Agent 框架，而是基于 **Pi / pi-agent-core** 来承载底层循环。

Pi 提供的是较薄的 Agent Loop：

- 消息格式
- 模型调用
- 工具调用入口
- 事件流输出
- 基础 session 骨架

OpenClaw 则在这个基础上叠加生产级能力：

- 流式响应
- 边说边执行
- 工具事件追踪
- 循环检测
- Provider fallback
- 上下文变换 hook
- 调度和权限策略

一句话：

> **Pi 负责让 Agent Loop 跑起来，OpenClaw 负责让它稳定、可控、可观测地跑。**

---

## 2. Pi 的事件流 Agent Loop

课程里提到，Pi 的 `agentLoop()` 返回的是：

```ts
EventStream<AgentEvent, AgentMessage[]>
```

本质上可以理解为一个 async generator。

它不是“调用一次，等完整结果返回”的黑盒，而是在执行过程中不断产生事件：

- `agent_start`
- `turn_start`
- `message_update`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`

这给 OpenClaw 提供了扩展点。

OpenClaw 可以在这些事件上做：

- UI 实时更新
- 工具执行状态展示
- 日志记录
- Hook 触发
- 结果清洗
- 错误处理
- 成本统计
- 可观测性采集

---

## 3. 边说边执行

OpenClaw 支持生产级 Agent 常见的“边说边执行”。

模型在流式输出时，如果工具调用块已经完整，底层 `pi-agent-core` 会触发：

```txt
tool_execution_start
```

工具不需要等整条 assistant message 全部生成完才开始执行。

执行前，OpenClaw 会先把已经缓存的文字推给用户，避免工具执行打断用户可见输出。

这解决两个问题：

1. **降低等待感**：用户能更早看到 Agent 的思考和动作。
2. **提高吞吐**：工具调用和文本生成不必完全串行。

---

## 4. Chunked Reply：智能分段推送

OpenClaw 没有把每个 token 都立即推给前端或聊天平台。

原因：

- token 级更新会导致 UI 闪烁
- Slack / Telegram / Discord 等平台有更新频率限制
- 每个 token 一次消息更新成本太高
- Markdown 可能被切坏，尤其是代码块

OpenClaw 的做法是：设置缓冲区，攒够一定内容后，在自然边界切分。

优先级：

1. 段落边界：两个换行
2. 句子边界：句号等
3. 空白字符
4. 超过上限强制切分

如果强制切到代码块中间，OpenClaw 会先临时关闭代码块，下一段再重新打开，保证 Markdown 渲染正常。

这属于 Loop 层和消息通道层之间的体验优化。

---

## 5. 多 Provider 流式适配

OpenClaw 支持多个模型 Provider：

- Anthropic
- OpenAI
- Google Gemini
- Ollama / 本地模型
- 其他兼容供应商

不同 Provider 的流式协议差异很大：

| Provider | 流式特点 |
|---|---|
| Anthropic | SSE，带明确 event 类型，如 `content_block_delta` |
| OpenAI | SSE，但通常只有默认 message，需要从 JSON 判断事件 |
| Gemini | 数据块较大，附带 safety 信息 |
| 工具调用 | JSON delta 字段路径各家不同 |

OpenClaw 的做法是实现 **流适配器**：

> 把不同 Provider 的流式协议转换为统一内部事件格式。

这样上层 Agent Loop 不需要关心不同厂商的协议细节。

---

## 6. 循环保险丝

生产级 Agent Loop 不能相信模型自己一定会停。

课程里提到 OpenClaw 设计了四种死循环检测器：

| 检测器 | 识别的问题 |
|---|---|
| Generic Repeat | 同一个工具反复调用 |
| Known Poll | 无进展轮询 |
| Ping-Pong | 两个工具来回交替调用 |
| 全局熔断 | 重复次数过多，强制停止 |

### 6.1 调用指纹

OpenClaw 会对工具名和参数生成哈希指纹。

如果多次调用的：

- 工具名相同
- 参数相同
- 指纹相同

就可能是重复调用。

### 6.2 结果指纹

只看调用还不够。

因为有些轮询工具虽然参数相同，但返回结果可能在变化。

所以 OpenClaw 不只记录调用指纹，也记录结果指纹。

只有：

```txt
同样的调用 + 同样的结果
```

才更可能判定为“无进展”。

### 6.3 全局熔断

如果局部检测没拦住，OpenClaw 还有全局重复次数上限，例如 30 次重复强制停止。

这体现的是：

> Agent Loop 的退出不能完全依赖模型 stop signal，系统外层必须有安全网。

---

## 7. API 容错与 Provider fallback

课程材料里提到，OpenClaw 支持比普通 retry 更复杂的模型 API 容错。

它会把错误分得比“可重试 / 不可重试”更细。

例如：

- 429 限流
- 5xx 服务错误
- 流式中断
- 上下文超限
- Provider 不可用
- 模型不可用

OpenClaw 不只是简单 sleep 后重试，而是可以：

1. 先尝试同 Provider 的其他模型
2. 再尝试其他 Provider
3. 根据错误类型决定是否 fallback
4. 在预算内做多次尝试

这也是 Agent Loop 稳定性的组成部分。

---

## 8. 面试表达

可以这样说：

> OpenClaw 的 Agent Loop 底层基于 Pi 的 `agentLoop`，它是事件流模型，不是黑盒调用。Loop 在模型输出、工具开始、工具结束等节点抛事件，OpenClaw 基于这些事件实现边说边执行、Chunked Reply、多 Provider 流式适配、工具状态追踪和循环保险丝。它的关键思想是：Agent Loop 不只是 `while(true)`，还要处理流式、异常、重试、熔断、用户反馈和可观测性。

---

## 9. 关键词

- Pi
- `pi-agent-core`
- `agentLoop()`
- EventStream
- async generator
- `message_update`
- `tool_execution_start`
- Chunked Reply
- 流适配器
- Provider fallback
- Generic Repeat
- Known Poll
- Ping-Pong
- 全局熔断
