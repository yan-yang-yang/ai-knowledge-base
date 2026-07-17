# Claude Code 六大支柱：面试速记与总结

> 记录时间：2026-07-17 16:29 GMT+8  
> 来源：基于 Sitor「吃透 AI Agent 开发」课程材料和已有 Claude Code 六大支柱拆分笔记整理。  
> 用途：面试前快速复习 Claude Code 的 Agent 工程化细节。

---

## 0. 一句话定位

**Claude Code 是围绕本地代码开发场景打造的生产级 Coding Agent：它用手写 Agent Loop 驱动模型连续工作，用工具系统读写执行代码，用上下文工程控制信息窗口，用文件式 Memory 沉淀长期偏好，用子 Agent 隔离探索任务，再用 Harness 把权限、安全、日志、调度和恢复能力包起来。**

---

## 1. 六大支柱总览表

| 支柱 | Claude Code 核心能力 | 面试关键词 |
|---|---|---|
| Agent Loop | 手写生产级 Coding Loop，处理流式、工具、权限、预算、容错 | streaming、parallel tool_use、token budget、Retry-After、529 downgrade |
| Tool System | 自研工具管线，代码读写执行，Zod 校验，延迟工具加载 | Zod、validateInput、ToolSearch、Deferred Tool Loading、MCP、Skills |
| Context Engineering | 让模型在正确时间看到正确代码和任务上下文 | CLAUDE.md、Agentic Search、Explore、Microcompact、Snip、Auto-compact |
| Memory | Markdown 文件派长期记忆，透明可审查 | MEMORY.md、user/feedback/project/reference、AutoDream、200 行上限 |
| Multi-Agent | 用子 Agent 隔离大量代码探索和团队式协作 | Explore Agent、AsyncLocalStorage、git worktree、Swarm、Mailbox、Leader |
| Harness Engineering | 模型外部的安全、可观测、可恢复运行环境 | permissions、Bash classifier、Hooks、JSONL transcript、sandbox、Routines |

---

## 2. Agent Loop 面试细节

### 2.1 核心观点

Claude Code 的 Agent Loop 不是简单 while true，而是一个面向代码开发场景的生产级循环。

一轮循环大致包括：

1. 组装上下文
2. 调用 Claude 模型
3. 流式接收输出
4. 解析文本和工具调用
5. 判断工具权限和风险
6. 并发或串行执行工具
7. 写回工具结果
8. 判断是否继续下一轮
9. 处理预算、异常和退出

### 2.2 关键工程点

- **流式响应**：模型边生成边显示，工具调用块完整后尽早执行。
- **并发工具执行**：读工具如 Read/Grep/Glob 可并发；写工具如 Edit/Write/Bash 要串行或审批。
- **多退出路径**：最终答案、最大轮次、token 不足、成本预算、用户中断、权限拒绝、异常恢复失败。
- **Token 预算保险丝**：提前预留 buffer，避免请求发出后才超限。
- **输出截断恢复**：逐步提高 `max_tokens`，仍不够则注入“请继续”。
- **API 容错**：指数退避、尊重 Retry-After、连续 529 后模型降级、流式失败转非流式。

### 2.3 面试回答

> Claude Code 的 Agent Loop 是手写的生产级 Coding Agent 循环。它不只是调用模型，而是在每一轮里处理上下文组装、流式输出、工具调用解析、权限审批、并发工具调度、工具结果回写、预算控制、截断恢复和 API 容错。比如读工具可以并发，写工具要串行或审批；当 token 接近上限会提前压缩或停止；当输出被截断会尝试恢复；遇到 529 会指数退避甚至模型降级。这些机制让它能稳定完成真实代码任务。

---

## 3. Tool System 面试细节

### 3.1 核心观点

Claude Code 的工具系统是它从 ChatBot 变成 Coding Agent 的关键。

典型工具：

- Read
- Edit
- Write
- Bash
- Grep
- Glob
- WebSearch
- WebFetch
- MCP tools
- Skills

