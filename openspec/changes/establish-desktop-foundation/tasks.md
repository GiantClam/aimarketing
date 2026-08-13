## 0. Verify upstream dependencies

- [x] 0.1 确认 `validate-windows-desktop-feasibility` 的 foundation decision 为 `approved`。✓ 2026-08-13 — `docs/desktop/windows-v1-feasibility-results.zh-CN.md` 明确记录 foundation 为 approved、release 为 pending。
- [x] 0.2 确认 `extract-shared-application-core` 已归档或全部质量门禁通过。✓ 2026-08-13 — 所有 extract tasks 已完成，shared boundary/provenance、SaaS adapter parity、desktop tests、root typecheck/lint/production build 均通过。
- [x] 0.3 链接 foundation architecture decision、runtime contracts 和 WorkbenchClient；runtime spike 仅作诊断参考。✓ 2026-08-13 — foundation 仅消费 `@aimarketing/runtime-contracts` 与 `@aimarketing/workbench-client` 的稳定导出；可行性文档将 spike 明确限定为诊断证据。
- [x] 0.4 任一依赖不满足时停止实施，不创建替代协议或复制核心。✓ 2026-08-13 — 前置 status 已重验；桌面 adapter 继续经 shared contracts/ports 工作，不引入替代协议或 legacy shared imports。

**Blocking Quality Gate:**
- [x] 依赖状态和接口版本均明确
- [x] Foundation decision 已批准，且所有未完成 runtime/release 验收均有明确下游 owner

## 1. Create the Tauri host shell

- [x] 1.1 创建 Vite React + Tauri 2 应用和 desktop composition root
- [x] 1.2 接入共享 runtime contracts 与 WorkbenchClient，不注册具体业务页面
- [x] 1.3 建立 typed Tauri invoke/listen 边界和结构化错误
- [x] 1.4 添加当前 Windows 开发/CI 环境的 shell build smoke，并产出可供 release matrix 复用的测试入口（Vite、Cargo、NSIS/MSI 已验证）

**Quality Gate:**
- [ ] Desktop shell test、typecheck、static build 和 Rust build 通过
- [ ] Desktop host 不导入 Next route、SaaS auth/billing 或云 clients

## 2. Implement paths, config and single-instance state

- [x] 2.1 实现普通 `%LOCALAPPDATA%` 与 `portable.flag`/`data` 路径
- [x] 2.2 覆盖中文、空格路径和非法配置恢复的基础 tests；长路径、只读路径由 Windows hardening 补齐
- [x] 2.3 实现 normal/portable 单实例写锁
- [x] 2.4 实现 UTF-8 `config.json` schema、tmp/flush/rename、备份和损坏恢复
- [x] 2.5 实现 API Key 明文风险提示和递归日志/诊断 redactor
  - [x] 2026-08-13 Rust storage now recursively redacts credential-shaped keys in persisted event, node, checkpoint, attempt, and workflow JSON; the regression proves nested API keys/tokens are replaced while input/output token counters remain intact.

**Quality Gate:**
- [ ] 两种模式路径和锁 tests 通过
- [ ] 部分配置写入可恢复
- [ ] 密钥不进入测试日志、错误、SQLite 或诊断 fixture

**Progress Evidence:** `apps/desktop/test/runtime.test.ts` 覆盖 normal/portable、原子配置恢复、单实例锁；`apps/desktop/runtime/config.ts` 提供递归 redactor；Rust `storage::tests::structured_json_storage_redacts_credentials_without_losing_usage_fields` 验证结构化持久化边界。长路径、只读路径和用户消息正文中的任意凭据文本仍由后续 hardening/host integration 验收。

## 3. Build the mandatory runtime bootstrap

- [ ] 3.1 实现 WebView2、Node/workflow-host、OpenCode、Python/PPT、字体、embedding、Skills 和 migrations probes
  - [x] 2026-08-14 TypeScript bootstrap now probes the concrete `host.mjs`, isolated `knowledge.mjs`, LanceDB `dist/index.js`, `msyh.ttc`, and `local-hash-384-v1.json` assets, honoring persisted private runtime paths; readiness requires all ten components.
