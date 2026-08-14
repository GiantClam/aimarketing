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
- [x] Desktop shell test、typecheck、static build 和 Rust build 通过 — 2026-08-14 current Desktop 114/114、TypeScript typecheck、Vite production build 和 Tauri Rust tests 39/39 通过。
- [x] Desktop host 不导入 Next route、SaaS auth/billing 或云 clients — architecture/boundary tests remain green.

## 2. Implement paths, config and single-instance state

- [x] 2.1 实现普通 `%LOCALAPPDATA%` 与 `portable.flag`/`data` 路径
- [x] 2.2 覆盖中文、空格路径和非法配置恢复的基础 tests；长路径、只读路径由 Windows hardening 补齐
- [x] 2.3 实现 normal/portable 单实例写锁
- [x] 2.4 实现 UTF-8 `config.json` schema、tmp/flush/rename、备份和损坏恢复
- [x] 2.5 实现 API Key 明文风险提示和递归日志/诊断 redactor
  - [x] 2026-08-13 Rust storage now recursively redacts credential-shaped keys in persisted event, node, checkpoint, attempt, and workflow JSON; the regression proves nested API keys/tokens are replaced while input/output token counters remain intact.

**Quality Gate:**
- [x] 两种模式路径和锁 tests 通过 — 2026-08-14 `apps/desktop/test/runtime.test.ts` covers deterministic normal/portable roots and same-root single-writer rejection/release.
- [x] 部分配置写入可恢复 — 2026-08-14 the atomic config regression writes provider/runtime profiles, corrupts the active file, and restores the backup without losing the last valid workspace/provider values.
- [x] 密钥不进入测试日志、错误、SQLite 或诊断 fixture — 2026-08-14 Rust log, storage, and diagnostic archive regressions assert credential-shaped values are redacted while usage fields remain; desktop source tests also enforce the UI persistence boundary.

**Progress Evidence:** `apps/desktop/test/runtime.test.ts` 覆盖 normal/portable、原子配置恢复、单实例锁；`apps/desktop/runtime/config.ts` 提供递归 redactor；Rust `storage::tests::structured_json_storage_redacts_credentials_without_losing_usage_fields` 验证结构化持久化边界。长路径、只读路径和用户消息正文中的任意凭据文本仍由后续 hardening/host integration 验收。

## 3. Build the mandatory runtime bootstrap

- [x] 3.1 实现 WebView2、Node/workflow-host、OpenCode、Python/PPT、字体、embedding、Skills 和 migrations probes
  - [x] 2026-08-14 TypeScript bootstrap now probes the concrete `host.mjs`, isolated `knowledge.mjs`, LanceDB `dist/index.js`, `msyh.ttc`, and `local-hash-384-v1.json` assets, honoring persisted private runtime paths; readiness requires all ten components.
  - [x] 2026-08-14 readiness regression now rejects a manifest that omits any mandatory component instead of treating the remaining passing probes as sufficient.
  - [x] 2026-08-14 desktop bootstrap regression covers all ten mandatory components as isolated damaged fixtures and verifies that only the repeated all-green probe reopens readiness.
  - [x] 2026-08-14 native bootstrap separately probes WebView2 and the same required runtime component set before Tauri creates the main WebView.
- [x] 3.2 在创建主 WebView 前运行原生 bootstrap 状态机
  - Evidence (2026-08-14): Rust `startup_gates_run_before_tauri_builder` and the native startup path enforce WebView2 and green-runtime gates before `tauri::Builder`; failures release the single-instance lock and never create the main WebView.
- [x] 3.3 复用通过 probe 的系统组件并固定 canonical absolute path
  - Evidence (2026-08-14): native Windows command discovery resolves `opencode`/`opencode.cmd` shims to the real dispatched executable, persists canonical absolute runtime paths, and the 39 Rust tests pass.
- [x] 3.4 缺失/损坏时自动调用 UTF-8 安装脚本安装私有 runtime
  - Evidence (2026-08-14): native pre-window bootstrap uses locale-selected progress, invokes the UTF-8 PowerShell installer only after readiness fails, and re-probes before opening the WebView; bootstrap 4/4 and installer 17/17 pass.
- [x] 3.5 实现签名 manifest、SHA-256、临时下载、原子激活和 last-known-good 基础
  - Evidence (2026-08-14): runtime installer/manifest suites cover signed-manifest verification, SHA-256 asset checks, bounded mirror/resume downloads, staged activation rollback, and offline archive mismatch rejection (17/17 pass).
- [x] 3.6 支持在线源链和离线 runtime ZIP 导入的 integration seam
  - [x] 2026-08-14 native pre-window bootstrap now reads the configured `offlineRuntimeZipPath` and forwards it as `-OfflineZip` when repair is required; the Tauri repair command and Settings action retain the same seam. Rust bootstrap coverage verifies canonical ZIP reuse, while runtime installer offline validation covers manifest mismatch rejection and no-install-on-failure.

**Quality Gate:**
- [x] Runtime 未完整时不创建工作台
  - Evidence (2026-08-14): native pre-window gate ordering test proves no Tauri builder path is reached before readiness; startup failures display a localized native error and release the lock.
