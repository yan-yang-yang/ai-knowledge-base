# 2026-07-27：Skills 和 MCP 有什么区别？

> 题目来源：用户每日面试题。  
> 原始题意：Skills 和 MCP 区别。  
> 依据：Sitor「吃透 AI Agent 开发」课程中 MCP、Skills、Tool System 相关笔记；OpenClaw / Claude Code 六大支柱工具系统笔记。

---

## 1. 面试官真正想问什么？

这道题表面是在问两个概念的定义，实际是在考四件事：

1. **你是否能区分“能力说明”和“能力接入”**：Skills 更像知识、流程和工具使用方式的分发；MCP 更像外部工具和资源的标准接入协议。
2. **你是否理解 Agent 工程里的工具治理问题**：工具不是越多越好，schema、权限、安全、上下文成本都要管。
3. **你是否知道二者可以互补，而不是非此即彼**：MCP 可以提供真实工具能力，Skill 可以告诉 Agent 什么时候用、怎么用、有哪些坑。
4. **你是否有生产级安全意识**：MCP Server 是外部输入入口，工具结果可能带 Prompt Injection；Skills 也可能绑定脚本，所以都要经过权限、扫描和审批。

面试时不要只说：

> MCP 是协议，Skills 是提示词。

这个回答太浅。

更好的说法是：

> MCP 解决的是外部工具和 Agent 之间如何标准化发现、描述和调用的问题；Skills 解决的是 Agent 如何渐进式获取某个领域能力的使用说明、流程约束、脚本模板和最佳实践的问题。MCP 偏运行时工具接入，Skills 偏知识和能力分发。真实项目里二者可以组合：MCP 暴露数据库、浏览器、企业系统等工具，Skill 负责告诉模型这些工具在什么业务场景下使用、参数怎么填、风险怎么避。

---

## 2. 1 分钟回答

Skills 和 MCP 不是同一层东西。

MCP，全称 Model Context Protocol，核心是一个标准化工具协议。它让外部系统以 MCP Server 的形式暴露 tools、resources、prompts，Agent Client 可以发现这些工具、读取 schema，然后按协议调用。它解决的是“外部能力怎么接进 Agent”的问题，比如数据库、浏览器、文件系统、企业内部接口。

Skills 更像 Agent 时代的知识和能力包。一个 Skill 通常包含 `SKILL.md`、frontmatter、脚本、模板、示例和使用规范。它不一定直接提供协议工具，而是告诉模型“什么时候该用这个能力、该调用哪些 CLI 或 API、有哪些约束和坑”。它解决的是“模型怎么知道该如何完成某类任务”的问题。

所以区别可以概括为：**MCP 偏工具接入协议，Skills 偏能力使用说明和知识分发机制。** 二者可以配合：MCP 提供真实工具，Skill 提供使用策略。比如 MCP 暴露 CRM 查询工具，Skill 规定只能查哪些字段、如何脱敏、什么场景必须人工确认。

工程取舍上，MCP 的好处是标准化和生态复用，但会带来 token 占用、安全风险和运行复杂度；Skills 的好处是渐进式加载、低成本分发项目知识，但如果绑定脚本也要做安全扫描和权限审批。

---

## 3. 深入回答：MCP 是什么？

MCP 解决的是 Agent 与外部工具之间的标准化连接问题。

没有 MCP 时，每个 Agent 系统都要自己写一套：

- 怎么发现工具；
- 工具参数 schema 怎么描述；
- 怎么调用工具；
- 工具结果怎么返回；
- 资源、文件、上下文怎么暴露。

MCP 把这些抽象成统一协议。常见角色是：

| 角色 | 说明 |
|---|---|
| MCP Client | Agent 侧客户端，负责连接 MCP Server |
| MCP Server | 外部能力提供方，比如数据库、浏览器、企业系统 |
| Tools | 可被模型调用的动作，比如查询订单、读取网页 |
| Resources | 可读取的资源，比如文件、数据库记录、文档 |
| Prompts | Server 提供的提示模板或任务入口 |

它的价值是生态复用：一个数据库 MCP Server 可以被多个 Agent 使用，不用每个 Agent 重写一遍集成。

但 MCP 不是银弹，因为它会引入三个工程问题：

1. **Token 占用**：工具多了以后，每个工具的名称、描述、schema 都可能进入上下文。
2. **安全风险**：外部工具返回的内容可能包含 Prompt Injection，诱导模型泄露数据或执行危险操作。
3. **复杂度上升**：要管理 Server 生命周期、transport、认证、权限、错误处理、结果清洗和审计。

