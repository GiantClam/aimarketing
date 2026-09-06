# CoworkAny Windows Desktop v1 Implementation Plan

> Use this plan to execute the work task-by-task with tight verification after each step.

**Goal:** 在不复制 SaaS 业务核心的前提下，为 Windows 10 22H2/Windows 11 x64 交付面向个人与单机小团队的本地 CoworkAny 工作台。

**Architecture:** 保留当前 Next.js SaaS，并把纯 TypeScript 协议、工作流引擎、模型目录和可复用 UI 抽入 workspace packages。桌面端采用 Tauri + React；Rust 主进程负责启动门禁、SQLite、LanceDB、文件系统和子进程监管，私有 Node `workflow-host` 运行共享 TypeScript 核心，OpenCode `serve` 承担全部文本对话与 Skill 执行，媒体能力通过共享 Provider adapters 直连用户配置的 API。

**Tech Stack:** pnpm workspace、TypeScript、React 19、Next.js 15、Tauri 2/Rust、SQLite、LanceDB、OpenCode CLI、Node.js、Python embeddable、ONNX 本地 Embedding、OpenCode Skills、Playwright。

---

**Status:** 产品边界已通过 grill-me 访谈确认；本文是 Windows v1 的实施基线，不包含代码实施。

## 1. 已锁定范围

### 1.1 首版包含

- 本地 Agent 与普通对话；所有文本交互必须经过 OpenCode。
- 内容写作与现有写作 Skills。
- OpenCode + `ppt-master` Skill 直接在项目目录生成 PPTX；不保留 `ppt-master worker`。
- 本地会话、任务、产物、项目和用量统计。
- 工作流编辑、运行、取消、重试、恢复、foreach、collect 与全部已确认节点。
- 图片、视频、数字人、音乐、语音合成、声音克隆和通用音频生成。
- Obsidian Vault 直接读写、关键词检索、后台语义索引和混合 RAG。
- OpenAI 兼容文本/Embedding/图片接口，以及百炼、MiniMax、RunningHub 等现有媒体 Provider。
- 普通模式与便携模式；首次运行强制完成环境安装。

### 1.2 首版排除

- Lead Hunter 及其下载、预览、证据和工作流节点。
- 公开营销页面、SEO 页面和网站生成能力。
- 注册、登录、用户会话、企业、角色、权限、订阅、支付、余额和真实计费。
- 发布为 Agent、工作流市场、企业预设和云端共享。
- R2、Railway、Cloudflare runtime、RAGFlow、Dify、Vercel API 和云端异步任务。
- 多机共享数据库、实时协作、共享任务队列和云端同步。

### 1.3 权限与隐私边界

- 首次启动默认 Full Access，不展示权限选择，不做逐命令确认。
- OpenCode 继承当前 Windows 用户权限，可使用文件、Shell、Skill、网络和外部目录。
- 应用不主动提权；需要管理员权限时由 Windows UAC 决定。
- UI 实时展示工具步骤并提供紧急停止；关键工具事件持久化。
- API Key 明文保存在可读 JSON 配置中；UI 明示风险，日志和诊断包必须脱敏。
- 除用户主动配置的模型/媒体 Provider 和运行时下载源外，不连接 CoworkAny 业务后端。

## 2. 当前代码审计结论

### 2.1 可以直接抽取的核心

- `lib/ai-runtime/opencode-protocol.ts`、`opencode-prompt.ts`、`opencode-model.ts`：已有 OpenCode 协议、提示和模型归一化测试。
- `lib/ai-runtime/contracts.ts`、`capabilities.ts`、`types.ts`：可作为共享运行时契约起点。
- `lib/workflows/schema.ts`、`workflow-definition-v2.ts`、`workflow-definition-migrations.ts`：可形成版本化工作流格式。
- `lib/workflows/execution.ts`、`iteration-execution.ts`、`iteration-runtime.ts`：图执行、并行层和循环逻辑可复用。
- `lib/workflows/node-definitions/*`、`connect.ts`、`plan-compiler.ts`、`resume-compatibility.ts`：大部分是纯逻辑。
- `lib/ai-runtime/adapters/*` 与 `lib/image-generation/provider-orchestration.ts`：媒体 Provider 请求逻辑可通过端口抽取。
- `content/skills/*`：继续作为 SaaS 与桌面端共享的 Skill 单一源。

### 2.2 必须隔离的 SaaS 耦合

- `lib/workflows/capability-invoker.ts` 直接导入 Next `app/api` route、鉴权、积分、企业、R2 和云任务，不能进入共享包。
- `lib/workflows/task-runner.ts`、`run-job.ts`、`store.ts` 直接依赖 Drizzle/Postgres、企业身份和积分租约。
- `lib/ai-entry/runtime/background-run-service.ts`、`artifact-publisher.ts`、Cloudflare/Railway/R2 clients 属于 SaaS adapter。
- `components/ai-entry/ai-entry-workspace.tsx`、`components/writer/writer-workspace.tsx`、`components/workflows/workflow-builder-page.tsx` 直接依赖 `next/navigation` 和 `/api/*`，必须先注入 client/router 端口再共享。
- `lib/db/schema.ts` 的 SaaS schema 超过桌面需求；不得迁移或裁剪后复用。

### 2.3 复用规则

1. 不复制上述核心文件到 `apps/desktop`。
2. 先补契约测试，再移动实现。
3. 原路径保留薄 re-export，保证 SaaS 小步迁移。
4. 共享包禁止导入 `next/*`、`app/api/*`、Postgres、企业、计费、R2、Railway 或 Cloudflare。
5. SaaS 与 desktop adapter 必须运行同一组 contract tests。

## 3. 目标目录与进程拓扑

