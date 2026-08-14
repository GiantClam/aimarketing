## 1. Verify foundation and runtime contracts

- [x] 1.2a Desktop package boundary check covers the local workbench runtime and rejects SaaS/Next imports.
- [x] 1.3a Local chat service contract exposes only host-mediated OpenCode execution; no direct text-model fallback is registered.

- [x] 1.1 验证三个上游 change 的完成状态和接口版本
  - [x] 2026-08-14 upstream status is rechecked: `extract-shared-application-core` 66/66, `establish-desktop-foundation` 86/87 (archive marker only), and `add-writing-ppt-and-obsidian-rag` 79/80 (archive marker only). Shared interfaces are runtime contract v1, workflow schema v2 (legacy v1 migration retained), and package version 0.1.0; current Desktop 126/126 and build gates pass.
- [x] 1.2 添加 architecture tests，禁止 workbench 导入 Next API、SaaS auth/billing、R2、Railway、Cloudflare、Dify 或 RAGFlow
  - [x] 2026-08-13 `apps/desktop/test/architecture-boundaries.test.ts` scans desktop source/runtime for Next, SaaS infrastructure, `ai-sdk-native`, and direct chat-completions imports.
- [x] 1.3 添加失败测试，证明普通桌面对话不能选择 `ai-sdk-native` 或直接文本 Provider runtime
  - [x] 2026-08-13 the same architecture guard rejects both forbidden text runtime markers and direct chat endpoint usage; the route test requires `session.create`/`session.prompt` through the host.
- [x] 1.4 用 fake OpenCode 固定 health/session/stream/tool/usage/abort/error fixtures。✓ 2026-08-13 — `fake-opencode-serve.mjs` 在随机 loopback port 验证 Basic Auth、retained/lost session、text/tool/usage SSE、abort、terminal session error 和服务端 crash；桌面集成测试对每种状态断言归一化 runtime event。

**Blocking Quality Gate:**
- [x] 上游 ports 稳定，无需本 change 定义第二套 contracts
  - [x] 2026-08-13 desktop WorkbenchClient and runtime-contracts remain the only compatibility surfaces used by the local route.
- [x] OpenCode-only 路由测试先红后绿
  - [x] 2026-08-13 architecture and host-session tests pass with ordinary chat routed through the OpenCode session API.

## 2. Implement the supervised local OpenCode runtime

- [x] 2.1 在 loopback 随机端口启动 `opencode serve` 并生成随机 Basic Auth
  - [x] 2026-08-13 `OpenCodeServeClient` allocates a free `127.0.0.1` port and per-runtime random Basic Auth; fake serve regression covers health, auth and retained/lost session paths.
- [x] 2.2 禁用外部 CORS/mDNS，使用 AIMarketing 私有 config/Skill/cache/session 目录
  - [x] 2026-08-13 production spawn explicitly passes `--pure --hostname 127.0.0.1`; source regression rejects `--mdns`/`--cors`; host sets isolated `OPENCODE_CONFIG_DIR` and runtime workspace directories.
- [x] 2.3 一个 conversation 映射一个稳定 session，并验证跨 conversation/data root 隔离
  - [x] 2026-08-13 session IDs are persisted per conversation, recovery creates a replacement only for a lost session, and host-session/workbench tests cover workspace-scoped mapping.
- [x] 2.4 归一化 text、reasoning、tool、usage、warning、error、artifact 和 completion events
  - [x] 2026-08-13 shared `runtime-contracts/opencode` normalization plus fake serve fixtures cover streamed text/tool/usage, terminal errors, service exit and completion evidence; malformed event handling is covered by host-session tests.
- [x] 2.5 实现 abort、紧急停止、crash detection、supervised restart 和 interrupted status。✓ 2026-08-13 — `run.cancel` 通过 serve abort；服务端 close 使 active turn 统一产生 retryable `opencode_serve_exited`，避免 HTTP socket 竞态误报为 prompt failure；下一次 session 创建自动重启 serve，workflow-host 崩溃仍由 Tauri supervisor/UI 标记 interrupted 并支持显式 retry。
- [x] 2.6 验证进程树随 Tauri 退出且不自动请求管理员权限
  - [x] 2026-08-13 supervised OpenCode shutdown uses a Windows `taskkill /T /F` tree fallback with hidden, non-elevated process creation; host SIGTERM/SIGINT handlers stop the server before exit.

