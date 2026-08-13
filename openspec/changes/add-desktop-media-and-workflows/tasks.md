## 1. Extract pure media clients

- [x] 1.2a Define host-neutral media request/task/provider/cancellation contracts.
- [x] 1.6a Add shared media idempotency, task normalization and restart recovery contract tests.
- [x] 1.2b Add generic submit/poll/cancel-aware `runMediaJob` with persisted submission/update callbacks and timeout.
- [x] 1.2c Add direct JSON Provider adapter and atomic URL/base64 output downloader; provider-specific endpoint clients remain follow-up adapters.
- [x] 1.6b Harden media runner cancellation so provider cancel requests are sent with a non-aborted control port; add size/MIME rejection coverage for local downloads.

- [ ] 1.1 迁移现有 success、429、invalid response、polling 和 timeout fixtures
- [x] 1.2 定义统一 `submit/poll/cancel/download/usage` async media job contract。✓ 2026-08-13 — `media-runtime` 提供 host-neutral request/task/provider/cancellation ports、generic submit/poll/cancel runner、atomic downloader 与 idempotency/recovery contract tests。
- [x] 1.3 抽取 OpenAI-compatible/Bailian image clients
  - [x] 2026-08-13 `media-runtime` now provides direct OpenAI-compatible `/images/generations` and DashScope text-to-image submit/poll adapters; desktop host selects them for configured image nodes. Fixture contract tests cover request shape, idempotency headers, `/v1` base-path preservation, async status normalization, and local URL/base64 outputs.
- [ ] 1.4 抽取 MiniMax/Bailian/RunningHub video clients
- [x] 1.5 抽取 RunningHub digital human 和 MiniMax music/TTS/clone/audio clients
  - [x] 2026-08-13 shared adapters cover RunningHub task capabilities plus MiniMax music, async voice synthesis, voice cloning and general audio; fixture coverage verifies synchronous base64, async file retrieval, clone preview output, workspace-local multipart reference upload and strict path/source-file validation. Desktop voice-clone UI metadata is carried as `featureId=voice-clone` into the local host without base64 IPC.
- [ ] 1.6 为 SaaS/Desktop adapters 运行同一组 provider contract tests

**Quality Gate:**
- [ ] `media-runtime` 无 Next、DB、billing、enterprise、R2 或环境全局读取
- [ ] Provider fixtures 全部通过
- [ ] SaaS 现有媒体回归无行为漂移

## 2. Desktop media jobs and artifacts

- [x] 2.2a Persisted media job records now derive deterministic idempotency keys and resume by polling when a provider task ID exists.
- [x] 2.4a workflow-host media nodes write downloaded outputs into canonical project artifact subdirectories and emit relative metadata only.
- [x] 2.5a PPT/media artifact metadata includes relative path, byte length and SHA-256 before UI event emission.
- [x] 2.5b Desktop media workspace exposes cloud-aligned audio/video feature groups, per-feature fields, local artifact pickers, task status and artifact opening.
- [x] 2.2c Tauri startup lists persisted `run_attempts` with provider task IDs and host resume requests carry current config without persisting API keys.

- [x] 2.1 实现从明文 `config.json` 解析并脱敏传递 Provider 配置。✓ 2026-08-13 — 配置仅在当前内存 Provider payload 中传给 host；workflow save/export/import/dispatch 会递归剔除凭据，真实 LLM/图片 smoke 均通过且未输出密钥。
  - [x] 2.1a `config.json` now persists a normalized configured model list and selected Skill; stale selected models fall back to the first configured model.
  - [x] 2.1b Workflow definitions recursively remove Provider credentials before save, export, import, or host dispatch; credentials remain only in the current in-memory Provider payload.
