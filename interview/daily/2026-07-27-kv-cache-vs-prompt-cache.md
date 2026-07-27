# 2026-07-27：KV Cache 和 Prompt Cache 有什么区别？

> 题目来源：用户每日面试题。  
> 原始题意：KV Cache 和 Prompt Cache 区别。  
> 依据：Sitor「吃透 AI Agent 开发」课程 Cache 与成本控制、Context Engineering、Claude Code Prompt Cache 友好设计相关笔记。

---

## 1. 面试官真正想问什么？

这道题表面是在问两个 Cache 的定义，实际是在考四件事：

1. **你是否理解 LLM 推理过程**：知道 Attention 里会缓存 Key / Value，避免重复计算历史 token。
2. **你是否理解大模型 API 的成本机制**：知道 Prompt Cache 是 API 厂商给开发者暴露的计费优化，不等同于模型内部 KV Cache。
3. **你是否能做 Agent 成本优化**：知道稳定前缀、静态内容前置、动态内容后置、工具 schema 稳定对缓存命中率很关键。
4. **你是否能区分系统层级**：KV Cache 在推理引擎层，Prompt Cache 在 API /产品计费层，Context Collapse 在应用层。

面试时不要只说：

> KV Cache 是缓存 KV，Prompt Cache 是缓存 Prompt。

这个回答太浅。

更好的说法是：

> KV Cache 是模型推理引擎内部为了加速自回归生成而缓存历史 token 的 Key / Value 张量；Prompt Cache 是 API 提供商为了降低重复 prompt 成本而提供的前缀复用和计费折扣机制。KV Cache 主要影响推理速度和算力复用，开发者通常不能直接控制；Prompt Cache 主要影响 API 成本，开发者可以通过稳定 prompt 前缀、合理设置 cache_control、减少工具 schema 变化来提高命中率。

---

## 2. 1 分钟回答

KV Cache 和 Prompt Cache 最大区别是：**层级不同、控制权不同、优化目标不同**。

KV Cache 是模型推理层的缓存。Transformer 每生成一个 token，都要基于历史 token 做 Attention 计算。历史 token 的 Key 和 Value 已经算过，如果每一步都重新算会很浪费，所以推理引擎会把这些 K/V 张量缓存起来，后续生成时直接复用。它主要解决的是推理速度和算力效率问题，开发者一般不能直接操作，只能通过保持输入前缀稳定来间接帮助命中。

Prompt Cache 是 API 层的缓存。它关注的是“这段 prompt 之前是不是发过”。如果 system prompt、工具定义、长文档或对话历史的前缀重复，API 厂商可以按缓存读取价格计费，通常比普通输入 token 便宜很多。它主要解决的是成本问题，开发者可以直接优化，比如把稳定规则和工具说明放前面，动态时间、用户输入、临时上下文放后面；Anthropic / Qwen 这类还可以用 `cache_control` 显式标记缓存断点。

一句话：**KV Cache 是模型内部算得更快，Prompt Cache 是 API 侧让重复 prompt 算得更便宜。**

---

## 3. 深入回答：KV Cache 是什么？

Transformer 的核心计算是 Attention。每个 token 会被映射成三类向量：

- Q：Query，表示当前 token 想找什么信息；
- K：Key，表示历史 token 提供什么索引；
- V：Value，表示历史 token 真正携带的信息内容。

自回归生成时，模型是一个 token 一个 token 往外生成的。

如果没有 KV Cache，第 1000 个 token 生成时，模型要重新计算前 999 个 token 的 Key / Value；第 1001 个 token 又要再算一遍前 1000 个 token。这会造成大量重复计算。

KV Cache 的做法是：

```txt
第一次处理历史 token：计算并缓存 K/V
后续生成新 token：只计算新 token 的 Q/K/V，然后复用历史 K/V
```

它的特点：

| 维度 | KV Cache |
|---|---|
| 所在层 | 模型推理引擎内部 |
| 缓存内容 | Attention 计算中的 Key / Value 张量 |
| 主要目标 | 降低重复计算，提高推理速度 |
| 开发者能否直接控制 | 通常不能直接控制 |
| 影响方式 | 保持输入前缀稳定、减少无意义上下文变化 |
| 典型场景 | 多轮对话、长上下文、持续生成 |

注意：KV Cache 不等于“缓存模型回答”。它缓存的是中间计算结果，不是最终文本。

---

## 4. 深入回答：Prompt Cache 是什么？

Prompt Cache 是 API 层或服务商产品层的缓存机制。

它关心的是：你的请求前缀是否和之前某次请求一致。如果一致，服务商可以复用已经处理过的 prompt 计算，并按更低的缓存 token 价格收费。

常见模式有三类：