**Quality Gate:**
- [x] Fake OpenCode 全协议 tests 通过
  - [x] 2026-08-13 fake serve covers retained/lost sessions, text/tool/usage, abort, terminal error and crash recovery.
- [x] Loopback/auth/进程生命周期 tests 通过
  - [x] 2026-08-13 loopback Basic Auth, supervised restart and process-tree shutdown tests pass.
- [x] OpenCode/用户全局配置未被修改
  - [x] 2026-08-13 host writes only workspace-private `.opencode` config and sets `OPENCODE_CONFIG_DIR`; no global OpenCode config path or auto-update mutation is used.

## 3. Route ordinary chat and Agent turns through OpenCode

- [x] 3.1a Implement `LocalChatService` with framed host RPC, request/run correlation, abort signal and streamed OpenCode event collection.
- [x] 3.2a Desktop chat service has no `ai-sdk-native` or direct provider execution path.
- [x] 3.1b Workflow-host now supports `session.create`/`session.prompt`, stable in-process session mapping and workspace-scoped OpenCode cwd.
- [x] 3.3a UI Provider/model/base URL/API key is passed request-scoped to Host, which writes an isolated OpenCode config and env reference (key is not a CLI argument).
- [x] 3.4a User messages/runs/events/usage are persisted through typed Tauri commands; terminal status is idempotent.

- [x] 3.1 实现本地 chat service，使用共享 context/session/message/event contracts。✓ 2026-08-13 — `LocalChatService`、framed workflow-host RPC 与 `session.create`/`session.prompt` 复用共享 runtime contracts，并以 stable conversation session 运行。
- [x] 3.2 移除或拒绝 desktop 对 `ai-sdk-native`、Railway、Cloudflare 的文本路由。✓ 2026-08-13 — desktop chat 只经 host-mediated OpenCode；边界与路由 tests 不存在 direct text-provider fallback。
- [x] 3.3 将选定 OpenAI-compatible Provider/model/base URL/key 和 reasoning effort 传入 request-scoped runtime config。✓ 2026-08-13 — UI 选中的 configured model、endpoint、key 与 reasoning effort 写入 isolated OpenCode config/env reference，key 不作为 CLI 参数。
- [x] 3.4 执行前持久化用户消息，终止时原子保存 assistant 结果、状态、关键事件和用量。✓ 2026-08-13 — typed Tauri commands 写入 conversations/messages/runs/events/usage，terminal state 与 usage idempotency 由桌面回归覆盖。
- [x] 3.5 实现 session loss recovery snapshot，失败不覆盖已持久化历史。✓ 2026-08-13 — host 明确返回 `recovered`；仅在已持久化 session ID 失效并更换时，桌面将最近 12 个 user/assistant 文本 turn 作为有界只读上下文附加到当前请求，明确禁止重放旧工具动作；SQLite 回归断言新 session ID 不改写已保存消息。
- [x] 3.6 添加多轮、取消、session loss、crash、坏事件和缺 Provider tests
  - [x] 2026-08-13 host-session, OpenCode Serve and RPC tests cover multi-turn session recovery, abort/cancel, lost sessions, crash, malformed/oversized frames and unavailable runtime paths.

**Quality Gate:**
- [x] 每个普通聊天 run 有 OpenCode runtime evidence
  - [x] 2026-08-13 route, host-session and architecture tests require `session.create`/`session.prompt`, framed runtime events and persisted run evidence.
- [x] 不存在 desktop 直连文本模型 SDK fallback
  - [x] 2026-08-13 architecture boundary scan rejects `ai-sdk-native`, direct chat-completions and SaaS/Next runtime markers.
- [x] 恢复不会重复已完成工具副作用
  - [x] 2026-08-13 recovery snapshot is bounded to prior text turns and explicitly excludes replaying old tool actions; session-loss regression verifies persisted history remains unchanged.

## 4. Build the desktop Agent workbench

