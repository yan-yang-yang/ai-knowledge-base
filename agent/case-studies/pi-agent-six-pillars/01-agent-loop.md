# Pi 六大支柱技术细节：01 Agent Loop

> 基于源码复核，不以设计文档替代实现证据。
> 固定版本：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`。
> 仓库 remote 为 GitClone 镜像；链接使用对应的 `earendil-works/pi` GitHub 仓库。

---

## 1. 核心定位：先区分三层

Pi 不是只有一个名为 Agent 的大循环。
理解源码时，先把通用执行器、编码会话和持久化执行模型分开。

| 层次 | 主要入口 | 本文讨论的职责 |
|---|---|---|
| agent core | `Agent`、`runAgentLoop` | 消息、模型流、工具批次、队列和边界钩子 |
| coding-agent | `AgentSession` | 扩展事件、会话保存、压缩、重试和提示词刷新 |
| durable harness | `AgentHarness`、`driveOperation` | 持久化阶段、效果意图、恢复和取消协调 |

前两层有直接调用关系：`AgentSession` 包装 `Agent`。
较新的 harness 有独立状态和驱动过程，不能把它的恢复语义移植到旧循环的描述中。
同仓库 `packages/durable` 的 Pico5 也需要单独辨认：当前公开导出是记录契约和 `MemoryStorage`。
其规范和 handoff 文档中列出的完整运行时，不等于这个 commit 已实现的公开 API。

## 2. 一次 run 和一个 turn 有什么区别

`runAgentLoop` 先复制上下文消息数组，加入本次 prompts，再发出生命周期事件。
本次调用产生的消息单独放进 `newMessages`，不会把全部旧历史作为返回值。
`runAgentLoopContinue` 则复用当前上下文，不额外添加 prompt。

一个 turn 包含一次 assistant 响应，以及该响应对应的整批工具结果。
一个 run 可以包含很多 turn；连续工具调用、steering 和 follow-up 都可能让它继续。
因此，`turn_end` 不是任务结束，`agent_end` 才是本次 core run 的结束。
在 coding-agent 中，`agent_end` 后仍可能重试或压缩恢复，最后还存在 `agent_settled` 边界。

## 3. 双层循环：工具延续与任务续接

`runLoop` 的内层处理工具调用和 steering，外层处理 follow-up。
初始 `hasMoreToolCalls = true`，保证即使没有队列消息也请求一次模型。
每次完整响应后识别工具块，执行结果写回上下文，再决定是否生成下一次响应。

以下是简化伪代码，省略事件和错误转换，不是可直接运行的源码：

```ts
pending = drainSteering();
while (true) {
  moreTools = true;
  while (moreTools || pending.length > 0) {
    if (lastTurn) refreshBeforeNextTurn(lastTurn);
    append(preparedMessages, pending);
    assistant = await streamWholeResponse();
    if (isErrorOrAborted(assistant)) return;
    results = await executeOrFailToolBatch(assistant);
    append(results);
    lastTurn = { assistant, results, context };
    if (await shouldStopAfterTurn(lastTurn)) return;
    moreTools = results.batchContinues;
    pending = drainSteering();
  }
  pending = drainFollowUp();
  if (pending.length === 0) break;
}
```

steering 在内层轮次边界注入，follow-up 在模型本来会停下来时注入。
这支持“修正当前执行方向”和“当前任务后再执行下一件事”两种交互。
它不意味着任意时刻打断正在进行的文件写入。
`Agent` 的两类队列默认都是 `one-at-a-time`，可切换到一次排空的模式。

## 4. 下一轮准备是明确的可扩展边界

首轮之前不调用 `prepareNextTurn`；有 `lastCompletedTurn` 后才进入下一轮刷新。
返回值可以替换 context、追加 messages、切换 model 或 thinking level。
这比在工具函数内部偷偷修改全局提示词更容易维护。

准备工作可能耗时，例如触发压缩。
如果之前没有取到 steering，准备结束后会再次查询，接住等待期间新到的输入。
如果已经有一条 pending，则不再取第二条，避免破坏 `one-at-a-time` 的语义。
这是一个很小但很实际的队列公平性细节。

coding-agent 的 `_installAgentNextTurnRefresh` 使用这个边界：

1. 检查是否需要在下一次 assistant 请求前压缩。
2. 调用原先安装的准备钩子。
3. 根据当前工具、提示词配置构建增量 system message。
4. 返回当前工具集合、模型和 thinking level。

## 5. 流式显示，不等于流式工具执行

`streamAssistantResponse` 持续消费 provider 事件。
`start` 将 partial assistant 放入上下文，delta 事件替换末尾 partial 并发出 `message_update`。
`done` 或 `error` 用最终消息替换 partial，并发出 `message_end`。

工具执行发生在 `streamAssistantResponse` 返回之后。
所以本版本 core 是“模型输出流式可见，完整响应后执行工具批次”。
不能据此声称 `toolcall_end` 一出现就执行那个工具。

这项取舍让运行时可以先检查整个 assistant 的 `stopReason`。
若响应以 `length` 截断，即使 JSON salvage 得到了看似合法的参数，也不会执行任何工具。
`failToolCallsFromTruncatedMessage` 将每个调用转换成错误结果，要求模型重新提交完整参数。
避免“语法校验通过，但参数在语义上只生成了一半”的副作用。

## 6. 工具批次如何让循环结束

工具调度的详细机制见第二篇，这里关注对循环的影响。
有工具调用通常会继续下一 turn，让模型观察工具结果。
但只有本批全部已完成结果都设置 `terminate === true`，才触发批次终止。
单个工具拒绝执行，并不自动让混合批次整体结束。

此外，宿主可通过 `shouldStopAfterTurn` 在完整 turn 边界结束 run。
这适合实现轮次、费用或任务预算，但源码不能因此被描述成默认已有这些预算策略。
core 本身没有在该循环里写死统一的最大轮次和成本上限。

## 7. 错误、取消和继续的契约

assistant 的 `error` 或 `aborted` 会立即产生 `turn_end` 和 `agent_end`。
一般工具异常则被转换为 `isError` 工具结果，允许模型下一轮解释或调整。
取消信号传给 provider 和工具，实际结束速度取决于工具是否合作响应信号。

`agentLoopContinue` 拒绝空上下文，也拒绝直接从 assistant 消息继续。
因为 provider 通常需要最后是 user 或 toolResult 的有效续接上下文。
自定义消息能否转换成这些角色，只能在 `convertToLlm` 边界确定。

`StreamFn` 明确要求请求失败通过事件流和最终错误消息表达，不能直接抛出。
`convertToLlm` 也有不得抛出、应返回安全兜底值的契约。
破坏这些契约会中断低层循环，不能假设所有宿主错误都有正常结束事件。

## 8. coding-agent 如何补上恢复编排

`_runAgentPrompt` 调用 `agent.prompt`，随后通过 `_handlePostAgentRun` 判断是否 `agent.continue`。
可重试错误先进入 `_prepareRetry`；随后检查 compaction；最后处理结束事件中新排入的消息。
因此网络容错是会话层编排，不能归纳为 `runLoop` 自带所有恢复能力。

`_handleAgentEvent` 在 `message_end` 将普通消息追加到 session。
partial delta 通常只服务实时显示，不能据此声称 JSONL 保存了每个流式 token。
`turn_end` 后刷新等待中的 custom messages，避免把自定义上下文插在 tool call 和结果之间。

阈值压缩可以在下一轮请求前执行。
溢出恢复则在失败后删除内存中的失败尾部、压缩并有限续接。
历史审计记录与下一次请求的有效上下文可以不同，第三篇会展开这个区别。

## 9. durable harness：把程序计数器保存下来

`driveOperation` 根据 `operation.state.at` 分派到实际过程：
`starting`、`checkpoint`、`assistant.ready`、`assistant.effect_pending`、`tools` 等。
压缩和导航也有自己的阶段，而非藏在一个无法恢复的 async 调用栈中。

```ts
for (;;) {
  state = lane.state.operation.state;
  if (state.control.status === "cancel_requested") reconcile();
  else await dispatch(state.at);
  if (settled || waiting) return outcome;
  if (nextState === state) throw invariantError;
}
```

`publishGenerationIntent` 先提交 `assistant.effect_pending` 和预留输出 ID，再调用 provider。
崩溃后驱动遇到这个阶段，会调用 `recoverAssistantGeneration`。
它读取已提交的 partial frames，合成 interrupted error，再通过 `publishResponse` 结算。
此恢复过程不会为了补齐旧请求再调用一次 provider。

工具恢复则区分可安全重放与未知副作用，见第二篇。
持久化阶段不是“所有外部效果恰好执行一次”的证明。
真正的耐久性还取决于所用 session storage 的提交实现和宿主部署方式。

## 10. 工程取舍与面试表达

core 保持较小的执行协议，让宿主决定重试、审批、预算和持久化。
coding-agent 把编码工作流装在会话层，便于 CLI、SDK 和扩展共享机制。
harness 用更多持久化状态换取恢复边界的明确性，也增加状态兼容和存储开销。

**面试回答：**

> Pi core 的 run 是双层循环：内层延续工具和 steering，外层接 follow-up。
> 每个 turn 先完整消费模型流，再校验执行工具并写回结果。
> 下一轮准备钩子允许会话层刷新上下文、模型和工具。
> coding-agent 负责保存会话、重试和压缩；较新的 harness 则保存操作阶段，显式处理孤儿请求和工具效果恢复。
> 这三层的能力边界要分开，不能把 session JSONL 等同于耐久执行状态机。

**追问：为什么不能在收到工具块时立即执行？**

本实现需要检查最终截断状态；提前执行可能让不完整响应中的参数产生真实副作用。
若要更低延迟，需要额外定义单调用完成协议和截断后的效果处置，不能只改事件监听器。

**追问：有了恢复，为什么还不能承诺 exactly-once？**

本地 intent 和远端效果之间没有天然分布式事务；远端成功、本地结果未提交时仍存在不确定窗口。

## 11. 源码证据

以下链接全部固定到本文核验 commit，路径从 Pi 仓库根目录开始。

- [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/agent-loop.ts)：`runLoop`、`streamAssistantResponse`、`failToolCallsFromTruncatedMessage`。
- [`packages/agent/src/agent.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/agent.ts)：`Agent` 的队列默认值和下一轮钩子连接。
- [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/types.ts)：`StreamFn`、`AgentLoopTurnUpdate`、`ShouldStopAfterTurnContext`。
- [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/agent-session.ts)：`_installAgentNextTurnRefresh`、`_handleAgentEvent`、`_handlePostAgentRun`。
- [`packages/agent/src/harness/runtime/drive.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/drive.ts)：`driveOperation`。
- [`packages/agent/src/harness/runtime/drive/generation.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/drive/generation.ts)：`publishGenerationIntent`、`runGeneration`。
- [`packages/agent/src/harness/runtime/drive/recovery.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/drive/recovery.ts)：`recoverAssistantGeneration`。
- [`packages/durable/src/index.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/durable/src/index.ts)：实际公开导出；完整 Pico5 设计不能由此宣称已实现。