- [ ] 3.2 在创建主 WebView 前运行原生 bootstrap 状态机
  - [x] 2026-08-13 Rust regression `startup_gates_run_before_tauri_builder` locks WebView2 and green-runtime gate ordering before `tauri::Builder`, including lock release on gate failure.
- [ ] 3.3 复用通过 probe 的系统组件并固定 canonical absolute path
  - [x] 2026-08-14 native Windows command discovery resolves `opencode`/`opencode.cmd` shims to the real dispatched executable before saving the canonical runtime path or starting workflow-host.
- [ ] 3.4 缺失/损坏时自动调用 UTF-8 安装脚本安装私有 runtime
- [ ] 3.5 实现签名 manifest、SHA-256、临时下载、原子激活和 last-known-good 基础
- [ ] 3.6 支持在线源链和离线 runtime ZIP 导入的 integration seam

**Quality Gate:**
- [ ] Runtime 未完整时不创建工作台
- [ ] 每个组件损坏 fixture 均触发修复并重复 probe
- [ ] 健康环境不主动升级

## 4. Implement local transactional state

- [x] 4.0a 创建独立 Rust SQLite schema（不导入线上 `lib/db/schema.ts`），并启用 WAL、外键和 busy timeout。
- [x] 4.0b 添加 identity/projects/conversations/messages/runs/run_events/artifacts/usage/workflows/revisions/vault_mappings 基础表及完整性检查命令。
- [x] 4.0c 添加 conversations/messages/runs/run_events 的 typed Tauri repository commands，并通过 Rust round-trip/idempotency test。
- [x] 5.2a 实现 canonical project artifact path 校验、文件大小/MIME/SHA-256 检查及幂等登记命令。
- [x] 5.4a OpenCode 关键事件和 usage 通过 Tauri commands 登记到 SQLite；完整 raw log rolling 仍待补齐。
- [x] 5.4b Runtime probe and supervisor now resolve system Node/OpenCode/Python candidates to absolute paths and expose selected paths in diagnostics.

- [x] 4.1 新建独立 SQLite migrations，不导入 `lib/db/schema.ts`。✓ 2026-08-13 — Rust `storage.rs` 维护 `schema_migrations`（当前 v2）及幂等 schema upgrades；桌面没有导入线上 schema。
- [x] 4.2 创建 identity、projects、conversations、messages、runs/events、artifacts、usage、workflows/revisions、run nodes/attempts 和 vault mappings。✓ 2026-08-13 — 本地 schema 与 storage round-trip tests 覆盖这些 transactional metadata 表，不保存 Vault 原文、向量或媒体内容。
- [x] 4.3 启用 WAL、foreign keys、busy timeout、幂等 migration、backup 和 integrity check。✓ 2026-08-13 — Rust SQLite connection 固定 WAL/foreign keys/5s busy timeout；每五分钟创建 SQLite-consistent backup，遇到损坏时保留隔离副本并恢复最新已验证备份；storage tests 通过。
- [x] 4.4 让 Rust 成为唯一 SQLite owner，并实现 typed repository commands。✓ 2026-08-13 — 仅 Tauri Rust storage commands 读写 app.db；conversation/message/run/event/artifact/usage/workflow/revision/vault repository commands 已作 idempotent round trip 覆盖。
- [ ] 4.5 添加并发读/单写、锁、升级和损坏恢复 tests

**Quality Gate:**
- [ ] SQLite 不含向量、Vault 原文、媒体二进制、完整 stdio 或 API Key
- [ ] 空库/重复升级/备份恢复 tests 通过

## 5. Implement projects, artifacts and bounded logs

- [ ] 5.1 实现项目目录和 canonical temp output 分配
- [ ] 5.2 实现路径归属、MIME、大小、hash 验证和原子 rename
- [ ] 5.3 实现 Explorer、应用内和默认程序打开动作
- [x] 5.4 关键事件写 SQLite，完整 NDJSON/stdout/stderr 写 per-run JSONL
- [x] 5.5 实现 30 天或 1GB 原始日志滚动，不删除用户工作

**Quality Gate:**
- [ ] 路径穿越、重复文件名、部分下载和 Windows 锁文件 tests 通过
- [ ] 大文件不通过 UI/IPC base64

## 6. Implement workflow-host RPC and process supervision

