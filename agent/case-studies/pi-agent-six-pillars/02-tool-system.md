# Pi 六大支柱：02 Tool System

> 源码基线：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`
> 核心源码：`packages/agent/src/agent-loop.ts`、`packages/coding-agent/src/core/tools/`、`packages/coding-agent/src/core/extensions/`

## 1. 一句话定位

**Pi Core 提供工具声明、参数校验、串并行调度和事件回传；Coding Agent 再叠加文件工具、扩展 Hook、输出截断与写入协调，但默认不内建权限弹窗或 MCP。**

## 2. 三层边界

| 层 | 主要职责 | 不应混淆的能力 |
|---|---|---|
| `pi-agent-core` | 工具声明、参数校验、执行调度、结果回写 | 不负责具体文件工具和交互审批 |
| `coding-agent` | `read/bash/edit/write` 等工具、Extension、渲染与输出治理 | README 明确没有内建 MCP 和权限弹窗 |
| durable Harness | effect intent、checkpoint、replay/recovery | 不是传统 Loop 每次工具调用默认拥有的保证 |

## 3. Core 的工具闭环

`AgentTool` 至少包含名称、描述、参数 Schema 和 `execute()`。Loop 在模型边界把工具转成 provider declaration；模型返回 `toolCall` 后，执行流程是：

```text
查找工具
  -> prepareArguments
  -> validateToolArguments
  -> beforeToolCall
  -> execute(signal, onUpdate)
  -> afterToolCall
  -> ToolResultMessage
  -> 下一轮模型调用
```

源码入口：

- `executeToolCalls()`：选择串行或并行执行。
- `prepareToolCall()`：工具存在性检查、参数预处理、Schema 校验、前置拦截。
- `executePreparedToolCall()`：传递 `AbortSignal`，收集增量结果。
- `finalizeExecutedToolCall()`：执行后 Hook 可改写结果。
- `createToolResultMessage()`：将结果与 `toolCallId` 配对回写上下文。

## 4. 参数校验和错误反馈

模型输出必须视为不可信输入。Pi 调用 `validateToolArguments()` 校验参数；工具不存在、参数错误、执行异常都会转成结构化错误结果，而不是直接让 Loop 崩溃。

如果 assistant 因 token 上限以 `stopReason: "length"` 结束，Pi 不执行其中任何工具调用，因为参数可能已被截断。它会为每个调用生成错误结果，引导模型重新发出完整参数。

这个细节比“Schema 校验”更重要：Schema 只能校验已经收到的对象，无法证明被截断的 JSON 仍表达了模型原意。

## 5. 串行与并行调度

默认策略由 `config.toolExecution` 控制；任一工具声明 `executionMode: "sequential"` 时，整个 batch 转为串行。

```ts
const forceSequential = toolCalls.some(
  call => tools.find(t => t.name === call.name)?.executionMode === "sequential"
)

return forceSequential
  ? executeToolCallsSequential(...)
  : executeToolCallsParallel(...)
