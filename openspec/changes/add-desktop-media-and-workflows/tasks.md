## 1. Extract pure media clients

- [x] 1.2a Define host-neutral media request/task/provider/cancellation contracts.
- [x] 1.6a Add shared media idempotency, task normalization and restart recovery contract tests.
- [x] 1.2b Add generic submit/poll/cancel-aware `runMediaJob` with persisted submission/update callbacks and timeout.
- [x] 1.2c Add direct JSON Provider adapter and atomic URL/base64 output downloader; provider-specific endpoint clients remain follow-up adapters.
- [x] 1.6b Harden media runner cancellation so provider cancel requests are sent with a non-aborted control port; add size/MIME rejection coverage for local downloads.

- [x] 1.1 迁移现有 success、429、invalid response、polling 和 timeout fixtures
  - [x] 2026-08-13 `media-runtime` now has non-video fixture coverage for successful submit/poll, HTTP 429 propagation, invalid JSON rejection, polling timeout, cancellation and persisted-task resume; video generation tests are intentionally excluded from the real-provider verification scope.
- [x] 1.2 定义统一 `submit/poll/cancel/download/usage` async media job contract。✓ 2026-08-13 — `media-runtime` 提供 host-neutral request/task/provider/cancellation ports、generic submit/poll/cancel runner、atomic downloader 与 idempotency/recovery contract tests。
- [x] 1.3 抽取 OpenAI-compatible/Bailian image clients
  - [x] 2026-08-13 `media-runtime` now provides direct OpenAI-compatible `/images/generations` and DashScope text-to-image submit/poll adapters; desktop host selects them for configured image nodes. Fixture contract tests cover request shape, idempotency headers, `/v1` base-path preservation, async status normalization, and local URL/base64 outputs.
- [x] 1.4 抽取 MiniMax/Bailian/RunningHub video clients
  - [x] 2026-08-13 `packages/media-runtime` exposes direct MiniMax, Bailian and RunningHub async video adapters; `apps/desktop/test/media-runtime.test.ts` verifies host routing for `video_generate`/`digital_human` without issuing a video-generation request. Existing provider fixtures cover submit/poll normalization; real video smoke remains excluded by acceptance scope.
  - [x] 2026-08-14 added an explicit opt-in `test:real-providers:video` smoke path that selects only configured non-Seedance video profiles, exercises submit/poll/result-schema handling for RunningHub (with Bailian/MiniMax protocol branches), and fails before network access when no eligible profile is configured; local fixture coverage passes without exposing credentials.
- [x] 1.5 抽取 RunningHub digital human 和 MiniMax music/TTS/clone/audio clients
  - [x] 2026-08-13 shared adapters cover RunningHub task capabilities plus MiniMax music, async voice synthesis, voice cloning and general audio; fixture coverage verifies synchronous base64, async file retrieval, clone preview output, workspace-local multipart reference upload and strict path/source-file validation. Desktop voice-clone UI metadata is carried as `featureId=voice-clone` into the local host without base64 IPC.
- [x] 1.6 为 SaaS/Desktop adapters 运行同一组 provider contract tests
  - [x] 1.6a 2026-08-13 `lib/ai-runtime/provider-parity.test.ts` runs the same normalized output/idempotency assertions against SaaS and Desktop OpenAI-compatible and Bailian image adapters; video generation remains outside the real-provider smoke scope.
  - [x] 2026-08-14 `pnpm test:media:provider-parity` exposes and passes the shared parity suite (2/2): OpenAI-compatible and Bailian image adapters match terminal output, output count, and idempotency/request identity semantics.

**Quality Gate:**
- [x] `media-runtime` 无 Next、DB、billing、enterprise、R2 或环境全局读取
  - [x] 2026-08-13 shared-boundaries and shared-provenance checks pass; the package depends only on injected provider/fetch, filesystem and workspace ports.
- [x] Provider fixtures 全部通过
  - [x] 2026-08-13 non-video provider fixtures and generic HTTP fixtures pass; video generation is excluded from the real-provider smoke scope by acceptance requirement.