- [ ] 6.1 为 framing、correlation、反向请求、events、取消、最大消息和坏消息写 tests
  - [x] 6.1a Node workflow-host framing tests 覆盖 UTF-8 byte length、严格数字前缀、8 MiB 上限、坏 frame 后继续处理下一条合法请求；Rust host 额外覆盖 stdout 长度/UTF-8/JSON/v1 response schema 和超长行丢弃。
  - [x] 2026-08-14 reverse-RPC framing now has a separate `service_request`/`service_response` schema, Rust validation coverage, and a desktop source-level delegation regression.
  - [x] 2026-08-14 workflow repository create/status, ordered event append, and artifact registration now use typed reverse-service methods; direct Node-host workflow integration tests include a mock framed service responder.
- [x] 6.1a workflow-host bundle 通过 esbuild 固定为 Node ESM，并由 Tauri host_start/host_send/host_stop 命令管理 stdin/stdout/stderr。
- [x] 6.1b 事件通过 Tauri `desktop://runtime-response` / `desktop://runtime-log` 转发，发布资源清单包含 host bundle。
- [ ] 6.2 创建私有 Node workflow-host，装载共享 packages 和 desktop ports
- [ ] 6.3 workflow-host 通过双向 RPC 请求 repository、artifact、RAG 和 runtime services
  - [x] 2026-08-14 RAG/index/write operations run in a separate `knowledge.mjs` Node service and are reached from workflow-host through Tauri reverse RPC; workflow repository, artifact, and ordered event ports now use the same typed reverse-service seam. Remaining runtime/process controls are still open.
- [x] 6.4 Tauri 使用 Windows Job Object 监管 workflow-host 与 OpenCode process slots
- [x] 6.5 Host workflow invalid/cancel paths clean controller state and emit structured terminal errors.
- [ ] 6.5 实现 crash detection、supervised restart 和 interrupted 状态基础
- [x] 6.6 验证 stdout 仅承载 framed RPC，日志使用 stderr→JSONL。✓ 2026-08-13 — Rust host 只转发长度、UTF-8、JSON 均验证且不超过 8 MiB 的 stdout frame；无效或超长行被丢弃并以结构化 runtime log 记录，stderr 仍单独写入 redacted per-run JSONL。

**Quality Gate:**
- [x] 并发/反向 RPC 与取消 tests 通过 — 2026-08-14 desktop 96/96, Rust 30/30, and workflow/foreach host integration paths passed with framed service responses.
- [ ] 主进程强杀后无孤儿子进程
- [x] workflow-host 未打开 SQLite/LanceDB — 2026-08-14 `runtime/host.ts` no longer imports RAG/Obsidian/LanceDB; the isolated `knowledge.mjs` service owns those modules and is supervised by a dedicated Job Object.

## 7. Foundation integration handoff

- [x] 7.1a 当前 Windows 开发机已通过 desktop TypeScript tests/typecheck/build、Rust cargo check 和 Tauri NSIS/MSI bundle smoke。
- [x] 7.3a normal/portable 路径、配置恢复、单实例锁和已打包 EXE 启动 smoke 已在当前 Windows 环境验证。

- [ ] 7.1 运行 desktop unit/typecheck/build、Rust tests 和 bootstrap integration
  - [x] 2026-08-14 desktop typecheck, 94 desktop tests, and desktop build passed; Tauri cargo check and 28 Rust tests remain passing from the native startup-gate verification, while clean Windows bootstrap integration remains part of release hardening.
- [ ] 7.2 运行共享 contract tests、Next lint/build 和 SaaS parity regression
  - [x] 2026-08-13 shared boundary/provenance tests, workbench-client/SaaS adapter tests, media-runtime tests, root lint, root `tsc --noEmit` and Next production build passed; full SaaS parity and browser E2E remain open.
- [ ] 7.3 在当前 Windows 开发/CI 环境验证 normal/portable 空壳、修复、锁和进程生命周期；干净 Win10/Win11 全矩阵由 hardening 执行
- [ ] 7.4 为 `add-local-opencode-workbench` 记录稳定 ports、错误码和已知限制

**Completion Quality Gate:**
- [ ] 所有 foundation specs 满足
- [ ] 依赖和下游接口文档同步
- [ ] Ready for `openspec-archive establish-desktop-foundation`