- [x] 4.1 组合共享 message parts、prompt input、conversation sidebar 和 stream UI — 2026-08-14 `DesktopConversationWorkspace`/shared Workbench UI composition and route regressions are covered by the existing desktop suite.
- [x] 4.2 添加模型/Skill selector、artifact view、usage、settings 和 diagnostics routes — 2026-08-14 configured model/Skill controls, artifact/task/usage surfaces, settings warnings, and diagnostics actions are covered by WorkbenchClient and route tests.
- [x] 4.3 删除 desktop bundle 中 login、registration、tenant、role、balance、subscription、Agent publishing、market 和 enterprise preset affordances
  - Evidence (2026-08-14): `apps/desktop/test/routes.test.ts` scans the desktop source and shared route manifest for account/billing/publishing/enterprise-preset markers; the 114-test Desktop suite passes and `pnpm desktop:verify-bundle` reports zero violations across the built UI/host/knowledge bundles.
- [x] 4.4 展示 Full Access 风险，但不展示权限模式选择或逐命令确认
- [x] 4.4a UI displays Full Access and plaintext config risk without exposing a permission-mode selector.
- [x] 4.2a Desktop home/chat inputs expose model, reasoning and local Skill selectors; task center exposes persisted usage/run state.
- [x] 4.2b Desktop chat uses the shared cloud-compatible AI/user message cards, timestamps, live event panel, active route highlighting and quick prompt chips.
- [x] 4.1a 2026-08-13 `DesktopConversationWorkspace` composes shared `WorkbenchChatMessage`/`WorkbenchWriterMessage`, prompt composer, route conversation history and artifact/event surfaces; route regressions verify the cloud-compatible composition.
- [x] 4.2c 2026-08-13 `Desktop WorkbenchClient` now owns artifact listing/removal, run listing/inspection, usage summary reads, and Vault citation opening; the resource-library and task-center UI consume those typed adapters.
  - [x] 4.2d 2026-08-14 all desktop workspaces consume the active capability Provider profile's configured model list; model/reasoning changes immediately write the selected profile back to `config.json` while legacy single-provider configs remain compatible.
  - [x] 2026-08-13 Obsidian index/rebuild and search now also use typed `WorkbenchClient.knowledge.index/search` adapters, including host-start, response correlation, timeout and normalized citation mapping.
- [x] 4.5 实时展示文本/工具步骤和 emergency stop — 2026-08-14 WorkbenchClient event tests and the live desktop run path cover streamed text/tool events, cancellation, and terminal state rendering.
- [x] 4.5a 2026-08-13 `workbench-client.test.ts` drives the real Desktop WorkbenchClient adapter with malformed frames, text deltas, tool events, usage, workflow/media cancellation and terminal completion; the adapter emits normalized events and ignores malformed payloads.
- [x] 4.6 添加 streaming、长工具输出、取消、重启、artifact 和缺配置 UI tests — 2026-08-14 `apps/desktop/test/workbench-client.test.ts`, `opencode-serve.test.ts`, `routes.test.ts`, `rpc.test.ts`, and `media-runtime.test.ts` cover streamed text/tool output, oversized frames, cancellation, crash/restart recovery, artifact routing, and configuration-required UI states; the current Desktop suite passes 126/126.
- [x] 4.6a 2026-08-13 WorkbenchClient event tests cover streaming/cancel/error boundaries; existing RPC 8 MiB frame tests, fake OpenCode crash/restart E2E, artifact routing and missing-Provider UI regressions cover the remaining adapter contracts without video real-provider calls.

**Quality Gate:**
- [x] Workbench UI 只使用 Desktop WorkbenchClient — 2026-08-14 desktop architecture and route tests keep library/task/knowledge actions on the typed WorkbenchClient; native bootstrap and supervision remain explicit runtime seams.
  - [x] 2026-08-13 library/task/knowledge read, index and action surfaces use `Desktop WorkbenchClient`; low-level bootstrap, host supervision, session/workflow execution and persistence writes remain native runtime seams.
- [x] 桌面导航与确认范围一致
  - Evidence (2026-08-14): Desktop passes route-placement and exact query-string Agent highlighting regressions; hidden settings and footer video placement are preserved by the shared `WorkbenchShell` filter.
