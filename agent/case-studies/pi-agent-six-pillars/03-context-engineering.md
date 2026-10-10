# Pi 六大支柱：03 Context Engineering

> 源码基线：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`
> 核心源码：`packages/agent/src/agent-loop.ts`、`packages/agent/src/agent.ts`、`packages/coding-agent/src/core/system-prompt.ts`、`agent-session.ts`

## 1. 一句话定位

**Pi 不把上下文当成静态 messages 数组，而是在每次模型调用前经过系统提示词分段、工具集同步、会话树投影、扩展变换和压缩，生成当前请求真正需要的上下文。**

## 2. 三个上下文层次

| 层次 | 数据 | 作用 |
|---|---|---|
| Core runtime | `AgentContext { messages, tools }` | 驱动 Loop 与工具调用 |
| Coding Agent session | JSONL entry tree + system prompt sections | 保存完整历史并投影当前分支 |
| Provider request | `transformContext -> convertToLlm -> normalizeContext` | 生成最终模型输入 |

因此必须区分“磁盘保存了什么”和“本轮模型看到了什么”。完整 session tree 可以保留旧分支和压缩前历史，而 provider 只看到当前 leaf 对应的有效上下文。

## 3. 模型调用前的管线

`streamAssistantResponse()` 中的顺序非常清楚：

```text
context.messages
  -> transformContext()       // AgentMessage -> AgentMessage
  -> convertToLlm()           // 转 provider 通用消息
  -> normalizeContext()       // 规范消息形态
  -> streamFn(model, context) // 发起流式调用
```

`transformContext` 适合做临时投影，不一定写回 session；`convertToLlm` 负责自定义消息类型到模型消息的边界转换。

这个设计允许 transcript 保存 UI/业务需要的信息，而不是强迫所有内部消息都直接发送给 LLM。

## 4. 结构化 System Prompt

Coding Agent 的 `buildSystemPromptSections()` 把提示词拆为独立区段：

- `preamble`：角色和基本定位；
- `tools`：当前可见工具说明；
- `rules`：工具和编码规则；
- `docs`：Pi 自身文档入口；
- `project_context`：项目级上下文文件；
- `skills`：可用 Skill 清单；
- `cwd`：当前工作目录；
- Extension 自定义 sections。

非 preamble 区段使用 XML 风格标签包裹。`diffSystemPromptSections()` 只生成变化部分的 patch，删除区段用 `null` 表示。

相比每轮重写一大段字符串，这种方式更利于重放、动态工具集变化和扩展协作。

## 5. 项目上下文与 Skills

项目上下文文件被渲染为：

```xml
<project_instructions path="...">
  ...
