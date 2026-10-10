# Pi 六大支柱：05 Multi-Agent

> 复核基线：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`。
> 固定源码链接基址：<https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/>。

## 1. 核心结论

传统 Pi coding-agent **不内建 sub-agent**。
README 的原话是“No sub-agents”，建议用 tmux 启动 Pi、写 extension，或安装第三方 package。
仓库确实提供 subagent 示例扩展，但示例不等于核心产品默认能力。

同时，`packages/agent` 的新 `AgentHarness` 已实现多个 named lane、lane 内排队、watch 和恢复；实验 coding-agent 也用 main lane、worker 和 Chord 服务连接 presentation。
这些是 durable harness / 实验架构能力，不应倒推成传统 Pi 已有成熟多 Agent 编排器。

## 2. 传统 Pi 的官方边界

证据：[`packages/coding-agent/README.md`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/README.md)。
其设计哲学刻意保持核心小：没有内建 MCP、sub-agent、permission popup、plan mode、todo 或 background bash；这些交给 extension/package/tmux。

这意味着传统 Pi 默认只有一个当前 coding-agent session 和一个 agent loop。
分支 session、fork session 是上下文历史操作，不是 agent delegation：它不会自动派任务、聚合结果、控制子 Agent 深度或传播父子权限。

面试时应说：Pi 提供“可扩展到多 Agent”的 primitives 和示例，而不是默认提供完整 multi-agent runtime。

## 3. subagent 示例扩展怎么工作

源码：[`examples/extensions/subagent/index.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/examples/extensions/subagent/index.ts)。
说明：[`examples/extensions/subagent/README.md`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/examples/extensions/subagent/README.md)。

扩展注册一个 `subagent` 工具，每个 invocation 启动独立 `pi` 子进程，并用 JSON mode 收集结构化输出。
每个子进程有隔离的 context window；agent markdown 定义 system prompt、tools 和 model。
如果未指定 model，示例会继承 dispatching session 的 active model 和 thinking level。

示例支持三种模式：

| 模式 | 语义 |
|---|---|
| single | 一个 agent 处理一个任务 |
| parallel | 多任务并行，最多 8 个任务、4 个并发 |
| chain | 顺序执行，并用 `{previous}` 传递前一步结果 |

并行任务的模型可见最终输出每任务上限 50 KB；完整结果留在 tool details。
Ctrl+C 的 abort 会终止子进程。chain 在第一个失败步骤停止。

## 4. 为什么这是扩展，不是内建编排器

安装步骤要求把示例文件链接到 `~/.pi/agent/extensions/subagent`，并把 agents/prompts 单独安装。
项目本地 `.pi/agents/*.md` 可能包含仓库控制的危险指令，所以示例默认只加载用户级 agents；要开启项目 agents 必须设置 scope，并受 trust/confirm 约束。

它没有在核心 `Agent` 类型上新增 `spawnAgent()`，而是复用普通工具调用和子进程边界。
优势是简单、隔离、可替换；代价是跨进程启动、结果序列化、独立会话成本和文件写冲突仍需调用方治理。

一个典型流程：

```text
父 Pi 调用 subagent 工具
  ├─ scout 子进程：只读检索
  ├─ planner 子进程：消费 scout 摘要
  └─ worker 子进程：实现计划
父 Pi 收到最终 tool result
```

这不是共享内存中的多个 Agent，也没有自动解决两个 worker 同时修改同一文件的问题。

## 5. AgentHarness 的 lane 是什么

