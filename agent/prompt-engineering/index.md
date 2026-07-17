# Prompt Engineering 与 Context Engineering

> 来源：`/root/ai-text/4/System-Prompt-工程化与-Context.md`、`/root/ai-text/4/Context-Engineering-全景：五个维度，一张地图-—.md`、`/root/ai-text/4/Cache-全解与成本控制：别再弄混-KV-Cache、Prompt.md`。  
> 用途：从“写提示词”升级到“设计上下文系统”。

---

## 0. 一句话总结

**Prompt Engineering 在 Agent 里不只是写几句指令，而是 System Prompt、动态上下文、缓存、压缩、检索和用户自定义共同组成的行为控制系统。**

---

## 1. 从 Prompt 到行为控制系统

课程把 System Prompt 工程化拆成几个问题：

1. Prompt 怎么分模块？
2. 什么该缓存，什么不该缓存？
3. 用户怎么自定义 Agent 行为？
4. 高频变化的信息放在哪里？
5. 如何避免 Context Rot？

Agent 的 Prompt 通常包含：

- 身份和任务边界
- 工具使用规则
- 权限和安全要求
- 输出格式要求
- 项目约定
- 用户偏好
- 当前运行时上下文

这些内容变化频率不同，不能全部混在一个大 prompt 里。

---

## 2. Prompt 模块化

一个合理的 Agent Prompt 应该分层：

| 层级 | 内容 | 变化频率 | 例子 |
|---|---|---:|---|
| Base System | Agent 基本行为和安全规则 | 低 | 不泄露隐私、工具调用规范 |
| Product / Runtime | 运行时能力和平台规则 | 中低 | OpenClaw 工具策略、消息渠道限制 |
| Project Context | 项目约定 | 中 | pnpm、目录结构、测试命令 |
| User Preferences | 用户偏好 | 中 | 喜欢直接反馈、输出中文 |
| Turn Context | 当前任务上下文 | 高 | 当前问题、选中文件、最近错误 |

模块化的目的：

- 降低维护难度。
- 避免互相冲突。
- 保护 Prompt Cache。
- 让高频变化内容放在后面。

---

## 3. CLAUDE.md 代表的静态上下文机制

课程用 Claude Code 举例：

```txt
~/.claude/CLAUDE.md              # 用户全局，跨项目生效
项目根目录/.claude/CLAUDE.md     # 项目级，团队共享
CLAUDE.local.md                  # 本地私有，不提交 Git
```

这类文件解决冷启动问题：

- 项目用什么包管理器。
- 测试命令是什么。
- Commit message 风格。
- API 约定。
- 哪些目录不要碰。

它和 Memory 的区别：

| 类型 | 作用 |
|---|---|
| 静态上下文文件 | 项目稳定规则和操作指南 |
| Memory | 跨会话沉淀的偏好、反馈和经验 |
| 当前上下文 | 本轮任务需要的信息 |

---

## 4. Context Engineering 五个维度

课程把 Context Engineering 分成五个维度：

| 维度 | 含义 | 典型手段 |
|---|---|---|
| Offload | 把信息搬到上下文之外 | 文件系统、数据库、artifact |
| Reduce | 就地压缩上下文 | 摘要、截断、清理工具结果 |
| Retrieve | 按需取回信息 | RAG、memory search、grep |
| Isolate | 隔离上下文 | sub-agent、worktree、独立 session |
| Cache | 复用计算结果 | KV Cache、Prompt Cache |

这五个维度共同回答一个问题：

> 模型应该在什么时候看到什么信息，以及哪些信息不应该直接塞进窗口。

---

## 5. Context Rot：上下文不是越多越好

课程提醒：上下文会“腐烂”。

表现包括：

- 历史内容太多，模型注意力被稀释。
- 旧信息和新信息冲突。
- 工具结果噪声淹没有用信息。
- 压缩摘要丢掉关键错误和约束。
- 模型看到太多内容后反而偷懒，不再主动检索。

所以最好的压缩不是事后拼命总结，而是：

- 一开始就不要塞无关内容。
- 高频变化内容后置。
- 可推导信息不要重复写入 Memory。
- 大结果外置，只保留摘要和引用。

---

## 6. Cache：三个层次不要混淆

课程区分了三个 Cache：

| 类型 | 层级 | 含义 |
|---|---|---|
| KV Cache | 模型推理层 | 复用 Transformer 已计算的 Key/Value |
| Prompt Cache | API 层 | 复用稳定 prompt 前缀，降低成本和延迟 |
| Context Collapse | 应用层 | 通过压缩/裁剪降低上下文体积 |

常见坏实践：

- 把动态时间、随机内容放在 prompt 前缀，破坏 Prompt Cache。
- 随意改变工具 schema 列表，导致缓存失效。
- 把所有上下文提前塞进去，后面再压缩。

---

## 7. 面试表达

### 7.1 两分钟回答版

> 在 Agent 里，Prompt Engineering 不能理解成写一段提示词，而应该理解成上下文系统设计。System Prompt 需要模块化，把基础安全规则、运行时规则、项目上下文、用户偏好和当前任务上下文分层管理，因为它们变化频率不同，也会影响 Prompt Cache。Context Engineering 则进一步解决模型什么时候看到什么信息，可以从 Offload、Reduce、Retrieve、Isolate、Cache 五个维度设计：能放外部就不要塞进窗口，能按需检索就不要提前塞，复杂探索可以交给子 Agent 隔离，稳定前缀要保护缓存。这样才能避免 Context Rot，也就是上下文太多、太旧、太乱导致模型注意力下降或行为漂移。

### 7.2 高频追问

#### Q1：System Prompt 和 Memory 有什么区别？

System Prompt 更像稳定行为规则和运行边界；Memory 是跨会话沉淀的用户偏好、项目经验和反馈。能写在项目静态文件里的规则，不应该重复存成动态记忆。

#### Q2：为什么动态内容不要放在 prompt 前面？

因为 Prompt Cache 通常依赖稳定前缀。动态内容放前面会导致后面所有内容的缓存都失效，增加成本和延迟。

#### Q3：Context Engineering 和 RAG 是什么关系？

RAG 是 Context Engineering 里 Retrieve 维度的一种实现。Context Engineering 还包括 Offload、Reduce、Isolate、Cache，不等于 RAG。

---

## 8. 关键词速记

- System Prompt
- Context Engineering
- Offload / Reduce / Retrieve / Isolate / Cache
- CLAUDE.md
- Context Rot
- KV Cache
- Prompt Cache
- Context Collapse
- JIT Context
