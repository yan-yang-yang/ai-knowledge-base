# 🤖 Agent 知识库

> 全栈工程师 & AI 应用开发者的 Agent 专题知识库

---

## 📂 目录结构

```
knowledge-base/agent/
├── README.md              ← 你在这里（目录索引）
├── fundamentals/          ← 基础概念
├── frameworks/            ← 主流框架
├── rag/                   ← RAG 相关
├── prompt-engineering/    ← Prompt 工程
├── tools-and-mcp/         ← 工具调用 & MCP 协议
├── patterns/              ← 架构模式 & 设计范式
└── case-studies/          ← 实战案例
```

## 🧭 知识图谱

### 1. `fundamentals/` — 基础概念
- Agent 定义与分类（ReAct / Plan-and-Execute / Multi-Agent）
- LLM 作为推理引擎
- 记忆机制（短期 / 长期 / 工作记忆）
- Agent Loop 与推理链

### 2. `frameworks/` — 主流框架
- LangChain / LangGraph
- AutoGen / CrewAI
- OpenAI Agents SDK
- Dify / Coze 等低代码平台

### 3. `rag/` — RAG（检索增强生成）
- RAG 流程架构
- 向量数据库选型（Pinecone / Qdrant / Milvus）
- Embedding 模型与策略
- Chunking、Reranking、Hybrid Search

### 4. `prompt-engineering/` — Prompt 工程
- System Prompt 设计
- Few-shot / Chain-of-Thought
- Function Calling Prompt
- Prompt 模板管理

### 5. `tools-and-mcp/` — 工具调用 & MCP
- Function Calling 机制
- Tool Use 最佳实践
- MCP（Model Context Protocol）协议
- 工具注册与权限控制

### 6. `patterns/` — 架构模式
- Agent Loop 设计
- Multi-Agent 协作模式
- 人机协同（Human-in-the-loop）
- 容错与重试策略
- Guardrails（护栏机制）

### 7. `case-studies/` — 实战案例
- 客服 Agent
- 代码助手 Agent
- 数据分析 Agent
- 自动化工作流 Agent

---

## 📝 使用方式

- 每个子目录下放 `.md` 笔记，按主题组织
- 文件命名：`<序号>-<主题>.md`，如 `01-agent-definition.md`
- 重要概念可用 Mermaid 图表辅助说明
- 面试重点内容标注 ⭐

---

*Created: 2026-06-03*