- [x] SaaS 现有媒体回归无行为漂移
  - Evidence (2026-08-14): shared media-runtime jobs/http/polling/provider-adapter suites, SaaS media run/task route regressions, and SaaS/Desktop provider parity all pass together (37/37); video contract fixtures remain non-real-provider tests per scope.

## 2. Desktop media jobs and artifacts

- [x] 2.2a Persisted media job records now derive deterministic idempotency keys and resume by polling when a provider task ID exists.
- [x] 2.4a workflow-host media nodes write downloaded outputs into canonical project artifact subdirectories and emit relative metadata only.
- [x] 2.5a PPT/media artifact metadata includes relative path, byte length and SHA-256 before UI event emission.
- [x] 2.5b Desktop media workspace exposes cloud-aligned audio/video feature groups, per-feature fields, local artifact pickers, task status and artifact opening.
- [x] 2.2c Tauri startup lists persisted `run_attempts` with provider task IDs and host resume requests carry current config without persisting API keys.

- [x] 2.1 实现从明文 `config.json` 解析并脱敏传递 Provider 配置。✓ 2026-08-13 — 配置仅在当前内存 Provider payload 中传给 host；workflow save/export/import/dispatch 会递归剔除凭据，真实 LLM/图片 smoke 均通过且未输出密钥。
  - [x] 2.1a `config.json` now persists a normalized configured model list and selected Skill; stale selected models fall back to the first configured model.
  - [x] 2.1b Workflow definitions recursively remove Provider credentials before save, export, import, or host dispatch; credentials remain only in the current in-memory Provider payload.
  - [x] 2.1c 2026-08-13 desktop settings and host dispatch support multiple same-type Provider profiles with capability defaults for text/image/video/audio; each profile normalizes its model list and falls back to the first configured model. 2026-08-14 `provider-config.test.ts` now independently verifies image, audio, and video profiles/defaults keep their own catalogs and stale-model fallback.
  - [x] 2026-08-14 settings capability defaults now filter known profiles by explicit `capabilities` or source/model identity, while retaining the selected legacy profile and unknown profiles for backward compatibility; regression verifies image/text/audio/video isolation.
  - [x] 2.1d 2026-08-14 media feature-level model fields now derive their options from the active capability Provider profile, deduplicate configured models, fall back to the first configured model when stale, and stay synchronized with the top-level selector; `apps/desktop/test/media-model-options.test.ts` and the full Desktop suite pass.
  - [x] 2026-08-14 mixed workflow dispatch keeps the sanitized portable definition separate from the in-memory host definition; media nodes are rebound to the configured image/video/audio profile and its preferred model before execution, with regression coverage proving stale bindings and API keys are not carried forward.
  - [x] 2026-08-14 direct media routes and workflow canvas readiness now resolve Provider configuration per capability/node; an unrelated configured image/audio/video profile cannot unlock another media node, with route regression coverage for same-type multi-provider isolation.
  - [x] 2026-08-14 `providerForCapability` now repairs an existing incompatible capability default by selecting the first known compatible profile; unknown legacy defaults retain the prior legacy fallback behavior, with regression coverage for imported misbindings.
  - [x] 2026-08-14 `config.json` normalization now preserves and validates explicit per-profile `capabilities` declarations, including the top-level compatibility provider; runtime config regression covers text/image/video declarations alongside model/default persistence.
- [x] 2.2 提交前持久化 idempotency key，提交后立即保存 provider task ID（桌面在发送 `workflow.run` 前为每个媒体节点写入 queued attempt；收到 provider task ID 事件后幂等更新同一记录）
- [x] 2.3 实现可恢复 poll 和 provider 支持时的 cancel（`runMediaJob` 使用持久化 task ID 续 poll，并通过未 aborted 的控制端口发送 provider cancel）
- [x] 2.4 从 Rust 请求 canonical temp path，流式下载并原子移动到项目目录
  - [x] 2026-08-13 Tauri allocates a workspace-relative `artifacts/.tmp` directory per media node; host downloads provider streams there and atomically renames hashed outputs into the final artifact directory without carrying bytes through RPC.
