## Why

共享核心和桌面宿主完成后，Windows v1 仍需要第一个用户可用的垂直切片：无账号的本地 Agent 工作台、普通对话、模型/Skill 选择、实时工具步骤、本地会话/产物和用量。当前普通聊天 gateway 会绕过 OpenCode，当前 workspaces 又直接调用 Next API；直接复用这些宿主路径会违反“桌面所有普通对话必须经过 OpenCode”和“不连接 AIMarketing 业务后端”的已确认要求。

## What Changes

- 使用 foundation 的 process supervisor 启动一个应用生命周期内常驻的本地 `opencode serve`，绑定随机 loopback 端口和随机 Basic Auth。
- 每个本地 conversation 映射到一个隔离、可恢复的 OpenCode session。
- 所有普通桌面对话和通用 Agent turn 必须经过 OpenCode；不存在 desktop AI SDK 直连文本模型 fallback。
- OpenCode 默认 Full Access，不展示权限模式选择或逐命令确认；UI 展示实时工具步骤和紧急停止。
- 通过 Desktop WorkbenchClient 组合共享消息 parts、输入框、会话侧栏、模型/Skill 选择、artifact、usage 和 diagnostics UI。
- 在 SQLite/项目目录保存会话、消息、run 摘要、关键事件、产物和用量；原始事件进入有界 JSONL。
- 桌面导航不包含登录、企业、计费、余额、Agent 发布、市场或公开页面。

## Dependencies

- `validate-windows-desktop-feasibility` 的 OpenCode spike 仅作为协议参考；本 change 自己负责正式 desktop composition 的 session、stream、tool、usage、abort 和恢复验收。
- `extract-shared-application-core` 已提供 runtime/session/event 与 Workbench client/UI contracts。
- `establish-desktop-foundation` 已提供 Tauri、配置、repositories、artifact、workflow-host RPC、bootstrap 和 process supervision。

## Capabilities

### New Capabilities

- `local-opencode-runtime`: supervised OpenCode、persistent sessions、streaming events、Full Access、取消和恢复。
- `desktop-agent-workbench`: 本地普通对话、模型/Skill 选择、实时执行和无账号导航。
- `local-conversation-artifacts-usage`: 本地历史、文件产物、关键事件、日志保留和用量统计。

### Modified Capabilities

无。SaaS 普通对话路由保持现状；OpenCode-only 是 desktop host 的强制行为。

## Scope

### In Scope

- 普通对话和通用 Agent turn。
- OpenAI-compatible Provider/Model/Base URL/API Key、默认模型和推理强度设置。
- 本地会话、消息、事件、产物、用量和诊断。
- Full Access、实时工具步骤、取消和 interrupted recovery。

### Out of Scope

- 内容写作、`ppt-master` 和 Obsidian RAG；属于 `add-writing-ppt-and-obsidian-rag`。
- 媒体 Provider 和完整工作流；属于 `add-desktop-media-and-workflows`。
- 发布镜像、签名和完整 VM 硬化；属于 `harden-windows-desktop-release`。
- 身份、企业、计费、云同步和多机协作。

## Impact

- Desktop UI：Agent workspace、conversation sidebar、settings、artifacts、usage、diagnostics。
- Local runtime：OpenCode lifecycle、session mapping、event normalization、cancel 和 crash recovery。
- Data：foundation repositories 与 bounded JSONL logs。
- Security posture：Full Access 是明确产品行为，不自动提权，但可能修改/删除当前 Windows 用户可访问文件。

## Success Criteria

- [ ] 普通对话抓包/事件证明始终选择本地 OpenCode。
- [ ] 两个 conversation 使用隔离 session，同一 conversation 多轮连续。
- [ ] 用户可以停止工具执行，崩溃后 run 标记 interrupted 且不会自动重复副作用。
- [ ] 会话、产物和用量在重启后仍可用，原始日志按 30 天/1GB 清理。
- [ ] API Key 不进入 SQLite、命令行、日志或诊断包。
- [ ] Desktop bundle/导航无身份、企业、计费和市场能力。

## Risks

- OpenCode 非锁版协议漂移：每次选用版本都跑 health/session/stream/tool/abort capability probe。
- Full Access 文件副作用：工具步骤实时可见、提供紧急停止并明确警告，不虚假宣称沙箱。
- Runtime session 与 SQLite 漂移：SQLite 是消息事实源，session 丢失时从持久化上下文恢复。
- 巨型 UI 假共享：只通过共享 WorkbenchClient/组件组合，不复制完整 Next workspace。