```

并行路径先依次完成准备和前置 Hook，再用 `Promise.all()` 执行可运行项；最终仍按模型原始调用顺序生成 tool result，避免并发完成顺序污染 transcript。

工程取舍：

- `read/grep/find` 等只读操作适合并行。
- 文件写入、依赖前一步输出的动作应串行。
- Pi Core 提供执行模式，但不知道业务依赖图；复杂 DAG 仍需上层编排。

## 6. 流式更新与取消

工具 `execute()` 接收 `onUpdate(partialResult)`，Core 将它转成 `tool_execution_update` 事件，TUI 可以展示命令输出或进度。

执行完成后，Core 会等待已发出的 update event settle，再发最终结果，避免“最终结果先出现、旧进度后到达”的乱序。

`AbortSignal` 会传给工具和 Hook。它只能提供协作式取消：外部进程、数据库写入或远程 API 是否真正停止，取决于具体工具实现。

## 7. 动态工具集

`declareToolChanges()` 比较 transcript 已声明的工具与当前可执行工具，把差异编码为 system message 的 `toolsAdded/toolsRemoved`。

这意味着：

1. runtime 的真实工具集和模型可见声明可以保持一致；
2. 工具集变化成为 transcript 的一部分，可重放；
3. Coding Agent 可在 Extension 或会话阶段切换 active tool loadout。

它不是“延迟工具搜索”机制，而是对工具状态变化的显式声明。

## 8. Coding Agent 的具体工具

`packages/coding-agent/src/core/tools/index.ts` 提供：

- 默认编码工具：`read`、`bash`、`edit`、`write`；
- 可选工具：`grep`、`find`、`ls`、`powershell`；
- 只读组合：`read + grep + find + ls`；
- `withFileMutationQueue()`：协调文件修改操作；
- `truncateHead/truncateTail`：限制大输出进入上下文。

`wrapToolDefinition()` 把带 ExtensionContext、渲染信息和提示词元数据的 Coding Agent 工具适配为 Core 的 `AgentTool`。

## 9. Extension Hook

Coding Agent 的扩展可以注册工具，也可以在调用前后介入。Core 自身提供 `beforeToolCall/afterToolCall` 插槽，AgentSession 将 Extension Runner 接到这些插槽。

典型用途：

- 调用前做路径检查、确认或策略阻断；
- 调用后清洗结果、补充 usage、调整 `isError`；
- 为工具结果注入或规范化图片；
- 给 TUI 提供自定义渲染。

但 Pi 的产品哲学是最小内核。README 明确说明：没有内建权限弹窗、没有内建 MCP；需要容器隔离、扩展或第三方 package 自行实现。

## 10. Durable Harness 的工具执行

较新的 `packages/agent/src/harness/runtime/drive/` 把工具执行放进持久状态机：先提交 effect intent，再执行不确定副作用，最后 settlement；工具可声明 `replay: "safe"` 或 `"never"`。

- `safe`：持久化调用记录与当前工具都声明 safe，且未取消时，恢复过程才允许重放；是否安全由工具实现承担。
- `never`：副作用不自动重放，恢复时生成中断结果。
- checkpoint：保存有限进度，不代表副作用已经完成。

这降低重复副作用风险，但不承诺 exactly-once；外部写操作仍应提供幂等键或业务补偿。

## 11. 与 Claude Code / OpenClaw 对比

| 维度 | Pi | Claude Code | OpenClaw |
|---|---|---|---|
| 核心定位 | 最小、可扩展工具运行时 | 深度面向代码开发 | 多渠道 Agent Runtime |
| 默认工具 | 少量文件与 Shell 工具 | 丰富编码工具，按需加载 | Tool Profile 按场景裁剪 |
| 并发 | Core 支持 batch 串并行 | 由产品调度层治理 | 支持并行，但还受 lane/策略约束 |
| 权限 | 默认不提供弹窗 | 内建权限模式与分类 | Gateway/策略/审批链 |
| MCP | README 明确不内建 | 原生生态能力 | 可通过 MCP 接入 |
| 可恢复副作用 | 新 Harness 提供 replay policy | 以 transcript/任务恢复为主 | 强调幂等、审批和运行时恢复 |

## 12. 两分钟面试回答

> Pi 的工具系统分为 Core 和 Coding Agent 两层。Core 负责把工具声明给模型，收到 tool call 后依次做工具查找、参数预处理、Schema 校验、before hook、执行、after hook，再把结果按 tool_call_id 回写上下文。它支持串行和并行 batch，任一工具标记 sequential 时会强制串行；并行执行完成后仍按模型原顺序落 tool result。工具还可以通过 onUpdate 发送流式进度，并接受 AbortSignal。
>
> Coding Agent 在上层提供 read、bash、edit、write 等文件工具、输出截断、文件修改队列和 Extension Hook。Pi 刻意不内建 MCP 和权限弹窗，安全审批要由扩展、容器或上层系统完成。较新的 durable Harness 又增加 effect intent、checkpoint 和 safe/never replay，但它不等于 exactly-once，写操作仍要做幂等和补偿。

## 13. 高频追问

### Q1：为什么并行结果还要按原调用顺序写回？

为了保证 transcript 确定性，并维持 assistant tool call 与 tool result 的稳定对应；否则网络和执行时延会改变上下文顺序。

### Q2：Pi 如何阻止危险工具？

Core 只提供 `beforeToolCall` 阻断点和参数校验。具体权限策略不是默认能力，应由 Coding Agent Extension、容器隔离或宿主系统实现。

### Q3：`replay: never` 能保证工具只执行一次吗？

不能。进程可能在外部副作用成功、settlement 尚未提交时崩溃。它只保证恢复时不盲目重放；真正 exactly-once 仍需要外部系统的幂等协议。

## 14. 口诀

**先声明，后校验；可并行，序回写；Hook 管策略，副作用靠幂等。**

## 15. 文件工具的局部一致性与输出预算

`read` 对文本保留头部，默认限制为 2000 行或 50 KiB，先达到哪个边界就截断。
`offset/limit` 支持续读，结果提示下一 offset，避免把片段误认成完整文件。
`bash` 则保留输出尾部，截断时提供保存完整输出的临时文件位置。
头部利于理解文件结构，尾部利于定位最近报错；字节限制不等同于精确 token 限制。

`edit` 的多组替换针对同一份原内容，每个 oldText 要唯一匹配且不能重叠。
执行过程剥离 BOM、规范化换行，再恢复原来的编码标记和换行风格。
返回 details 中的 diff、patch 和 firstChangedLine 支持审阅，不必把全部差异塞入模型 content。

`withFileMutationQueue` 对现存文件优先用 realpath 作为队列键，缺失路径用 resolve。
edit/write 的同文件修改在本进程串行，不同文件仍能并发。
这不是跨进程锁，也不约束 bash 对文件的任意修改，更不提供多文件事务。
edit 在 await 后检查取消，而不在 abort listener 中提前释放队列。
因为文件系统操作可能尚未完成，提前放锁会让下一次写入与旧操作重叠。

并发工具的 `tool_execution_end` 按完成顺序发出，结果消息则按 assistant 源顺序发出。
这种分离使 UI 能及时显示完成情况，同时维持稳定 transcript。
但慢工具仍构成整批屏障，快工具结果不会独自启动下一轮模型请求。

harness 中可用 `onUpdate(partial, { checkpoint: true })` 请求保存恢复快照。
`AgentHarnessToolInvocation` 提供稳定 invocationId 和 getMemo/setMemo。
这些可携带远端作业 ID 或幂等键，却不会自动让外部系统具有幂等能力。

## 16. 固定版本源码证据

以下路径从 Pi 仓库根目录开始；链接固定到本文核验 commit。

- [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/agent-loop.ts)：`declareToolChanges`、`prepareToolCall`、`executeToolCallsParallel`、`finalizeExecutedToolCall`。
- [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/types.ts)：`AgentTool`、`ToolExecutionMode`、`AfterToolCallResult`。
- [`packages/coding-agent/src/core/tools/index.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/tools/index.ts)：`createCodingToolDefinitions`、`createReadOnlyToolDefinitions`。
- [`packages/coding-agent/src/core/tools/read.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/tools/read.ts)：`createReadToolDefinition`。
- [`packages/coding-agent/src/core/tools/edit.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/tools/edit.ts)：`createEditToolDefinition`、`prepareEditArguments`。
- [`packages/coding-agent/src/core/tools/file-mutation-queue.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/tools/file-mutation-queue.ts)：`withFileMutationQueue`。
- [`packages/agent/src/harness/runtime/drive/tools.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/drive/tools.ts)：`publishToolIntent`、`recoverToolInvocation`、`runTools`。
- [`packages/agent/src/harness/execution/tools.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/execution/tools.ts)：`applyBeforeToolDecision`、`executeToolCall`。
- [`packages/agent/src/harness/types.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/types.ts)：`AgentHarnessToolInvocation`、`AgentHarnessToolUpdateOptions`。
- [`packages/coding-agent/README.md`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/README.md)：产品明确说明 No MCP 和 No permission popups。
