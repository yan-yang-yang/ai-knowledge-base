# OpenClaw 六大支柱技术细节：04 Memory

> 来源：`/root/ai-text` Sitor「吃透 AI Agent 开发」课程材料整理  
> 主题：OpenClaw 在 Memory 层的原理与工程细节

---

## 1. 核心定位

Memory 解决的是跨会话长期记忆问题。

Context 管的是当前会话窗口里的信息，Memory 管的是：

- 用户偏好
- 项目背景
- 历史决策
- 长期任务
- 学习笔记
- 事故复盘
- 可复用知识

课程里把记忆方案分成两派：

| 路线 | 代表 | 特点 |
|---|---|---|
| 文件派 | Claude Code | `MEMORY.md`，简单透明，人类可读 |
| 数据库派 | OpenClaw | SQLite + 向量 + FTS5，适合大量记忆和语义检索 |

OpenClaw 选择的是数据库派。

---

## 2. 存储架构：SQLite + sqlite-vec + FTS5

OpenClaw 用 SQLite 存储记忆。

课程里提到路径类似：

```txt
~/.cache/openclaw/agents/memory/<agentId>.sqlite
```

核心表：

| 表 | 作用 |
|---|---|
| `chunks` | 存记忆文本和元数据 |
| `chunks_vec` | sqlite-vec 虚拟表，存向量索引 |
| `chunks_fts` | FTS5 全文搜索索引，支持 BM25 |

一条记忆会同时被三种方式管理：

1. 原始文本
2. 向量索引
3. 关键词全文索引

这种设计兼顾：

- 语义搜索
- 精确关键词搜索
- 本地部署
- 单文件数据库
- 较低运维成本

---

## 3. 为什么用 sqlite-vec

课程里提到，在本地应用或边缘部署场景，sqlite-vec 很合适。

优点：

- 零额外服务
- 单文件
- 易备份
- 本地运行
- 和 SQLite 元数据天然结合

缺点：

- 单线程写锁
- 高并发写入会有瓶颈

OpenClaw 是个人 / 多会话 Agent 系统，不一定需要上来就接 Pinecone、Milvus、Weaviate 这类重型向量数据库。

SQLite + sqlite-vec 是更务实的选择。

---

## 4. 混合检索：向量 70% + 关键词 30%

OpenClaw 记忆系统最核心的是混合检索。

公式类似：

```txt
score = 0.7 × vector_score + 0.3 × bm25_score
```

### 4.1 为什么不能只用向量？

因为：

> 语义相似不等于任务相关。

例子：

用户搜“部署命令”，向量可能返回“部署架构图”，但真正需要的是“上次上线执行的命令清单”。

向量擅长语义相似，但对操作性、精确性、专业术语的任务相关性不一定可靠。

### 4.2 为什么不能只用关键词？

因为：

> 用户表达和记忆文本可能没有共同关键词。

例子：

用户问“上次线上出啥问题”，记忆标题可能是“3 月 15 日事故复盘”。

关键词不重合，但语义高度相关。

### 4.3 混合检索的价值

OpenClaw 同时走两条路：

1. 查询转 embedding，走 `chunks_vec` 余弦相似度
2. 查询走 FTS5，得到 BM25 关键词排序
3. 两路结果去重、加权合并

向量负责“意思接近”，BM25 负责“字面命中”。

---

## 5. MMR 去重

课程总览里提到 OpenClaw 还有 MMR 去重。

MMR，即 Maximal Marginal Relevance，核心目标是：

> 不只返回最相似的结果，还要避免结果之间高度重复。

记忆检索如果只按相似度排序，可能返回一堆几乎一样的片段。

MMR 会在相关性和多样性之间折中。

---

## 6. 时间衰减

OpenClaw 支持指数时间衰减。

公式：

```txt
decay = e^(-λ × days)
λ = ln(2) / half_life_days
```

默认半衰期可类似 30 天：

- 30 天后权重减半
- 60 天后变成四分之一

背后的假设：

> 新信息通常比旧信息更有用。

但这个假设不总成立。

比如：

- 长期技术栈
- 项目核心约定
- 用户稳定偏好
- 安全规则

这些不应该因为时间久就降权。

所以 OpenClaw 允许常驻文件如 `MEMORY.md` 豁免衰减，并且时间衰减可以默认关闭、按需开启。

---

## 7. Memory Flush：压缩前归档

OpenClaw 在上下文压缩前会触发 Memory Flush。

流程：

1. 检测上下文接近阈值
2. 在压缩前让 Agent 判断当前会话是否有值得保存的信息
3. 写入长期记忆
4. 再执行上下文压缩

解决的问题：

> 压缩可能丢信息，Memory Flush 确保重要信息先落到长期记忆。

课程里也指出一个难题：

> “重要”到底由谁定义？Agent 觉得重要的和用户觉得重要的可能不同。

这说明 Memory Flush 不是完美答案，而是工程折中。

---

## 8. 增量索引和原子重建

在 RAG 流程章节里提到，OpenClaw 做知识库索引时使用 hash 检测变化。

### 增量更新

- 对文件内容计算 hash
- 没变的跳过
- 变了的重新处理

优点：

- 高效
- 避免重复 embedding
- 节省成本

### 全量重建

OpenClaw 更稳的做法是：

1. 先在临时 SQLite 数据库里建新索引
2. 校验没问题
3. 原子替换旧数据库

这样避免重建中途失败导致旧索引损坏。

---

## 9. Embedding Provider

OpenClaw 给 embedding 留了选择空间：

- OpenAI
- Gemini
- Voyage
- Mistral
- Ollama
- node-llama-cpp
- 本地小模型

这符合 OpenClaw 多 Provider 的整体设计。

---

## 10. 面试表达

可以这样说：

> OpenClaw 的 Memory 不是简单的 `MEMORY.md` 文件，而是 SQLite + sqlite-vec + FTS5 的数据库方案。它把记忆切成 chunks，原文存在 `chunks`，向量存在 `chunks_vec`，关键词索引存在 `chunks_fts`。查询时同时做向量语义检索和 BM25 全文检索，再按类似 70% 向量分、30% 关键词分混合排序，并用 MMR 做去重。它还支持时间衰减，让过旧记忆自动降权，但常驻文件可以豁免。上下文压缩前会触发 Memory Flush，先把重要信息归档，避免压缩导致信息永久丢失。

---

## 11. 关键词

- Memory
- SQLite
- sqlite-vec
- FTS5
- BM25
- Hybrid Search
- Vector Search
- MMR
- Time Decay
- Memory Flush
- chunks
- chunks_vec
- chunks_fts
- hash 增量更新
- 临时数据库 + 原子交换
