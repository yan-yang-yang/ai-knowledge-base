# Tool System、Function Calling、MCP 与 Skills

> 来源：`/root/ai-text/3/` Sitor「吃透 AI Agent 开发」课程材料。  
> 用途：理解 Agent 如何从“会说话”变成“能动手”，以及生产级工具系统要处理哪些工程问题。

---

## 0. 一句话总结

**Tool System 是 Agent 的手脚：模型负责声明意图，应用层负责校验、审批、执行工具并把结果回写上下文。Function Calling、MCP 和 Skills 分别解决结构化调用、外部工具接入和知识/能力分发问题。**

---

## 1. Function Calling 的真实过程

Function Calling 并不是模型真的执行函数，而是模型输出一段结构化意图：

```json
{
  "name": "read_file",
  "arguments": {
    "path": "src/index.ts"
  }
}
```

然后应用层做：

1. 解析模型输出。
2. 校验参数格式。
3. 校验业务规则。
4. 检查权限。
5. 执行真实工具。
6. 把工具结果写回上下文。

课程强调：**模型输出不可信，Function Calling 只是把自然语言意图变成结构化候选动作，不等于动作一定安全可执行。**

---

## 2. 工具调用管线：Claude Code 例子

课程用 Claude Code 展开了一次工具调用背后的完整管线：

| 阶段 | 作用 |
|---|---|
| 参数格式验证 | schema 层保证参数形状正确 |
| 业务逻辑校验 | 路径、文件状态、旧文本匹配等业务条件 |
| 输入补全和标准化 | 生成执行用副本，避免污染原始模型输入 |
| 前置 Hook | 给用户或系统机会修改/拦截工具调用 |
| 权限检查 | 判断是否 allow / deny / ask |
| 真正执行 | 调用文件系统、Shell、网络或 MCP 工具 |
| 后置 Hook | 记录、改写结果、触发审计或观测 |

这条管线体现了生产级 Tool System 的核心原则：

> 格式校验、业务校验、权限校验、执行、结果处理必须分层，不能混成一个函数。

---

## 3. 工具太多：Deferred Loading 与 Tool Profile

工具数量变多会带来两个问题：

- token 成本上升，因为工具 schema 要进上下文。
- 模型选择变差，因为候选工具太多。

课程给出三种思路：

| 思路 | 代表 | 核心机制 | 适合场景 |
|---|---|---|---|
| Deferred Loading | Claude Code | 初始只暴露核心工具，其他工具通过 ToolSearch 按需加载 | 工具很多且 API 支持 tool reference |
| Tool Profile | OpenClaw | 按场景配置工具组，运行前裁剪工具集合 | 多渠道、多角色、多权限 runtime |
| 小工具集 | Manus | 保持工具极少，降低选择难度 | 产品边界清晰、工具能力强 |

注意：课程特别提到工具列表频繁变化会破坏 Prompt Cache / KV Cache 友好性，所以不能粗暴动态增删工具。

---

## 4. MCP：协议很好，但不是银弹

MCP 解决的是外部工具和 Agent 之间的标准化接入问题。

它的价值：

- 统一工具发现和调用协议。
- 让数据库、浏览器、文件、业务系统可以作为工具暴露。
- 减少每个 Agent 重复写集成代码。

但课程也强调 MCP 有工程硬伤：

1. **Token 占用**：MCP 工具 schema 多了会挤占上下文。
2. **安全风险**：外部工具结果是 Prompt Injection 的入口。
3. **复杂度**：引入 server、transport、权限和结果处理复杂度。

Claude Code 的处理方式包括：

- MCP 工具命名空间隔离：`mcp__server__tool`
- MCP 工具默认延迟加载
- MCP 工具走共享权限管线
- MCP 结果按文本、图片、资源链接等类型分别处理

---

## 5. Skills：Agent 时代的知识分发系统

Skills 不是普通 prompt 模板，而是一种 Progressive Disclosure 机制：

- 元信息常驻，让模型知道“有这个能力”。
- 具体说明、脚本、模板按需加载。
- 可以绑定 CLI、脚本、参考文档和输出规范。

Claude Code 的 Skills 更偏：

- `SKILL.md`
- frontmatter
- Marketplace / Plugin
- 项目级和用户级技能

OpenClaw 的 Skills 更偏完整生态：

- 安装配方
- 资格检查
- 安全扫描
- 调用策略
- ClawHub / 本地技能 / 跨设备能力感知

Skills 与 MCP 的区别：

| 维度 | Skills | MCP |
|---|---|---|
| 解决问题 | 知识、流程、工具使用方式的分发 | 工具协议和外部能力接入 |
| 形态 | Markdown + 脚本 + 参考资料 | Server + tools/resources/prompts |
| 加载方式 | Progressive Disclosure | 协议发现和调用 |
| 常见组合 | Skill 说明怎么用某 CLI/MCP | MCP 提供真实工具能力 |

---

## 6. 权限系统：不能让 AI 直接裸跑工具

课程用 `rm -rf` 引出生产级权限系统。

关键设计：

- 操作风险分级，不是所有工具一样危险。
- Allow / Deny / Ask 三类规则。
- Bash 危险命令模式识别。
- OpenClaw 使用多层过滤和审批。
- 拒绝工具调用也应该作为反馈返回给模型，而不是静默失败。

真实攻击面包括：

- Prompt Injection 诱导工具调用。
- 持久化记忆被注入。
- Shell 内置命令绕过。
- 审批疲劳导致用户乱点允许。

---

## 7. 面试表达

### 7.1 两分钟回答版

> Tool System 是 Agent 从聊天变成行动的关键。Function Calling 不是模型真的执行函数，而是模型输出结构化工具调用意图，应用层必须做格式校验、业务校验、权限检查、执行和结果回写。生产级工具管线不能只靠 schema，因为格式正确不代表业务安全，比如文件路径、旧文本匹配、Shell 命令风险都需要单独判断。工具多了以后还要治理上下文成本和选择准确率，Claude Code 用 Deferred Loading 和 ToolSearch 按需加载工具，OpenClaw 用 Tool Profile 按场景裁剪工具集。MCP 解决外部工具标准接入，但会带来 token、安全和复杂度问题；Skills 则解决知识和工具使用方式的渐进式分发。最后，所有工具都要经过权限系统，因为模型输出不能被默认信任。

### 7.2 高频追问

#### Q1：Function Calling 和 Structured Output 有什么区别？

Function Calling 是让模型声明要调用哪个工具以及参数；Structured Output 更通用，是约束模型输出符合某个结构。工具调用是 Structured Output 的一个典型场景，但 Structured Output 也可以用于抽取、分类、JSON 生成等非工具任务。

#### Q2：为什么工具多了模型反而选不准？

因为每个工具的名称、描述、schema 都会进入上下文，候选动作越多，模型注意力越分散，token 成本越高，工具间语义相似也会增加误选概率。

#### Q3：Skills 和 MCP 怎么配合？

MCP 提供真实外部工具，Skills 说明这些工具什么时候用、怎么用、有哪些坑。一个常见组合是：MCP 暴露数据库或浏览器能力，Skill 提供项目约定、查询规范和安全注意事项。

---

## 8. 关键词速记

- Function Calling
- Structured Output
- Tool Pipeline
- format validation / business validation
- Hook
- Permission
- Deferred Loading
- Tool Profile
- MCP
- Skills
- Prompt Injection