```text
coworkany/
├─ app/ + components/ + lib/             # 现有 Next.js SaaS
├─ apps/
│  ├─ desktop/                            # Tauri + React 桌面应用
│  │  ├─ src/
│  │  └─ src-tauri/
│  └─ workflow-host/                      # 私有 Node TypeScript sidecar
├─ packages/
│  ├─ runtime-contracts/                  # IPC、OpenCode、事件、Provider 契约
│  ├─ agent-runtime-core/                 # Agent/session/context/artifact 纯逻辑
│  ├─ opencode-runtime/                   # Web/Desktop 共用 session/event client
│  ├─ workflow-core/                      # 纯 TS 工作流 schema/engine/migrations
│  ├─ media-runtime/                      # 纯 TS Provider adapters
│  ├─ writer-core/                        # Writer use cases 与纯领域逻辑
│  ├─ workbench-client/                   # UI 使用的应用端口
│  ├─ workbench-ui/                       # SaaS/desktop 共用 React UI
│  └─ skill-catalog/                      # content/skills 清单和同步逻辑
└─ packaging/windows/
   ├─ runtime-manifest.schema.json
   ├─ runtime-manifest.example.json
   ├─ install-runtime.ps1
   └─ build-offline-runtime.ps1
```

```text
React UI
   │ Tauri invoke/events
   ▼
Tauri Rust Host
   ├─ SQLite + config.json + local files
   ├─ per-Vault LanceDB + file watcher + local embedding
   ├─ Runtime bootstrap/download/repair
   └─ Process supervisor / Windows Job Object
          ├─ workflow-host (private Node, duplex JSON-RPC)
          └─ opencode serve (loopback random port + random Basic Auth)
                    └─ Python + ppt-master Skill / other local tools
```

责任边界：Rust 是本地状态和系统能力的唯一所有者；`workflow-host` 只运行共享 TypeScript 编排，通过双向 RPC 请求持久化、文件和 OpenCode/Provider 能力；React 不直接访问 SQLite、OpenCode 端口或 API Key。

## 4. 本地数据设计

### 4.1 路径

普通模式：

```text
%LOCALAPPDATA%\CoworkAny\
├─ config.json
├─ app.db
├─ runtime\<component>\<version>\
├─ projects\
├─ indexes\<vault-id>\lancedb\
├─ logs\
└─ cache\downloads\
```

便携模式由程序旁 `portable.flag` 激活：

```text
<exe-dir>\data\
├─ config.json
├─ app.db
├─ runtime\
├─ projects\
├─ indexes\
└─ logs\
```

### 4.2 `config.json`

配置是用户可读、UTF-8、原子替换的 JSON，不再把模型或 Vault 设置放进 SQLite：

```json
{
  "schemaVersion": 1,
  "workspaceDir": "D:\\CoworkAny Workspace",
  "vaults": [{ "id": "vault-local-id", "path": "D:\\Notes", "enabled": true }],
  "providers": {
    "openaiCompatible": [{ "id": "default", "baseUrl": "https://api.example.com/v1", "apiKey": "plain-text", "models": ["model-id"] }],
    "minimax": { "apiKey": "plain-text" },
    "bailian": { "apiKey": "plain-text" },
    "runninghub": { "apiKey": "plain-text" }
  },
  "defaults": { "textModel": "provider/model", "reasoningEffort": "medium", "embeddingMode": "local" },
  "rag": { "enabled": false, "remoteEmbeddingProviderId": null },
  "runtime": { "autoRepair": true }
}
```

写入流程必须是 `config.json.tmp` → flush → rename；日志、错误提示和诊断导出统一走 key redactor。

### 4.3 SQLite v1

不迁移 SaaS schema。`app.db` 仅包含：

```sql
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE identity(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE conversations(id TEXT PRIMARY KEY, project_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, opencode_session_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, parts_json TEXT, created_at INTEGER NOT NULL, FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE);
CREATE TABLE runs(id TEXT PRIMARY KEY, conversation_id TEXT, workflow_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER, finished_at INTEGER, error_code TEXT, summary_json TEXT);
CREATE TABLE run_events(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(run_id, sequence));
CREATE TABLE artifacts(id TEXT PRIMARY KEY, run_id TEXT, project_id TEXT, kind TEXT NOT NULL, path TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER, sha256 TEXT, created_at INTEGER NOT NULL);
CREATE TABLE usage_records(id TEXT PRIMARY KEY, run_id TEXT, provider_id TEXT NOT NULL, model_id TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, estimated_cost_micros INTEGER, currency TEXT NOT NULL DEFAULT 'USD', created_at INTEGER NOT NULL);
CREATE TABLE workflows(id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL, definition_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE workflow_revisions(id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, revision INTEGER NOT NULL, definition_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(workflow_id, revision));
CREATE TABLE run_nodes(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, node_key TEXT NOT NULL, status TEXT NOT NULL, output_json TEXT, error_code TEXT, started_at INTEGER, finished_at INTEGER, UNIQUE(run_id, node_key));
CREATE TABLE run_attempts(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, node_key TEXT NOT NULL, attempt INTEGER NOT NULL, idempotency_key TEXT NOT NULL, provider_task_id TEXT, status TEXT NOT NULL, state_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(run_id, node_key, attempt));
CREATE TABLE vault_mappings(id TEXT PRIMARY KEY, vault_id TEXT NOT NULL, project_id TEXT, index_state_path TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
```

启用 `WAL`、foreign keys 和 busy timeout。向量、chunk、Vault 原文、媒体二进制和完整 stdout/stderr 不进入 SQLite。

### 4.4 日志保留

- SQLite 只保存关键生命周期和工具摘要事件。
- 完整 OpenCode NDJSON、工具 stdout/stderr 写入 `logs/runs/<run-id>.jsonl`。
- 自动清理超过 30 天的原始日志；若未到 30 天但总量超过 1GB，从最旧日志开始清理。
- 会话、消息、用量、产物索引和用户文件永不自动删除。

## 5. Runtime 安装与绿色分发

### 5.1 强制启动门禁

主界面创建前依次检查：WebView2、Node、workflow-host、OpenCode、Python/依赖、字体、本地 Embedding、Skills、SQLite/LanceDB migrations。缺失或不兼容时自动调用 `install-runtime.ps1`；安装完成并再次通过探针后才进入应用，不提供受限模式。

### 5.2 兼容而非严格锁版

