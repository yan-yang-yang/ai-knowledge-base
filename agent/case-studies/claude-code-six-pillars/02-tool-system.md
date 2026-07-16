# Claude Code 六大支柱技术细节：02 Tool System

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：Claude Code 在 Tool System 层的原理与工程细节，并对比 OpenClaw

---

## 1. 核心定位

Claude Code 的工具系统是它能从 ChatBot 变成 Coding Agent 的关键。

模型本身只会生成文本，Claude Code 通过工具获得行动能力：

- Read
- Edit
- Write
- Bash
- Grep
- Glob
- WebSearch
- WebFetch
- MCP 工具
- Skills 扩展能力

课程里强调：Claude Code 没用 LangChain，工具系统也是自研的。每个工具是独立 TypeScript 文件，参数校验使用 Zod。

一句话：

> **Claude Code 的 Tool System 是围绕代码编辑场景深度定制的工具管线，而不是通用框架的 BaseTool 抽象。**

---

## 2. 工具定义结构

Claude Code 的工具定义包含：

- 工具名
- 描述
- Zod 参数 schema
- 业务级 validateInput
- execute 逻辑
- 权限/风险判断
- 结果截断和持久化策略

不仅有格式校验，还有业务校验。

例如：

- 文件路径必须合法
- 不能包含危险路径跳转
- 目标文件必须存在
- Edit 前后内容要能匹配

这体现了 Tool Pipeline 的一个核心原则：

> 格式正确不代表业务可执行，业务校验必须单独做。

---

## 3. 输入补全但不污染缓存

课程里提到一个很细的设计：Claude Code 会在不改变模型原始输入的前提下，生成一份带补充字段的副本。

为什么不能直接改原始输入？

因为模型输入会被序列化进对话历史，如果改了原始输入，Prompt Cache 可能失效。

所以它保留：

- 原始输入：用于缓存和对话历史
- 补全副本：用于实际工具执行

这说明 Claude Code 的工具管线不仅考虑“能不能执行”，还考虑成本和缓存稳定性。

---

## 4. 工具结果截断与持久化

工具结果是上下文膨胀大户。

Claude Code 设置了工具结果大小阈值。

课程里提到：

- 单个工具结果默认超过约 50,000 字符，会存到磁盘
- 对话历史里只放摘要 + 文件路径引用
- 单条消息内所有工具结果也有总预算，例如约 200,000 字符

这解决的问题：

- 防止一次 Grep / Bash 返回大量内容撑爆上下文
- 保留结果可追溯性
- 让模型看到摘要和引用路径，而不是完整噪声

---

## 5. Deferred Tool Loading

Claude Code 有 30+ 内置工具，再加 MCP 工具，工具数量可能超过 50。

如果全部工具 schema 一次性塞进上下文，会带来：

- token 成本高
- 模型选择准确率下降
- Prompt Cache 失效风险增加

Claude Code 的方案是 **Deferred Tool Loading**。

核心机制：

1. 初始请求只发送核心工具
2. 延迟工具只在 system prompt 里出现名字和一句话描述
3. 模型需要某个工具时调用 `ToolSearch`
4. `ToolSearch` 返回完整 schema / tool_reference
5. 下一轮请求带上已发现工具

课程里提到效果：

- 初始 prompt 瘦身 30-40%
- 约 20 个工具被标记为延迟加载
- 节省约 12,000-16,000 token
- MCP 工具越多，收益越明显

---

## 6. Deferred Loading 与 Cache

Claude Code 的延迟加载不是简单动态增删工具。

它依赖 Anthropic Claude API 的 beta 特性：

- `defer_loading`
- `tool_reference`

这样 API 知道这些延迟工具不影响 Cache 计算。

关键细节：

> 上下文压缩后，已发现工具不会丢失。

Claude Code 会把已发现工具名单单独做快照，压缩后从快照恢复，避免工具“失忆”。

---

## 7. MCP 管理

Claude Code 对 MCP 的态度是：接入，但管住。

它给 MCP 工具做三段式命名：

```txt
mcp__server__tool
```

例如：

```txt
mcp__supabase__execute_sql
```

好处：

- 避免命名冲突
- 模型能看出工具来源
- 权限策略可以按 server / tool 粒度控制

Claude Code 还会处理 MCP 结果类型：

- 文本
- 图片
- Resource Link

图片会压缩到合理尺寸，避免视觉 token 爆炸。

---

## 8. Skills 系统

Claude Code 的 Skills 是“知识 + 工具使用说明”的分发机制。

Skill 通常放在：

```txt
.claude/skills/<skill>/SKILL.md
```

它告诉模型：

- 这个能力什么时候用
- 最佳实践是什么
- 常见坑是什么
- 项目结构是什么
- 应该调用哪些 CLI / 脚本

Claude Code 的 Skill 来源有优先级：

- bundled 内置
- 项目级 `.claude/skills/`
- 用户全局配置
- MCP Server 转换而来

和 OpenClaw 对比：

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| Skills 风格 | 简洁，偏项目内知识注入 | 功能丰富，支持安装配方、市场、节点能力探测 |
| 分发 | Marketplace / skills.sh 社区生态 | ClawHub + 三层来源 + Remote Bin Probe |
| 安全 | 信任分级，官方 marketplace 更可信 | skill-scanner 扫描危险脚本 |

---

## 9. 面试表达

可以这样说：

> Claude Code 的 Tool System 是自研的 Coding Agent 工具管线，每个工具独立实现，用 Zod 做参数格式校验，还会做业务级 validateInput。它在工具执行前会补全参数但保留原始输入以保护 Prompt Cache；执行后会对大结果做截断和磁盘持久化，避免撑爆上下文。面对工具过多问题，Claude Code 使用 Deferred Tool Loading，通过 ToolSearch 按需加载工具 schema，并依赖 Anthropic API 的 `defer_loading` 和 `tool_reference` 保持 Cache 稳定。它还把 MCP 作为一等公民接入，用三段式命名和策略层控制风险。相比 OpenClaw 的 Tool Profile，Claude Code 更灵活，但更依赖 Anthropic API 能力。

---

## 10. 关键词

- Zod
- validateInput
- ToolSearch
- Deferred Tool Loading
- `defer_loading`
- `tool_reference`
- Prompt Cache
- MCP
- `mcp__server__tool`
- Skills
- tool result truncation
- disk persistence
