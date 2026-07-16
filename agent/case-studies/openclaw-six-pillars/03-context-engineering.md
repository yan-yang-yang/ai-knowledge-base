# OpenClaw 六大支柱技术细节：03 Context Engineering

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：OpenClaw 在 Context Engineering 层的原理与工程细节

---

## 1. 核心定位

Context Engineering 是 Agent 的大脑供血系统。

目标不是“塞更多内容”，而是：

> **让模型在正确的时间看到正确的信息。**

OpenClaw 的 Context Engineering 建在 Pi 的一个关键扩展点上：

```ts
transformContext
```

每次调用模型前，OpenClaw 可以在这个 hook 里对上下文做：

- 压缩
- 裁剪
- 注入
- 工具结果截断
- 记忆检索注入
- 最近轮次保护
- 标识符保留

---

## 2. transformContext：上下文治理入口

Pi 框架本身不做复杂上下文治理。

它提供 `transformContext` 这个钩子，让上层在发给模型前修改消息列表。

课程里明确说：

> OpenClaw 的整个上下文管理策略就建在这个 Hook 上。

这很关键。

因为 Agent 的上下文不是静态 prompt，而是持续膨胀的运行态 transcript：

- system prompt
- 用户消息
- assistant 推理/回复
- 工具调用
- 工具结果
- 记忆注入
- skill 说明
- 文件内容
- 错误日志

如果不治理，很快就会超过上下文窗口。

---

## 3. OpenClaw 四层压缩：渐进式防御

课程中专门讲到 OpenClaw 的四层上下文压缩策略。

它不是一上来就摘要，而是从轻到重逐层处理。

### 第一层：工具结果实时截断

OpenClaw 不等工具结果“过期”后再清理，而是在每次准备发送上下文给模型前，也就是 `transformContext` 阶段，检查所有工具结果。

如果单个工具输出太长，会先截断。

原因：

- 工具结果是上下文膨胀大户
- 很多工具输出包含大量无用细节
- 保留关键错误、路径、摘要通常就够了

---

### 第二层：老旧 tool result 替换

如果单条截断后还是超预算，OpenClaw 会从最老的 tool result 开始替换为：

```txt
[compacted: tool output removed to free context]
```

特点：

- 从老到新处理
- 优先保护最近信息
- 保留“这里曾经有工具结果”的结构痕迹
- 不直接删除整个消息结构

这符合课程里的原则：

> 压缩不等于删除，好的上下文管理应该尽量可恢复、可解释。

---

### 第三层：按轮次裁剪

如果工具结果处理后仍然超预算，OpenClaw 会按轮次裁剪旧对话。

注意，它是 **按 user turn 轮次**，不是简单按 token 数。

它会保留最近 N 轮 user turn 以及相关 assistant 回复和 tool result，更早的内容直接移出上下文。

这样做的好处：

- 最近用户意图通常最重要
- 对话结构更完整
- 避免切到半轮导致语义断裂

---

### 第四层：LLM 摘要压缩

当上下文接近窗口上限时，`pi-coding-agent` 会触发摘要压缩。

OpenClaw 的摘要压缩有几个细节。

#### 4.1 Token 估算

OpenClaw 使用启发式估算：

```txt
tokens ≈ chars / 4
```

同时加 1.2 倍安全系数。

原因是中文、多字节字符等场景下 token 估算容易低估。

#### 4.2 分段摘要

上下文太长时，会先分段，确保每段不超过模型可处理范围。

#### 4.3 结构化输出

OpenClaw 的摘要不是自由文本，而是要求包含固定 section。

课程里提到必须包含 5 个固定部分。

这种结构化摘要比随意总结更适合后续恢复上下文。

#### 4.4 质量守卫

摘要生成后，OpenClaw 会检查：

- 5 个 section 是否齐全
- 关键标识符是否保留
- 最近一次用户请求是否体现
- 重要任务状态是否保留

不通过会重试，最多 3 次。

---

## 4. Identifier Preservation：关键标识符保留

OpenClaw 对标识符保留有专门策略。

配置项类似：

```txt
compaction.identifierPolicy
```

支持：

| 策略 | 含义 |
|---|---|
| `strict` | 默认，要求原样保留 UUID、hash、API key 形态字符串等 |
| `off` | 不注入标识符保留指令 |
| `custom` | 通过自定义 instruction 指定保留规则 |

为什么重要？

因为 Agent 任务里很多关键内容不是自然语言，而是精确字符串：

- 文件路径
- 函数名
- 类名
- commit hash
- UUID
- 错误码
- API endpoint
- 数据库字段名

这些内容一旦被摘要改写，后续工具调用就可能失败。

---

## 5. 最近 N 轮保护

OpenClaw 会保护最近 N 轮对话。

原因：

- 最近用户请求通常是当前目标
- 最近工具结果通常是最新状态
- 最近错误信息对修复最关键

这也是对 Lost in the Middle 的工程应对：

> 不让关键近期信息掉进上下文中间或被过早压缩。

---

## 6. Memory Flush：压缩前先存档

OpenClaw 在触发上下文压缩前，会先跑 Memory Flush。

让 Agent 判断当前会话中是否有值得长期保存的信息，并写入记忆。

解决的问题：

> 压缩会丢信息。如果压缩前不存档，重要信息可能既不在上下文里，也不在长期记忆里。

触发条件包括：

- 已用 token 接近窗口上限
- transcript 文件超过阈值

这体现了 Context Engineering 和 Memory 的联动。

---

## 7. Overflow fallback

如果前面几层都没有把上下文压回预算，模型 API 可能返回 context overflow。

OpenClaw 会进入兜底机制，继续降级处理。

这说明上下文治理不是单点能力，而是多层防御系统。

---

## 8. 面试表达

可以这样说：

> OpenClaw 的 Context Engineering 建在 Pi 的 `transformContext` 钩子上。每次调用模型前，它会对上下文做压缩、裁剪和注入。它的压缩是四层渐进式防御：先实时截断工具结果，再从老旧 tool result 开始替换，然后按最近 N 轮保护裁剪旧对话，最后触发 LLM 摘要。摘要阶段会做 token 估算、分段、结构化输出和质量检查，并通过 identifierPolicy 保留关键标识符。压缩前还会触发 Memory Flush，避免重要信息丢失。

---

## 9. 关键词

- Context Engineering
- `transformContext`
- Compaction
- Summarization
- adaptive chunking
- tool result truncation
- recent N turns protection
- identifier preservation
- `compaction.identifierPolicy`
- Memory Flush
- context overflow fallback
- Lost in the Middle
