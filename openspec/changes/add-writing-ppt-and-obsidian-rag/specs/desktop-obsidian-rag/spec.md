## Purpose

定义无需 Obsidian 插件或云知识服务的 Vault 直接访问、本地索引、引用和内置写入行为。

## ADDED Requirements

### Requirement: Vault access is direct and user-selected

系统 SHALL 仅在用户显式选择 Vault 后直接访问其 Markdown、frontmatter 和本地附件，不要求 Obsidian 运行、插件、REST API 或 CLI。

#### Scenario: Obsidian is closed
- **GIVEN** 用户已经选择一个有效 Vault
- **WHEN** Obsidian 桌面程序未运行
- **THEN** AIMarketing 仍能扫描、检索和打开 Vault 文件

#### Scenario: Path is excluded
- **GIVEN** 文件位于 `.obsidian`、trash、隐藏路径或用户 ignore 范围
- **WHEN** 扫描或 watcher 发现该文件
- **THEN** 文件不会进入检索结果或语义索引

### Requirement: Search is available before semantic indexing completes

系统 SHALL 在首次扫描后立即提供标题、标签、链接和关键词检索，同时在后台构建语义索引；语义索引完成后 SHALL 使用 lexical + vector 混合检索。

#### Scenario: First index is still building
- **GIVEN** Vault 已扫描但 embedding 尚未完成
- **WHEN** 用户搜索知识库
- **THEN** 系统返回 index-free lexical 结果并显示语义索引进度

#### Scenario: Semantic index becomes ready
- **GIVEN** 当前 index generation 已完整构建并验证
- **WHEN** 后续执行相同查询
- **THEN** 系统使用混合检索并返回带来源位置的排序结果

### Requirement: Each Vault owns a rebuildable external index

每个 Vault SHALL 在应用数据目录拥有独立 LanceDB 和 `index-state.json`；SQLite MUST NOT 存储 chunk、向量或 Vault 原文。索引必须可删除后从 Vault 重建。

#### Scenario: Embedding contract changes
- **GIVEN** embedding 模型 ID、维度、距离算法或 chunk schema 与现有索引不兼容
- **WHEN** indexer 启动
- **THEN** 系统建立新 generation，验证完成后原子切换，而不是混用向量

#### Scenario: Index is deleted
- **GIVEN** Vault 原文仍存在但索引目录被删除
- **WHEN** 应用重新启动
- **THEN** 系统重新扫描并构建索引，不修改 Vault 原文

### Requirement: Index consistency does not depend only on watcher events

系统 SHALL 使用 watcher 进行增量提示，并在启动、唤醒和异常恢复时比较 manifest/hash，以修复漏事件、rename/delete 和同步盘变化。

#### Scenario: Watcher misses an external edit
- **GIVEN** 某个 Markdown 在应用休眠期间被外部修改
- **WHEN** 应用恢复并执行 reconciliation
- **THEN** 内容 hash 变化被发现且对应索引记录更新

### Requirement: Remote disclosure requires explicit knowledge enablement

本地 embedding SHALL 为默认模式。只有用户显式选择远程 embedding 时才发送待嵌入 chunk；只有用户在当前对话或工作流显式启用知识库时，top-k 内容才可发送给远程文本模型。

#### Scenario: Knowledge is not enabled for a chat
- **GIVEN** Vault 已建立本地索引
- **WHEN** 用户进行普通对话但没有启用知识库
- **THEN** Vault chunk 不会加入远程模型请求

#### Scenario: Knowledge is enabled
- **GIVEN** 用户在当前请求启用了某个 Vault
- **WHEN** 检索返回 top-k 片段
- **THEN** 仅这些片段及引用元数据进入文本模型上下文

### Requirement: Retrieval results are traceable

每个知识命中 SHALL 包含 Vault 相对路径、标题、段落或行范围，并允许用户打开来源。

#### Scenario: Answer uses Vault context
- **GIVEN** 模型响应使用了检索片段
- **WHEN** UI 渲染回答
- **THEN** 用户可查看并打开对应本地笔记位置

### Requirement: Built-in writes use conflict protection

内置 Obsidian/RAG 写入端口 SHALL 默认创建到 `Vault/AI Marketing/`。修改既有笔记时 MUST 携带 target path、base hash 和 diff；hash 不匹配时不得静默覆盖。

#### Scenario: Existing note is unchanged
- **GIVEN** 当前文件 hash 等于读取时的 base hash
- **WHEN** 用户确认应用内置修改
- **THEN** 系统应用 diff 并记录新 hash

#### Scenario: Existing note changed externally
- **GIVEN** 当前文件 hash 与 base hash 不同
- **WHEN** 内置修改尝试写入
- **THEN** 系统显示冲突并保留外部版本

### Requirement: Full Access limitation is disclosed

系统 SHALL 明确说明上述冲突保护只适用于内置知识库写入端口，不是对 Full Access OpenCode 文件工具的系统沙箱。

#### Scenario: Agent directly uses a file tool
- **GIVEN** 用户明确要求 Full Access Agent 操作 Vault 绝对路径
- **WHEN** OpenCode 直接调用文件工具
- **THEN** UI 展示该工具事件和目标路径，并允许紧急停止，但不得声称该操作经过内置 diff/hash 保护