- WebView2：最低版本 + 页面创建探针。
- Node：x64、支持的 engines 范围 + workflow-host 握手。
- Python：x64、版本范围 + import probe + PPT 冒烟测试。
- OpenCode：版本范围 + server/session/stream/tool 协议探针。
- 字体：所需字族、字形和渲染探针。
- Embedding：模型 ID、向量维度、距离算法和索引 schema 兼容。
- Skills：清单解析和实际加载探针。
- 环境可用时不主动升级；仅缺失、不兼容、损坏或用户主动修复时更新。

### 5.3 下载源和信任链

顺序为阿里云 OSS/CDN → 腾讯云 COS/CDN → 清华镜像（仅其实际提供的组件）→ 官方源。所有来源必须匹配同一份离线签名 manifest 和 SHA-256；客户端内置公钥，不能信任下载源同桶提供的公钥。

另行发布 `CoworkAny-Runtime-x64.zip`，支持从本地导入、校验和安装。主 ZIP 不内置完整运行环境；正常目标为 60–150MB，首次补齐环境后约 500MB–1.2GB，实际以 CI size budget 为准。

## 6. 分阶段实施任务

### Task 0: 记录架构决定、非阻断诊断与风险转交

**Files:**
- Create: `scripts/desktop-spikes/webview-bootstrap/`
- Create: `scripts/desktop-spikes/opencode-session/`
- Create: `scripts/desktop-spikes/ppt-master/`
- Create: `scripts/desktop-spikes/lancedb/`
- Create: `docs/desktop/windows-v1-feasibility-results.zh-CN.md`

**Steps:**

1. 记录 Tauri/React、Rust host、workflow-host、OpenCode、SQLite 与 per-Vault LanceDB 的 foundation direction 已批准。
2. 保留 WebView2、OpenCode、`ppt-master` 和 LanceDB spike 作为工程诊断，不用它们替代下游 integration/release acceptance。
3. 明确 WebView2 仅是 Tauri React UI 的 Windows 渲染运行时；foundation 实现 pre-window seam，真实缺失和 clean-VM 验收归 release hardening。
4. 接受单机 OpenCode + `ppt-master` 技术路径；普通对话/OpenCode、真实 PPTX、local embedding/LanceDB 分别在所属 capability change 验收。
5. 将干净 Win10/Win11、签名、最终包体积、多源下载安装和恢复统一转交 `harden-windows-desktop-release`。
6. 将 Foundation decision 标记为 `approved`，Release readiness 保持 `pending`，随后开始共享核心抽取。
7. Commit intent: `Separate foundation approval from Windows release evidence`。

### Task 1: 建立 workspace 与回归基线

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `packages/runtime-contracts/package.json`
- Create: `packages/agent-runtime-core/package.json`
- Create: `packages/opencode-runtime/package.json`
- Create: `packages/workflow-core/package.json`
- Create: `packages/media-runtime/package.json`
- Create: `packages/writer-core/package.json`
- Create: `packages/workbench-client/package.json`
- Create: `packages/workbench-ui/package.json`
- Create: `packages/skill-catalog/package.json`
- Create: `scripts/check-shared-package-boundaries.ts`
- Test: `scripts/check-shared-package-boundaries.test.ts`

**Steps:**

1. 写一个失败测试，扫描 `packages/*/src`，发现 `next/*`、`@/app/api`、`billing`、`enterprise`、`R2`、`Railway`、`Cloudflare` 或 Postgres 导入时失败。
2. 运行 `pnpm tsx --test scripts/check-shared-package-boundaries.test.ts`，确认测试因脚本缺失失败。
3. 把 `apps/*`、`packages/*` 加入 `pnpm-workspace.yaml`，不引入 monorepo 构建器。
4. 为九个 package 添加 `exports`、`types`、`test`、`typecheck`，并统一继承根 TypeScript 配置。
5. 实现边界扫描脚本和根脚本 `test:desktop:boundaries`。
6. 运行边界测试、现有 `pnpm lint` 和 `pnpm build`，记录未新增回归。
7. Commit intent: `Create enforceable sharing boundaries before desktop extraction`，使用 Lore trailers 记录 SaaS 必须继续构建。

### Task 2: 抽取 OpenCode 与运行时契约

**Files:**
- Create: `packages/runtime-contracts/src/opencode-protocol.ts`
- Create: `packages/runtime-contracts/src/events.ts`
- Create: `packages/runtime-contracts/src/capabilities.ts`
- Create: `packages/runtime-contracts/src/provider.ts`
- Create: `packages/runtime-contracts/src/ipc.ts`
- Create: `packages/agent-runtime-core/src/context/*.ts`
- Create: `packages/agent-runtime-core/src/artifacts/*.ts`
- Create: `packages/opencode-runtime/src/session-client.ts`
- Move pure implementation from: `infra/railway/opencode-runtime/src/opencode-serve-manager.ts`
- Modify: `lib/ai-runtime/opencode-protocol.ts`
- Modify: `lib/ai-runtime/contracts.ts`
- Modify: `lib/ai-runtime/capabilities.ts`
- Test: `packages/runtime-contracts/src/*.test.ts`

**Steps:**

1. 将现有 OpenCode fixture 契约测试复制到 package，并先让测试因 exports 缺失失败。
2. 定义版本化 `DesktopCommand`、`DesktopResponse`、`DesktopEvent`，所有 envelope 包含 `protocolVersion`、`requestId`、`runId` 和结构化错误码。
3. 将 context window/summary、artifact detector/policy、assistant message 等纯逻辑移入 `agent-runtime-core`。
4. 从 Railway manager 抽出纯 `OpenCodeSessionClient`；Railway 与桌面分别负责进程/HTTP transport composition，不共享 Railway server。
5. 移动纯协议实现，保留 `lib/ai-runtime/*` re-export；不得复制实现。
6. 增加未知事件透传、顺序号去重、部分流恢复和工具错误 fixture。
7. 运行三个 package tests、原 `lib/ai-runtime/*.test.ts` 及 Railway manager tests。
8. Commit intent: `Make OpenCode and agent runtime behavior host-neutral`。

核心 IPC 形状：