- [x] 2.5 验证 MIME、大小、hash 和路径归属后登记 artifact
  - [x] 2026-08-13 Rust artifact inspection enforces workspace ownership, extension/MIME policy, byte-size/hash calculation and idempotent registration after terminal host events; temp directories are removed after finalize or failure.
- [x] 2.6 记录 token/请求/媒体任务和预估成本，不执行扣费
  - [x] 2026-08-13 media-runtime now normalizes provider usage (tokens, duration, request count, provider/estimated cost) into terminal media events; desktop persists one idempotent usage row per media node and does not record the pre-download submitted event as complete.

**Quality Gate:**
- [x] 强制杀死并重启后只继续 poll、不重复 submit
  - [x] 2026-08-13 recovery allocates a fresh Rust-owned temp directory and resumes by provider task ID; the host never re-submits an existing task.
  - [x] 2026-08-14 repeated successful downloads reuse an existing content-addressed target instead of failing on Windows rename semantics; media-runtime regression covers the same task downloaded twice.
- [x] 大文件不以 base64 经过 UI/IPC
  - [x] 2026-08-13 desktop streams File chunks into Rust-owned attachment files; source regression rejects `readAsDataURL`/`btoa` and verifies bounded chunk RPC.
- [x] API Key 不进入命令行、SQLite、日志或诊断包
  - [x] 2026-08-13 source and Rust redaction regressions verify env-only host transport, credential-free persisted workflow/run payloads, and `[REDACTED]` diagnostics/log output.

## 3. Desktop workflow composition

- [x] 3.1 实现 desktop WorkflowRunRepository、CapabilityPort、ArtifactPort 和 EventSink
  - [x] 2026-08-13 `apps/desktop/runtime/workflow-ports.ts` composes the shared ports into a bounded RPC event bridge; repository status, artifact registration and ordered workflow events remain persisted by the existing Tauri SQLite handlers.
- [x] 3.1a workflow-core 已提供 capability/run/artifact/event ports 与 deterministic execution、cancel/retry/resume 基础。
- [x] 5.4a Desktop workflow UI exports versioned JSON, imports through workflow-core migration, and assigns a new local workflow ID without copying Provider/path state.
- [x] 5.4b Desktop workflow canvas exposes selectable Input/Capability/Output nodes and an editable capability/input configuration panel before execution.
- [x] 3.4a workflow-host `workflow.run` now executes pure text/file/collect/output nodes and routes writer/LLM/agent/PPT node prompts through local OpenCode; provider-backed media adapters remain downstream.
- [x] 3.4 将所有文本类节点路由到 OpenCode，将媒体节点路由到 host-neutral media-runtime；未配置 Provider 返回结构化 configuration-required 错误。
- [x] 3.5a SQLite schema now includes idempotent `run_nodes` and `run_attempts` records for node/provider recovery.
- [x] 3.2 注册 upload/text/file/writer/LLM/agent/image/video/digital-human/music/voice/audio/PPT/knowledge/product-store/foreach/collect/output
  - [x] 2026-08-13 workflow-core registry now includes the approved `voice_clone` node alongside every listed v1 input, text, media, knowledge, control and output node; schema tests validate the complete set.
- [x] 3.3 明确排除 Lead Hunter、publish-as-agent、marketplace 和 enterprise preset
  - [x] 2026-08-13 registry boundary test asserts all four excluded capability identifiers are absent.
- [x] 3.4 将所有文本类节点路由到 OpenCode，将媒体节点路由到 media-runtime
  - [x] 2026-08-13 host routing includes the independent `voice_clone` media executor and all text/Skill nodes remain on the OpenCode branch; desktop media routing tests cover the direct provider path.
- [x] 3.5 保存 run、run_nodes、run_attempts、关键 run_events 和 checkpoints
  - [x] 2026-08-13 workflow-core emits bounded node success outputs as stable checkpoint payloads; Tauri persists idempotent `run_checkpoints` rows keyed by run/checkpoint, including foreach iteration keys.

**Quality Gate:**
- [x] 完整 DAG、并行、foreach/collect contract tests 通过
  - [x] 2026-08-13 workflow-core execution tests cover deterministic DAG ordering, parallel siblings, foreach/collect concurrency and failure policy.