| 模式 | 代表 | 特点 |
|---|---|---|
| 隐式缓存 | OpenAI、DeepSeek、MiniMax 等 | 开发者不用改代码，API 自动识别重复前缀 |
| 显式标记缓存 | Anthropic、Qwen 等 | 开发者用 `cache_control` 标记缓存断点 |
| 显式创建缓存对象 | Gemini、豆包等 | 先创建 cache 对象，后续请求引用 cache id |

Prompt Cache 的优化目标是成本。

比如 Agent 系统里有很长的：

- system prompt；
- 安全规则；
- 工具定义；
- 项目规范；
- 长文档上下文；
- 历史对话。

如果每轮都全价付费，成本会很高。Prompt Cache 命中后，重复部分通常会按大幅折扣收费。

它的特点：

| 维度 | Prompt Cache |
|---|---|
| 所在层 | API / 服务商产品层 |
| 缓存内容 | prompt 前缀或显式标记内容 |
| 主要目标 | 降低输入 token 成本，也可能降低延迟 |
| 开发者能否控制 | 可以直接或间接控制 |
| 影响方式 | 稳定前缀、cache_control、工具 schema 稳定、静态内容前置 |
| 典型场景 | 长 system prompt、多轮 Agent、代码助手、知识库问答 |

---

## 5. 核心区别表

| 维度 | KV Cache | Prompt Cache |
|---|---|---|
| 层级 | 模型推理层 | API / 计费层 |
| 缓存对象 | Key / Value 张量，中间计算结果 | Prompt 文本前缀或缓存对象 |
| 主要目的 | 加速推理，减少 Attention 重算 | 降低重复输入 token 成本 |
| 开发者控制 | 通常不能直接控制 | 可以通过 prompt 结构直接优化 |
| 是否面向计费 | 不是主要计费接口 | 是，通常体现为 cached tokens 折扣 |
| 是否缓存答案 | 不缓存最终答案 | 也不是缓存答案，而是缓存输入处理结果 |
| 命中关键 | 历史上下文连续、前缀稳定 | 前缀完全一致或命中服务商缓存规则 |
| 失效原因 | 上下文变化、会话切换、推理引擎策略 | 前缀变化、TTL 过期、路由到不同节点、cache_control 位置错误 |
| 典型收益 | 更快、更省算力 | 更便宜，有时也更快 |

一句话：

> KV Cache 是“模型内部少算一遍”，Prompt Cache 是“API 侧重复输入少收钱”。

---

## 6. 为什么 Agent 场景特别重视 Prompt Cache？

Agent 和普通聊天不一样，它每轮请求通常都很长：

```txt
system prompt
+ 工具说明 / tool schema
+ 安全规则
+ 项目上下文
+ 历史对话
+ 工具调用结果
+ 当前用户问题
```

而 Agent 往往不是一问一答，而是多轮循环：

```txt
模型思考 → 调工具 → 工具结果回写 → 再调模型 → 再调工具 → 最终回答
```

如果前面的 system prompt、工具 schema、规则说明每轮都重复全价计费，成本会快速上升。

所以 Agent 成本优化里有一个很重要的原则：

> 把稳定、长、复用率高的内容放在前面；把动态、短、变化频繁的内容放在后面。

比如：

```txt
✅ 好结构：
通用系统规则 → 工具说明 → 项目长期规范 → 用户动态上下文 → 当前问题

❌ 坏结构：
当前时间 → 用户临时信息 → 通用系统规则 → 工具说明
```

如果一开始放当前时间戳，那么每次请求第一个 token 附近就变了，后面几千 token 的缓存都可能失效。

---

## 7. 常见 Bad Case

### 7.1 把动态内容放在 system prompt 开头

错误写法：

```txt
当前时间：2026-07-27 22:32
你是一个 AI 助手……
下面是 5000 token 工具说明……
```

每次时间变化都会破坏前缀稳定性。

正确做法：

```txt
你是一个 AI 助手……
下面是 5000 token 工具说明……
当前时间：2026-07-27 22:32
```

把动态内容放后面。

### 7.2 工具 schema 每轮动态变化

工具定义如果频繁增删、排序变化、描述变化，会破坏 Prompt Cache。

所以 Claude Code 的 Deferred Tool Loading、OpenClaw 的 Tool Profile，本质上都和 cache 友好有关：

- 不要一股脑塞所有工具；
- 不要让工具列表每轮随机变化；
- 尽量保持核心工具 schema 稳定；
- 大量工具按需加载或按场景裁剪。

### 7.3 cache_control 标记位置不对

显式缓存模式下，如果只缓存 system prompt，没有缓存长对话历史，Agent 多轮成本仍然可能很高。

更合理的方式通常是：

- 在稳定 system prompt 后打缓存点；
- 在长历史的合适位置打缓存点；
- 保证缓存点之前内容尽量稳定。

---

## 8. 项目中怎么讲？

可以结合 Agent 平台成本优化这样讲：