```ts
export type DesktopCommand =
  | { type: "chat.start"; conversationId: string; prompt: string; model: ModelRef; skillIds: string[] }
  | { type: "run.cancel"; runId: string }
  | { type: "workflow.run"; workflowId: string; input: Record<string, unknown> }
  | { type: "artifact.open"; artifactId: string }
  | { type: "rag.retrieve"; vaultId: string; query: string; limit: number }

export type DesktopEvent = {
  protocolVersion: 1
  runId: string
  sequence: number
  type: string
  payload: unknown
}
```

### Task 3: 抽取纯 TypeScript workflow-core

**Files:**
- Move implementation from: `lib/workflows/schema.ts`
- Move implementation from: `lib/workflows/workflow-definition-v2.ts`
- Move implementation from: `lib/workflows/workflow-definition-migrations.ts`
- Move implementation from: `lib/workflows/connect.ts`
- Move implementation from: `lib/workflows/plan-compiler.ts`
- Move implementation from: `lib/workflows/execution.ts`
- Move implementation from: `lib/workflows/iteration-*.ts`
- Move implementation from: `lib/workflows/node-definitions/*`
- Create: `packages/workflow-core/src/ports.ts`
- Create: `packages/workflow-core/src/index.ts`
- Test: `packages/workflow-core/src/**/*.test.ts`

**Steps:**

1. 复制现有 graph、migration、foreach、collect、cancel、resume 测试到 package，保持 fixture 不变。
2. 先运行 package tests，确认因实现未导出失败。
3. 定义 `WorkflowCapabilityPort`、`WorkflowRunRepository`、`ArtifactPort`、`WorkflowEventSink`、`Clock` 和 `IdGenerator`。
4. 将 `enterpriseId`、`ownerUserId`、`creditsConsumed` 从核心语义改为可选 adapter metadata；用量改为 `UsageDelta`，不包含扣费概念。
5. 移动纯实现并在原路径增加 re-export shims。
6. 加入静态测试，确保 workflow-core 没有 Next、数据库和 Provider 依赖。
7. 同时运行 package tests 与原工作流 tests，修复兼容 adapter，不改变 SaaS 行为。
8. Commit intent: `Separate workflow semantics from SaaS execution infrastructure`。

端口最小形状：

```ts
export interface WorkflowCapabilityPort {
  invoke(request: WorkflowCapabilityRequest, signal: AbortSignal): Promise<WorkflowCapabilityResult>
}

export interface WorkflowRunRepository {
  load(runId: string): Promise<WorkflowRunSnapshot | null>
  append(event: WorkflowDomainEvent): Promise<void>
  saveSnapshot(snapshot: WorkflowRunSnapshot): Promise<void>
}
```

### Task 4: 保持 SaaS adapter 通过同一契约

**Files:**
- Create: `lib/workflows/adapters/saas-capability-port.ts`
- Create: `lib/workflows/adapters/saas-run-repository.ts`
- Modify: `lib/workflows/capability-invoker.ts`
- Modify: `lib/workflows/task-runner.ts`
- Modify: `lib/workflows/run-job.ts`
- Modify: `lib/workflows/store.ts`
- Test: `lib/workflows/adapters/*.contract.test.ts`

**Steps:**

1. 为当前 `capability-invoker` 行为写 adapter contract tests，覆盖 LLM、writer、image、video、audio、PPT 和子工作流。
2. 实现 SaaS ports，内部继续调用现有 route/service，先不重写 Provider。
3. 让 task runner 依赖 workflow-core ports，而不是核心反向导入 Next route。
4. 将 Lead Hunter、积分和企业治理留在 SaaS adapter；不要加入共享 node registry。
5. 运行全部工作流测试和 `pnpm build`。
6. Commit intent: `Preserve SaaS behavior behind workflow ports`。

### Task 5: 为共享 UI 建立 client/router seam

**Files:**
- Create: `packages/workbench-client/src/client.ts`
- Create: `packages/workbench-client/src/router.ts`
- Create: `packages/workbench-client/src/context.tsx`
- Create: `lib/workbench/saas-client.ts`
- Modify: `components/ai-entry/ai-entry-workspace.tsx`
- Modify: `components/writer/writer-workspace.tsx`
- Modify: `components/workflows/workflow-builder-page.tsx`
- Modify: `components/workflows/workflow-list-page.tsx`
- Test: `packages/workbench-client/src/*.test.tsx`

**Steps:**

1. 为聊天发送、历史加载、资产选择、工作流保存和路由跳转写 mock-client 组件测试。
2. 定义 `WorkbenchClient`，禁止共享组件直接 `fetch('/api/...')`。
3. 定义 `WorkbenchRouter`，禁止共享组件直接导入 `next/navigation` 或 `next/link`。
4. 在原组件内先使用 SaaS client provider，确保 UI 行为不变。
5. 按 chat、writer、workflow、knowledge、media 小块移动到 `packages/workbench-ui`；原组件保留组合层。
6. 每移动一个小块运行其组件测试和相关页面 smoke test，禁止一次性搬迁三个千行组件。
7. Commit intent: `Make workbench UI host-agnostic without forking screens`。

### Task 6: 创建 Tauri 桌面壳与桌面 client

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/app.tsx`
- Create: `apps/desktop/src/desktop-client.ts`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/commands.rs`
- Test: `apps/desktop/src/desktop-client.test.ts`

**Steps:**

1. 写 desktop client mock 测试，确认命令 request ID 与事件 sequence 正确关联。
2. 创建 Vite React 应用并接入共享 design tokens、UI primitives 和 workbench client provider。
3. 创建 Tauri commands/events 薄层；UI 不接触文件路径或子进程句柄。
4. 建立本地导航，只注册 v1 页面，完全不注册登录、企业、计费、Lead Hunter、市场和公开页面。
5. 运行 `pnpm --filter @coworkany/desktop test`、`typecheck` 和静态 build。
6. Commit intent: `Create the desktop host around shared workbench surfaces`。

### Task 7: 实现配置、路径和便携模式

**Files:**
- Create: `apps/desktop/src-tauri/src/paths.rs`
- Create: `apps/desktop/src-tauri/src/config.rs`
- Create: `apps/desktop/src-tauri/src/redaction.rs`
- Create: `apps/desktop/src-tauri/tests/config_paths.rs`
- Create: `apps/desktop/src/settings/model-settings.tsx`

