## 1. Verify foundation and runtime contracts

- [x] 1.2a Desktop package boundary check covers the local workbench runtime and rejects SaaS/Next imports.
- [x] 1.3a Local chat service contract exposes only host-mediated OpenCode execution; no direct text-model fallback is registered.

- [ ] 1.1 验证三个上游 change 的完成状态和接口版本
- [ ] 1.2 添加 architecture tests，禁止 workbench 导入 Next API、SaaS auth/billing、R2、Railway、Cloudflare、Dify 或 RAGFlow
- [ ] 1.3 添加失败测试，证明普通桌面对话不能选择 `ai-sdk-native` 或直接文本 Provider runtime
- [ ] 1.4 用 fake OpenCode 固定 health/session/stream/tool/usage/abort/error fixtures

**Blocking Quality Gate:**
- [ ] 上游 ports 稳定，无需本 change 定义第二套 contracts
- [ ] OpenCode-only 路由测试先红后绿

## 2. Implement the supervised local OpenCode runtime

- [ ] 2.1 在 loopback 随机端口启动 `opencode serve` 并生成随机 Basic Auth
- [ ] 2.2 禁用外部 CORS/mDNS，使用 AIMarketing 私有 config/Skill/cache/session 目录
- [ ] 2.3 一个 conversation 映射一个稳定 session，并验证跨 conversation/data root 隔离
- [ ] 2.4 归一化 text、reasoning、tool、usage、warning、error、artifact 和 completion events
- [ ] 2.5 实现 abort、紧急停止、crash detection、supervised restart 和 interrupted status
- [ ] 2.6 验证进程树随 Tauri 退出且不自动请求管理员权限

**Quality Gate:**
- [ ] Fake OpenCode 全协议 tests 通过
- [ ] Loopback/auth/进程生命周期 tests 通过
- [ ] OpenCode/用户全局配置未被修改

## 3. Route ordinary chat and Agent turns through OpenCode

- [x] 3.1a Implement `LocalChatService` with framed host RPC, request/run correlation, abort signal and streamed OpenCode event collection.
- [x] 3.2a Desktop chat service has no `ai-sdk-native` or direct provider execution path.
- [x] 3.1b Workflow-host now supports `session.create`/`session.prompt`, stable in-process session mapping and workspace-scoped OpenCode cwd.
- [x] 3.3a UI Provider/model/base URL/API key is passed request-scoped to Host, which writes an isolated OpenCode config and env reference (key is not a CLI argument).
- [x] 3.4a User messages/runs/events/usage are persisted through typed Tauri commands; terminal status is idempotent.

- [ ] 3.1 实现本地 chat service，使用共享 context/session/message/event contracts
- [ ] 3.2 移除或拒绝 desktop 对 `ai-sdk-native`、Railway、Cloudflare 的文本路由
- [ ] 3.3 将选定 OpenAI-compatible Provider/model/base URL/key 和 reasoning effort 传入 request-scoped runtime config
- [ ] 3.4 执行前持久化用户消息，终止时原子保存 assistant 结果、状态、关键事件和用量
- [ ] 3.5 实现 session loss recovery snapshot，失败不覆盖已持久化历史
- [ ] 3.6 添加多轮、取消、session loss、crash、坏事件和缺 Provider tests

**Quality Gate:**
- [ ] 每个普通聊天 run 有 OpenCode runtime evidence
- [ ] 不存在 desktop 直连文本模型 SDK fallback
- [ ] 恢复不会重复已完成工具副作用

## 4. Build the desktop Agent workbench

- [ ] 4.1 组合共享 message parts、prompt input、conversation sidebar 和 stream UI
- [ ] 4.2 添加模型/Skill selector、artifact view、usage、settings 和 diagnostics routes
- [ ] 4.3 删除 desktop bundle 中 login、registration、tenant、role、balance、subscription、Agent publishing、market 和 enterprise preset affordances
- [ ] 4.4 展示 Full Access 风险，但不展示权限模式选择或逐命令确认
- [x] 4.4a UI displays Full Access and plaintext config risk without exposing a permission-mode selector.
- [x] 4.2a Desktop home/chat inputs expose model, reasoning and local Skill selectors; task center exposes persisted usage/run state.
- [x] 4.2b Desktop chat uses the shared cloud-compatible AI/user message cards, timestamps, live event panel, active route highlighting and quick prompt chips.
- [ ] 4.5 实时展示文本/工具步骤和 emergency stop
- [ ] 4.6 添加 streaming、长工具输出、取消、重启、artifact 和缺配置 UI tests

**Quality Gate:**
- [ ] Workbench UI 只使用 Desktop WorkbenchClient
- [ ] 桌面导航与确认范围一致
- [ ] Full Access 和明文 API Key 风险文案可见

## 5. Persist conversations, artifacts, usage and logs

- [ ] 5.1 使用 foundation repositories 保存 conversations/messages/runs/key events/artifacts/usage
- [x] 5.1a Tauri commands persist conversations, messages, runs and key run events; UI run action writes user message and event/terminal status.
- [x] 5.1c Task Center lists persisted SQLite runs, exposes terminal status and lets users load the original prompt for an explicit retry.
- [x] 5.1b Usage events are recorded as model/token/cost metadata without billing or balance enforcement.
- [x] 5.2a Tauri host writes redacted per-run JSONL from framed stdout and stderr with bounded rolling cleanup.
- [ ] 5.2 完整 OpenCode NDJSON 和工具 stdio 写 `logs/runs/<run-id>.jsonl` 并脱敏
- [x] 5.3 运行日志执行 30 天或 1GB 保留策略，只清理最早的 `logs/runs/*.jsonl`，不删除用户会话/产物/项目/usage；Rust 回归测试覆盖过期与超容量清理。 ✓ 2026-08-13
- [ ] 5.4 价格可得时估算成本，不可得时显示“成本未知”
- [ ] 5.5 支持应用内、Explorer 和默认本地程序打开 artifact

**Quality Gate:**
- [ ] 重启后历史、产物、usage 和 interrupted runs 可恢复
- [ ] API Key 不在 SQLite、日志、诊断或命令行参数中

## 6. End-to-end verification

- [ ] 6.1 运行 fake OpenCode E2E：首聊、多轮、tool、cancel、crash、artifact、usage
- [ ] 6.2 用一个真实配置 Provider 运行普通对话 smoke
- [ ] 6.3 捕获证据证明所有普通 desktop chat 选择 OpenCode
- [ ] 6.4 扫描 bundle 和网络日志，确认无排除的 SaaS 模块/端点
- [ ] 6.5 运行共享 tests、desktop TS/Rust tests/build、root lint、Next build 和 SaaS regressions

**Completion Quality Gate:**
- [ ] 三个 capability specs 全部满足
- [ ] 测试和诊断证据完整
- [ ] Ready for `openspec-archive add-local-opencode-workbench`