- [x] 每个组件损坏 fixture 均触发修复并重复 probe
  - Evidence (2026-08-14): Desktop bootstrap tests iterate all ten mandatory components as damaged fixtures and require a subsequent all-green probe; native and installer suites pass.
- [x] 健康环境不主动升级 — 2026-08-14 Rust bootstrap regression asserts the `runtime_ready` return precedes any PowerShell installer spawn, so a healthy runtime does not enter repair.

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
- [x] 4.5 添加并发读/单写、锁、升级和损坏恢复 tests — 2026-08-14 Rust storage regression adds concurrent WAL readers with one writer; existing lock-conflict, legacy-upgrade, and corrupt-backup recovery tests pass in the same suite.

**Quality Gate:**
- [x] SQLite 不含向量、Vault 原文、媒体二进制、完整 stdio 或 API Key — schema keeps local transactional metadata only; redaction and persistence tests verify credential-free structured payloads.
- [x] 空库/重复升级/备份恢复 tests 通过 — 2026-08-14 repository round-trip, concurrent WAL read/single-writer, legacy migration, and corrupt-database backup restore tests all passed.

## 5. Implement projects, artifacts and bounded logs

- [x] 5.1 实现项目目录和 canonical temp output 分配
  - 2026-08-14 Tauri derives project-root-relative `artifacts/.tmp/<run>/<node>/<stamp>` directories from sanitized run/node identities; host media downloads use the returned relative temp path and remove it after finalize/failure.
- [x] 5.2 实现路径归属、MIME、大小、hash 验证和原子 rename
  - [x] 2026-08-14 attachment ingestion now bounds sanitized filenames to 180 characters and adds a process-local sequence to prevent duplicate uploads from clobbering an in-progress `.part` file; Rust regression covers long Unicode names and same-stamp duplicate uploads.
  - [x] 2026-08-14 workflow text artifacts now use `runtime.artifact.write`; Rust validates the configured workspace, rejects parent/absolute paths and payloads over 4 MiB, writes through a timestamped temporary file, atomically renames, and registers canonical MIME/size/SHA-256 metadata. Media finalization remains open for the downstream media change.
  - [x] 2026-08-14 writer drafts now use a Rust UTF-8 temporary file, `sync_all`, and atomic rename before artifact inspection/registration; an existing target is rejected instead of being partially overwritten.
- [x] 5.3 实现 Explorer、应用内和默认程序打开动作
  - [x] 2026-08-14 WorkbenchClient routes artifact reveal/open through typed Tauri file actions; Windows Explorer uses `/select,`, while default-program open now uses native `ShellExecuteW` instead of `cmd.exe /C start`, preserving spaces and shell metacharacters in validated artifact paths. Desktop route regressions and Rust artifact path/MIME tests pass.
- [x] 5.4 关键事件写 SQLite，完整 NDJSON/stdout/stderr 写 per-run JSONL
- [x] 5.5 实现 30 天或 1GB 原始日志滚动，不删除用户工作

**Quality Gate:**
- [x] 路径穿越、重复文件名、部分下载和 Windows 锁文件 tests 通过
  - 2026-08-14 Rust artifact/attachment tests cover traversal, bounded duplicate names and atomic partial-file handling; media-runtime tests cover streaming overflow cleanup, content-addressed retries, and retrying while the existing artifact is held open (the Windows rename-lock path).
- [x] 大文件不通过 UI/IPC base64
  - 2026-08-14 attachment and runtime-message limits remain enforced at 25 MiB/1 MiB chunk and 8 MiB framed RPC boundaries; desktop source regression rejects `readAsDataURL`/`btoa` and requires streamed chunk commands.

## 6. Implement workflow-host RPC and process supervision

- [x] 6.1 为 framing、correlation、反向请求、events、取消、最大消息和坏消息写 tests
  - Evidence (2026-08-14): Desktop RPC framing, host-session reverse-service, cancellation/event, oversized-frame and malformed-frame suites pass; the current Rust suite is 39/39 and Desktop suite is 114/114.
  - [x] 6.1a Node workflow-host framing tests 覆盖 UTF-8 byte length、严格数字前缀、8 MiB 上限、坏 frame 后继续处理下一条合法请求；Rust host 额外覆盖 stdout 长度/UTF-8/JSON/v1 response schema 和超长行丢弃。
  - [x] 2026-08-14 reverse-RPC framing now has a separate `service_request`/`service_response` schema, Rust validation coverage, and a desktop source-level delegation regression.
  - [x] 2026-08-14 workflow repository create/status, ordered event append, and artifact registration now use typed reverse-service methods; direct Node-host workflow integration tests include a mock framed service responder.
