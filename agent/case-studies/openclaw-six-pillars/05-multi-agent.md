# OpenClaw 六大支柱技术细节：05 Multi-Agent

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：OpenClaw 在 Multi-Agent 层的原理与工程细节

---

## 1. 核心定位

课程里强调：

> Multi-Agent 的核心价值不是分角色，而是分上下文。

很多教程把 Multi-Agent 讲成：

- PM Agent
- Developer Agent
- Tester Agent
- Reviewer Agent

但生产级 Agent 系统更关注的是：

- 上下文隔离
- 并发控制
- 资源限制
- 结果回传
- 取消传播
- 防止无限嵌套

OpenClaw 的 Multi-Agent 设计也是围绕这些问题展开。

---

## 2. subagents-tool：OpenClaw 自己补的多 Agent 层

Pi 本身不内置完整 Multi-Agent 能力。

OpenClaw 在上层加了：

```txt
subagents-tool
```

主 Agent 可以把某个任务委派给子 Agent。

子 Agent 在自己的上下文中工作，最后把结果回传给父 Agent。

这样父 Agent 不需要把所有探索过程都塞进自己的上下文。

价值：

- 子 Agent 可以独立读大量资料
- 父 Agent 只接收压缩后的结论
- 降低主上下文污染
- 支持并行探索

---

## 3. Announce Queue：异步结果回传

OpenClaw 和 Claude Code 的子 Agent 回传不同。

Claude Code 更直接：

> 子 Agent 最终输出作为工具结果直接注入父 Agent 上下文。

OpenClaw 更精细：

> 子 Agent 完成后，结果先进入 Announce Queue，再异步通知父 Agent。

Announce Queue 的机制：

| 机制 | 作用 |
|---|---|
| 1 秒防抖 | 避免子 Agent 频繁更新打断父 Agent |
| 指数退避重试 | 投递失败后 2s、4s、8s 直到上限 60s |
| 异步投递 | 父 Agent 不必阻塞等待子 Agent |

这个设计适合 OpenClaw 这种多会话、多渠道、多任务系统。

它解决的是：

- 子 Agent 结果什么时候注入
- 父 Agent 是否被打断
- 投递失败怎么办
- 子 Agent 高频更新怎么降噪

---

## 4. Lane 模型：队列化并发控制

OpenClaw 的并发控制核心是 Lane 模型。

Lane 可以理解为“车道”。

不同任务走不同车道，每条车道有自己的并发配额。

课程里举例：

| Lane | 并发特点 |
|---|---|
| `main` | 主会话任务，最多若干并发 |
| `cron` | 定时任务，通常串行 |
| `subagent` | 子 Agent 任务，可有较高并发 |

更重要的是：

> 同一个 session 内部严格串行，跨 session 可以并行。

---

## 5. 嵌套队列实现

OpenClaw 的实现是两层队列：

```txt
消息到达
↓
session 级别队列
↓
全局 lane 队列
↓
执行
```

### session 队列

保证同一个 session 内的消息按顺序执行。

避免：

- 两条 prompt 同时修改同一个上下文
- 两个工具调用同时改同一份状态
- 用户连续发送导致上下文错乱

### lane 队列

控制全局不同类型任务的并发上限。

例如：

- 定时任务不能无限并发
- 子 Agent 不能无限启动
- 主会话要有较高优先级

这个设计避免了复杂锁。

核心思想：

> 用队列顺序化代替共享状态锁。

---

## 6. 为什么 Lane 模型务实

多 Agent 并发最怕冲突。

典型问题：

- 两个 Agent 同时 edit 同一个文件
- 一个 Agent 读到旧状态，另一个已经改了
- 全局变量被污染
- 父任务取消了，子任务还在跑

OpenClaw 没有默认追求“所有 Agent 完全并行”。

它选择：

- 同 session 串行
- 跨 session 并行
- 不同 Lane 控制并发

这解决了大部分实际问题。

课程评价这个设计很务实：

> 大部分 Agent 场景不需要两个 Agent 同时改同一个 session 的状态，用队列把同 session 操作排好，就能解决 90% 的并发问题。

---

## 7. AbortController 传播

取消传播是 Multi-Agent 系统容易忽略的问题。

如果父 Agent 被取消，子 Agent 必须一起停。

OpenClaw 会把 abort signal 沿 Agent 树向下传播：

```txt
父 Agent abort
↓
子 Agent abort
↓
孙 Agent abort
```

否则会出现：

- 用户以为任务停了
- 子 Agent 还在后台跑
- 继续消耗 token
- 继续执行工具
- 可能产生副作用

Abort 传播是资源控制和安全控制的一部分。

---

## 8. maxSpawnDepth：防止无限嵌套

OpenClaw 直接设置硬限制：

```txt
maxSpawnDepth = 1
```

含义：

> 子 Agent 不能再派生子 Agent，子 Agent 是叶子节点。

这防止：

```txt
A 派 B
B 派 C
C 派 D
D 派 E
...
```

无限嵌套会导致：

- token 成本爆炸
- 工具调用失控
- 调试困难
- 权限边界复杂
- 任务结果难以汇总

所以 OpenClaw 用硬限制兜底。

---

## 9. Multi-Agent 的成本提醒

课程最后强调：

> 能用一个 Agent 搞定的事，就别拆成多个。

因为拆 Agent 有成本：

- 启动成本
- 上下文传递成本
- 结果汇总成本
- 并发安全成本
- 调试成本
- 调度成本

Multi-Agent 适合：

- 独立探索
- 大量资料检索
- 并行信息收集
- 高风险实验隔离
- 主上下文需要保持干净

不适合：

- 简单线性任务
- 高度共享状态任务
- 需要持续精细协同的任务

---

## 10. 面试表达

可以这样说：

> OpenClaw 的 Multi-Agent 重点不是角色扮演，而是上下文隔离和并发控制。Pi 本身不内置多 Agent，OpenClaw 通过 `subagents-tool` 实现子 Agent 调用。子 Agent 的结果不是直接塞回父上下文，而是进入 Announce Queue，带 1 秒防抖和指数退避重试，避免频繁打断父 Agent。并发上，OpenClaw 用 Lane 模型，把 main、cron、subagent 等任务分车道调度，同一个 session 内严格串行，跨 session 并行。同时通过 abort signal 传播和 `maxSpawnDepth = 1` 防止任务取消失效和子 Agent 无限嵌套。

---

## 11. 关键词

- Multi-Agent
- subagents-tool
- Announce Queue
- debounce
- exponential backoff
- Lane 模型
- session queue
- global lane queue
- 同 session 串行
- 跨 session 并行
- AbortController
- abort signal propagation
- `maxSpawnDepth = 1`
- 上下文隔离