- [x] 节点注册表与确认范围逐项匹配
  - [x] 2026-08-13 registry contract tests cover every approved v1 node and the four excluded SaaS-only capabilities.
- [x] desktop composition 不导入 Next route 或 SaaS infrastructure
  - [x] 2026-08-13 shared boundary and provenance tests pass for the desktop composition.

## 4. Run control and recovery

- [x] 4.1 实现 workflow/run/node cancel 和紧急停止
  - [x] 2026-08-13 host cancellation propagates AbortSignal, kills matching OpenCode children, exposes an emergency-stop command/event, and Tauri closes unfinished nodes as cancelled/interrupted.
- [x] 4.2 实现节点/分支重试与 resume compatibility 检查
  - [x] 2026-08-13 workflow-core retries failed capability calls, reuses successful node checkpoints for Task Center retries, and rejects definition-hash changes before recovery.
- [x] 4.3 媒体 provider job 恢复为 poll/download，OpenCode/本地工具恢复为 interrupted
  - [x] 2026-08-13 persisted provider task IDs resume through poll/download while Tauri startup recovery marks OpenCode/local nodes interrupted.
- [x] 4.4 防止重启后重复 artifact registration 和 usage recording
  - [x] 2026-08-13 deterministic artifact paths, idempotent registration keys and usage rows are covered by media/runtime/storage regression tests.
- [x] 4.5 实现异常退出、临时 URL 到期和部分产物测试
  - [x] 2026-08-13 provider-success/download-failure recovery retains the task ID; atomic downloader tests cover partial files, MIME/size rejection and cleanup.
- [x] 4.3a `media.resume` seeds `runMediaJob` with the persisted task ID, polls/downloads without submit, and emits terminal artifact metadata.
- [x] 4.4a media progress/status events update the idempotent attempt record; resumed artifacts use the same deterministic registration path.
- [x] 4.5a Media download/verification failures retain the provider task ID as recoverable `download_failed` attempts; startup recovery resumes poll/download while terminal provider failures remain excluded.

**Quality Gate:**
- [x] 关闭应用后恢复长媒体工作流
  - [x] 2026-08-13 desktop host integration test starts a persisted `media.resume`, terminates the host, restarts it with the same provider task ID, verifies polling reaches a local artifact, and asserts the provider submit endpoint was never called.
- [x] failed/interrupted 节点可安全重试
  - [x] 2026-08-13 host crash/interrupted recovery is supervised by Tauri, workflow retry reuses the persisted definition hash/checkpoints, and the media restart fixture verifies a retryable provider task does not resubmit.
- [x] 外部请求与 usage 记录具有幂等证据
  - [x] 2026-08-13 media idempotency keys and persisted usage/attempt updates are asserted by desktop, media-runtime and Rust storage tests.

## 5. Workflow UI and portability

- [x] 5.1 使用共享 workflow builder 和 desktop WorkbenchClient
  - [x] 2026-08-13 desktop run start/emergency-stop lifecycle now goes through the shared WorkbenchClient runs port; workflow definitions preserve schema/revision/hash metadata and use the shared builder/compiler.
- [x] 5.2 未配置 Provider 的媒体节点保持可见，画布显示双语“需要配置 / Configuration required”状态并提供模型配置入口；运行时仍保留结构化 configuration-required 错误。 ✓ 2026-08-13
- [x] 5.3 运行页展示文本、工具、媒体进度、产物、错误和用量
  - [x] 2026-08-13 Task Center can inspect any persisted run and displays node statuses/outputs, ordered tool/media/error events, local artifacts referenced by events, retry entry points, and per-run usage totals from SQLite.
- [x] 5.4 实现版本化 workflow JSON export/import 和 schema migration
  - [x] 2026-08-13 export/import uses the shared versioned envelope and migration path; imports receive a new local workflow ID and sanitized provider/path bindings.
- [x] 5.5 在另一台机器导入后重新绑定本地路径/Provider，不复制数据库 ID
  - [x] 2026-08-13 portability sanitizer removes Provider/model bindings, credentials, database IDs and absolute paths while preserving relative references; import migrates/validates and saves a new local ID.

