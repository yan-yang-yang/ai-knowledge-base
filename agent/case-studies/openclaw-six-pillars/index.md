# OpenClaw 六大支柱技术细节

> 基于 Sitor「吃透 AI Agent 开发」课程材料整理。用于复习 OpenClaw 在 Agent 六大支柱上的工程实现。

## 总结一句话

**OpenClaw 底层用 Pi 提供轻量 Agent Loop，上层通过工具策略、上下文治理、混合记忆检索、多 Agent 调度和 Harness 安全网，把最小循环扩展成生产级 Agent Runtime。**

## 阅读路线

1. [Agent Loop](./01-agent-loop) — Pi 事件流、边说边执行、Chunked Reply、循环保险丝
2. [Tool System](./02-tool-system) — 工具装饰器、事件驱动工具管线、Tool Profile、权限过滤
3. [Context Engineering](./03-context-engineering) — `transformContext`、四层压缩、标识符保留、Memory Flush
4. [Memory](./04-memory) — SQLite + sqlite-vec + FTS5、Hybrid Search、MMR、时间衰减
5. [Multi-Agent](./05-multi-agent) — subagents-tool、Announce Queue、Lane 模型、深度限制
6. [Harness Engineering](./06-harness) — 权限、Hook、可观测性、调度、安全网

## 面试材料

- [面试 2 分钟回答版 + 表格速记](./interview)
- [OpenClaw Agent Loop：3 分钟精讲版](./agent-loop-3min)
