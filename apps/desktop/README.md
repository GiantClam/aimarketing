# AI Marketing Windows Desktop

本目录是 Windows 绿色版的唯一桌面入口：React/Vite UI 由 Tauri 2 承载，Rust 负责 SQLite 和本地路径，Node workflow-host 负责 OpenCode framed RPC。桌面包不引入线上登录、企业、计费、R2、Railway 或云端任务服务。

## 本机验证

```powershell
pnpm install
pnpm --filter @aimarketing/desktop typecheck
pnpm --filter @aimarketing/desktop test
pnpm --filter @aimarketing/desktop build
pnpm --filter @aimarketing/desktop exec tauri build --bundles nsis
pnpm --filter @aimarketing/desktop package:zip
pnpm --filter @aimarketing/desktop package:portable-zip
```

NSIS 产物位于 `apps/desktop/src-tauri/target/release/bundle/nsis/`；本机最新验证包约 123MB。绿色 ZIP 位于 `.artifacts/desktop-release/`，普通包约 162MB，便携包约 162MB；便携包已内置 `portable.flag`。Python/PPT 依赖仍由首启镜像链安装。运行时数据默认写入 `%LOCALAPPDATA%\AIMarketing`；便携包使用 exe 旁的 `data/`。MSI 需要本机安装并可用 WiX `light.exe`，NSIS 不依赖该可选步骤。

当前已接通：本地配置原子恢复、单实例锁、Rust SQLite 基础 schema 与 typed repository、OpenCode Host framed RPC（普通对话/写作/工作流文本统一走 OpenCode 且复用稳定 session）、本地文件 artifact、Obsidian Markdown manifest/关键词检索/reconciliation/冲突保护写入/扫描重建、共享 workflow/writer/skill/media contracts、工作流能力选择、OpenAI-compatible/Bailian/MiniMax/RunningHub 直连 submit/poll 与媒体下载、Windows Job Object 进程监管；桌面 UI 复用了线上 dashboard 的路由命名与导航顺序（`/dashboard`、`/dashboard/ai`、`/dashboard/writer`、`/dashboard/image-assistant`、`/dashboard/workflows`、`/dashboard/tasks`、`/dashboard/assets`、`/dashboard/knowledge-base`、`/dashboard/video`、`/dashboard/settings` 等），通过 `@aimarketing/workbench-ui` 共享线上主题 token、字体栈、首页入口文案、消息框架和工作区 archetype。构建时固定拉取官方 `hugohe3/ppt-master` commit 并复制完整 Skill（缺失时优先本地 spike 缓存，否则自动 git 获取），桌面只移除已确认排除的登录、企业、计费、Lead Hunter、公开营销页面与发布为 Agent，其余入口使用同一文案和路由语义；本地运行时、配置和数据适配由 Tauri/Rust/Node 完成。

LanceDB 使用动态加载：主绿色包不携带约 283 MiB 的平台原生 `.node`。索引默认使用随应用提供的离线 `local-hash-384-v1` 特征哈希向量（无需网络），若用户显式配置 loopback Ollama `nomic-embed-text` 则使用真实本地模型；两者都只写入每 Vault 独立 LanceDB，SQLite 永不保存 chunk、向量或 Vault 原文。

## 工作流可移植边界

工作流通过普通 `.workflow.json` 文件共享。导出内容不包含 API Key、Provider/模型绑定、数据库内部 ID、运行历史或绝对本机路径；在另一台机器导入时会迁移 schema、生成新的本地 workflow ID，并使用该机当前 Provider、项目目录、Vault 和索引路径。`app.db` 与每个 Vault 的 LanceDB 都是单机状态，不支持通过同步盘共享或并发打开；第二个实例会被单实例锁拒绝。

仍需后续验收：RunningHub 各业务 endpoint 的真实账号 smoke、真实 OpenCode+官方 ppt-master 端到端产物、LanceDB 独立运行时分发、首启原生安装门禁/干净 Win10/Win11 矩阵、完整 Workbench streaming UI 与线上 parity fixtures。当前未将这些诊断缺口误标为 v1 已完成。