- [x] Full Access 和明文 API Key 风险文案可见
  - [x] 2026-08-13 `apps/desktop/test/routes.test.ts` asserts bilingual settings warnings, workflow Full Access copy, persistence boundaries, and the absence of permission-mode/command-confirmation selectors.

## 5. Persist conversations, artifacts, usage and logs

- [x] 5.1 使用 foundation repositories 保存 conversations/messages/runs/key events/artifacts/usage。✓ 2026-08-13 — local SQLite repository commands 是唯一持久化入口，Task Center、history、artifact 与 usage summary 均通过它读取。
- [x] 5.1a Tauri commands persist conversations, messages, runs and key run events; UI run action writes user message and event/terminal status.
- [x] 5.1c Task Center lists persisted SQLite runs, exposes terminal status and lets users load the original prompt for an explicit retry.
- [x] 5.1b Usage events are recorded as Provider/model/token metadata with separate Provider-reported and local-estimated cost fields, without billing or balance enforcement. ✓ 2026-08-13 — SQLite migration v3 adds `provider` and `provider_cost`; OpenCode cost events are stored as Provider cost while unknown local estimates remain NULL, and the desktop stats surface keeps both values separate.
  - [x] 2026-08-13 Desktop usage persistence now prefers the model reported by the terminal usage event, falling back to the selected configured model only when the Provider omits it; the route regression protects this model-switching invariant.
- [x] 5.2a Tauri host writes redacted per-run JSONL from framed stdout and stderr with bounded rolling cleanup.
- [x] 5.2 完整 OpenCode NDJSON 和工具 stdio 写 `logs/runs/<run-id>.jsonl` 并脱敏。✓ 2026-08-13 — Rust host 将验证后的 framed stdout 与 stderr 分开写入 redacted per-run JSONL，并采用 30 天/1GB 保留策略。
- [x] 5.3 运行日志执行 30 天或 1GB 保留策略，只清理最早的 `logs/runs/*.jsonl`，不删除用户会话/产物/项目/usage；Rust 回归测试覆盖过期与超容量清理。 ✓ 2026-08-13
- [x] 5.4 价格可得时估算成本，不可得时显示“成本未知”。✓ 2026-08-13 — SQLite `usage_summary` 保留 `SUM(estimated_cost)` 的 null 语义，不再以 `COALESCE(..., 0)` 把未知成本伪装为零；桌面用量栏对未知值呈现 Unknown/未知，对可得的零成本仍格式化为 `$0.0000`。
- [x] 5.5 支持应用内、Explorer 和默认本地程序打开 artifact。✓ 2026-08-13 — Workbench 产物卡片作为应用内入口；`files.reveal` 调用已校验路径的 `explorer.exe /select,`，`files.open` 使用默认本地程序；两条路径均先执行 MIME、hash 与项目根目录归属检查。

**Quality Gate:**
- [x] 重启后历史、产物、usage 和 interrupted runs 可恢复
  - [x] 2026-08-13 SQLite startup recovery, session recovery snapshots, artifact revalidation and usage idempotency tests cover restart-visible state.
- [x] API Key 不在 SQLite、日志、诊断或命令行参数中
  - [x] 2026-08-13 workflow sanitization, host env-only Provider transport, Rust log redaction and diagnostics export tests cover all four persistence/transport surfaces.

## 6. End-to-end verification

- [x] 6.1 运行 fake OpenCode E2E：首聊、多轮、tool、cancel、crash、artifact、usage
  - [x] 2026-08-13 `apps/desktop/test/opencode-serve.test.ts` runs one supervised fake-serve process through first and second prompts, asserts streamed text/tool-artifact/usage evidence, aborts a long turn through the cancel endpoint, observes serve crash as retryable, and recreates the session without replaying the prior turn.