### 3.2 关键工程点

- **工具独立实现**：每个工具是独立 TypeScript 文件。
- **Zod 参数校验**：先保证格式正确。
- **validateInput 业务校验**：路径是否合法、文件是否存在、Edit 旧文本能否匹配等。
- **输入补全不污染原始输入**：执行时使用补全副本，但历史里保留模型原始输入，保护 Prompt Cache。
- **工具结果截断与落盘**：大输出存磁盘，对话里只放摘要和路径引用。
- **Deferred Tool Loading**：大量工具不一次性塞进上下文，而是通过 ToolSearch 按需加载 schema。
- **MCP 三段式命名**：`mcp__server__tool`，避免冲突并方便权限控制。
- **Skills**：用 `SKILL.md` 分发“什么时候用、怎么用、注意什么”。

### 3.3 面试回答

> Claude Code 的 Tool System 是自研的代码工具管线。它用 Zod 做格式校验，用 validateInput 做业务校验，避免“参数格式对但业务不可执行”。工具执行前会生成补全副本，但不修改模型原始输入，以保护 Prompt Cache。工具结果过大会截断并持久化到磁盘，只把摘要和引用放回上下文。面对工具数量膨胀，它用 Deferred Tool Loading 和 ToolSearch 按需加载工具 schema；MCP 工具用 `mcp__server__tool` 三段式命名，方便隔离和权限控制。

---

## 4. Context Engineering 面试细节

### 4.1 核心观点

Context Engineering 的目标不是塞满上下文，而是让模型在正确时间看到正确信息。

Claude Code 的核心是围绕代码仓库做上下文治理。

### 4.2 关键工程点

- **CLAUDE.md 三层加载**：用户全局、项目级、本地私有。
- **Agentic Search**：用 Grep/Glob/Read 多轮搜索，而不是主要依赖代码向量 RAG。
- **Explore 子 Agent**：大范围搜索交给子 Agent，父 Agent 只接收压缩结论。
- **Microcompact**：先就地缩小工具结果。
- **Snip**：再裁剪旧消息，同时修复 tool_use/tool_result 配对。
- **Auto-compact**：最后才用 LLM 摘要旧上下文。
- **压缩后恢复当前工作集**：重新附加最近读过的文件。
- **摘要保留错误和修复方式**：避免重复踩坑。
- **Prompt Cache 友好**：避免频繁改变 prompt 前缀和工具定义。

### 4.3 面试回答

> Claude Code 的 Context Engineering 很适合代码场景。它通过 CLAUDE.md 三层加载解决冷启动，用 Grep/Glob/Read 做 Agentic Search，而不是过度依赖向量 RAG；大范围搜索交给 Explore 子 Agent，避免污染主上下文。上下文膨胀时，它按 Microcompact、Snip、Auto-compact 渐进压缩：先清工具结果，再裁剪旧消息，最后才做 LLM 摘要。Auto-compact 后还会重新附加最近文件，并要求摘要保留错误和修复方式，保证 Coding Agent 不会忘记当前任务状态。

---

## 5. Memory 面试细节

### 5.1 核心观点

Claude Code 的 Memory 走文件派：用 Markdown 管理长期记忆。

### 5.2 关键工程点

- **MEMORY.md + 独立 Markdown**：索引和正文分离。
- **四类记忆**：user、feedback、project、reference。
- **Agent 自己读写记忆**：不需要复杂数据库 API。
- **不存清单**：能从代码、git、CLAUDE.md 推导的信息不重复存。
- **手动记忆优先**：用户明确要求记住时，跳过自动提取，避免重复。
- **Sonnet 异步相关性选择**：不阻塞主流程。
- **AutoDream**：会话间整理、合并、清理记忆。
- **200 行物理上限**：倒逼清理低价值记忆。
- **冲突处理**：记忆和当前观察冲突时，信当前观察并更新旧记忆。

