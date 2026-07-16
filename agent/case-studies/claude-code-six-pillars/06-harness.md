# Claude Code 六大支柱技术细节：06 Harness Engineering

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：Claude Code 在 Harness Engineering 层的原理与工程细节，并对比 OpenClaw

---

## 1. 核心定位

Harness 是模型外面的运行环境。

Claude Code 的 Harness 非常完整，课程里甚至认为它在几个框架中覆盖度最高。

它包含：

- 权限系统
- Bash 风险分类器
- Hook 体系
- Token / 成本保险丝
- 上下文压缩
- Memory
- Sub-agent
- JSONL transcript
- 沙箱和文件权限
- Routines 定时任务

一句话：

> **Claude Code 的 Harness 是围绕本地 Coding Agent 场景构建的一整套安全、可观测、可恢复运行环境。**

---

## 2. 权限系统

Claude Code 的权限系统非常细。

课程里提到它支持多种权限模式，从严格到宽松。

典型能力：

- 全局权限模式
- 细粒度 allow / deny / ask 规则
- 工具级规则
- 参数级规则
- Bash 命令风险判断
- alwaysAllow 记忆规则
- 审批界面展示原因和风险

权限规则配置有两层：

- 用户级配置
- 项目级配置

这让个人偏好和团队约定可以分开管理。

---

## 3. Bash 风险分类器

Bash 工具风险极高。

简单白名单覆盖不了所有边界情况。

Claude Code 使用轻量分类器来判断 Bash 命令风险。

危险模式包括：

- `rm -rf /`
- fork bomb
- sudo
- 删除关键文件
- 高风险网络/系统操作

它的思路是：

> 用一点额外延迟换更高安全性。

这是 Coding Agent 场景非常值得付出的成本。

---

## 4. Hook 体系

Claude Code 的 Hook 系统很完整。

课程里提到它不止 PreToolUse / PostToolUse，而是在 Agent 生命周期很多关键节点都有 Hook，数量约 27-28 种。

典型 Hook：

- PreToolUse
- PostToolUse
- PermissionRequest
- PreCompact
- Stop / SubagentStop
- Notification
- SessionStart
- SessionEnd

Hook 能做：

- 观察行为
- 修改工具输入
- 注入上下文
- 阻止危险操作
- 自动审批特定命令
- 记录审计日志
- 在压缩前处理上下文

和 OpenClaw 对比：

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| Hook 范围 | 生命周期级，约 27-28 种事件 | 工具事件 + runtime hooks |
| 能力 | 可观察、可修改、可阻止、可注入 | 事件驱动，偏多渠道 runtime 扩展 |
| 场景 | 本地 coding workflow | Gateway / 多渠道 / 多工具系统 |

---

## 5. Hook 安全边界

Claude Code 明确禁止 Agent 在会话期间修改 Hook 配置。

原因：

> 如果 Agent 能修改 Hook，它可能绕过安全限制。

它还支持：

- Shell Hook
- HTTP Hook
- Agent Hook

HTTP Hook 有环境变量白名单：

```txt
allowedEnvVars
```

防止 API Key 等敏感信息被意外传出。

---

## 6. Transcript 与可观测性

Claude Code 用 JSONL append-only 日志记录整个对话过程。

每条消息一行 JSON：

- 用户输入
- 模型回复
- 工具调用
- 工具结果
- 权限请求
- 中间事件

价值：

- 可复盘
- 可重放
- 可调试
- 崩溃后可恢复
- 可做审计

这对 Agent 很重要，因为 Agent 的任务可能跨几十轮、几十次工具调用。

---

## 7. 沙箱与文件权限

Claude Code 是本地工具，不一定需要容器。

课程里提到它使用操作系统级权限控制：

- 文件系统默认只读
- 工作目录可写
- 可配置白名单
- 可通过 `--dangerously-skip-permissions` 跳过权限

优点：

- 开销小
- 本机直接执行
- OS 强制执行规则

缺点：

- 用户如果跳过权限，风险变大
- 不如 VM / 容器隔离彻底

---

## 8. Routines：定时 Agent

Claude Code Routines 支持：

- 定时触发
- HTTP 调用触发
- GitHub webhook 触发

它让 Agent 不只响应用户输入，也能按计划执行。

这属于 Harness 的调度层。

---

## 9. Claude Agent SDK 作为 Harness 封装

课程里提到 Claude Agent SDK 本质上是把 Claude Code 作为库来调用。

它没有传统 `Agent` 类，而是通过：

```ts
query()
```

启动完整 Agent Loop，返回 `AsyncGenerator<SDKMessage>`。

SDK 参数包括：

- `maxTurns`
- `maxBudgetUsd`
- `effort`
- permissions
- hooks
- tools
- MCP
- skills

也就是说，Claude Code 的 Harness 能力通过 SDK 暴露出来。

---

## 10. 和 OpenClaw 对比

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| Harness 重点 | 本地 Coding Agent 安全与体验 | 多渠道 Agent Runtime 和 Gateway |
| 权限 | 多权限模式 + Bash 分类器 + Hook | Profile Policy + Allow/Deny + Owner-only + Exec Approval |
| Hook | 生命周期 Hook 极完整 | 事件驱动 Hook，偏 runtime 扩展 |
| 调度 | Routines | cron / Lane / session queue |
| 可观测性 | JSONL transcript | 事件流 + tool tracking + session/runtime 状态 |
| 沙箱 | OS 权限 / worktree | 节点/Gateway/权限策略/工具边界 |

---

## 11. 面试表达

可以这样说：

> Claude Code 的 Harness 是它最强的部分之一。它把权限系统、Bash 风险分类器、Hook、JSONL transcript、上下文压缩、Memory、Sub-agent、沙箱和 Routines 都包在模型外面。权限系统支持多种模式和细粒度规则，Bash 命令会用分类器判断风险；Hook 覆盖 Agent 生命周期约 27-28 种事件，可以观察、修改、注入或阻止行为；所有对话和工具调用会写入 JSONL append-only 日志，方便复盘和恢复。相比 OpenClaw，Claude Code 的 Harness 更偏本地 Coding Agent，OpenClaw 更偏多渠道、多 session 的 Agent Runtime。

---

## 12. 关键词

- Harness
- permissions
- Bash classifier
- alwaysAllow
- PreToolUse
- PostToolUse
- PermissionRequest
- PreCompact
- JSONL transcript
- sandboxing
- Routines
- Claude Agent SDK
- maxTurns
- maxBudgetUsd