- [x] 6.2 用一个真实配置 Provider 运行普通对话 smoke。✓ 2026-08-13 — `apps/desktop/real-providers.test.local.json` 驱动的 `test:real-providers` 已确认 LLM `/chat/completions` HTTP 200（choices/usage）；同次图片请求连续 3 次 HTTP 502（上游 `upstream_error`，已记录为外部阻塞）；视频/seedance 按验证范围明确未执行。
  - [x] 2026-08-13 rerun: LLM remains HTTP 200 with the expected schema; the configured image endpoint returned upstream HTTP 502 after bounded retries, so this is recorded as an external Provider blocker rather than a local pass. Video remains excluded.
  - [x] 2026-08-14 current rerun: using `apps/desktop/real-providers.test.local.json`, LLM HTTP 200/schema, OpenAI-compatible image HTTP 200/schema, and MiniMax audio HTTP 200/schema passed; video and Seedance remained explicitly excluded.
  - [x] 2026-08-14 latest default smoke repeated the same scope with LLM/image `attempts=1` and MiniMax audio `providerStatus=Success` on poll 11; credentials were not present in the sanitized output.
  - [x] 2026-08-14 latest verification on the current host: LLM HTTP 200/schema and MiniMax audio HTTP 200/schema passed, while the configured PPTOKEN image endpoint returned HTTP 502 `upstream_error` after 3 bounded attempts. This remains an upstream availability blocker, not a local chat/OpenCode failure; video and Seedance stayed excluded.
  - [x] 2026-08-14 targeted rerun now confirms the configured `gpt-image-2` image provider is available: the image-only smoke returned HTTP 200/schema on the first attempt with a 60-second request bound, and low-resolution-first direct probes (`256x256`, `512x512`, `1024x1024`) all returned HTTP 200/schema. Video and Seedance remained excluded; the user-local config was unchanged.
  - [x] 2026-08-14 latest bounded default smoke passed LLM, `gpt-image-2`, and MiniMax audio with HTTP 200/schema; the result scope explicitly executed only `llm,image,audio` and excluded `video,seedance`.
  - [x] 2026-08-14 PPTOKEN connectivity smoke was narrowed to the configured `gpt-image-2` only and defaulted to `256x256`; the direct image request returned HTTP 200 with one image result, while unsupported sizes fail before any request.
  - [x] 2026-08-14 latest current revalidation supersedes the transient success records above for the image boundary: `/v1/models` returned HTTP 200 with `gpt-image-2` present, but `gpt-image-2` generation at `256x256` returned proxy HTTP 401 `Invalid token` and direct timeout. The fail-closed verifier returned non-zero; video and Seedance remained excluded.
  - [x] 2026-08-14 latest full non-video rerun kept ordinary chat healthy (LLM HTTP 200/schema) while image generation timed out and MiniMax audio remained `Processing` after 24 bounded polls; the external media availability issue does not alter the local OpenCode chat pass.
  - [x] 2026-08-14 isolated configured MiniMax audio rerun reached HTTP 200/schema `Success` on poll 12 with a 60-poll bounded budget; ordinary chat remains independently verified and video/Seedance stayed excluded.
- [x] 6.3 捕获证据证明所有普通 desktop chat 选择 OpenCode
  - [x] 2026-08-13 architecture-boundary and route tests require `session.create`/`session.prompt` and reject direct chat-completions or `ai-sdk-native` paths.
- [x] 6.4 扫描 bundle 和网络日志，确认无排除的 SaaS 模块/端点
  - [x] 2026-08-13 `desktop:verify-bundle` scans Vite assets and the bundled workflow host for excluded SaaS routes/capability markers and cloud-only integrations; the scanner intentionally permits the approved Full Access warning copy.
- [x] 6.5 运行共享 tests、desktop TS/Rust tests/build、root lint、Next build 和 SaaS regressions
  - [x] 2026-08-14 current verification passed all 15 shared package test files, Desktop 126/126 tests, desktop typecheck/build, Rust `cargo check`, shared boundary/provenance scans, root lint, media Provider parity, and Next production build (425/425 routes). Clean VM, full browser E2E and current image Provider recovery remain release-hardening evidence rather than this local workbench gate.

**Completion Quality Gate:**
- [x] 三个 capability specs 全部满足 — local OpenCode-only routing, WorkbenchClient UI, session recovery, artifacts and usage persistence are covered by the Desktop contract suite and browser regression.
- [x] 测试和诊断证据完整 — Desktop 126/126, OpenCode serve/session/RPC, boundary/provenance, typecheck/build, and Writer browser fixture/provider-missing evidence are recorded; clean VM and production live-provider gates remain in hardening.
- [ ] Ready for `openspec-archive add-local-opencode-workbench`