**Steps:**

1. 写 normal/portable、中文路径、空格路径、只读目录和超长路径测试。
2. 实现 `portable.flag` 检测和明确的目录解析，不读取模糊环境变量作为删除目标。
3. 实现普通/便携单实例锁；同一 `app.db` 或 LanceDB 目录被另一个实例占用时拒绝第二写者。
4. 实现 JSON schema version、原子保存、备份和损坏恢复。
5. 实现递归 key redactor，覆盖 header、query、JSON 和错误链。
6. 添加“打开配置”“重新加载”“导出已脱敏诊断”入口和明文 API Key 警告。
7. 运行 Rust tests 和前端设置页测试。
8. Commit intent: `Make local configuration readable, portable, and recoverable`。

### Task 8: 实现强制 Runtime Bootstrap

**Files:**
- Create: `apps/desktop/src-tauri/src/bootstrap/mod.rs`
- Create: `apps/desktop/src-tauri/src/bootstrap/probes.rs`
- Create: `apps/desktop/src-tauri/src/bootstrap/manifest.rs`
- Create: `apps/desktop/src-tauri/src/bootstrap/downloader.rs`
- Create: `packaging/windows/runtime-manifest.schema.json`
- Create: `packaging/windows/install-runtime.ps1`
- Create: `packaging/windows/build-offline-runtime.ps1`
- Test: `apps/desktop/src-tauri/tests/bootstrap.rs`

**Steps:**

1. 为各组件 probe 写失败、兼容、不兼容、损坏和系统安装可复用测试。
2. 为签名无效、SHA 不符、断点续传和源切换写 downloader tests。
3. 在创建 WebView 前执行原生 preflight；缺少 WebView2 时仍能显示原生修复状态。
4. 实现阿里云 → 腾讯云 → 清华适用源 → 官方源的组件级 source matrix。
5. 自动调用 UTF-8 `install-runtime.ps1`，下载到临时目录，验证后原子切换私有 runtime。
6. 实现离线 runtime ZIP 导入和重复 probe。
7. 实现“可用不更新，损坏/不兼容/主动修复才更新”和 last-known-good 回退。
8. probe 选中系统组件后记录其 canonical absolute executable path；本次运行不再重新搜索 PATH。
9. 将私有字体目录同时传给 Tauri、OpenCode 和 Python/PPT 环境，并以真实中英文字形输出验证。
10. 在普通、便携两种模式分别运行 bootstrap integration test。
11. Commit intent: `Guarantee a complete runtime before opening the workbench`。

### Task 9: 实现 SQLite repository 与迁移

**Files:**
- Create: `apps/desktop/src-tauri/src/db/mod.rs`
- Create: `apps/desktop/src-tauri/src/db/migrations/0001_init.sql`
- Create: `apps/desktop/src-tauri/src/db/repositories/*.rs`
- Create: `apps/desktop/src-tauri/tests/db_migrations.rs`
- Create: `packages/runtime-contracts/src/repository.ts`

**Steps:**

1. 写空库升级、重复升级、回滚保护、外键和 WAL tests。
2. 创建本文定义的精简 schema；不得导入 `lib/db/schema.ts`。
3. 为 conversation/message/run/event/artifact/usage/workflow 建 repository。
4. 在 Rust IPC 中实现 workflow-host 反向 repository requests，避免 Node 原生 SQLite addon。
5. 测试两个并发只读请求和一个写事务；保证桌面单实例。
6. 写数据库备份和 integrity check 命令。
7. Commit intent: `Keep desktop state transactional without importing the SaaS database`。

### Task 10: 实现本地项目、产物与日志

**Files:**
- Create: `apps/desktop/src-tauri/src/artifacts.rs`
- Create: `apps/desktop/src-tauri/src/projects.rs`
- Create: `apps/desktop/src-tauri/src/logs.rs`
- Create: `apps/desktop/src-tauri/tests/artifacts.rs`
- Create: `packages/runtime-contracts/src/artifacts.ts`

**Steps:**

1. 写路径穿越、重复文件名、部分下载、哈希不符和 Windows 锁文件 tests。
2. 产物先写临时文件，再 rename 到项目目录；数据库只登记最终路径。
3. 实现 Explorer 打开、应用内预览、外部默认程序打开和缺失文件修复标记。
4. 实现关键 run events 入库，原始 NDJSON/stdio 写文件。
5. 实现 30 天/1GB 滚动策略，只清理原始日志。
6. Commit intent: `Treat local files as artifacts and SQLite as their index`。

### Task 11: 实现 workflow-host 与双向 RPC

**Files:**
- Create: `apps/workflow-host/package.json`
- Create: `apps/workflow-host/src/main.ts`
- Create: `apps/workflow-host/src/rpc.ts`
- Create: `apps/workflow-host/src/runtime.ts`
- Create: `apps/workflow-host/src/adapters/desktop-*.ts`
- Create: `apps/desktop/src-tauri/src/processes/workflow_host.rs`
- Test: `apps/workflow-host/src/*.test.ts`

**Steps:**

1. 写 framing、并发 request、反向 request、取消、子进程退出和坏消息 tests。
2. 实现 length-prefixed 或逐行 JSON-RPC，明确最大消息大小；大文件只传路径和元数据。
3. workflow-host 装载 workflow-core、media-runtime 和 desktop ports。
4. Rust 用 Windows Job Object 监管 host，主进程退出时终止子进程树。
5. 崩溃后重启 host，将运行中任务标记 interrupted，不自动重复外部付费请求。
6. 打包私有 Node 和编译后的 host；系统 Node 只有通过 probe 才复用。
7. Commit intent: `Run shared TypeScript orchestration as a supervised local sidecar`。

### Task 12: 实现本地 OpenCode Host 与普通对话

**Files:**
- Create: `apps/desktop/src-tauri/src/processes/opencode.rs`
- Create: `apps/workflow-host/src/adapters/opencode-client.ts`
- Create: `apps/workflow-host/src/chat-service.ts`
- Create: `apps/workflow-host/src/opencode-event-normalizer.ts`
- Test: `apps/workflow-host/src/chat-service.test.ts`
- Test: `apps/desktop/src-tauri/tests/opencode_supervisor.rs`