### 5.3 面试回答

> Claude Code 的 Memory 是文件派，用 MEMORY.md 和 Markdown 管理长期记忆。它把记忆分成 user、feedback、project、reference，读写完全靠 Agent 自己用 Write/Edit 工具完成。系统 prompt 会约束什么该存、什么不该存，比如能从代码、git、CLAUDE.md 推导出来的信息不要重复存。它还有手动记忆优先、Sonnet 异步相关性选择、AutoDream 后台整理和 200 行上限。优点是透明、可审查、可 git diff，适合个人 Coding Agent 场景。

---

## 6. Multi-Agent 面试细节

### 6.1 核心观点

Claude Code 的 Multi-Agent 不是为了角色扮演，而是为了上下文隔离。

### 6.2 关键工程点

- **Parent-Child 模式**：父 Agent 派子 Agent，子 Agent 结果作为工具结果回到父上下文。
- **Explore Agent**：负责大量搜索和阅读，最后输出压缩结论。
- **AsyncLocalStorage**：进程内异步上下文隔离。
- **git worktree**：高风险任务用独立工作目录隔离文件修改。
- **读写并发控制**：读工具可并发，写工具必须串行。
- **Swarm 模式**：更复杂团队式多 Agent 协作。
- **Mailbox**：基于文件或内存队列的 Agent 间消息系统。
- **共享任务列表**：多个 Agent 创建、认领、更新任务。
- **权限请求转发**：Worker 请求权限，Leader 统一展示给用户。
- **Leader 审批制关闭**：Worker 不能自行宣布完成，必须 Leader 确认。
- **多执行后端**：in-process、tmux、iTerm2。

### 6.3 面试回答

> Claude Code 的 Multi-Agent 核心是上下文隔离。主 Agent 可以派 Explore Agent 在独立上下文里搜索大量代码、阅读文件、分析调用链，最后只把压缩结论返回主上下文，避免主上下文被探索过程污染。它用 AsyncLocalStorage 做进程内隔离，用 git worktree 做高风险文件系统隔离，并在工具层区分只读并发和写入串行。更复杂的 Swarm 模式里，它用 Mailbox、共享任务列表、权限请求转发和 Leader 审批制关闭来协调多个 Agent。

---

## 7. Harness Engineering 面试细节

### 7.1 核心观点

Harness 是模型外面的运行环境。Claude Code 的 Harness 把 Coding Agent 变成可控、可审计、可恢复的开发工具。

### 7.2 关键工程点

- **权限系统**：allow / deny / ask，用户级和项目级规则。
- **Bash 风险分类器**：识别 rm -rf、sudo、fork bomb、危险网络/系统操作等。
- **alwaysAllow**：用户可记住某些低风险命令。
- **Hook 体系**：覆盖 PreToolUse、PostToolUse、PermissionRequest、PreCompact、Stop、SubagentStop、Notification、SessionStart/End 等。
- **Hook 安全边界**：Agent 会话期间不能修改 Hook 配置。
- **HTTP Hook 环境变量白名单**：避免敏感信息泄露。
- **JSONL transcript**：append-only 记录用户输入、模型输出、工具调用、工具结果、权限事件。
- **沙箱与文件权限**：OS 权限、工作目录白名单、可选跳过权限但有风险。
- **Routines**：定时、HTTP、GitHub webhook 触发 Agent。
- **Claude Agent SDK**：通过 `query()` 启动完整 Agent Loop，返回 `AsyncGenerator<SDKMessage>`。

### 7.3 面试回答

> Claude Code 的 Harness 是它很强的一层。它把权限系统、Bash 风险分类器、Hook、JSONL transcript、沙箱、上下文压缩、Memory、Sub-agent 和 Routines 都包在模型外面。权限系统支持 allow/deny/ask 和细粒度规则，Bash 命令会经过风险分类器；Hook 覆盖 Agent 生命周期，可以观察、修改、注入或阻止行为；所有对话和工具调用写入 JSONL append-only 日志，方便复盘、恢复和审计。这个 Harness 让 Coding Agent 在真实本地环境里运行时更安全、可控。