源码：[`agent-harness.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/agent-harness.ts)。
核心接口：`AgentHarness.lane()`、`AgentHarness.lanes()`、`AgentLane`。

lane 是同一 durable Session 中一个命名分支与执行控制单元。
每条 lane 有 tip、configuration、inbox、current operation 和 last operation。
`AgentLane` 暴露 prompt、steer、followUp、nextRun、compact、navigateTree、resume、abort、waitForIdle 和 watch。

同一 lane 忙时，新的 prompt admission 可返回 `LaneBusy`；steer/follow-up/nextRun 则进入持久 inbox。
多个 lane 可以有独立 tip 和配置，但它们本身仍是 runtime primitive，不携带“研究员/审查员”等角色语义。

因此 lane 可以作为多工作流或多 Agent 上层编排的基础，但“lane = sub-agent”是不准确的。

## 6. Branch、Lane、Session 三者不要混淆

- branch：entry tree 的一条历史路径，核心是 parentId/tip。
- lane：新 harness 中绑定 branch tip、配置、队列和 active operation 的执行单元。
- session：承载多个 entries、values、lanes 和操作状态的持久容器。

传统 `SessionManager.branch()` 只移动 leaf。
新 harness 的 `harness.lane(name)` 会读取或创建 lane state；`navigateTree()` 改变该 lane 的历史位置。
`session/fork.ts:createForkSnapshot()` 又可以按 tree 或指定 branch 投影 entries 与 scalar values 到新 session。
这些能力支持隔离和并行构建，但不会自动做任务分解、结果仲裁或冲突合并。

## 7. 实验 coding-agent 能力

`packages/coding-agent/src/experimental/mini/` 是基于 durable `AgentHarness` 的最小多进程 coding-agent。
worker 每 session 持有 storage、harness、lane 和 model runtime；server/TUI 通过 RPC 与 worker 通信。
`worker/run.ts` 获取 `harness.lane("main")`，并在服务可达后恢复 open operations。

`experimental/services/` 进一步用 Chord facet service 暴露 `AgentController` 和 `Transcript`。
README 明确由 worker-owned main lane 执行 prompt/queue/abort/resume/compaction/navigation，presentation 订阅复制状态。
这仍标记在 `experimental` 路径；应写成实验中的 durable client/server 架构，而非稳定 coding-agent 默认行为。

## 8. Pico3 与 Pico5

`packages/agent/src/harness/pico3/` 和其测试中存在 task、owned conversation、subagent 等实验/参考实现。
但 Pico5 handoff 明确要求 Pico3 仅作为 reference material，并声明“No Pico5 implementation exists”。
`packages/durable` 当前公开实现只到 record contracts 和 detached MemoryStorage。

所以文档必须分层：

| 层级 | 当前判断 |
|---|---|
| 传统 coding-agent 内建 sub-agent | 没有 |
| 示例 extension 子 Agent | 有，可运行的示例方案 |
| packages/agent named lanes | 已有实现与测试 |
| experimental mini/services | 实验集成 |
| Pico3 | 参考/旧实验实现 |
| Pico5 完整多 Agent runtime | 规划，未实现 |

## 9. 并发与安全边界

示例扩展限制并发并支持 abort，但不提供全局文件锁、事务式 workspace 合并或自动 worktree 隔离。
并行 worker 如果拥有 write/bash 工具，仍可能互相覆盖。
项目本地 agent 定义属于可执行信任边界；README 特别要求只在可信仓库启用。

新 harness 的 lane queue 能保证 lane 状态按 runtime 规则推进，但不同 lane 触碰外部系统时，外部副作用仍需工具层幂等或资源锁。
持久 inbox 解决“输入不丢”和恢复顺序，不等于跨 lane 的 serializable transaction。

## 10. 工程选型建议

只需要隔离检索上下文时，用 subagent 示例的独立进程模型很直接。
需要稳定产品能力时，应自己定义：任务拓扑、最大并发、取消传播、权限继承、输出上限、共享文件策略和失败聚合。
需要进程重启后继续时，可基于 `AgentHarness` lane 和 operation state 构建，但要接受它仍在演进，并单独治理外部副作用。

## 11. 面试问答

**问：Pi 是否原生支持 Multi-Agent？**

答：传统 coding-agent 明确不内建 sub-agent。仓库提供 extension 示例，通过 `subagent` 工具启动独立 Pi 子进程，支持 single、parallel 和 chain；这是可选扩展示范，不是默认核心能力。

**问：Pi 的 lane 是否就是子 Agent？**

答：不是。lane 是 durable harness 的命名执行分支，包含 tip、配置、队列和 active operation。上层可以把 lane 映射成一个 agent，但源码没有强制角色语义、任务分解或结果仲裁。

**问：并行 subagent 如何隔离？**

答：示例通过独立进程和独立 context window 隔离模型上下文，同时限制任务数和并发数；但默认共享文件系统，文件冲突仍需调用方用只读工具、worktree 或锁来治理。

**问：Pico 是否已经实现完整多 Agent？**

答：不能这么说。Pico3 是保留的参考实现；Pico5 有详细规范和 handoff，但 handoff 明确说当前没有 Pico5 实现。当前 `packages/durable` 的公开 API 只到记录契约和 detached 内存存储。

## 12. 源码索引

- `packages/coding-agent/README.md`：明确“No sub-agents”。
- `packages/coding-agent/examples/extensions/subagent/`：子进程 delegation 示例。
- `packages/agent/src/harness/agent-harness.ts`：`AgentHarness`、`AgentLane`。
- `packages/agent/src/harness/runtime/lane.ts`：lane admission、队列与驱动。
- `packages/agent/src/harness/session/fork.ts`：tree/branch fork 投影。
- `packages/coding-agent/src/experimental/mini/`：durable harness 多进程实验。
- `packages/durable/docs/pico-v5-handoff.md`：Pico5 尚未实现及规划范围。