**Steps:**

1. 用 fake OpenCode server 写启动、握手、session、stream、tool、cancel 和 crash tests。
2. 在 loopback 随机端口启动 `opencode serve`，生成随机 Basic Auth，关闭 CORS/mDNS。
3. 使用 CoworkAny 私有 config/skills 目录，避免读取或修改用户全局 OpenCode 配置。
4. 将一个 conversation 稳定映射到一个 OpenCode session；SQLite 仍是消息事实源。
5. 全部普通对话、写作和文本 workflow node 走此服务，禁止 desktop 直接调用文本模型 SDK。
6. 把 normalized events 写入 UI、关键事件表和原始 JSONL。
7. 实现紧急停止、Job Object 终止和 interrupted recovery。
8. Commit intent: `Route every desktop text interaction through local OpenCode`。

### Task 13: 同步 Skills 并接通写作与 ppt-master

**Files:**
- Create: `packages/skill-catalog/src/catalog.ts`
- Create: `packages/skill-catalog/src/sync.ts`
- Create: `packages/writer-core/src/*.ts`
- Modify: `scripts/sync-shared-agent-skill-bundles.ts`
- Create: `packaging/windows/skills/ppt-master/`
- Create: `apps/workflow-host/src/ppt-service.ts`
- Test: `packages/skill-catalog/src/catalog.test.ts`
- Test: `apps/workflow-host/src/ppt-service.test.ts`

**Steps:**

1. 为 `content/skills` 单一源、catalog digest 和缺失 reference 写 tests。
2. 生成 SaaS runtime 与 desktop runtime 两种目标，不复制手工维护 Skill。
3. 从 `lib/writer` 抽取 config、types、result、revision guard、session runtime、assets、message reconciliation 和 memory 纯逻辑；DB/R2/企业知识留在 SaaS adapter。
4. 将确认保留的内容写作 Skills 加入 desktop catalog，排除企业/Lead Hunter/市场发布 Skills。
5. 安装 `ppt-master` Skill 和必要 Python 依赖；不引入 `infra/railway/ppt-master-worker`。
6. 让 OpenCode 在项目目录调用 Skill，监听本地 PPTX/SVG/preview 产物并登记 artifact。
7. 写包含中文、图片、16:9、可编辑文本和失败恢复的 PPT smoke test。
8. Commit intent: `Share writer logic and run ppt-master as a local OpenCode skill`。

### Task 14: 实现 Obsidian Vault 与本地 RAG

**Files:**
- Create: `apps/desktop/src-tauri/src/vault/mod.rs`
- Create: `apps/desktop/src-tauri/src/vault/watcher.rs`
- Create: `apps/desktop/src-tauri/src/vault/manifest.rs`
- Create: `apps/desktop/src-tauri/src/rag/index.rs`
- Create: `apps/desktop/src-tauri/src/rag/embedding.rs`
- Create: `apps/desktop/src-tauri/src/rag/retrieval.rs`
- Create: `apps/desktop/src/knowledge/*.tsx`
- Test: `apps/desktop/src-tauri/tests/vault_rag.rs`
- Reference: `docs/research/2026-08-11-obsidian-local-rag-integration.zh-CN.md`

**Steps:**

1. 写忽略 `.obsidian`、trash、隐藏路径、用户 ignore、symlink loop 和非法 frontmatter tests。
2. 实现用户显式选择 Vault；不要求 Obsidian 运行、插件、REST API 或 CLI。
3. 启动时立即提供标题/tag/link/内容扫描检索，同时后台构建 per-Vault LanceDB。
4. 实现 watcher + 启动/唤醒 manifest/hash reconciliation，避免漏事件。
5. 将模型 ID、维度、距离算法和 chunk schema 写入 `index-state.json`；不兼容时重建索引。
6. 语义索引完成后启用 lexical + vector hybrid retrieval，并返回文件、标题、段落和行号引用。
7. 默认只写 `Vault/CoworkAny/`；修改既有笔记必须使用目标路径、base hash、diff 和冲突提示。
8. 默认 local embedding；只有用户显式启用远程 embedding 才发送 chunk。
9. 只有用户在对话/工作流显式启用知识库时，才把 top-k 内容交给远程文本模型。
10. Commit intent: `Use Obsidian files directly with an app-owned recoverable RAG index`。

注意：上述写入保护约束的是应用内置的 Obsidian/RAG 写入端口。由于产品已确认 OpenCode Full Access，用户明确要求 Agent 直接操作某个 Vault 绝对路径时，OpenCode 文件工具理论上可以绕过该端口；UI 和文档必须如实说明，不能把 diff/hash 宣称为系统级沙箱。

### Task 15: 抽取并接通媒体 Provider adapters

**Files:**
- Move implementation from: `lib/ai-runtime/adapters/*`
- Move implementation from: `lib/image-generation/provider-orchestration.ts`
- Create: `packages/media-runtime/src/providers/*.ts`
- Create: `packages/media-runtime/src/jobs.ts`
- Create: `apps/workflow-host/src/adapters/media-capability-port.ts`
- Test: `packages/media-runtime/src/providers/*.contract.test.ts`

**Steps:**

1. 将现有成功、429、无效响应、轮询和超时 fixtures 移入共享 package tests。
2. 定义统一 async media job contract：submit、poll、cancel-if-supported、download、usage。
3. 抽取 OpenAI-compatible/Bailian image、MiniMax/Bailian/RunningHub video、RunningHub digital human、MiniMax music/TTS/clone/audio。
4. 删除 desktop 路径上的 R2、presigned URL 和云 artifact 假设；reference 与结果直接读写项目文件。
5. Provider 未配置时返回 `provider_configuration_required`，UI 节点显示“需要配置”，不隐藏节点。
6. workflow-host 只向 Rust 请求一个 canonical 临时输出路径并流式写入；完成后由 Rust 校验 MIME、大小、哈希和路径归属，再原子移动并登记产物。
7. SaaS adapter 继续复用相同 request/response normalization，但保留其云存储逻辑。
8. Commit intent: `Share provider behavior while keeping storage host-specific`。

