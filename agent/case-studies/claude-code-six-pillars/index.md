# Claude Code 六大支柱技术细节

> 基于 Sitor「吃透 AI Agent 开发」课程材料整理。用于复习 Claude Code 在 Agent 六大支柱上的工程实现，并与 OpenClaw 对比。

## 总结一句话

**Claude Code 是一个围绕本地代码开发场景深度手写的生产级 Coding Agent：Loop、工具、上下文、记忆、多 Agent 和 Harness 都服务于“安全、持续、可恢复地修改代码”。**

## 阅读路线

1. [Agent Loop](./01-agent-loop) — 手写循环、流式响应、并发工具、预算保险丝、API 容错
2. [Tool System](./02-tool-system) — Zod 工具定义、Deferred Tool Loading、MCP、Skills
3. [Context Engineering](./03-context-engineering) — CLAUDE.md、Agentic Search、Microcompact / Snip / Auto-compact
4. [Memory](./04-memory) — MEMORY.md 文件派、AutoDream、Sonnet 相关性选择、200 行上限
5. [Multi-Agent](./05-multi-agent) — Explore Agent、AsyncLocalStorage、Worktree、Swarm、Mailbox
6. [Harness Engineering](./06-harness) — 权限系统、Bash 分类器、Hook、JSONL transcript、Routines

## 面试材料

- [Claude Code 六大支柱面试速记与总结](./interview)
- [Claude Code vs OpenClaw 六大支柱横向对比](../claude-code-vs-openclaw-six-pillars/)


## 对比 OpenClaw 的总印象

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 产品定位 | 本地 Coding Agent | 多渠道个人 Agent Runtime |
| 底层实现 | 核心逻辑高度自研/手写 | 基于 Pi 薄内核，上层自研 runtime |
| 工具策略 | Deferred Tool Loading，依赖 Anthropic API 能力 | Tool Profile，按场景裁剪工具集 |
| 上下文 | CLAUDE.md + Agentic Search + 三层压缩 | transformContext + 四层压缩 + Memory Flush |
| 记忆 | 文件派 MEMORY.md | SQLite + 向量 + FTS5 |
| 多 Agent | Explore / Worktree / Swarm | subagents-tool / Announce Queue / Lane |
| Harness | 本地权限、Hook、Bash 分类器 | Gateway、多渠道、权限策略、调度 |