- [x] 2.2 提交前持久化 idempotency key，提交后立即保存 provider task ID（桌面在发送 `workflow.run` 前为每个媒体节点写入 queued attempt；收到 provider task ID 事件后幂等更新同一记录）
- [x] 2.3 实现可恢复 poll 和 provider 支持时的 cancel（`runMediaJob` 使用持久化 task ID 续 poll，并通过未 aborted 的控制端口发送 provider cancel）
- [ ] 2.4 从 Rust 请求 canonical temp path，流式下载并原子移动到项目目录
- [ ] 2.5 验证 MIME、大小、hash 和路径归属后登记 artifact
- [x] 2.6 记录 token/请求/媒体任务和预估成本，不执行扣费
  - [x] 2026-08-13 media-runtime now normalizes provider usage (tokens, duration, request count, provider/estimated cost) into terminal media events; desktop persists one idempotent usage row per media node and does not record the pre-download submitted event as complete.

**Quality Gate:**
- [ ] 强制杀死并重启后只继续 poll、不重复 submit
- [ ] 大文件不以 base64 经过 UI/IPC
- [ ] API Key 不进入命令行、SQLite、日志或诊断包

## 3. Desktop workflow composition

- [ ] 3.1 实现 desktop WorkflowRunRepository、CapabilityPort、ArtifactPort 和 EventSink
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
- [ ] 3.5 保存 run、run_nodes、run_attempts、关键 run_events 和 checkpoints

**Quality Gate:**
- [ ] 完整 DAG、并行、foreach/collect contract tests 通过
- [ ] 节点注册表与确认范围逐项匹配
- [ ] desktop composition 不导入 Next route 或 SaaS infrastructure

## 4. Run control and recovery

- [ ] 4.1 实现 workflow/run/node cancel 和紧急停止
- [ ] 4.2 实现节点/分支重试与 resume compatibility 检查
- [ ] 4.3 媒体 provider job 恢复为 poll/download，OpenCode/本地工具恢复为 interrupted
- [ ] 4.4 防止重启后重复 artifact registration 和 usage recording
- [ ] 4.5 实现异常退出、临时 URL 到期和部分产物测试
- [x] 4.3a `media.resume` seeds `runMediaJob` with the persisted task ID, polls/downloads without submit, and emits terminal artifact metadata.
- [x] 4.4a media progress/status events update the idempotent attempt record; resumed artifacts use the same deterministic registration path.

**Quality Gate:**
- [ ] 关闭应用后恢复长媒体工作流
- [ ] failed/interrupted 节点可安全重试
- [ ] 外部请求与 usage 记录具有幂等证据

## 5. Workflow UI and portability

- [ ] 5.1 使用共享 workflow builder 和 desktop WorkbenchClient
- [x] 5.2 未配置 Provider 的媒体节点保持可见，画布显示双语“需要配置 / Configuration required”状态并提供模型配置入口；运行时仍保留结构化 configuration-required 错误。 ✓ 2026-08-13
- [ ] 5.3 运行页展示文本、工具、媒体进度、产物、错误和用量
- [ ] 5.4 实现版本化 workflow JSON export/import 和 schema migration
- [ ] 5.5 在另一台机器导入后重新绑定本地路径/Provider，不复制数据库 ID

**Quality Gate:**
- [ ] 混合文本→图片→视频→音频→PPT 工作流 E2E 通过
- [ ] workflow JSON 可通过普通文件共享并成功导入
- [ ] 不支持共享或并发打开 `app.db`/LanceDB 的文档已明确

## Completion Checklist

- [ ] 所有阶段与质量门禁通过
- [ ] 三个 capability specs 全部满足
- [ ] 每类真实 Provider smoke 结果已记录
  - 2026-08-13：`apps/desktop/real-providers.test.local.json` 的顺序 smoke 已验证 LLM `chat/completions` HTTP 200（响应含 `choices`/`usage`）和图片 Provider HTTP 200（响应含 `data`/`created`）；脚本按顺序执行以排除 client-side concurrency，且按验收范围未执行视频生成。
- [ ] Ready for `openspec-archive add-desktop-media-and-workflows`