### Task 16: 接通桌面工作流

**Files:**
- Create: `apps/workflow-host/src/workflow-service.ts`
- Create: `apps/workflow-host/src/adapters/desktop-workflow-repository.ts`
- Create: `apps/workflow-host/src/adapters/desktop-capability-port.ts`
- Create: `apps/desktop/src/workflows/*.tsx`
- Modify shared: `packages/workbench-ui/src/workflows/*`
- Test: `apps/workflow-host/src/workflow-service.integration.test.ts`

**Steps:**

1. 用 fake ports 写完整 DAG、并行、foreach/collect、失败、取消、重试和恢复 tests。
2. 注册 v1 节点：上传、文本输入、文件创建、writer、LLM、agent、image、video、digital human、music、TTS、audio、PPT、knowledge retrieve/write、本地 product store、foreach、collect、output。
3. 明确不注册 Lead Hunter、publish-as-agent、marketplace 和 enterprise preset 节点。
4. 复用共享 workflow builder，通过 desktop client 保存 `definition_json`。
5. 对外部异步媒体请求持久化 provider job ID；重启后允许继续 poll，不重复 submit。
6. submit 前先持久化 idempotency key，submit 成功后立即写入 provider task ID；临时 URL 到期前优先下载本地。
7. 对 OpenCode/本地工具运行持久化 checkpoint；崩溃后标记 interrupted，由用户选择重试。
8. 运行 workflow integration tests 和桌面 UI smoke test。
9. Commit intent: `Execute the shared workflow graph with local desktop adapters`。

### Task 17: 用量统计、恢复与诊断

**Files:**
- Create: `apps/workflow-host/src/usage-service.ts`
- Create: `apps/desktop/src-tauri/src/recovery.rs`
- Create: `apps/desktop/src/usage/*.tsx`
- Create: `apps/desktop/src/diagnostics/*.tsx`
- Test: `apps/workflow-host/src/usage-service.test.ts`
- Test: `apps/desktop/src-tauri/tests/recovery.rs`

**Steps:**

1. 写 OpenCode、OpenAI-compatible 和媒体 Provider usage normalization tests。
2. 按模型记录 token、请求次数、媒体任务和预估成本；不扣费、不设余额、不阻止使用。
3. 价格未知时保留 token/请求量并显示“成本未知”，不得伪造价格。
4. 启动恢复 queued/running runs：可安全 poll 的媒体任务继续；其余标 interrupted。
5. 诊断页展示 runtime probe、进程、DB integrity、索引状态、日志大小和下载源，不展示密钥。
6. 导出诊断 ZIP 前运行 redaction tests。
7. Commit intent: `Make local usage and failures observable without billing semantics`。

### Task 18: 首次引导与 v1 导航收口

**Files:**
- Create: `apps/desktop/src/onboarding/*.tsx`
- Create: `apps/desktop/src/navigation.ts`
- Create: `apps/desktop/src/settings/*.tsx`
- Modify shared: `packages/workbench-ui/src/shell/*`
- Test: `apps/desktop/src/onboarding/onboarding.test.tsx`

**Steps:**

1. 写首次启动状态机 tests：runtime → 工作目录 → Vault → Provider → 完成。
2. runtime bootstrap 必须完成；工作目录必须可写；Vault 可跳过；至少一个文本 Provider 配置后才完成 AI onboarding。
3. 模型设置支持 Provider/Model/Base URL/API Key、默认模型和推理强度。
4. 首次启动直接 Full Access，只展示明确风险说明，不展示权限选项。
5. 导航只保留对话、写作、工作流、媒体、知识库、项目/产物、用量、设置和诊断。
6. 用静态测试确保排除菜单和 route 不进入桌面 bundle。
7. Commit intent: `Expose only the approved local-first desktop product`。

### Task 19: Windows 打包、便携版和离线包

**Files:**
- Create: `packaging/windows/build-green.ps1`
- Create: `packaging/windows/build-portable.ps1`
- Create: `packaging/windows/verify-package.ps1`
- Create: `.github/workflows/windows-desktop.yml`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

**Steps:**

1. 生成普通 ZIP；数据默认落在 LocalAppData。
2. 生成仅多一个 `portable.flag` 的便携 ZIP；运行后数据和 runtime 落在 `data/`。
3. 生成完整离线 runtime ZIP 和签名 manifest。
4. 在干净 Windows 10 22H2 与 Windows 11 x64 VM 验证在线安装、镜像回退、官方回退和离线导入。
5. 验证升级时普通模式数据不被覆盖；便携模式升级前提示备份。
6. 验证 ZIP、解压和首次补齐后的 size budget；超预算时输出组件明细并使 CI 失败。
7. 验证 Authenticode 签名、manifest 签名和 SHA-256。
8. Commit intent: `Ship repairable green and portable Windows distributions`。

### Task 20: 全量验收与 SaaS 回归

**Files:**
- Create: `tests/desktop/first-run.spec.ts`
- Create: `tests/desktop/chat-opencode.spec.ts`
- Create: `tests/desktop/writer-ppt.spec.ts`
- Create: `tests/desktop/obsidian-rag.spec.ts`
- Create: `tests/desktop/workflow-media.spec.ts`
- Create: `tests/desktop/portable-upgrade.spec.ts`
- Create: `docs/desktop/windows-v1-release-checklist.zh-CN.md`

**Steps:**

1. 在 fake Provider 下跑 deterministic E2E，覆盖全部关键 UI 和错误恢复。
2. 对至少一个真实文本 Provider 跑普通对话、写作和 PPT smoke。
3. 对每类媒体 Provider 至少跑一个真实最小任务；不在 CI 保存真实 Key。
4. 用包含中文、空格、长路径、OneDrive、损坏 Markdown 和 10k+ 笔记的 Vault 跑 RAG 回归。
5. 强制杀死 OpenCode、workflow-host 和应用，验证 Job Object、interrupted 状态和恢复。
6. 运行共享包 tests、Rust tests、desktop typecheck/build、Next lint/build 和现有 SaaS 回归。
7. 检查桌面 bundle 不含 Lead Hunter、auth、enterprise、billing、R2、Railway、Cloudflare 和 Dify/RAGFlow 客户端。
8. 记录未测 Provider/硬件组合，不以“功能存在”代替实际验收。
9. Commit intent: `Prove desktop completeness without regressing the SaaS host`。

