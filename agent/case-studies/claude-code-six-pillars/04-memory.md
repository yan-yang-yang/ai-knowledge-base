# Claude Code 六大支柱技术细节：04 Memory

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：Claude Code 在 Memory 层的原理与工程细节，并对比 OpenClaw

---

## 1. 核心定位

Claude Code 的记忆系统选择了非常朴素但有效的路线：

> **文件派：用纯文本 Markdown 管理长期记忆。**

和 OpenClaw 的 SQLite + 向量检索不同，Claude Code 更适合单用户、本地开发、记忆量不大的场景。

它的优势是：

- 简单
- 透明
- 人类可读
- 可 git diff
- 可手动编辑
- 可审查

---

## 2. MEMORY.md：索引 + 正文结构

课程里提到，Claude Code 的记忆系统不是一个简单大文件，而是“索引 + 正文”的双层结构。

大致思路：

- `MEMORY.md` 存索引和核心长期规则
- 独立 Markdown 文件存更详细记忆
- 每条记忆有描述、路径、上下文

这样既保留文件方案的透明性，也避免一个文件无限膨胀。

---

## 3. 四种记忆类型

Claude Code 的记忆大致可以分为四类：

| 类型 | 含义 |
|---|---|
| user | 用户画像和长期偏好 |
| feedback | 用户对 Agent 行为的反馈 |
| project | 项目动态和约定 |
| reference | 外部资料和参考链接 |

例子：

- “这个项目用 pnpm，不要用 npm”
- “测试用 vitest，不要用 jest”
- “commit message 用中文”
- “用户喜欢直接反馈，不要客套”

---

## 4. 记忆读写靠 Agent 自己

Claude Code 记忆系统很精妙的一点是：

> **记忆读写完全靠 Agent 自己用现有 Write/Edit 工具完成。**

它不是单独做复杂数据库 API。

系统 prompt 会告诉 Agent：

- 什么该存
- 什么不该存
- 格式怎么写
- 如何避免重复
- 如何更新过时记忆

如果记忆质量不好，调 prompt 即可，不一定要改底层代码。

---

## 5. 什么不该存

Claude Code 在 system prompt 里维护“不存清单”。

不应该存：

- 能从代码推导的信息
- 能从 git 推导的信息
- 已经写在 CLAUDE.md 的项目约定
- 临时调试方案
- 已经落地到代码里的修复细节
- 重复信息

原因：

> 记忆不是越多越好，低质量记忆会污染上下文。

---

## 6. 手动记忆优先于自动提取

课程里提到一个聪明机制：

如果用户在当前会话里已经明确让 Agent 记住某件事，系统会跳过自动提取。

原因：

- 用户手动指定的信息通常更重要
- 自动提取容易重复
- 自动提取可能抓错重点

这体现了“入口控制”的思想：

> 宁可少存高质量记忆，也不要多存低质量记忆。

---

## 7. Sonnet 异步相关性选择

Claude Code 会用 Sonnet 做 relevance selection，并且不阻塞主流程。

也就是说：

- 当前会话继续跑
- 后台异步判断哪些记忆相关
- 相关记忆再注入上下文

为什么用 Sonnet 而不是更小模型？

课程里说，对于语义匹配任务，Claude Code 官方认为 Sonnet 更合适。

---

## 8. AutoDream：记忆垃圾回收

Claude Code 有 AutoDream 功能。

它会在会话之间自动整理记忆：

- 扫描记忆目录
- 回顾最近会话
- 合并重复条目
- 清理冗余信息
- 删除过时内容

可以理解为记忆系统的 GC。

名字也很形象：像人在睡眠时整理白天记忆。

---

## 9. 200 行物理上限

Claude Code 的 `MEMORY.md` 有物理上限，例如限制在 200 行以内。

这个约束看似粗糙，但很有效：

> 记忆多到一定程度，必须清理旧的才能加新的。

物理上限倒逼只保留最重要的信息。

---

## 10. 冲突处理原则

Claude Code 的原则是：

> 如果记忆和当前观察冲突，信当前观察，然后更新或删除过时记忆。

例如：

- 记忆说项目用 npm
- 但 packageManager / lockfile 显示现在用 pnpm

应该相信当前文件，而不是旧记忆。

---

## 11. 和 OpenClaw 对比

| 维度 | Claude Code | OpenClaw |
|---|---|---|
| 路线 | 文件派 | 数据库派 |
| 存储 | MEMORY.md + Markdown 文件 | SQLite + sqlite-vec + FTS5 |
| 检索 | Sonnet 异步相关性选择 | 向量 + BM25 混合检索 |
| 可审查性 | 极强，人类直接编辑 | 需要工具/查询查看 |
| 扩展性 | 适合单用户、少量记忆 | 适合多用户、大量记忆 |
| 清理 | AutoDream + 200 行上限 | 时间衰减 + MMR + Memory Flush |

---

## 12. 面试表达

可以这样说：

> Claude Code 的 Memory 走的是文件派，不用向量数据库，而是用 MEMORY.md 和独立 Markdown 文件管理长期记忆。它把记忆分成 user、feedback、project、reference 等类型，读写完全靠 Agent 自己用 Write/Edit 工具完成。系统 prompt 明确规定什么该存、什么不该存，比如能从代码、git、CLAUDE.md 推导出来的信息就不要重复存。它还有手动记忆优先、Sonnet 异步相关性选择、AutoDream 后台整理和 200 行物理上限。相比 OpenClaw 的 SQLite + 向量 + BM25，Claude Code 的方案更简单透明，适合个人 coding agent 场景。

---

## 13. 关键词

- MEMORY.md
- 文件派记忆
- user / feedback / project / reference
- Agent 自写记忆
- 不存清单
- relevance selection
- AutoDream
- 200 行上限
- CLAUDE.md 冷启动
