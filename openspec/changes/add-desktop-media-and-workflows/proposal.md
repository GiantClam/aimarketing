## Why

Windows v1 的产品范围不仅是本地聊天，还包括图片、视频、数字人、音乐、语音合成、声音克隆、通用音频及完整工作流。当前媒体实现把 Provider 请求与 Postgres、企业配置、计费、R2 和云异步任务混合；当前 `lib/workflows/capability-invoker.ts` 直接调用多个 Next API route。若直接搬入桌面端，会重新引入被明确排除的 SaaS 基础设施，也会导致 Web/Desktop 两套工作流长期分叉。

## What Changes

- 把媒体请求构造、响应归一化和异步 job 协议抽到共享 `media-runtime`，存储、任务和配置由 host adapter 注入。
- 桌面 Provider 直接调用用户配置的 OpenAI-compatible、百炼、MiniMax 和 RunningHub API，允许 reference upload、异步提交、轮询和临时 URL。
- 所有完成结果优先下载到本地项目目录，SQLite 仅登记路径和元数据。
- 外部异步任务在 submit 前持久化 idempotency key，submit 后立即持久化 provider task ID；重启后继续 poll，不自动重复付费提交。
- 桌面工作流使用共享 `workflow-core`，通过 desktop capability/repository/artifact ports 运行。
- 注册全部已确认 v1 节点，排除 Lead Hunter、发布为 Agent、工作流市场和企业预设。
- 支持 DAG、并行层、foreach、collect、取消、节点/分支重试、checkpoint 和恢复。
- 工作流定义可导出/导入可读 JSON，供小团队通过 Git、同步盘或文件传递；不共享 `app.db` 或 LanceDB。

## Dependencies

- `validate-windows-desktop-feasibility`
- `establish-desktop-foundation`
- `extract-shared-application-core`
- `add-local-opencode-workbench`
- `add-writing-ppt-and-obsidian-rag`

## Capabilities

### New Capabilities

- `desktop-media-generation`: 本地 Provider 配置、异步任务、恢复、下载、产物与用量行为。
- `desktop-workflow-execution`: 共享工作流定义、节点集合、运行、取消、重试和恢复。
- `desktop-workflow-portability`: 工作流 JSON 导入导出和单机小团队共享边界。

### Modified Capabilities

无。SaaS 保留其计费、企业和云存储 adapters；共享 core/provider clients 由本 change 接入 desktop adapter。

## Scope

### In Scope

- 图片：OpenAI-compatible、百炼。
- 视频：MiniMax、百炼、RunningHub。
- 数字人：RunningHub。
- 音乐、语音合成、声音克隆、通用音频：MiniMax。
- 用户配置 Provider/Model/Base URL/API Key 与节点可用状态。
- 全部确认的工作流节点、运行历史、事件、产物和用量。

### Out of Scope

- AIMarketing 云任务、R2、Railway、Dify/RAGFlow。
- Lead Hunter、发布为 Agent、工作流市场和企业预设。
- 多机并发执行、共享数据库和实时协作。
- 真实收费、余额限制或 AIMarketing 代付 Provider 请求。

## Impact

- Shared packages：`packages/media-runtime`、`packages/workflow-core`、`packages/runtime-contracts`。
- Desktop：`workflow-host` capability composition、Rust artifact/temp-path service、SQLite run nodes/attempts。
- UI：Provider 配置状态、工作流 builder、运行结果、媒体预览、取消/重试/恢复。
- SaaS：现有 provider normalization 改为调用共享 clients，但继续使用 Web adapters。

## Success Criteria

- [ ] 每类媒体能力至少有 fixture contract test 和一个真实 Provider smoke。
- [ ] 成功结果全部下载为本地文件，关闭应用后仍可访问。
- [ ] 重启异步任务只继续 poll，未重复 submit。
- [ ] 所有确认节点可保存、运行、取消、重试和恢复。
- [ ] 缺少配置的节点仍可见并明确显示“需要配置”。
- [ ] Desktop bundle 不含 Lead Hunter、publish-as-agent、marketplace、enterprise preset 或云存储 clients。

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Provider 响应和异步状态不一致 | High | Medium | fixture contract + 归一化状态机 + 原始响应诊断摘要 |
| 崩溃后重复提交造成外部费用 | Medium | High | submit 前 idempotency，submit 后立即保存 provider task ID，恢复只 poll |
| 临时 URL 在恢复前过期 | Medium | High | succeeded 后先下载本地再完成 run；恢复优先下载 |
| 大媒体经 IPC 导致内存峰值 | Medium | High | IPC 只传 canonical path/metadata，文件流写临时目录 |
| 工作流核心再次导入 SaaS | Medium | High | package boundary CI 与 Web/Desktop 同一 contract suite |