## 7. 验收门禁

### 7.1 功能门禁

- 普通对话抓包/日志证明经过本地 OpenCode，不存在桌面直调文本模型旁路。
- `ppt-master` 由 OpenCode Skill 调用本地 Python，项目目录出现可打开 PPTX。
- 工作流所有 v1 节点可保存、运行、取消、重试和恢复。
- 媒体输出下载为本地文件，关闭应用后仍可在 Explorer 打开。
- Obsidian 不运行时仍可检索；索引删除后可自动重建；既有笔记冲突不会被静默覆盖。
- API Key 只出现在 `config.json` 和必要进程内存，不出现在日志、SQLite、诊断包或命令行参数。

### 7.2 质量门禁

```powershell
pnpm install --frozen-lockfile
pnpm test:desktop:boundaries
pnpm --filter @coworkany/runtime-contracts test
pnpm --filter @coworkany/workflow-core test
pnpm --filter @coworkany/media-runtime test
pnpm --filter @coworkany/workflow-host test
pnpm --filter @coworkany/desktop test
pnpm --filter @coworkany/desktop typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm lint
pnpm build
pnpm --filter @coworkany/desktop build
```

所有命令必须通过；新增核心代码覆盖率目标 80% 以上。真实 Provider、Windows VM、长路径和离线安装结果记录在 release checklist。

## 8. 建议排期与人员

扩展后的 v1 比最初 MVP 多出完整工作流、图片/视频、数字人、音乐/语音/音频、强制 Runtime Bootstrap、国内多源、离线环境包和双模式打包。原“10–14 人周”不再可信。

建议投入 3 条并行实施线：

| 周 | Runtime/Data | Shared Core/UI | Capabilities/QA |
| --- | --- | --- | --- |
| 1–2 | Tauri、路径、config、SQLite | contracts、workflow-core | contract fixtures、CI 基线 |
| 3–4 | bootstrap、workflow-host、OpenCode | client seam、chat/writer UI | chat/writer/PPT integration |
| 5–6 | Vault、LanceDB、embedding | workflow UI | RAG、image/video/audio adapters |
| 7–8 | recovery、logs、portable | desktop shell/settings | 全节点 workflow E2E |
| 9–10 | mirrors、offline bundle、signing | SaaS regression fixes | Windows VM、性能、发布回归 |

合理预算为 **18–24 人周，3 人并行约 8–10 个日历周**；若只有 1–2 人，按 **12–16 周** 规划更稳妥。不得用跳过 SaaS 回归、离线安装、真实媒体测试或恢复测试来压缩时间。

## 9. 关键风险与止损点

1. **共享 UI 抽取失控：** 三个主页面均超过 2,000 行。先注入 client/router，再按功能块移动；禁止整文件复制。
2. **工作流“共享”名存实亡：** 若 desktop adapter 导入 Next route，立即停止并修正端口边界。
3. **Node/SQLite ABI：** SQLite 由 Rust 所有，workflow-host 不使用 `better-sqlite3`，避免系统 Node 兼容范围被原生 addon 锁死。
4. **OpenCode 兼容漂移：** 不严格锁版本，但必须通过协议 capability probe；失败则使用 last-known-good 私有版本。
5. **外部媒体重复扣费：** submit 后立即持久化 provider job ID；恢复只 poll，不自动重新 submit。
6. **Vault watcher 漏事件：** watcher 只做增量提示，启动/唤醒 hash reconciliation 才是最终一致性机制。
7. **明文密钥泄露：** 这是已确认产品选择；通过最小文件权限、日志脱敏、诊断测试和持续警告降低风险，不能宣称加密。
8. **镜像供应链：** 同桶 hash 不构成信任；manifest 必须离线签名，客户端内置公钥。
9. **范围继续膨胀：** 发布 Agent、市场、企业预设、团队同步和 SaaS 数据迁移一律进入 v2 候选，不得插入 v1。

## 10. 完成定义

只有同时满足以下条件才可称为 Windows v1 完成：

- 已确认范围全部通过自动化或记录明确的真实 smoke test。
- 干净 Windows 10/11 能从主 ZIP 自动补齐环境并进入应用。
- 所有源不可用时可以导入离线 runtime 包完成安装。
- 普通版升级不覆盖 LocalAppData；便携目录复制后无需重新下载环境。
- SQLite、LanceDB、日志和媒体文件职责分离，日志滚动策略生效。
- SaaS `pnpm build` 和相关回归仍通过，共享核心不存在桌面 fork。
- 发布清单列出签名、哈希、体积、已测 Provider、未测硬件和已知限制。

## 11. OpenSpec 执行分解

本文继续作为 Windows v1 的总架构与范围基线；实际实施按以下 OpenSpec changes 严格串行 apply/archive，后续 change 不得复制上游实现：

| 顺序 | Change ID | 主要覆盖 |
| --- | --- | --- |
| 1 | `validate-windows-desktop-feasibility` | Task 0 架构决定、非阻断诊断与风险转交 |
| 2 | `extract-shared-application-core` | Shared contracts、workflow/media/writer core、UI client seam、SaaS parity |
| 3 | `establish-desktop-foundation` | Tauri、config、路径、bootstrap、SQLite、文件、workflow-host RPC |
| 4 | `add-local-opencode-workbench` | 普通对话、Agent 工作台、会话、产物、用量、Full Access |
| 5 | `add-writing-ppt-and-obsidian-rag` | 内容写作、`ppt-master`、Vault 与本地 RAG |
| 6 | `add-desktop-media-and-workflows` | 图片/视频/数字人/音乐/语音/音频与完整工作流 |
| 7 | `harden-windows-desktop-release` | 国内多源、离线包、普通/便携 ZIP、签名和发布回归 |

每个 change 必须满足自己的 delta specs 和 tasks quality gates 后才能 archive；只有已声明依赖全部完成，才允许 apply 下一个 change。
