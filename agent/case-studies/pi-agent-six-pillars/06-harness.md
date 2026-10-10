# Pi 六大支柱：06 Harness

> 复核基线：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`。
> 固定源码链接基址：<https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/>。

## 1. 核心结论

Pi 必须分成两套 harness 讨论：

1. 传统 `packages/coding-agent` 的 `SessionManager + AgentSession`：JSONL transcript、工具调用、compaction、branch/fork、插件扩展。
2. 新 `packages/agent` 的 `AgentHarness`：durable Session、named lane、operation state、checkpoint、恢复和 watch。

第二套不是第一套的一个更漂亮的名字，也不是 `packages/durable` Pico5 的完成版。
Pico5 文档是规范/实施 handoff；`packages/durable/README.md` 明确当前公开 API 只有记录契约和 detached `MemoryStorage`。

## 2. 传统 Coding-Agent Harness

源码：[`session-manager.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/session-manager.ts)。
相关：`packages/coding-agent/src/core/agent-session.ts`、`agent-session-runtime.ts`。

`SessionManager` 是 append-only JSONL session tree：entry 带 id/parentId，当前 leaf 指定 active branch。
`AgentSession` 把 agent loop、模型、工具、session manager、扩展和事件连接起来。
传统 harness 的强项是可读、可调试、扩展容易；它的恢复主要是重载 transcript 后继续 agent loop，不是将每个外部副作用建模成 durable task state machine。

典型循环：

```text
用户 prompt
  ↓ AgentSession / Agent
追加 user entry
  ↓ provider stream
assistant message / tool call
  ↓ tool execution
tool result + 后续 turn
  ↓ SessionManager append JSONL
可继续、分支或压缩
```

`SessionManager._persist()` 使用 append 写入；首次 assistant 前可能延迟 flush。
`buildSessionContext()` 按 branch 和 compaction 生成模型 messages。
`branch()` 只移动 leaf；`forkFrom()` 复制历史到新 session 文件。

这套 harness 没有声称 exactly-once tool execution。进程在工具产生外部副作用后崩溃，普通 JSONL transcript 不提供“副作用和记录同一事务”的证明。

## 3. 新 AgentHarness 的对象模型

源码：[`agent-harness.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/agent-harness.ts)。
运行时：[`runtime/harness.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/harness.ts)。

`AgentHarness.create(options, context)` 返回 `{ harness, open }`。

`AgentHarness` 管理 session 级配置、工具、资源、retry、compaction、hooks、events，并提供 `lane(name)`、`lanes()`、`watchSession()`、`close()`。
`AgentLane` 管理一个命名分支：

- `tipId`：当前 transcript tip。
- configuration：model、thinking、active tools 等。
- inbox：steer/followUp/nextRun/write 等持久队列项。
- operation：run、compaction 或 navigation 的当前状态。
- result：可按 operationId 查询的 durable 结果。

`prompt()` 只是便捷入口；更底层的 `accept()` 负责 admission，`drive()` 负责驱动已接受的 operation，`resume()` 负责恢复可继续操作。

## 4. Durable operation state machine

状态定义位于 `packages/agent/src/harness/session/types.ts`，包括 assistant generation、tools、deferred、summary 等阶段。
关键思想是：先持久化 intent/checkpoint，再执行可能失败或耗时的 effect，最后持久化 outcome。

工具调用大致如下：

```text
planned
  ↓ durable admission
 effect_pending(replay policy)
  ↓ execute tool
 outcome_ready
  ↓ persist result
settled
```

模型生成、摘要生成、deferred poll 也各有相应阶段。
`runtime/drive.ts` 按阶段选择普通推进或 recovery；`drive/reconcile.ts` 处理恢复时的状态对齐。

这样进程重启后可以知道“操作进行到哪一步”，而不是只看到一段半截日志。
但它仍然不能知道一个外部 HTTP 请求是否已经在崩溃前成功，除非外部系统提供幂等键/查询或操作本身可安全重放。

## 5. replay policy：源码真正保证什么