</project_instructions>
```

路径被保留，模型可以判断规则来源。Skill 则默认只把名称、描述和文件位置放进系统提示词，具体 `SKILL.md` 由模型在需要时通过 `read` 或 `bash` 加载。

这是典型的渐进披露：

1. 常驻元数据帮助模型选择能力；
2. 详细说明按需读取；
3. 避免把所有 Skill 全文永久塞入上下文。

若当前工具集中没有 `read` 或 `bash`，Skills 区段不会被注入，因为模型没有读取正文的手段。

## 6. 动态工具和提示词同步

AgentSession 的 `_installAgentNextTurnRefresh()` 在每个完成的 turn 后：

1. 检查是否需要压缩；
2. 重算 active tools；
3. 重建结构化 system prompt；
4. 生成 prompt section 和 tool loadout 的增量消息；
5. 同步当前 model 与 thinking level。

Core 的 `declareToolChanges()` 同时把 `toolsAdded/toolsRemoved` 写进 system message。这样模型看到的工具声明、Core 可执行工具和 transcript 可重放状态保持一致。

## 7. Steering 与 Follow-up

Core Loop 有两类队列：

- `getSteeringMessages()`：在工具循环或准备下一轮时注入，用于用户中途调整方向；
- `getFollowUpMessages()`：Agent 原本准备结束后继续处理后续请求。

内层 Loop 会在“工具调用仍存在”或“有 pending steering message”时继续；外层在准备结束时检查 follow-up queue。

这说明上下文工程不仅是压缩，还包括**消息进入 Loop 的时机**。同一句用户消息在当前 turn 插入还是在 Agent 结束后开启下一轮，会改变决策路径。

## 8. Session Tree 投影

传统 Coding Agent 使用 `SessionManager` 保存 JSONL tree。每个 entry 有 `id/parentId`，当前 `leafId` 决定 active branch。

`buildSessionContext()` 不是简单返回全部 entries，而是：

1. 沿 leaf 回溯当前分支；
2. 识别 compaction boundary；
3. 注入 compaction 或 branch summary；
4. 转换 message/custom_message 等可进入 LLM 的 entry；
5. 忽略仅用于扩展状态、UI 或元数据的 entry。

所以 `/tree` 可以保留并查看历史分支，但模型不会同时看到整棵树。

## 9. Compaction

长会话接近 context window 时，AgentSession 的 `_compactBeforeNextAssistantResponse()` 调用 `shouldCompact()` 判断阈值，并运行自动压缩。

压缩的核心不是删除 JSONL，而是生成 summary 和 `firstKeptEntryId`，后续 provider context 使用：

```text
系统提示词
+ 旧历史摘要
+ 保留的最近消息
+ 新消息
```

手动压缩和自动压缩都会经过共享的 lower-level `compact()`；Extension 可以在 `session_before_compact` 介入或提供自定义摘要。

边界：压缩是有损的。原始历史仍可在 session 文件/tree 中存在，但模型后续推理依赖摘要，遗漏细节会影响任务连续性。

## 10. Forced Prompt 的投影

Extension 的 `before_agent_start` 可以返回 `systemPrompt`。AgentSession 不直接破坏 transcript，而是在 `transformContext` 阶段把多个 system messages 投影成一个 provider head，并保留当前工具声明。

这是“存储表示”和“请求表示”分离的具体例子：完整结构化 section 仍可留在 transcript，本次 provider 请求则获得强制替换后的首条系统提示词。

## 11. Durable Harness 的上下文

新 Harness 使用 branch、lane 和 immutable entry tree 构建上下文。Lane 持有模型配置和 operation 状态，branch tip 决定数据路径；compaction 是新的 entry，不删除旧历史。

它还需要在恢复时从 durable operation state 重建执行位置。这里的 context 除模型消息外，还包括“当前操作进行到哪里”。

不要把设计规范中的所有 retention、远程调度或 Pico 能力都当成稳定公开产品能力；应以当前源码、测试和 README 为准。

## 12. 与 Claude Code / OpenClaw 对比

| 维度 | Pi | Claude Code | OpenClaw |
|---|---|---|---|
| 项目规则 | context files 注入 section | CLAUDE.md 分层加载 | AGENTS/工作区文件与运行时上下文 |
| 能力披露 | Skill 元数据常驻、正文按需读 | Skills/工具按需发现 | Skill 指令 + Tool Profile |
| 历史组织 | JSONL tree + leaf 投影 | transcript + compact | session transcript + runtime context |
| 压缩 | summary + recent tail | microcompact/snip/auto-compact | transform/compaction/memory flush |
| 动态更新 | section diff + tool delta | 产品内部上下文管线 | Hook 与上下文组装层 |
| 定位 | 最小可扩展 Coding Harness | 强产品化 Coding Agent | 多渠道 Agent Runtime |

## 13. 两分钟面试回答

> Pi 的上下文工程可以分成存储、运行时和 provider 三层。传统 Coding Agent 用 JSONL entry tree 保存完整会话，当前 leaf 决定 active branch，`buildSessionContext()` 再结合 compaction boundary 投影出模型需要的消息。Core 在真正调用模型前依次执行 `transformContext`、`convertToLlm` 和 `normalizeContext`，所以内部消息不需要全部直接暴露给模型。
>
> 系统提示词也不是一整段硬编码文本，而是 preamble、tools、rules、project_context、skills、cwd 等结构化 section，变化时只写增量 patch。Skills 只常驻元数据，正文按需读取。每轮结束后 AgentSession 会检查压缩、刷新工具集和系统提示词；steering 与 follow-up 队列控制新消息进入循环的时机。长会话通过摘要加最近消息控制 token，但压缩是有损的，完整历史保留不等于模型仍能看到全部细节。

## 14. 高频追问

### Q1：`transformContext` 和 compaction 有什么区别？

`transformContext` 是调用前投影 Hook，可以不持久化；compaction 会生成 session entry 和摘要边界，改变之后如何稳定重建上下文。

### Q2：为什么 Skill 不直接把全文注入系统提示词？

为了降低固定 token 成本和无关信息干扰。常驻名称与描述用于路由，模型判断相关后再读取正文。

### Q3：完整历史还在 JSONL，为什么仍可能“忘记”？

因为 provider context 只包含当前分支、摘要和保留 tail。原文存在于存储中，不代表本轮模型可见；摘要遗漏的信息不会自动回来。

## 15. 源码索引

- `packages/agent/src/agent-loop.ts`：`streamAssistantResponse()`、`declareToolChanges()`。
- `packages/agent/src/agent.ts`：`createLoopConfig()`、steering/follow-up queue。
- `packages/coding-agent/src/core/system-prompt.ts`：section 构建与 diff。
- `packages/coding-agent/src/core/agent-session.ts`：next-turn refresh、forced prompt、auto compaction。
- `packages/coding-agent/src/core/session-manager.ts`：tree 到 provider context 的投影。
- `packages/coding-agent/src/core/skills.ts`：Skill 发现与校验。

## 16. 口诀

**树上存全量，叶上取当前；提示分区段，技能按需读；长了做摘要，调用前再投影。**

## 17. 预算、切分与恢复的源码细节

`estimateContextTokens` 使用最近有效 assistant usage 加其后新增消息的估算值。
没有有效 usage 时才估算全部消息；文本启发式约为字符数除以 4，图像使用固定估算。
默认 reserveTokens 为 16384，keepRecentTokens 为 20000，具体会话 settings 可覆盖。
阈值为 `contextTokens > contextWindow - reserveTokens`，预留余量与近期保留量不是同一预算。
压缩后保留消息的 usage 可能仍反映旧大上下文，`_checkCompaction` 会检查它是否早于最新压缩边界。

`findCutPoint` 从尾部累积保留预算，合法切点不设在 toolResult，保护调用与结果配对。
切入 turn 内部时，`prepareCompaction` 分出历史与 turn prefix；`compact` 分别总结后合并。
`getSummarizationFailure` 拒绝命中 length 上限的不完整摘要，不能把半份摘要当成功 checkpoint。
溢出或可恢复截断会移除内存失败尾部后 compact-and-retry，并限制重复恢复；历史消息仍可保存。
`appendCompaction` 保存当前完整 systemMessage，重建时恢复最新 prompt/tool state。

harness 的 `readBoundedEntries` 从 lane tip 扫描到 compaction，避免每轮无界读取整棵历史树。
其 CompactResult 直接保存 retainedTail，与 coding-agent 的 firstKeptEntryId 不是同一 schema。
`harness/context.ts` 的 Context 则用于取消、值传播和 telemetry，不能误当 prompt 上下文。

## 18. 固定版本源码链接

- [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/agent-loop.ts)：`streamAssistantResponse`、`declareToolChanges`。
- [`packages/coding-agent/src/core/system-prompt.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/system-prompt.ts)：`buildSystemPromptSections`、`diffSystemPromptSections`。
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/session-manager.ts)：`buildContextEntries`、`appendCompaction`。
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/compaction/compaction.ts)：`estimateContextTokens`、`findCutPoint`、`prepareCompaction`、`compact`。
- [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/agent-session.ts)：`_installAgentForcedPromptProjection`、`_checkCompaction`。
- [`packages/agent/src/harness/runtime/transcript.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/transcript.ts)：`readBoundedEntries`、`readBoundedContext`。
- [`packages/agent/src/harness/compaction/compaction.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/compaction/compaction.ts)：`CompactResult`、`findCutPoint`。
