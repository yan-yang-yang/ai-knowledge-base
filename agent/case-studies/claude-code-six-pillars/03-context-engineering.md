# Claude Code 六大支柱技术细节：03 Context Engineering

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：Claude Code 在 Context Engineering 层的原理与工程细节，并对比 OpenClaw

---

## 1. 核心定位

Context Engineering 的核心不是把上下文塞满，而是：

> **让模型在正确的时间看到正确的信息。**

Claude Code 在 Context Engineering 上做得很完整，尤其体现在：

- CLAUDE.md 三层加载
- Deferred Tool Loading
- Agentic Search
- Explore 子 Agent
- Microcompact
- Snip
- Auto-compact
- PreCompact Hook
- Prompt Cache 友好设计

课程里评价：在几个框架里，Claude Agent SDK / Claude Code 是少数真正内置上下文治理的系统。

---

## 2. CLAUDE.md 三层加载

Claude Code 通过 `CLAUDE.md` 注入静态项目上下文。

典型三层：

```txt
~/.claude/CLAUDE.md              # 用户全局，跨项目生效
项目根目录/.claude/CLAUDE.md     # 项目级，团队共享，可提交 Git
CLAUDE.local.md / 本地配置        # 私有本地，不提交
```

它解决的是冷启动问题。

例如：

- 项目用 pnpm 不用 npm
- 测试用 vitest
- commit message 用中文
- 目录结构约定
- API 约定
- 常见命令

和 Memory 的关系：

| 类型 | 作用 |
|---|---|
| CLAUDE.md | 静态上下文，项目/用户稳定规则 |
| MEMORY.md | 动态记忆，跨会话沉淀的偏好和经验 |

---

## 3. Agentic Search，而不是代码 RAG

课程里提到一个重要观点：Claude Code 早期试过本地向量数据库做代码 RAG，后来放弃了。

原因：代码有明确结构，很多时候确定性工具比向量检索更准。

Claude Code 更偏 Agentic Search：

- `Grep`
- `Glob`
- `Read`
- 选择性读文件
- 多轮搜索 query 调整

模型在 Agent Loop 中自主决定：

1. 搜什么
2. 读哪个文件
3. 信息够不够
4. 要不要换 query
5. 是否派 Explore 子 Agent

这本质上是一种 Agentic RAG，只是检索工具不是向量数据库，而是确定性代码搜索工具。

---

## 4. Explore 子 Agent：上下文隔离

如果需要大范围搜索，比如“找所有鉴权相关逻辑”，Claude Code 会派 Explore 子 Agent。

子 Agent 在独立上下文里：

- 搜索大量文件
- 阅读代码
- 分析调用链
- 汇总结论

最后只把压缩后的结果返回给主 Agent。

这属于 Context Engineering 五维中的 Isolate：

> 用多 Agent 隔离上下文，避免主上下文被大量探索过程污染。

---

## 5. 三层压缩：Microcompact → Snip → Auto-compact

Claude Code 的上下文压缩是渐进式降级。

课程明确说：

> Claude Code 的压缩策略是先轻后重，从 Microcompact 到 Snip，再到 Auto-compact。

### 5.1 Microcompact

Microcompact 是真正的 Compaction：就地缩小工具结果。

会清理：

- Read
- Bash
- Grep
- Glob
- WebSearch
- WebFetch
- Edit / Write 的大输入参数

这些内容往往是一次性的，保留完整原文价值不高。

### 5.2 Snip

如果 Microcompact 不够，就开始砍掉旧对话。

Snip 会移除更早的消息，但需要修复 `tool_use` / `tool_result` 配对。

因为如果裁掉了工具调用，却留下对应工具结果，API 会报错。

### 5.3 Auto-compact

Auto-compact 是 LLM 摘要压缩，用摘要替代旧对话。

注意：它叫 compact，但本质是 Summarization。

这一步更重，因为：

- 要额外调用模型
- 有信息损失风险
- 摘要质量会影响后续任务

所以 Claude Code 先用轻手段，最后才上 Auto-compact。

---

## 6. Auto-compact 细节

Claude Code 的 Auto-compact 有几个关键工程设计。

### 6.1 剥离图片

图片 token 很贵，摘要时不需要完整图像。

Claude Code 会把图片块替换为：

```txt
[image]
```

保留“这里有图”这个事实，但不消耗大量视觉 token。

### 6.2 重新附加最近文件

压缩后，Claude Code 会重新附加最近读过的 5 个文件内容。

每个文件最多约 5K token，整个恢复阶段有总预算。

原因：Coding Agent 当前正在操作的文件非常关键，不能因为压缩就丢失。

### 6.3 摘要必须保留错误和修复方式

Auto-compact prompt 中有明确要求：

> Errors that you ran into and how you fixed them

也就是必须保留“遇到过什么错误，以及怎么修复的”。

这对 Coding Agent 特别重要，因为错误和修复路径是后续避免重复踩坑的关键上下文。

### 6.4 失败重试

如果压缩失败，Claude Code 会重试。

连续 3 次失败后放弃自动压缩，避免无限浪费。

---

## 7. Prompt Cache 友好设计

Claude Code 很重视 Cache。

它会避免随意改变 prompt 前缀，尤其是工具定义和静态上下文。

比如前面提到：工具参数补全时不改模型原始输入，就是为了避免 Prompt Cache 失效。

Deferred Tool Loading 也和 Cache 强相关：

- 不直接动态增删工具 schema
- 用 API 原生 `defer_loading` / `tool_reference`
- 保持缓存计算稳定

---

## 8. 和 OpenClaw 对比

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 上下文入口 | CLAUDE.md 三层加载 | AGENTS/SOUL/MEMORY + runtime context |
| 搜索方式 | Agentic Search，grep/glob/read | RAG + memory search + tools |
| 压缩 | Microcompact → Snip → Auto-compact | 工具结果截断 → 老 tool result 替换 → 最近轮保护 → 结构化摘要 |
| 摘要恢复 | 重新附加最近 5 个文件 | 标识符保留、5 section 质量守卫 |
| Hook | PreCompact Hook | transformContext / compaction hook |
| 重点场景 | 本地代码仓库 | 多渠道、多会话 Agent Runtime |

---

## 9. 面试表达

可以这样说：

> Claude Code 的 Context Engineering 很完整。它通过三层 CLAUDE.md 注入静态项目上下文，通过 Grep、Glob、Read 做 Agentic Search，而不是依赖向量 RAG 来理解代码。面对上下文膨胀，它采用 Microcompact、Snip、Auto-compact 三层渐进式压缩：先清理工具结果，再裁剪旧消息，最后才用 LLM 摘要。Auto-compact 时会剥离图片、保留错误和修复方式，并重新附加最近读过的文件，保证 Coding Agent 不会压缩后忘记当前任务。相比 OpenClaw，Claude Code 更针对本地代码编辑场景，OpenClaw 更强调多会话运行时和结构化压缩策略。

---

## 10. 关键词

- CLAUDE.md
- Agentic Search
- Grep / Glob / Read
- Explore 子 Agent
- Microcompact
- Snip
- Auto-compact
- PreCompact Hook
- Prompt Cache
- recent files reattach