所以生产级系统里，MCP 工具不能享受特权，仍然要走统一工具管线：格式校验、业务校验、权限检查、审批、执行、结果过滤。

---

## 4. 深入回答：Skills 是什么？

Skills 解决的是 Agent 如何按需获得某类任务的知识和操作方法。

一个 Skill 通常不是单纯一句 prompt，而是一个能力包，里面可能包含：

- `SKILL.md`：说明什么时候使用这个 Skill；
- frontmatter：描述名称、触发条件、权限边界；
- 使用步骤：告诉模型具体工作流；
- CLI / 脚本：真正执行某些动作；
- 示例、模板、参考资料；
- 输出格式和注意事项。

Skills 的关键设计是 **Progressive Disclosure，渐进式披露**：

1. 平时只把 Skill 的名称、描述、触发条件暴露给模型；
2. 当任务匹配时，再读取完整 `SKILL.md`；
3. 必要时再加载脚本、模板、参考文档。

这样做有两个好处：

- 降低上下文 token 成本，不用把所有技能细节一次性塞给模型；
- 降低模型干扰，只在需要时加载相关能力。

以 OpenClaw 为例，Skills 不只是 Markdown，还可以包含安装配方、资格检查、安全扫描、ClawHub 分发、跨设备能力探测等机制。Claude Code 的 Skills 更偏项目级 / 用户级知识注入和 Marketplace 分发。

---

## 5. 核心区别表

| 维度 | Skills | MCP |
|---|---|---|
| 本质 | 知识、流程、工具使用方式的能力包 | 外部工具 / 资源 / Prompt 的标准协议 |
| 主要解决 | Agent 怎么知道如何做某类任务 | Agent 怎么接入和调用外部能力 |
| 层级 | 偏上层，接近 Context Engineering + Tool 使用策略 | 偏底层 / 中间层，接近 Tool Protocol |
| 典型形态 | Markdown、frontmatter、脚本、模板、示例 | MCP Server、tools、resources、prompts |
| 加载方式 | Progressive Disclosure，按需读取说明和资料 | 通过协议发现工具 schema 并调用 |
| 是否一定执行工具 | 不一定，也可能只是提供流程和规范 | 通常会暴露可调用工具或资源 |
| 主要风险 | 恶意脚本、错误操作指南、过时知识 | Prompt Injection、权限过大、Server 不可信、token 膨胀 |
| 适合场景 | 项目规范、操作流程、面试笔记、特定工作流 | 数据库、浏览器、文件系统、SaaS、企业内部服务接入 |
| 最佳组合 | 说明 MCP / CLI 怎么用 | 提供真实外部工具能力 |

一句话：

> MCP 更像“插座和协议”，Skills 更像“说明书和工具箱使用手册”。

---

## 6. 二者怎么配合？

真实项目里，不建议把 Skills 和 MCP 对立起来。

更合理的组合是：

```txt
Skill：告诉模型业务流程、边界、参数规范、安全注意事项
MCP：提供真实外部系统的工具调用能力
Tool Pipeline：统一做校验、权限、审批、执行、结果过滤
```

例子：企业客服 Agent。

- MCP Server 暴露：`query_order`、`refund_status`、`get_user_profile`。
- Skill 规定：
  - 什么问题需要查订单；
  - 查询前是否要确认用户身份；
  - 哪些字段不能直接返回；
  - 退款争议什么时候升级人工；
  - 输出话术模板是什么。

这样模型不是看到工具就乱用，而是在 Skill 的业务约束下使用 MCP 工具。

---

## 7. 项目中怎么讲？

如果你在面试中结合项目，可以这样说：

> 在项目里我会把 MCP 和 Skills 分层使用。MCP 负责把外部系统标准化接进 Agent，比如订单、设备、知识库或浏览器工具；Skills 负责沉淀某个业务场景的操作流程，比如客服异常处理、RAG 知识库维护、代码仓库分析。这样做的好处是工具能力和使用策略解耦：MCP Server 可以复用，Skill 可以按项目快速迭代。
>
> 但我不会让 MCP 工具直接裸露给模型。所有工具调用都会经过统一 Tool Pipeline，包括参数校验、业务校验、权限审批、超时、结果脱敏和截断。因为模型输出不可信，外部工具返回内容也不可信。Skills 绑定脚本时也要做安全扫描和最小权限控制。

如果要结合 OpenClaw，可以补一句：