> 在 Agent 项目里，我会把 Cache 分成三层看。KV Cache 是模型推理层的优化，开发者通常不能直接操作，但要保持 prompt 前缀稳定，避免破坏推理侧复用。Prompt Cache 是 API 层的成本优化，开发者可以直接设计 prompt 结构，比如把系统规则、工具 schema、项目规范这些稳定长文本放前面，把时间、用户临时输入、动态检索结果放后面。对于显式缓存模型，会在合适 block 上加 `cache_control`；对于隐式缓存模型，就重点保证前缀一致性。
>
> 在 Coding Agent 或客服 Agent 里，工具定义和安全规则很长，如果每轮都全价传，成本会非常高。所以我会控制工具集合稳定性，比如使用 Tool Profile 或 Deferred Tool Loading，避免每轮动态增删工具 schema。这样既能降低 token 成本，也能减少模型误选工具。

如果面试官追问“这和 Context Compression 有什么关系”，可以补一句：

> Prompt Cache 是复用重复前缀，信息还在上下文里；Context Compression / Collapse 是当上下文太长时减少或折叠上下文内容。前者偏成本复用，后者偏窗口管理，不是一回事。

---

## 9. 高频追问

### Q1：KV Cache 会不会降低 API 计费？

不一定。KV Cache 是推理引擎内部的算力优化，是否把收益体现在价格上由服务商决定。开发者在账单里通常看不到“KV Cache token”。账单里常见的是 input tokens、output tokens、cached tokens，这更接近 Prompt Cache。

### Q2：Prompt Cache 是不是缓存模型输出？

不是。Prompt Cache 通常缓存的是输入 prompt 的处理结果或前缀复用，不是把上一次回答原样返回。当前请求的后续生成仍然会根据新输入继续推理。

### Q3：为什么前缀稳定这么重要？

因为无论 KV Cache 还是 Prompt Cache，都依赖“前面一段内容可复用”。如果请求开头放了时间戳、随机 ID、动态检索结果，前缀从一开始就变了，后面再长的稳定内容也可能无法命中。

### Q4：Prompt Cache 显式和隐式有什么区别？

隐式缓存由服务商自动识别重复前缀，开发者基本不用改代码，但命中可能受路由、TTL、LRU 等因素影响。显式缓存需要开发者标记缓存断点或创建缓存对象，控制更强，但要理解服务商规则和额外费用。

### Q5：为什么工具太多会影响 Prompt Cache？

工具 schema 本身是 prompt 的一部分。如果工具列表、顺序、描述每轮都变化，缓存前缀就不稳定。工具太多还会增加 token 成本和模型选择噪声，所以需要 Deferred Tool Loading 或 Tool Profile。

### Q6：KV Cache 和 Context Window 是一回事吗？

不是。Context Window 是模型一次能看的最大 token 数；KV Cache 是为了处理这些 token 时缓存 Attention 中间结果。窗口越长，KV Cache 占用的显存通常越大。

---

## 10. 背诵版

KV Cache 和 Prompt Cache 最大区别是层级不同。KV Cache 在模型推理层，缓存的是 Attention 里的 Key / Value 张量，用来避免自回归生成时反复计算历史 token，主要提升推理速度和算力效率，开发者通常不能直接控制。

Prompt Cache 在 API / 计费层，缓存的是重复 prompt 前缀或显式标记的上下文块，主要降低输入 token 成本。开发者可以通过 prompt 结构设计提高命中率，比如稳定内容前置、动态内容后置、工具 schema 保持稳定，或者使用 `cache_control` 标记缓存点。

一句话概括：KV Cache 是“模型内部少算一遍”，Prompt Cache 是“API 侧重复输入少收钱”。在 Agent 项目里，Prompt Cache 特别重要，因为 system prompt、工具定义、历史对话会在多轮 Agent Loop 中反复出现，缓存命中率直接影响成本。

---

## 11. 关键词速记

- KV Cache：推理层 / Attention / Key / Value / 加速生成
- Prompt Cache：API 层 / cached tokens / 计费折扣 / 前缀复用
- 核心原则：稳定前缀、静态前置、动态后置
- 显式缓存：`cache_control`、cache object
- 隐式缓存：服务商自动识别重复前缀
- Agent 成本优化：工具 schema 稳定、Tool Profile、Deferred Tool Loading
- 不要混淆：KV Cache ≠ Prompt Cache ≠ Context Collapse

---

## 12. 事实来源

- `/root/ai-text/4/Cache-全解与成本控制：别再弄混-KV-Cache、Prompt.md`：Cache 三层概念、KV Cache、Prompt Cache、Context Collapse、常见 Bad Case。
- `memory/notes/ai-agent-course-index.md`：Cache 与 Context Engineering 课程索引。
- `memory/notes/claude-code-six-pillars/03-context-engineering.md`：Claude Code Prompt Cache 友好设计。
- `memory/notes/claude-code-six-pillars/interview.md`：Deferred Tool Loading 与 Prompt Cache 稳定性。
