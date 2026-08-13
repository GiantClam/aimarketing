## Why

桌面基础设施和本地 OpenCode 工作台建立后，Windows v1 仍需要交付三个核心生产场景：通过共享内容 Skills 写作、通过 OpenCode 直接运行 `ppt-master` 生成本地 PPTX，以及把用户选择的 Obsidian Vault 作为无需插件的本地知识库。当前 Writer 逻辑混合云运行时、企业知识、数据库和 R2；PPT 依赖云端 worker 路径；知识库实现面向 RAGFlow/Dify/企业数据，均不能直接进入桌面端。

## What Changes

- 抽取 Writer 的纯领域逻辑和内容 Skill catalog，Web/Desktop 继续使用 `content/skills/` 单一源。
- 桌面端所有写作 turn 通过本地 OpenCode session 执行，不迁移云端 Writer runtime、R2 或企业知识路径。
- 将 `ppt-master` 作为桌面 OpenCode Skill 安装到私有 runtime，由 OpenCode 在本地项目目录调用私有 Python，直接产生 PPTX、SVG 和预览文件。
- 用户显式选择 Obsidian Vault 后直接读写 Markdown/frontmatter/附件；不要求 Obsidian 常驻、插件、REST API 或 CLI。
- 首次扫描立即提供标题、标签、链接和关键词检索，同时后台使用本地 embedding 构建每 Vault 独立 LanceDB；完成后启用混合检索。
- 配置变化、模型维度变化、漏失 watcher 事件和休眠恢复通过 manifest/hash reconciliation 与可重建索引处理。
- 内置知识库写入默认限定在 `Vault/AI Marketing/`；修改既有笔记使用 base hash、diff 和冲突检测。
- 明确说明 Full Access 下该写入保护是应用端口行为，不是对 OpenCode 文件工具的系统沙箱。

## Dependencies

- `validate-windows-desktop-feasibility` 已记录本地 OpenCode + `ppt-master` 路径获产品接受，并保留 LanceDB 诊断；本 change 自己负责真实 PPTX、本地 embedding 和 LanceDB 生产集成验收。
- `establish-desktop-foundation` 已提供 Tauri、配置、SQLite、文件和 RPC。
- `extract-shared-application-core` 已提供 Writer/Agent/Skill 共享边界。
- `add-local-opencode-workbench` 已提供稳定 OpenCode session、会话、事件和本地产物。

## Capabilities

### New Capabilities

- `desktop-local-writing`: 共享 Writer 核心、内容 Skill 单一源与本地 OpenCode 写作流程。
- `desktop-ppt-master`: OpenCode + 私有 Python + `ppt-master` 的本地 PPT 生成和修改。
- `desktop-obsidian-rag`: Vault 直接访问、增量索引、混合检索、引用和受保护写入。

### Modified Capabilities

无。现有 Writer/PPT/Knowledge 能力继续作为 SaaS adapter；本 change 添加桌面行为规范。

## Scope

### In Scope

- 内容写作、继续修改和本地产物。
- `ppt-master` 的创建、迭代和产物发现。
- Obsidian Vault 选择、扫描、索引、检索、引用和内置写入。
- 本地 embedding 默认、远程 embedding 可选。

### Out of Scope

- 迁移完整独立 Writer 云工作台的所有历史 UI 状态。
- `infra/railway/ppt-master-worker` 或任何 PPT 云 worker。
- Obsidian 插件、Local REST API、CLI 自动化。
- 多机共享 LanceDB、云同步或企业知识库。
- 对 Full Access OpenCode 文件工具建立权限沙箱。

## Impact

- Shared packages：`packages/writer-core`、`packages/skill-catalog`、`packages/workbench-ui`。
- Desktop host：Vault watcher、manifest、embedding、LanceDB、RAG retrieval 和引用打开。
- Runtime：私有 Python、字体、`ppt-master` Skill 和依赖探针。
- Data：`vault_mappings`、conversation/session、artifacts、usage；chunk/vector 不进入 SQLite。
- UI：写作入口、PPT 产物卡、知识库设置、索引状态、引用和冲突提示。

## Success Criteria

- [ ] 同一写作会话可连续创建和修改内容，所有文本 turn 均有 OpenCode 运行证据。
- [ ] OpenCode 直接调用 `ppt-master`，在本地项目目录产生可打开的中文 PPTX。
- [ ] Obsidian 未运行时仍可扫描、检索和打开引用。
- [ ] 删除索引后可以从 Vault 原文重建，Vault 文件不受损。
- [ ] 未显式启用知识库时，Vault 内容不进入远程文本模型请求。
- [ ] 修改既有笔记遇到 hash 冲突时不会静默覆盖。

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Writer 抽取形成第二套实现 | Medium | High | 原路径 re-export，同一 contract tests 跑 Web/Desktop |
| Python/字体环境差异导致 PPT 损坏 | Medium | High | capability probe + 真实中英文字形/PPT smoke |
| watcher 漏事件或 OneDrive 重命名 | High | Medium | watcher 仅作提示，启动/唤醒执行 manifest/hash reconciliation |
| embedding 变化导致旧索引不可读 | Medium | Medium | `index-state.json` 记录模型/维度/schema，不兼容时重建 |
| Full Access 绕过内置 Vault 写入保护 | Medium | High | UI 明示保护边界，关键文件工具事件可见且可紧急停止 |
