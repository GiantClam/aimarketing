**Status:** Implementation Complete
**Completed:** 2026-08-13

## Why

当前 AIMarketing 的可复用业务逻辑分散在 `lib/ai-runtime`、`lib/ai-entry`、`lib/workflows`、`lib/writer`、`lib/image-assistant` 和大型 React workspace 中，并与 Next.js route、Postgres、企业身份、计费、R2、Railway、Cloudflare 及 `next/navigation` 直接耦合。若桌面端直接复制这些实现，SaaS 后续升级无法同步，工作流和 Provider 行为也会形成两个需要重复调试的分支。

在开始桌面功能实现前，需要建立可执行的共享边界：纯 TypeScript 核心只有一个实现，SaaS 与桌面通过各自 adapter 使用同一契约和测试。Windows Desktop 的架构方向已经批准；WebView2、OpenCode、`ppt-master`、LanceDB 和干净 VM 的实现/发布验收由下游 changes 负责，不阻塞这项 host-neutral 抽取。

## What Changes

- 建立 pnpm workspace packages，并通过自动检查禁止共享包导入 Next route、Postgres、企业、计费、R2、Railway 或 Cloudflare。
- 抽取版本化 runtime、OpenCode、Provider、artifact、usage 和双向 IPC 契约，原 `lib/*` 路径保留薄 re-export。
- 将工作流 schema、migrations、图编译、foreach/collect、取消、重试和恢复逻辑抽入 host-neutral `workflow-core`，所有持久化和能力执行改为 ports。
- 将媒体 Provider 的请求构建、响应归一化、异步任务查询和取消契约抽入 `media-runtime`；SaaS 继续保留云存储、计费和任务 adapter。
- 将 Writer 的纯领域逻辑与 `content/skills` catalog/sync 逻辑抽为共享实现，不复制 Skill 源文件。
- 为共享 React workspace 引入 `WorkbenchClient` 和 `NavigationAdapter`，移除共享组件中的硬编码 `/api/*` 与 `next/navigation`。
- 用现有 SaaS tests、共享 contract tests 和 Next build 证明迁移前后行为等价。

## Capabilities

### New Capabilities

- `shared-package-boundaries`: 可自动验证的 host-neutral package 边界、单一实现和兼容 re-export 规则。
- `shared-runtime-provider-contracts`: Web/Desktop 共用的 OpenCode、Provider、事件、产物、用量和 IPC 契约。
- `shared-workflow-runtime`: 与宿主无关的工作流格式、编译、执行、迭代和恢复核心。
- `shared-workbench-client`: React workspace 使用的请求、事件、导航和本地文件动作端口。

### Modified Capabilities

无。此 change 只建立共享核心及 SaaS adapter，不交付桌面壳、SQLite、LanceDB 或 Windows runtime 安装器。

## Dependencies

- `validate-windows-desktop-feasibility` MUST record an `approved` foundation decision. Its runtime spikes are diagnostic inputs, not prerequisites for pure TypeScript extraction.
- `add-local-opencode-workbench` and all later desktop capability changes depend on this change's shared contracts and parity gate.

## Impact

- Workspace: `pnpm-workspace.yaml`、根 scripts、TypeScript package resolution。
- Shared code: `lib/ai-runtime/*`、纯 `lib/ai-entry/*`、`lib/workflows/*`、纯 `lib/writer/*`、`lib/ai-runtime/adapters/*`、`content/skills/*`。
- SaaS adapters: Next route、Postgres repository、计费、企业治理、R2/云任务继续保留在现有宿主层。
- UI: AI Entry、Workflow 和媒体 workspace 先注入 client/navigation ports，再逐块迁入共享 package。
- Verification: 现有单元/route tests、共享 contract tests、boundary scan、`pnpm lint` 和 `pnpm build`。