> OpenClaw 相对更强调 Skills + CLI 的组合，因为当 Agent 跑在用户本机或可信节点上，有文件系统和 Shell 能力时，Skill 通过 Markdown 描述流程、CLI 承担执行，往往比为每个能力都包装 MCP 更直接。但如果要接入跨语言、跨应用、跨团队复用的外部服务，MCP 的标准化价值就更明显。

---

## 8. 高频追问

### Q1：Skills 是不是就是 Prompt 模板？

不是。Prompt 模板通常只是一段提示词，而 Skill 是能力包。它除了提示说明，还可以包含触发条件、操作流程、脚本、模板、参考资料、安装检查和安全约束。更关键的是，Skill 强调按需加载，不是把所有内容一次性塞进系统提示词。

### Q2：MCP 是不是有了就不需要 Function Calling？

不是。MCP 负责外部工具如何标准化暴露；Function Calling / Tool Calling 是模型如何声明调用工具的方式。实际执行时，模型可能通过 Tool Calling 选择一个 MCP 工具，应用层再通过 MCP Client 调用对应 MCP Server。

### Q3：MCP 最大的问题是什么？

我会优先说三个：token、安全、复杂度。工具 schema 多会挤占上下文；外部工具结果可能带 Prompt Injection；多一个 MCP Server 就多一层认证、权限、transport、错误处理和运维复杂度。

### Q4：Skills 最大的问题是什么？

Skills 的问题主要是治理：Skill 内容可能过时，脚本可能危险，不同 Skill 之间可能冲突，触发描述写不好会导致模型误用。所以需要版本管理、安全扫描、触发条件设计和权限边界。

### Q5：什么时候优先用 Skills，什么时候优先用 MCP？

- 如果目标是沉淀项目知识、操作流程、输出规范、CLI 使用方式，优先 Skills。
- 如果目标是把外部系统标准化暴露成工具，供多个 Agent / 客户端复用，优先 MCP。
- 如果是生产系统，常见答案是一起用：MCP 提供工具，Skills 提供使用策略。

### Q6：为什么说 MCP 工具不应该有特权？

因为 MCP Server 也是外部输入边界。它返回的内容可能被污染，工具也可能有副作用。模型不能因为工具来自 MCP 就默认信任，仍然要走统一权限管线，包括 allow / deny / ask、结果过滤和审计。

---

## 9. 背诵版

Skills 和 MCP 不是同一层东西。MCP 是外部工具接入协议，解决工具、资源、Prompt 怎么被 Agent 标准化发现和调用；Skills 是能力分发机制，解决模型怎么按需获得某类任务的流程、规范、脚本和最佳实践。

简单说，MCP 偏“工具怎么接进来”，Skills 偏“工具和业务流程该怎么用”。MCP 的优势是标准化和生态复用，适合数据库、浏览器、企业系统这类外部能力接入；问题是 token 占用、安全风险和运行复杂度。Skills 的优势是渐进式加载和项目知识沉淀，适合封装业务流程、CLI 使用规范和输出模板；问题是要治理版本、触发条件和脚本安全。

真实项目里二者可以配合：MCP 提供真实工具，Skill 规定什么时候用、怎么用、哪些字段要脱敏、什么操作要人工确认。最终所有调用都要经过统一 Tool Pipeline，因为模型输出和外部工具结果都不能默认信任。

---

## 10. 关键词速记

- Skills：知识分发 / 能力包 / Progressive Disclosure
- MCP：Model Context Protocol / 外部工具接入协议
- Tool Calling：模型声明调用意图
- MCP Server：暴露 tools / resources / prompts
- Skill：`SKILL.md` / frontmatter / CLI / 脚本 / 模板
- 组合方式：MCP 提供工具，Skill 提供使用策略
- 风险：token 占用、Prompt Injection、权限、脚本安全
- 工程底线：统一 Tool Pipeline，不给 MCP 工具特权

---

## 11. 事实来源

- `memory/notes/ai-agent-course-index.md`：Sitor 课程中 MCP 与 Skills 文章索引。
- `memory/notes/openclaw-six-pillars/02-tool-system.md`：OpenClaw Tool System、MCP 与 Skills 取舍。
- `memory/notes/claude-code-six-pillars/02-tool-system.md`：Claude Code Skills、Deferred Tool Loading、MCP 工具治理。
- `knowledge-base/agent/tools-and-mcp/index.md`：Tool System、Function Calling、MCP 与 Skills 汇总笔记。
