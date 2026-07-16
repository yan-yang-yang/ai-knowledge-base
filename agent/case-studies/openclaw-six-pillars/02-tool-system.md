# OpenClaw 六大支柱技术细节：02 Tool System

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：OpenClaw 在 Tool System 层的原理与工程细节

---

## 1. 核心定位

Tool System 是 Agent 的手脚。

模型本身只能生成文本，真正“做事”依赖工具：

- 读文件
- 写文件
- 执行命令
- 搜索
- 调 API
- 发消息
- 访问节点设备
- 操作浏览器

OpenClaw 的工具系统特点是：

> **底层 Pi 工具接口很薄，OpenClaw 在外层用装饰器、事件和策略系统把它扩展成生产级工具管线。**

---

## 2. Pi 工具接口：薄核心

Pi 的工具抽象比较干净，核心是：

```ts
execute(params) => result
```

Pi 本身不负责：

- 权限判断
- 审批
- 风险分类
- Hook
- 结果清洗
- 循环检测
- 工具分组
- 工具 profile
- 多用户策略

这些能力全部由 OpenClaw 上层实现。

这是一种“薄内核 + 厚应用层”的设计。

优点：

- 底层简单
- 可扩展性高
- OpenClaw 可以按自己的产品形态定制策略

代价：

- 上层要自己写大量工程逻辑
- 不是开箱即用的重框架

---

## 3. 装饰器模式：给工具一层层加能力

课程里提到，OpenClaw 用装饰器模式包装 Pi 原生工具。

例如：

```ts
wrapToolWithBeforeToolCallHook(rawTool)
```

原始工具只会执行。

包装后工具可以变成：

```txt
参数校验
↓
Profile / Policy 检查
↓
Before Hook
↓
权限审批
↓
真正 execute
↓
After Hook
↓
结果清洗
↓
事件记录
```

这里的“装饰器模式”是设计模式里的 Decorator Pattern，不是 TypeScript 的 `@decorator` 语法。

它的价值是：

> 不改原工具实现，也能在执行前后叠加系统能力。

---

## 4. 事件驱动工具管线

Claude Code 的工具执行更像线性流水线。

OpenClaw 的工具执行是事件驱动。

典型事件：

```txt
tool_execution_start
→ tool_execution_update
→ tool_execution_end
```

每个事件可以有多个监听器。

例如 `tool_execution_end` 可以触发：

- 执行耗时记录
- 错误信息提取
- URL 收集
- details 字段剥离
- 消息类工具 pending 状态追踪
- after_tool_call hook
- 可观测性记录

好处：

- 松耦合
- 新能力可以通过监听器加入
- 主流程不用频繁修改
- 方便接入不同平台和工具类型

坏处：

- 调试链路更分散
- 需要良好的事件命名和日志
- 复杂问题排查要跨监听器追踪

---

## 5. Tool Profile：按场景预选工具

工具太多会导致模型选不准。

课程里提到：

- 10 个工具以内，模型选择准确率较高
- 30 个工具准确率明显下降
- 50 个以上如果不处理会很糟糕

OpenClaw 的做法不是 Claude Code 那种 Deferred Tool Loading，而是 **Tool Profile**。

核心思想：

> 按场景预先裁剪工具集，不在当前 Profile 里的工具，模型完全看不到，也不能用。

课程中提到 OpenClaw 定义了多种 Tool Profile，例如可以按任务场景区分：

- 默认工具集
- 编码工具集
- 浏览器工具集
- 节点/设备工具集
- 消息/外部动作工具集

同时还有 **Tool Group** 概念，按功能对工具分组。

这个方案的优点：

- 不依赖模型 API 的特殊能力
- 实现简单
- 降低 prompt token
- 降低误选工具概率
- 权限边界更清晰

缺点：

- 不如 Deferred Loading 灵活
- Profile 选错时，模型可能看不到需要的工具

---

## 6. 权限系统：五层确定性过滤

课程里提到 OpenClaw 的权限思路是多层确定性过滤，而不是完全依赖模型或分类器。

典型五层：

| 层级 | 作用 |
|---|---|
| Profile Policy | 当前场景允许哪些工具 |
| Allow/Deny 白名单 | 显式允许或拒绝某些工具 |
| Owner-only | 某些工具只有管理员可用 |
| Exec Approval | 执行类工具需要显式审批 |
| Workspace 路径边界 | 文件操作不能越界 |

这体现了一个核心原则：

> 工具权限不能交给模型判断，必须由确定性规则兜底。

---

## 7. 两阶段审批

执行类工具，例如：

- shell
- exec
- write
- delete
- 外部发送

通常需要审批。

OpenClaw 的审批思路偏两阶段：

1. 模型提出工具调用
2. 系统根据策略决定是否需要用户确认
3. 用户确认后才真正执行

这避免了模型直接执行高风险动作。

---

## 8. MCP 与 Skills 的取舍

课程里提到 OpenClaw 对 MCP 比较克制。

原因是 MCP 工具可能带来不可信文件读取、协议边界和安全问题。

OpenClaw 更强调 Skills：

- `SKILL.md` 提供知识说明
- CLI / 脚本承担能力实现
- 安装时扫描危险代码模式
- 通过 Gateway 节点感知远程设备能力

这背后的判断是：

> 当 Agent 跑在用户本机或可信节点上，有文件系统和 shell 能力时，Skills + CLI 往往比 MCP 更直接。

但安全检查必须前置。

---

## 9. 面试表达

可以这样说：

> OpenClaw 的 Tool System 是薄核心加厚策略。Pi 的工具接口只负责 `execute`，OpenClaw 在外层用装饰器模式叠加 Hook、权限、审批、结果清洗和事件追踪。它的工具执行是事件驱动的，通过 `tool_execution_start/update/end` 等事件解耦扩展逻辑。同时 OpenClaw 用 Tool Profile 按场景裁剪工具集，降低模型误选工具的概率，并通过多层确定性权限过滤保证高风险工具可控。

---

## 10. 关键词

- Tool System
- Pi tool execute
- Decorator Pattern
- Hook
- Tool Profile
- Tool Group
- Event-driven pipeline
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- Allow/Deny
- Owner-only
- Exec Approval
- Workspace boundary
- Skills
- MCP 安全边界
