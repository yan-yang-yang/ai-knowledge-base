# Claude Code 六大支柱技术细节：05 Multi-Agent

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：Claude Code 在 Multi-Agent 层的原理与工程细节，并对比 OpenClaw

---

## 1. 核心定位

课程里反复强调：

> Multi-Agent 的核心不是角色扮演，而是上下文隔离。

Claude Code 的子 Agent 设计正是这个思路。

当主 Agent 需要探索大量代码时，它可以派一个 Explore Agent 出去。

子 Agent 在独立上下文里：

- 搜索代码库
- 阅读文件
- 分析调用链
- 汇总结果

最后只把压缩后的结论返回给父 Agent。

---

## 2. Parent-Child 模式

Claude Code 的子 Agent 是典型 Parent-Child 模式。

流程：

```txt
父 Agent 识别子任务
↓
调用 Agent 工具
↓
子 Agent 在独立上下文中工作
↓
子 Agent 输出最终结论
↓
结论作为工具结果注入父 Agent 上下文
```

特点：

- 单向
- 同步
- 低延迟
- 结果直接进入父上下文

和 OpenClaw 对比：

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 回传方式 | 子 Agent 结果直接作为工具结果注入 | Announce Queue 异步回传 |
| 父 Agent 是否阻塞 | 更偏同步 | 可异步通知 |
| 场景 | 本地代码探索 | 多会话、多渠道任务系统 |

---

## 3. Explore Agent：上下文压缩器

Claude Code 的 Explore Agent 可以读几十个文件、做十几次搜索。

但父 Agent 只收到几百到一两千 token 的总结。

这相当于 10-20 倍上下文压缩。

价值：

- 主上下文保持干净
- 探索过程不污染主任务
- 子 Agent 可以自由消耗自己的窗口
- 父 Agent 只吸收结论

这就是 Multi-Agent 在 Coding Agent 中最实际的用途。

---

## 4. AsyncLocalStorage：进程内上下文隔离

Claude Code 用 Node.js 的 `AsyncLocalStorage` 做进程内隔离。

它原本常用于后端请求级上下文隔离，例如每个请求有自己的 traceId。

Claude Code 用它给每个子 Agent 创建独立异步上下文。

具体来说：

- 子 Agent 启动时克隆一份文件状态缓存
- 不共享同一份可变状态
- 一个子 Agent 修改缓存，不影响另一个子 Agent

优点：

- 零 IPC 开销
- 启动快
- 内存成本低

缺点：

- 隔离不彻底
- 如果代码误用全局变量，仍可能泄漏状态

---

## 5. Worktree 隔离

对于高风险任务，Claude Code 提供 Worktree 模式。

它用：

```bash
git worktree
```

给子 Agent 创建独立工作目录。

子 Agent 可以在自己的 worktree 里：

- 大规模重构
- 实验性修改
- 跑测试
- 尝试方案

改坏了直接删掉，不影响主目录。

为了节省磁盘空间，Claude Code 会把 `node_modules` 等依赖目录用 symlink 指回主目录。

优点：

- 文件系统层面隔离
- 适合破坏性操作
- 可回滚

缺点：

- 创建有成本
- 占用更多磁盘
- 不适合小任务频繁启动

---

## 6. 文件冲突与并发安全

Claude Code 区分读写工具：

- Read / Grep / Glob 可以并发
- Edit / Write 必须串行

原因很简单：

- 读不改变状态
- 写会互相覆盖

多个 Agent 同时编辑同一个文件，会导致冲突。

所以 Claude Code 在工具层面对并发安全做判断。

---

## 7. 子 Agent 深度控制

Claude Code 没有像 OpenClaw 那样设置硬性的 `maxSpawnDepth = 1`。

它更依赖 token 预算自然收敛。

子 Agent 分到的 token 预算有限，用完就必须收工。

这是一种软限制。

对比：

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 深度控制 | token 预算自然收敛 | `maxSpawnDepth = 1` 硬限制 |
| 风格 | 依赖预算约束 | 依赖确定性规则 |
| 适用 | 本地 coding agent | 多用户多 session runtime |

---

## 8. Swarm：团队式多 Agent

Claude Code 还有更复杂的 Swarm 方案。

它不是简单父子模式，而是团队协作。

核心组件：

- Mailbox
- 共享任务列表
- 权限请求转发
- Leader 审批制关闭
- 多执行后端

---

## 9. Mailbox

Claude Code 的 Mailbox 是基于文件的消息系统。

每个 Agent 有一个收件箱，其他 Agent 往里面写消息。

并发安全通过：

- 文件锁
- 重试退避

解决。

如果两个 Agent 在同一个进程里，Claude Code 会跳过文件 I/O，直接用内存队列和 Promise 传递消息，提高效率。

---

## 10. 共享任务列表

团队需要共享任务列表。

Claude Code 给每个 team 创建独立任务目录。

多个 Agent 可以：

- 创建任务
- 认领任务
- 更新状态

并发控制仍然靠文件锁 + 重试退避。

团队名字用于解析同一个任务目录，确保不同执行后端看到的是同一套任务状态。

---

## 11. 权限请求转发

Worker Agent 如果需要权限，会把请求写到 `pending/` 目录。

Leader Agent 轮询 pending 请求，展示给用户。

用户批准或拒绝后，结果写到 `resolved/` 目录。

Worker 读取结果后继续或放弃。

这解决多 Agent 场景下：

> 权限决策必须集中到用户/Leader，而不是让每个 Worker 自己弹审批。

---

## 12. Leader 审批制关闭

Worker 不能自己决定“我干完了”。

它要向 Leader 发 shutdown 请求。

Leader 检查任务是否真的完成：

- 完成：批准退出
- 未完成：拒绝，并告知还需要做什么

这防止子 Agent 过早退出。

---

## 13. 三种执行后端

Claude Code Swarm 支持三种 teammate 后端：

- in-process
- tmux
- iTerm2

tmux 模式会给每个 teammate 开独立 pane，是真正进程隔离。

三种后端共享同一套：

- Mailbox
- 任务列表
- team 配置

后端选择自动完成：有 tmux 用 tmux，有 iTerm2 用 iTerm2，否则 fallback 到 in-process。

---

## 14. 面试表达

可以这样说：

> Claude Code 的 Multi-Agent 不是为了角色扮演，而是为了上下文隔离。主 Agent 可以通过 Agent 工具派 Explore 子 Agent 在独立上下文里搜索代码、阅读文件，最后只把压缩结论返回主上下文。它用 AsyncLocalStorage 做进程内隔离，用 git worktree 做高风险文件系统隔离，并在工具层区分只读并发和写入串行。更复杂的 Swarm 模式里，Claude Code 用 Mailbox、共享任务列表、权限请求转发和 Leader 审批制关闭来协调多个 Agent。相比 OpenClaw 的 Lane 队列和 Announce Queue，Claude Code 更偏本地开发环境中的团队式协作。

---

## 15. 关键词

- Explore Agent
- Parent-Child
- AsyncLocalStorage
- git worktree
- Mailbox
- file lock
- shared task list
- permission forwarding
- Leader approval
- in-process
- tmux
- iTerm2