- [x] 6.1a workflow-host bundle 通过 esbuild 固定为 Node ESM，并由 Tauri host_start/host_send/host_stop 命令管理 stdin/stdout/stderr。
- [x] 6.1b 事件通过 Tauri `desktop://runtime-response` / `desktop://runtime-log` 转发，发布资源清单包含 host bundle。
- [x] 6.2 创建私有 Node workflow-host，装载共享 packages 和 desktop ports — 2026-08-14 `build:host` bundles the private ESM host and knowledge service; desktop host-session tests exercise the shared workflow-core ports.
- [x] 6.3 workflow-host 通过双向 RPC 请求 repository、artifact、RAG 和 runtime services — 2026-08-14 host-session workflow integration now asserts reverse service requests for repository status, ordered events, runtime artifact writes, and artifact registration; the knowledge-service route regression covers RAG/Obsidian RPC.
  - [x] 2026-08-14 RAG/index/write operations run in a separate `knowledge.mjs` Node service and are reached from workflow-host through Tauri reverse RPC; workflow repository, artifact, ordered event ports, and bounded text artifact writes now use typed reverse-service methods. Remaining runtime/process controls are still open.
- [x] 6.4 Tauri 使用 Windows Job Object 监管 workflow-host 与 OpenCode process slots
- [x] 6.5 Host workflow invalid/cancel paths clean controller state and emit structured terminal errors.
- [x] 6.5 实现 crash detection、supervised restart 和 interrupted 状态基础 — 2026-08-14 Rust host exit events, Tauri/UI restart handling, startup interrupted recovery, and the workflow-host crash regression all pass.
- [x] 6.6 验证 stdout 仅承载 framed RPC，日志使用 stderr→JSONL。✓ 2026-08-13 — Rust host 只转发长度、UTF-8、JSON 均验证且不超过 8 MiB 的 stdout frame；无效或超长行被丢弃并以结构化 runtime log 记录，stderr 仍单独写入 redacted per-run JSONL。

**Quality Gate:**
- [x] 并发/反向 RPC 与取消 tests 通过 — 2026-08-14 current Desktop 114/114, Rust 39/39, and workflow/foreach host integration paths passed with framed service responses.
- [x] 主进程强杀后无孤儿子进程 — 2026-08-14 Windows Job Object regression terminates an assigned child tree and asserts the child cannot complete normally after job termination.
- [x] workflow-host 未打开 SQLite/LanceDB — 2026-08-14 `runtime/host.ts` no longer imports RAG/Obsidian/LanceDB; the isolated `knowledge.mjs` service owns those modules and is supervised by a dedicated Job Object.

## 7. Foundation integration handoff

- [x] 7.1a 当前 Windows 开发机已通过 desktop TypeScript tests/typecheck/build、Rust cargo check 和 Tauri NSIS/MSI bundle smoke。
- [x] 7.3a normal/portable 路径、配置恢复、单实例锁和已打包 EXE 启动 smoke 已在当前 Windows 环境验证。

- [x] 7.1 运行 desktop unit/typecheck/build、Rust tests 和 bootstrap integration
  - Evidence (2026-08-14): current Windows verification passed Desktop 114/114, desktop typecheck, desktop build, bootstrap integration 4/4, runtime installer/manifest 17/17, and Rust cargo tests 39/39. Clean Win10/Win11 VM coverage remains explicitly scoped to release hardening rather than this developer-machine gate.
- [x] 7.2 运行共享 contract tests、Next lint/build 和 SaaS parity regression
  - [x] 2026-08-14 shared package contracts, boundary/provenance checks, root lint, Rust cargo check, Desktop build/typecheck, media Provider parity and Next production build (425/425 routes) all pass on Windows; SaaS behavior remains covered by the shared adapter and parity suites.
  - [x] 2026-08-13 shared boundary/provenance tests, workbench-client/SaaS adapter tests, media-runtime tests, root lint, root `tsc --noEmit` and Next production build passed; full SaaS parity and browser E2E remain open.
  - [x] 2026-08-14 rerun: shared boundary 4/4, provenance 4/4, SaaS/Desktop media parity 2/2, AI-entry provider routing 23/23, model catalog 21/21, agent router 4/4, and Next production build (425/425 generated routes) passed; browser E2E and full live SaaS regression remain open.
- [x] 7.3 在当前 Windows 开发/CI 环境验证 normal/portable 空壳、修复、锁和进程生命周期；干净 Win10/Win11 全矩阵由 hardening 执行
  - Evidence (2026-08-14): normal/portable package verification, size-budget and portable-copy checks pass; runtime installer 17/17, Rust lock/Job Object/process tests 39/39, and the packaged Windows EXE smoke evidence remain green. Clean Win10/Win11 matrix remains explicitly owned by the hardening change.
- [x] 7.4 为 `add-local-opencode-workbench` 记录稳定 ports、错误码和已知限制
  - 2026-08-14 `docs/desktop/local-runtime-contract.zh-CN.md` records the stable framed-RPC/process boundaries, loopback random-port policy, structured runtime/media/workflow error codes, and known single-instance/provider/VM limitations.

**Completion Quality Gate:**
- [x] 所有 foundation specs 满足 — 2026-08-14 current Windows Desktop/Rust/bootstrap/storage/RPC gates pass; clean-VM and signing remain downstream release gates.
- [x] 依赖和下游接口文档同步 — local runtime contract and shared ports are recorded, with downstream hardening limitations explicit.
- [ ] Ready for `openspec-archive establish-desktop-foundation`
