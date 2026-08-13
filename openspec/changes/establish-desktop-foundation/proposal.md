## Why

桌面架构方向批准且共享核心抽取完成后，项目仍缺少承载桌面产品的正式宿主：Tauri 壳、可读本地配置、精简 SQLite、项目/产物文件、强制 runtime bootstrap、私有 Node workflow-host、双向 RPC 和 Windows 子进程监督。若在这些基础设施完成前接入聊天、Writer、PPT、RAG 或媒体，业务能力会自行建立存储和进程模型，最终无法统一恢复与打包。

## What Changes

- 创建 Tauri 2 + React 桌面壳和 Desktop WorkbenchClient composition，但暂不交付具体 AI 工作台。
- 实现普通模式 `%LOCALAPPDATA%\AIMarketing` 与 `portable.flag` 便携模式的确定性路径和单实例锁。
- 实现 UTF-8 `config.json`、原子写入、备份恢复、明文 API Key 警告和统一脱敏。
- 新建不迁移 SaaS schema 的精简 SQLite，由 Rust 独占；实现项目、会话、run、artifact、usage、workflow 和 Vault 映射 repositories。
- 实现本地项目/产物原子文件操作、关键事件入库与原始 JSONL 日志滚动。
- 在创建 WebView/工作台前建立完整 runtime bootstrap、组件 capability probes、自动修复和私有 runtime 目录。
- 创建私有 Node `workflow-host` 和版本化双向 RPC；Tauri 通过 Windows Job Object 监管 workflow-host 与 `opencode serve`。
- 提供 fake runtime/process/repository integration tests，供后续本地 OpenCode 工作台使用。

## Dependencies

1. `validate-windows-desktop-feasibility` 的 foundation decision MUST 为 `approved`；其诊断 spike 无需全部达到 release 级通过。
2. `extract-shared-application-core` MUST 已提供 runtime contracts、host-neutral packages、WorkbenchClient seam 和 SaaS parity 证据。

## Capabilities

### New Capabilities

- `desktop-host-runtime`: Tauri shell、强制 bootstrap、私有 runtime、进程监督和双向 RPC。
- `desktop-local-state`: config、普通/便携路径、SQLite、项目、产物和日志职责。

### Modified Capabilities

无。此 change 只建立桌面基础设施，不改变 SaaS 对外行为。

## Scope

### In Scope

- Tauri/React 壳和桌面 composition root。
- Runtime probes、安装/修复基础、私有目录和 last-known-good。
- SQLite、文件、日志、路径和单实例基础设施。
- workflow-host framing、反向 RPC、取消和 process lifecycle。

### Out of Scope

- 用户可用的普通聊天、内容写作、`ppt-master`、Obsidian RAG、媒体或完整工作流。
- 共享核心抽取和巨型 UI 拆分；这些属于 `extract-shared-application-core`。
- 发布级镜像演练、签名、size budget 和完整 VM 矩阵；这些属于 `harden-windows-desktop-release`。
- Lead Hunter、公开页面、身份、企业、计费和云服务。

## Impact

- 新增 `apps/desktop`、`apps/workflow-host` 和 `packaging/windows` 基础目录。
- 新增 Rust/Tauri、SQLite、Windows process 和 runtime 安装构建面。
- 使用已抽取的 `packages/runtime-contracts` 与 `packages/workbench-client`，不重新定义协议。
- 不迁移或修改 SaaS 数据库。

## Success Criteria

- [ ] 两个依赖 change 均完成且架构决定、共享 contracts 和 parity 证据可追溯。
- [ ] 当前支持的 Windows 开发/CI 环境能通过 foundation runtime gate 后进入空桌面壳；干净 Win10/Win11 发布矩阵留给 hardening。
- [ ] 普通/便携路径、单实例、配置恢复和明文密钥警告符合 specs。
- [ ] Rust 独占 SQLite，workflow-host 只能通过 typed repository RPC 访问。
- [ ] 大文件不经 IPC base64，项目文件原子写入并验证路径归属。
- [ ] 主进程退出或紧急停止时不存在孤儿 workflow-host/OpenCode 进程。
- [ ] Desktop foundation tests、Rust tests、Next lint/build 和 SaaS parity 全部通过。

## Risks

- WebView2 首装鸡生蛋：foundation 实现 pre-window 原生 bootstrap seam，真实缺失安装与干净 VM 由 release hardening 验收。
- Node/SQLite ABI：SQLite 只由 Rust 所有，不在 workflow-host 加原生 SQLite addon。
- 便携目录并发：数据根使用单实例锁，不允许多写者。
- 明文 Key 与 Full Access：统一脱敏和警告，但不宣称加密或沙箱。
