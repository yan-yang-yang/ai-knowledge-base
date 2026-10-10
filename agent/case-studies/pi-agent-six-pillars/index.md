# Pi Agent 六大支柱技术细节

> 基于本地 Pi monorepo 源码整理。复核基线：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`。
> 用途：日常复习 Pi 的 Agent 工程原理，并与 Claude Code、OpenClaw 建立统一认知框架。

## 总结一句话

**Pi 不是一个单层 Agent 框架：`pi-agent-core` 提供轻量事件流 Loop，`pi-coding-agent` 把它组装成可扩展的终端 Coding Agent，较新的 durable Harness 再用 branch、lane、operation、事务状态和恢复策略处理长任务可靠性。**

## 先理解三层架构

| 层 | 主要目录 | 核心职责 |
|---|---|---|
| Agent Core | `packages/agent/src/agent-loop.ts`、`agent.ts` | 模型流式调用、工具循环、事件、steering/follow-up |
| Coding Agent | `packages/coding-agent/src/core/` | 文件工具、系统提示词、Skills、Extensions、JSONL session、compaction、TUI 编排 |
| Durable Harness | `packages/agent/src/harness/` | 持久 branch/lane、operation 状态机、effect intent、checkpoint、recovery |

这三层不能混讲。尤其要注意：

- JSONL `SessionManager` 是传统 Coding Agent 的会话树。
- durable Harness 是另一套运行状态持久化与恢复模型。
- README 明确说明传统 Pi 默认没有内建 sub-agent、MCP 和权限弹窗。
- Harness 处理不确定副作用，但不承诺 exactly-once。
- `packages/durable` 下的设计稿和 Pico 路线图必须与当前实现区分。

## 阅读路线

1. [Agent Loop](./01-agent-loop) - 双层循环、事件流、steering/follow-up、停止条件
2. [Tool System](./02-tool-system) - 参数校验、串并行工具、Hook、动态工具集、恢复策略
3. [Context Engineering](./03-context-engineering) - 结构化 System Prompt、Skills、session tree、compaction
4. [Memory](./04-memory) - JSONL append-only tree、branch/fork、上下文重建、durable state
5. [Multi-Agent](./05-multi-agent) - 默认边界、扩展式 sub-agent、branch/lane 与并行模型
6. [Harness Engineering](./06-harness) - operation 状态机、事务、effect gate、checkpoint、recovery

## 面试材料

- [Pi Agent 六大支柱面试速记](./interview)
- [Claude Code vs OpenClaw 六大支柱横向对比](../claude-code-vs-openclaw-six-pillars/)
- [Claude Code 六大支柱](../claude-code-six-pillars/)
- [OpenClaw 六大支柱](../openclaw-six-pillars/)

## Pi 与 Claude Code、OpenClaw 的关系

| 维度 | Pi | Claude Code | OpenClaw |
|---|---|---|---|
| 产品定位 | 极简、可改造的终端 Coding Harness | 深度产品化的 Coding Agent | 多渠道个人 Agent Runtime |
| Loop | 薄 Core，源码边界清晰 | 高度自研并与产品能力融合 | 底层借助 Pi 思路，上层加运行时治理 |
| 扩展 | Extensions、Skills、Pi Packages | Skills、Hooks、MCP、子 Agent | Skills、插件、MCP、Tool Profile |
| 会话 | JSONL tree，支持 branch/fork/compact | transcript 与压缩恢复 | 渠道 session、Memory 和 runtime context |
| 多 Agent | 默认不内建，扩展或宿主组装 | 内建 Task/Explore/Worktree 等模式 | subagent、session、lane 和 announce |
| 可靠性 | 新 Harness 深入探索 durable execution | 面向编码任务的权限和恢复 | Gateway、调度、权限、幂等、可观测性 |

## 学习重点

不要只背“Pi 很轻量”。更值得学习的是它如何划分责任：

1. Core 只负责可组合的模型和工具循环。
2. Coding Agent 用 session、prompt、tools 和 extensions 构成产品。
3. 完整历史与模型可见上下文分离。
4. 动态工具和提示词变化进入可重放 transcript。
5. Durable Harness 把“接受任务”和“真正执行”分离。
6. 对不确定副作用承认现实，用 replay policy 和幂等边界治理，而不是宣称绝对 exactly-once。

## 源码索引

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/extensions/`
- `packages/agent/src/harness/runtime/`
- `packages/agent/src/harness/session/`
- `packages/agent/docs/harness.md`