---

## 8. 高频追问

### Q1：Claude Code 为什么不用传统代码 RAG？

因为代码有明确结构，很多问题用确定性搜索更准：Grep、Glob、Read、调用链分析往往比向量召回更可控。Claude Code 更像 Agentic Search：模型自己决定搜什么、读什么、是否换 query、是否派 Explore Agent。它不是完全没有检索，而是不把代码理解主要建在向量数据库上。

### Q2：Deferred Tool Loading 解决什么问题？

解决工具 schema 太多导致的 token 成本、模型选择噪声和 Prompt Cache 不稳定问题。Claude Code 初始只加载核心工具，延迟工具只放名字和简述；需要时模型调用 ToolSearch 获取完整 schema / tool_reference。这样可以减少初始 prompt，并保持 Cache 友好。

### Q3：Microcompact、Snip、Auto-compact 有什么区别？

- Microcompact：就地缩小工具结果，属于轻量压缩。
- Snip：裁剪旧消息，需要修复 tool_use/tool_result 配对。
- Auto-compact：用 LLM 摘要旧上下文，信息损失风险更高，所以最后才用。

### Q4：Claude Code 的 Memory 为什么用 Markdown？

因为个人 Coding Agent 场景下，记忆量不一定巨大，透明性和可审查性很重要。Markdown 文件可读、可 diff、可手动编辑，也方便 Agent 自己用 Write/Edit 管理。它牺牲了一部分大规模检索能力，换来简单可靠。

### Q5：Multi-Agent 最重要的价值是什么？

不是“多个角色聊天”，而是上下文隔离。比如探索整个代码库会产生大量中间噪声，放在主上下文里会污染任务。Explore Agent 可以独立探索，最后只返回压缩结论。

### Q6：Harness 和 Tool System 有什么区别？

Tool System 解决“Agent 能调用什么工具、怎么校验、怎么执行”；Harness 解决“整个 Agent 运行环境怎么安全、可观测、可恢复”。权限、Hook、日志、沙箱、调度、预算这些都属于 Harness。

---

## 9. 两分钟完整背诵版

> Claude Code 可以按 Agent 六大支柱来理解。第一是 Agent Loop，它是手写的生产级 Coding Loop，不只是 while true，而是处理流式输出、工具调用、权限审批、并发工具执行、预算控制、截断恢复和 API 容错。第二是 Tool System，它用 Read/Edit/Write/Bash/Grep/Glob 等工具让模型具备行动能力，工具用 Zod 做格式校验，用 validateInput 做业务校验，并通过 Deferred Tool Loading 和 ToolSearch 按需加载工具 schema。第三是 Context Engineering，它用 CLAUDE.md 做静态上下文，用 Grep/Glob/Read 做 Agentic Search，用 Explore 子 Agent 隔离大范围搜索，并通过 Microcompact、Snip、Auto-compact 渐进压缩上下文。第四是 Memory，它走 Markdown 文件派，用 MEMORY.md 和独立文件管理 user、feedback、project、reference 等长期记忆，有 AutoDream 和 200 行上限，强调透明可审查。第五是 Multi-Agent，它的核心不是角色扮演，而是上下文隔离，Explore Agent 可以独立搜索代码并返回压缩结论，复杂场景下还有 Swarm、Mailbox、共享任务列表和 Leader 审批。第六是 Harness，它是模型外面的运行环境，包括权限系统、Bash 风险分类器、Hook、JSONL transcript、沙箱、Routines 和 SDK，让 Coding Agent 在本地真实环境中安全、可观测、可恢复地运行。

---

## 10. 最短口诀

**Loop 会干活，Tool 能动手，Context 会找资料，Memory 会记事，Multi-Agent 会分身，Harness 负责安全壳。**