工具类型声明位于 `packages/agent/src/harness/types.ts`，工具调用状态位于 `session/types.ts`。
`replay` 有 `safe` 和 `unsafe` 语义；省略时默认 `unsafe`。
恢复逻辑在 [`runtime/drive/tools.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/drive/tools.ts) 的 `recoverToolInvocation()`。

源码条件是：调用未取消、持久 call 的 replay 是 `safe`、当前 tool declaration 的 replay 也是 `safe`，才会清除 replay checkpoint 并再次执行工具。
否则恢复会发布 `interruptedOutcome()`，不会盲目重新运行不安全工具。

因此可以准确说：

- `safe` 是“此工具在该 checkpoint 上允许恢复重执行”的显式协议。
- `unsafe` 会在恢复时中断/结算为 interrupted，而不是自动重跑。
- 这不是 exactly-once；safe 工具可能在崩溃窗口中被执行两次。
- 也不能把 unsafe 简化成“永不 replay”而忽略其他阶段；应具体看 recovery path 和 operation state。

`pico3` 参考实现中也有 replay 字段，但 Pico3 和新 AgentHarness 不能混用保证。

## 6. 生成和响应恢复

`runtime/drive/recovery.ts` 的 `recoverAssistantGeneration()`、`recoverCancelledAssistantEffect()` 负责 assistant effect checkpoint 的重建。
`drive/response.ts` 在 recovery 标记下发布事件/结果，并区分 retryable error、aborted partial、provider error 和正常 response。

这解释了为什么 harness 需要 durable partial、attempt、retry 等状态：模型流可能中断，恢复应先读取已持久化的状态，再决定继续、重试、取消或 fault。

这里的 replay 多数是对模型请求状态和显示结果的恢复，不代表 provider 请求一定只发送一次。
Provider 是否幂等、计费是否重复，仍由 provider/API 合同决定。

## 7. Watch 的 snapshot + stream

`AgentLane.watch()` 返回 `WatchHandle`，包含 `snapshot`、`start(listener)`、`resnapshot()` 和 `unsubscribe()`。
experimental mini README 说明 worker 先捕获 snapshot，harness 为该订阅缓冲事件，`start()` 再 drain。
这样客户端获得一个有边界的 snapshot/stream 对，而不是先读 snapshot、再因竞态漏掉中间事件。

这可以称为“无 gap、无 duplicate 的订阅配对”——前提是指 harness 的该 watch 协议和事件消费边界。
不要把它扩大成全系统 exactly-once delivery；网络断开、客户端重连和业务副作用仍需单独处理。

## 8. JSONL 与存储后端

`packages/agent/src/harness/session/jsonl/` 提供 JSONL session repo/storage；同时 core session 层也有 memory/storage testing 实现。
新 harness 把 entries、values、operation meta/state 和 marker/commit 组织成 backend contract。
存储的 durable commit 与内存中的 live lane projection 分开，恢复时重新读取权威存储。

测试目录包括 `runtime/restore.test.ts`、`runtime/drive-tools.test.ts`、`jsonl-storage-conformance.test.ts` 和 `jsonl-session-repo.test.ts`。
这些测试证明的是实现行为和回归约束，不自动把系统提升为分布式事务或 exactly-once 引擎。

## 9. Hooks、工具和副作用边界

`AgentHarnessOptions` 支持 tools、toolContext、systemPrompt、retry、compaction、steering/followUp mode 和 hooks。
工具可以配置 replay policy；工具执行前后的 hook 以及 output bounds 让 harness 控制输入校验、结果大小和恢复行为。

工程上应把副作用分三类：

| 类别 | 处理方式 |
|---|---|
| 纯计算/读操作 | 可考虑 `safe`，仍需验证重复执行成本 |
| 幂等写操作 | 用业务 idempotency key，再考虑 `safe` |
| 不可逆写操作 | 标为 `unsafe`，恢复时接受 interrupted 并人工/业务查询 |

例如 `read_file` 重跑通常风险低；`create_charge` 即使返回成功后进程崩溃也不能靠 safe 标志解决重复扣款，必须由支付系统幂等键兜底。

## 10. Durable 与规划边界

`packages/durable/docs/pico-v5.md` 是 normative specification，描述 Conversation、Task、Document、checkpoint、abort、scheduler、watch 等更完整模型。
但 `pico-v5-handoff.md` 的 Status 明确写着旧 pico/pico4 已移除、pico3 保留、Pico5 尚无实现。
因此本篇只把 `packages/agent/src/harness` 的实现写为当前能力，把 durable package 的完整语义写为规划。

## 11. 失败恢复例子

例：模型要求执行一个 `safe` 的只读扫描工具。

1. harness 持久化 tool call 和 replay policy。
2. 进程在工具执行期间退出。
3. reopen 后 `restoreLaneState()` 找到 open operation。
4. drive 进入 `recoverToolInvocation()`。
5. 若持久化 call 与当前 tool declaration 都是 `safe` 且未取消，允许恢复执行并发布结果。
6. 若任一侧为 `never`，则发布 interrupted outcome，避免未经授权的重跑。

例：普通 coding-agent 使用 `SessionManager.appendMessage()` 后在 bash 中崩溃。
重新打开 JSONL 只能知道已落盘的 transcript；不能证明 bash 是否完成，也不能自动安全补偿。

## 12. 面试问答

**问：Pi 的 Harness 怎么做崩溃恢复？**

答：新 `packages/agent` harness 把 lane 的 operation 持久化为 intent、阶段和结果，重启时由 `restoreSession/restoreLaneState` 恢复 open operation，再由 drive/recovery 继续或结算。传统 coding-agent 则主要重载 JSONL transcript 后继续，不应套用新 harness 的状态机保证。

**问：Pi 是 exactly-once 吗？**

答：不能声称。`safe` replay 允许恢复时重执行，`never` 工具通常结算为 interrupted；外部副作用可能已发生但尚未写入 outcome。exactly-once 需要外部系统事务或幂等协议，源码没有给出通用证明。

**问：safe 与 never replay 怎么说才准确？**

答：当前主 AgentHarness 的持久状态和 drive 协议使用 `safe | never`，默认 `never`；只有持久化 call 与当前工具声明都为 `safe` 且操作未取消时，recovery 才会重新调用。保留的 Pico3 参考实现使用的是 `safe | unsafe`，不能混成同一套枚举。

**问：Pico5 是不是当前 harness？**

答：不是。当前实现主要在 `packages/agent/src/harness`；`packages/durable` 的 Pico5 是规范和 handoff，README/Status 明确完整实现尚不存在。

## 13. 源码索引

- `packages/coding-agent/src/core/session-manager.ts`：传统 JSONL session tree。
- `packages/coding-agent/src/core/agent-session.ts`：传统 AgentSession 组合层。
- `packages/agent/src/harness/agent-harness.ts`：新 harness 公共 API。
- `packages/agent/src/harness/runtime/restore.ts`：恢复 lane/op 状态。
- `packages/agent/src/harness/runtime/drive.ts`、`drive/reconcile.ts`：推进与恢复决策。
- `packages/agent/src/harness/runtime/drive/tools.ts`：`recoverToolInvocation()` 与 replay 条件。
- `packages/agent/src/harness/session/types.ts`：operation/replay 状态类型。
- `packages/durable/README.md`、`docs/pico-v5-handoff.md`：Pico5 实现状态。
