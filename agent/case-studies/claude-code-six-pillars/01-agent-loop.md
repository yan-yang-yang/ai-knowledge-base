# Claude Code 六大支柱技术细节：01 Agent Loop

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：Claude Code 在 Agent Loop 层的原理与工程细节，并对比 OpenClaw

---

## 1. 核心定位

Claude Code 的 Agent Loop 是一个典型的生产级 Coding Agent 循环。

最小形式仍然是：

```ts
while (true) {
  think();
  act();
  observe();
}
```

但 Claude Code 的真实 Loop 远不止 10 行。课程里提到：Claude Code 的核心 Agent Loop 函数有上千行，复杂点不在“调用模型”本身，而在：

- 流式响应
- 工具调用解析
- 并发工具调度
- 权限审批
- 状态追踪
- 上下文管理
- 死循环检测
- token 预算
- 输出截断恢复
- API 容错

一句话：

> **Claude Code 的 Agent Loop 是围绕 Coding Agent 场景手写出来的生产级循环，不依赖 LangChain 这类通用框架。**

---

## 2. 单轮循环发生什么

Claude Code 的一轮循环大致包括：

1. 组装上下文
2. 调用模型
3. 流式接收模型输出
4. 解析文本和工具调用
5. 判断工具是否可执行
6. 触发权限审批
7. 并发或串行执行工具
8. 把工具结果写回消息历史
9. 判断是否继续下一轮
10. 处理异常、预算和终止条件

它不是简单“模型返回 tool call → 执行工具”这么粗糙，而是每一步都有工程逻辑。

---

## 3. 7 种退出路径

课程中提到，Claude Code 的退出判断比“有没有工具调用”复杂得多，它有多种退出路径。

核心思想是：

> Agent Loop 不能只靠模型自然停止，还要有系统层面的退出判断。

常见退出原因包括：

- 模型正常返回最终答案
- 达到最大轮次
- token 预算不足
- 成本预算触顶
- 用户中断
- 权限拒绝导致无法继续
- 异常恢复失败

相比 OpenClaw：

- Claude Code 更强调本地 CLI coding workflow 的连续自主执行
- OpenClaw 更强调多渠道、多 session、事件驱动运行时

---

## 4. 流式响应与边说边执行

早期 Claude Code 体验比较僵硬：用户发一句话后，等几秒，突然刷出一大段；工具执行时又空白等待。

后来的 Claude Code 改成生产级流式体验：

- 模型边生成边显示
- 工具调用块完整后尽早执行
- 工具结果再进入下一轮上下文

这和 OpenClaw 一样，都采用了“边说边执行”的策略。

区别是：

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 实现方式 | 自研 StreamingToolExecutor / Loop 管线 | 基于 `pi-agent-core` 事件流 |
| 运行场景 | 本地 CLI 为主 | 多渠道消息平台 + WebChat + 节点 |
| 输出处理 | 终端流式体验 | Chunked Reply 适配 Slack/Telegram/Discord 等 |

---

## 5. 并发工具执行

Claude Code 依赖模型原生的 `parallel tool_use` 能力。

模型可以在一次响应中输出多个工具调用，Claude Code 再根据工具类型判断能否并发执行。

关键规则：

- 只读工具可以并发
- 写入工具需要串行
- 需要审批的工具会等待用户确认
- 不需要审批的工具可以先执行

例如：

- `Read` / `Grep` / `Glob`：通常可以并发
- `Edit` / `Write` / `Bash`：需要更谨慎，尤其涉及副作用

OpenClaw 则更多通过事件驱动和 Lane 队列做调度。

---

## 6. Token 预算保险丝

Claude Code 有 token 预算系统。

当上下文接近上限时，不是等 API 报错，而是提前拦截。

课程里提到一个设计：Claude Code 会保留一定缓冲区，例如 3000 token，避免请求发出去后才被模型 API 拒绝。

这样做有两个好处：

1. 用户不用白等一次网络往返
2. 避免无效请求被计费

如果预算不够，Claude Code 会进入恢复流程，例如压缩上下文或提示模型收尾。

---

## 7. 输出截断递进恢复

模型输出可能被 `max_tokens` 截断。

Claude Code 的处理是三步递进恢复：

1. 第一次把 `max_tokens` 提到 8192，希望模型说完
2. 不够则升到更大的输出上限，例如 64K
3. 再不行就注入一条“你的输出被截断了，请继续”的消息

超过恢复次数后放弃。

这体现了一个原则：

> Agent Loop 不只处理工具调用，还要处理模型输出本身的不完整性。

---

## 8. API 容错

Claude Code 的 API 容错分层比较清晰。

课程里提到：

- API 级重试：最多 10 次指数退避，可通过 `CLAUDE_CODE_MAX_RETRIES` 配置
- 尊重 `Retry-After`：服务端告诉什么时候恢复，就优先按服务端建议等
- 连续 529 触发模型降级：例如连续 3 次 529 后从 Opus 降到可用性更高的模型
- 流式失败后降级为非流式请求
- 流式失败和非流式重试共享失败预算，不是各算各的

和 OpenClaw 对比：

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 重试 | API 级指数退避，最多约 10 次 | Provider fallback 更激进，预算更大 |
| 流式失败 | 降级为非流式 | 多 Provider 适配 + fallback |
| 模型降级 | 连续 529 后降级 | 同 Provider / 跨 Provider 兜底 |

---

## 9. 面试表达

可以这样说：

> Claude Code 的 Agent Loop 是一个手写的生产级 Coding Agent 循环。它不是简单 `while(true)`，而是在每轮里处理上下文组装、流式输出、工具调用解析、权限审批、并发工具执行、工具结果回写、退出判断、token 预算、截断恢复和 API 容错。它支持边说边执行，读工具可以并发，写工具和高风险工具要串行或审批；同时有 token 预算、输出截断恢复、指数退避、流式失败转非流式、模型降级等保险丝。相比 OpenClaw，Claude Code 更偏本地 CLI 和 Coding Agent 场景，OpenClaw 更偏多渠道、多 session 的事件驱动运行时。

---

## 10. 关键词

- Agent Loop
- 手写核心循环
- StreamingToolExecutor
- parallel tool_use
- token budget
- max turns
- maxBudgetUsd
- output truncation recovery
- Retry-After
- 529 model downgrade
- streaming fallback
- CLI Coding Agent
