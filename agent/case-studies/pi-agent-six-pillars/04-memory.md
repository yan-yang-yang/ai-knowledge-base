# Pi 六大支柱：04 Memory

> 复核基线：`36b60d2e8985899743c4cf5bd5f8929832a3f05d`。
> 仓库远端：`https://gitclone.com/github.com/earendil-works/pi.git`（GitHub 上游路径可用固定源码链接）。
> 固定链接基址：<https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/>。

## 1. 核心结论

Pi 的“记忆”首先是可恢复的会话历史，而不是一个独立的向量记忆产品。
当前传统 coding-agent 把会话保存成 JSONL append-only 树；上下文由当前 leaf 到根的路径推导。
`SessionManager` 负责会话文件、树结构、分支、压缩摘要和恢复，不负责语义 embedding、BM25 或长期用户画像。

要避免一个常见误读：`packages/agent` 的新 harness 也有持久化 Session、lane 状态和操作 checkpoint，但它是 durable execution 的状态恢复机制，不等于“记忆检索系统”。

## 2. 传统 SessionManager：历史即记忆

源码：[`session-manager.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/coding-agent/src/core/session-manager.ts)。

核心符号：`SessionHeader`、`SessionEntry`、`SessionManager`、`buildContextEntries()`、`buildSessionContext()`。

一个 session 文件是 JSONL：首行是 `type: "session"` 的 header，其后是带 `id` 和 `parentId` 的 entry。
每次 `appendMessage()`、`appendCompaction()` 或扩展 entry 都追加记录，并把 `leafId` 移到新 entry。
已有记录不被原地修改；调用 `branch(id)` 只移动 leaf，下一次追加自然形成新分支。

这是一种“事件/记录重建当前上下文”的设计：

```text
JSONL entries
    ↓ loadEntriesFromFile()
byId + leafId
    ↓ getBranch()/buildContextEntries()
当前分支与压缩边界
    ↓ buildSessionContext()
发给模型的 messages
```

`buildContextEntries()` 沿当前 leaf 回溯到根并反转；它理解 compaction 和 branch summary。
`buildSessionContext()` 再把有效 entry 转成模型上下文。因此 UI 显示的完整树和模型实际看到的上下文不是同一个集合。

## 3. 写入与恢复细节

`SessionManager._persist()` 在尚未出现 assistant 消息前会延迟首次落盘；assistant 到来后写入已积累的 entries。
之后采用 `appendFileSync()` 追加。它解决的是 session transcript 的可恢复性和减少空会话噪声，不是事务数据库提交协议。

`SessionManager.open()` 读取 header 和完整 entries；旧版本通过 `migrateV1ToV2()`、`migrateV2ToV3()` 补齐 id/parentId 或迁移角色。
`continueRecent()` 通过最近文件继续会话；`inMemory()` 明确关闭文件持久化，适合测试和临时运行。

压缩记录 `CompactionEntry` 保存 summary、`firstKeptEntryId`、tokensBefore，并可保存 `systemMessage`、usage 和扩展 details。
因此压缩不是删除历史：旧 JSONL 仍在，当前模型上下文改由摘要和保留路径构成。
`branchWithSummary()` 把被放弃路径的摘要作为 `branch_summary` entry 接到新 leaf 上。

## 4. 可学习的工程模式

1. 把不可变历史和可变游标分离：entry 永久保留，leaf 表示当前视图。
2. 用 parentId 建树而非复制完整上下文，分支成本低，历史可追溯。
3. 用显式 compaction entry 表示上下文边界，恢复时可以确定性重建。
4. 扩展状态用 `custom` entry 保存；需要进入模型上下文时才用 `custom_message`。
5. session header 记录 cwd、id、timestamp 和 `parentSession`，支持跨目录 fork。

一个可迁移的业务例子：代码审查助手先读取 20 个文件，然后压缩；下一次打开 session 时不会把所有工具输出重新塞入 prompt，而是从 JSONL 重建压缩后的有效路径。

## 5. Fork 与上下文边界

`SessionManager.forkFrom()` 新建 session 文件，写入新的 header，并复制源 session 的非 header entries；新 header 的 `parentSession` 指向源文件。
这是“复制历史到新会话”，不是多个 Agent 共享一个 live context。

传统 manager 的 `createBranchedSession()` 则抽取指定 leaf 的根到叶路径，重建一个更窄的 session 文件。
这两个 API 都是 transcript 级能力，不能据此声称 Pi 已经提供多 Agent 协作协议。

## 6. 新 harness 的 memory 边界

源码入口：[`agent-harness.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/agent-harness.ts)。
恢复入口：[`restore.ts`](https://github.com/earendil-works/pi/blob/36b60d2e8985899743c4cf5bd5f8929832a3f05d/packages/agent/src/harness/runtime/restore.ts)。

`AgentHarness.create()` 返回 harness 和 `open` operations；`harness.lane(name)` 获取一个持久 lane。
`restoreSession()` 扫描 branch tip、lane config、lane state，然后 `restoreLaneState()` 读取 operation meta/state。
它会验证 operation 属于正确 lane、intent 与 state 相容，再把未完成操作交给后续 drive/recovery。

这部分“记住”的是：当前分支 tip、排队输入、模型配置、运行阶段、工具 checkpoint 和结果。
它解决进程退出后从 durable 状态继续驱动的问题，不提供按语义召回旧经验的 API。

## 7. Pico 的状态

`packages/durable/README.md` 明确写着：当前公开 API 是 durable record contracts 和 detached `MemoryStorage`。
`packages/durable/docs/pico-v5-handoff.md` 的 Status 又明确写着“No Pico5 implementation exists”。
因此 Pico5 文档中的 conversation、document、task、checkpoint 和 as-of fork 应写成规范/规划，不能当成当前可用长期记忆实现。

## 8. 边界与风险

- 没有证据表明当前 Pi 内建 embedding、向量库、FTS5、MMR 或时间衰减。
- JSONL append-only 不等于每一行都已 fsync，也不等于断电场景的强一致事务。
- compaction summary 是上下文压缩产物，不是自动沉淀的长期知识库。
- `custom` entry 是否被重新注入模型取决于 entry 类型；普通扩展状态默认不参加 LLM context。
- 分支历史保留不代表模型能同时理解所有分支；当前 leaf 决定 active context。

## 9. 实战检查清单

阅读 Pi 的 memory 行为时按以下顺序检查：

1. 当前使用的是 `coding-agent SessionManager` 还是 `packages/agent AgentHarness`。
2. 持久化后恢复的是 transcript、lane state 还是业务 document。
3. 上下文入口是 `buildSessionContext()` 还是 harness 的 lane/context projector。
4. 压缩是否记录 first-kept 边界、summary 和 system message。
5. 是否有明确的检索实现；没有就不要使用“长期语义记忆”表述。

## 10. 面试问答

**问：Pi 的 Memory 怎么实现？**

答：当前 Pi 更准确的说法是 session memory。传统 coding-agent 用 JSONL append-only entry tree 保存对话，`SessionManager` 通过 parentId 和 leafId 维护分支，`buildSessionContext()` 沿当前路径重建模型上下文，compaction entry 用摘要和保留边界缩短 prompt。它不是内建向量记忆系统。

**问：压缩会不会丢历史？**

答：模型上下文会被压缩，但原始 JSONL entries 仍可保留；当前 context 由 compaction summary、firstKeptEntryId 和后续路径推导。能否恢复全部原文取决于查看 session tree，而不是继续向模型发送全部历史。

**问：新 AgentHarness 和 SessionManager 是什么关系？**

答：它们不能混称。SessionManager 是传统 coding-agent 的 JSONL transcript/tree 管理器；AgentHarness 是 `packages/agent` 的 durable lane、operation 和 recovery runtime，持久化运行状态以便重启后继续驱动。两者的 session API、entry 模型和保证边界不同。

**问：Pi 是否有 RAG memory？**

答：在本次 HEAD 的源码和 README 中未发现内建 embedding/向量检索/FTS 记忆层。可通过扩展或外部服务加入，但那是集成方案，不应写成 Pi 核心当前能力。

## 11. 源码索引

- `packages/coding-agent/src/core/session-manager.ts`：`SessionManager`、`buildSessionContext`、branch/fork/compaction。
- `packages/agent/src/harness/agent-harness.ts`：`AgentHarness`、`AgentLane` 公共协议。
- `packages/agent/src/harness/runtime/restore.ts`：lane/session durable 状态恢复。
- `packages/durable/README.md`：当前公开包状态。
- `packages/durable/docs/pico-v5-handoff.md`：Pico5 规划与“尚不存在”声明。