**Quality Gate:**
- [x] 混合文本→图片→视频→音频→PPT 工作流 E2E 通过
  - 2026-08-14 `apps/desktop/test/host-session.test.ts` runs a local fake OpenCode serve plus injected HTTP media Provider through one v2 DAG; text, image, video, audio and PPT nodes all reach `node_succeeded`, artifacts are downloaded under the workspace, and the generated PPTX fixture has the ZIP signature. The test uses no real Seedance/video smoke request.
- [x] workflow JSON 可通过普通文件共享并成功导入
  - [x] 2026-08-13 `apps/desktop/test/workflow-storage.test.ts` writes the versioned export to an ordinary UTF-8 `workflow.json`, reads it back, runs migration/validation, strips Provider/path bindings, and verifies a fresh portable definition hash.
- [x] 不支持共享或并发打开 `app.db`/LanceDB 的文档已明确
  - [x] 2026-08-13 `apps/desktop/README.md` and the portability spec explicitly prohibit sync-drive sharing/concurrent opens and describe the single-instance lock boundary.

## Completion Checklist

- [x] 所有阶段与质量门禁通过 — 2026-08-14 Desktop 124/124, desktop build, bundle-boundary scan, root TypeScript and lint pass; real-provider scope remains LLM/image/audio plus the separately verified non-Seedance video profile, with Seedance intentionally excluded.
- [x] 三个 capability specs 全部满足 — local media/workflow/portability contract tests cover direct Provider routing, recovery/idempotency, local artifacts, cancellation/retry, and credential-free JSON import/export.
- [x] 每类真实 Provider smoke 结果已记录
  - 2026-08-13：使用 `apps/desktop/real-providers.test.local.json` 顺序 smoke（LLM → image → audio，未执行 video/seedance）；LLM HTTP 200 且 schema 通过，音频 profile `audio-minimax/speech-2.8-turbo` 提交 HTTP 200 并在第 8 次查询返回 `Success`，图片请求连续 3 次 HTTP 502（上游 `upstream_error`，非本地适配器失败）。脱敏输出明确记录 `scope.executed=[llm,image,audio]` 与 `scope.excluded=[video,seedance]`，API key 不进入结果。
  - 2026-08-14 rerun: LLM HTTP 200/schema 通过；图片直连 `/v1/images/generations` 连续 3 次 HTTP 502，备用工具代理返回 HTTP 401 `Invalid token`；音频提交 HTTP 200 但 24 次轮询仍未达最终状态。结果继续归类为上游 Provider 可用性阻塞，未把它误报为桌面适配器成功；video/seedance 仍未执行。
  - 2026-08-14 current rerun: using `apps/desktop/real-providers.test.local.json`, LLM HTTP 200/schema passed, OpenAI-compatible image HTTP 200/schema passed after one bounded retry, and MiniMax audio HTTP 200/schema passed after bounded polling; video/seedance remained explicitly excluded.
  - 2026-08-14 follow-up rerun with 48 bounded audio polls: LLM HTTP 200/schema and image HTTP 200/schema passed; MiniMax audio submit stayed HTTP 200 but remained non-terminal after 48 polls (`providerStatus=Processing`), so the command correctly exited non-zero. This is recorded as upstream task availability, not a local adapter success.
  - 2026-08-14 isolated `test:real-providers:audio` retry (without re-running LLM/image) reached MiniMax HTTP 200 and `Success` on poll 4; the bounded audio-only entry point keeps provider timing diagnosable without weakening fail-closed behavior.
  - 2026-08-14 latest default smoke: `node scripts/test-desktop-real-providers.mjs` using `apps/desktop/real-providers.test.local.json` returned LLM HTTP 200/schema (`attempts=1`), OpenAI-compatible image HTTP 200/schema (`attempts=1`), and MiniMax audio HTTP 200/schema (`providerStatus=Success`, `attempts=11`); output remained credential-free and scope was `executed=[llm,image,audio]`, `excluded=[video,seedance]`.
  - 2026-08-14 real `video-minimax-h3` profile added to the user-local config (the file remains ignored); `test:real-providers:video` reached RunningHub HTTP 200 and `SUCCESS` after 76 bounded polls, with `scope.excluded=[seedance]` and no credential output. Earlier runs corrected the H3-specific `2K`/`16:9` request contract; the final run is the accepted evidence.
  - 2026-08-14 latest isolated video verification submitted only the configured `video-minimax-h3` profile: RunningHub returned HTTP 200, and the first task reached `SUCCESS` after 106 total polls while a second task reached `SUCCESS` after 133 total polls. The smoke now gives H3 a bounded default budget of 240 polls, local config credentials remain unprinted, and `scope.excluded=[seedance]` stayed enforced. The provider can exceed 120 polls, so an intermediate `RUNNING` result remains a correct fail-closed outcome rather than a false success.
  - 2026-08-14 final-code default `test:real-providers:video` rerun selected only `video-minimax-h3`, returned RunningHub HTTP 200/schema-valid `SUCCESS` after 122 polls, and kept `scope.excluded=[seedance]`; no credential was emitted.
  - 2026-08-14 final targeted image-only verification used the configured `gpt-image-2` profile at `256x256`: PPTOKEN returned HTTP 200 with a schema-valid response on the first attempt; scope was `executed=[image]`, `excluded=[video,seedance]`, and no credential was emitted. One successful configured image model is sufficient for this gate.
  - 2026-08-14 earlier bounded default smoke on the current host returned LLM HTTP 200/schema and MiniMax audio HTTP 200/schema, but PPTOKEN image `/v1/images/generations` returned HTTP 502 `upstream_error` on all 3 bounded attempts. The command correctly failed closed; no credential was emitted and video/Seedance remained excluded.
  - 2026-08-14 added and verified the isolated `test:real-providers:image` entry point and fixture coverage (`test-desktop-real-providers.test.mjs`); an earlier image-only run reproduced the same PPTOKEN HTTP 502 after 3 attempts with scope `executed=[image]`, `excluded=[video,seedance]`, without re-running LLM/audio or exposing credentials.
  - 2026-08-14 temporary model probes against the same PPTOKEN key did not identify a local model-selection fix: `gpt-image-2-1k` exceeded the 30-second request bound and `nano-banana2-1k` was rejected as not an image model; the user-local config was not changed.
  - 2026-08-14 the PPTOKEN tool proxy also returned `401 Invalid token` for the same local credential, while direct `/models` returned the configured image catalog; direct generation remains the only failing upstream boundary and no credential was printed or changed.
  - 2026-08-14 latest targeted verification supersedes the transient failures above: using only configured `gpt-image-2`, the low-resolution-first direct probes `256x256`, `512x512`, and `1024x1024` each returned HTTP 200 with image data/schema; the isolated `test:real-providers:image` command also returned HTTP 200/schema in one attempt with video and Seedance excluded. The local provider config was not changed and sanitized output contained no credentials.
  - 2026-08-14 latest bounded default smoke using the same local config passed LLM HTTP 200/schema, `gpt-image-2` HTTP 200/schema, and MiniMax audio HTTP 200/schema with provider status `Success`; scope was `executed=[llm,image,audio]`, `excluded=[video,seedance]`, and sanitized output remained credential-free.
  - 2026-08-14 image smoke now defaults to low-resolution `256x256` with `AIMARKETING_PROVIDER_IMAGE_SIZE` overrides for supported sizes; fixture coverage asserts the request size, and the real default-size `gpt-image-2` smoke returned HTTP 200/schema.
  - 2026-08-14 PPTOKEN 专用连通性 smoke 固定只验证 `gpt-image-2`，默认请求 `256x256`；使用同一用户本地配置直连 `/v1/images/generations` 返回 HTTP 200、`data` schema 且 `imageCount=1`，未执行其他图片模型。
  - 2026-08-14 latest default rerun with `AIMARKETING_PROVIDER_IMAGE_SIZE=256x256`: LLM HTTP 200/schema (`attempts=1`), `gpt-image-2` HTTP 200/schema (`attempts=2`), and MiniMax audio HTTP 200/schema (`providerStatus=Success`, `attempts=5`); sanitized scope remained `executed=[llm,image,audio]`, `excluded=[video,seedance]`.
  - 2026-08-14 current revalidation: `pnpm test:desktop-real-provider-config` passed 5/5; isolated image smoke used only configured `gpt-image-2` at `256x256` and returned HTTP 200/schema on the first attempt, with `scope.excluded=[video,seedance]` and no credential output.
  - 2026-08-14 latest default non-video smoke: LLM HTTP 200/schema (`attempts=1`), configured `gpt-image-2` HTTP 200/schema at `256x256` (`attempts=1`), and MiniMax audio HTTP 200/schema with `providerStatus=Success` (`attempts=3`); sanitized scope was `executed=[llm,image,audio]`, `excluded=[video,seedance]`.
  - 2026-08-14 latest PPTOKEN-only revalidation after fail-closed verifier hardening still targets only configured `gpt-image-2` at `256x256`: the tool proxy returned HTTP 401 `Invalid token`, and direct generation timed out without an HTTP response. The verifier returned `success=false`/non-zero, so no image provider success is claimed; other image models, video, and Seedance were not executed.
  - 2026-08-14 the same image credential can read PPTOKEN `/v1/models` (HTTP 200, 15 models, `gpt-image-2` present), but catalog visibility does not translate to generation availability; the dedicated low-resolution generation check remains failed closed.
  - 2026-08-14 latest full non-video rerun with the current local config and `256x256` image size passed LLM HTTP 200/schema, timed out on the isolated `gpt-image-2` generation, and left MiniMax audio at `Processing` after 24 bounded polls; the command returned non-zero with `executed=[llm,image,audio]`, `excluded=[video,seedance]` and no credential output.
  - 2026-08-14 the dedicated PPTOKEN smoke now includes the desktop adapter's default `response_format=url` field, while remaining fixed to `gpt-image-2`/`256x256`; fixture and OpenAI-compatible adapter contract tests pass, and the current live proxy still returns `401 Invalid token`.
  - 2026-08-14 generic `test:real-providers:image` now also forces `gpt-image-2` whenever the selected image profile is PPTOKEN, even if a stale catalog-listed model is present; fixture coverage asserts the outbound model, while the current configured low-resolution live request still times out.
  - 2026-08-14 curl-only comparison using the same configured PPTOKEN credential and the desktop request body (`gpt-image-2`, `256x256`, `response_format=url`) also received 0 bytes and timed out after 60 seconds; the image failure is therefore upstream generation availability, not Node fetch transport behavior.
  - 2026-08-14 new isolated music-only smoke selected configured MiniMax audio profile and called `/music_generation` with `music-2.6`; it returned HTTP 200/schema-valid URL audio on the first attempt, with `executed=[music]`, `excluded=[video,seedance]` and no credential output.
  - 2026-08-14 isolated audio-only rerun with `AIMARKETING_PROVIDER_AUDIO_POLLS=60` and the configured `audio-minimax/speech-2.8-turbo` profile reached HTTP 200/schema `Success` on poll 12; scope was `executed=[audio]`, `excluded=[video,seedance]`, and no credential was emitted.
  - 2026-08-14 latest video-only rerun selected only configured `video-minimax-h3` (`profileId=video-minimax-h3`); RunningHub returned HTTP 200/schema `SUCCESS` on poll 106 with scope `executed=[video]`, `excluded=[seedance]`, and no credential output.
  - 2026-08-14 continuation revalidation with the same local config, `--image-only`, `AIMARKETING_PROVIDER_IMAGE_SIZE=256x256`, `AIMARKETING_PROVIDER_RETRIES=0`, and a 15-second request bound selected only `gpt-image-2`; it returned `ok=false`, `schemaOk=false`, `attempts=1`, and an abort timeout. The result remains fail-closed and confirms the upstream generation timeout persists.
- [ ] Ready for `openspec-archive add-desktop-media-and-workflows` — archive after the Windows hardening change carries the final clean-VM/signature release evidence.
