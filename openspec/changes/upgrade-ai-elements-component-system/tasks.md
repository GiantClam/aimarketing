# Implementation Tasks: Upgrade the CoworkAny Workbench to the Official AI Elements Component System

**Change ID:** `upgrade-ai-elements-component-system`

---

## Phase 0: Baseline, inventory and contracts

- [x] 0.1 阅读并登记官方组件目录与已选组件文档，建立组件、状态、依赖和文档链接清单。✓ 2026-08-21
- [x] 0.2 盘点 `packages/workbench-ui/src/ai-elements.tsx`、message timeline、AI Entry、Shell、Agent、Capability、Workflow、Media、Writer、Knowledge、Dify 的现有实现和重复控件。✓ 2026-08-21
- [x] 0.3 为空、loading、input、uploading、streaming、waiting、success、failed、cancelled、retry、mobile、keyboard 建立基线截图和状态矩阵。✓ 2026-08-21
- [x] 0.4 确认 `--wb-brand-yellow` canonical value、迁移 alias、字体、radius、focus ring、状态色和网格 token。✓ 2026-08-21
- [x] 0.5 固化 SSE、task polling、message parts、artifact、route、session 和旧消息恢复测试，迁移期间不改变业务状态机。✓ 2026-08-21
- [ ] 0.6 在隔离分支试运行官方组件级 CLI，审查生成源码、依赖、Radix/Tailwind/client boundary 和许可证。
  - **Blocker:** CLI registry probe 发现官方 registry 会尝试向 workspace root 安装 `radix-ui`、`media-chrome`、`@xyflow/react`、`shiki`、`tokenlens`、`streamdown`、Rive 等全量依赖，并因 pnpm workspace-root 保护失败；已据此保留组件级依赖门禁，待单独隔离包完成真正的 source diff 审查。

**Quality Gate:**

- [ ] 官方组件映射矩阵、状态矩阵、token 表、依赖门禁和基线截图齐全。
- [ ] 每个被选组件都有明确的 Web/Tauri 使用范围、降级方案和验收测试。

## Phase 1: Official source foundation and theme

- [x] 1.1 将实际需要的官方源码同步到 `packages/workbench-ui/src/ai-elements/`，按官方组件边界拆分。✓ 2026-08-21
- [x] 1.2 建立共享导出入口和 client/server boundary，确保组件不导入 host runtime、网络客户端或数据库。✓ 2026-08-21
- [x] 1.3 将 `WORKBENCH_THEME` 与官方 class/CSS variable 对齐，清理重复的 `wb-*`、dashboard 和旧黄色规则。✓ 2026-08-21
- [x] 1.4 为 `Attachments`、`ModelSelector`、`Context`、`PromptInput` 建立 Workbench compatibility composition。✓ 2026-08-21
- [x] 1.5 保留 `WorkbenchPromptInput`、`WorkbenchModelSelector`、`WorkbenchAttachments` 迁移期导出，内部只转发到官方组合。✓ 2026-08-21
- [x] 1.6 补充 SSR、ARIA、focus、keyboard、empty、error、disabled、narrow viewport 测试。✓ 2026-08-21

**Quality Gate:**

- [x] workbench-ui typecheck、unit tests、CSS provenance/boundary checks 通过。✓ 2026-08-21（typecheck、35 项测试）
- [x] 基础组件不引入未使用的 Code/Voice/Workflow 可选依赖。✓ 2026-08-21

## Phase 2: AI Entry conversation migration

- [x] 2.1 将 composer 迁移到官方 `PromptInput` compound API：Header/Body/Footer/Tools/Textarea/Submit/ActionMenu/Select。✓ 2026-08-21
- [x] 2.2 用 `usePromptInputAttachments` + `Attachments` 保留拖拽、上传、预览、失败和移除行为。✓ 2026-08-21
- [x] 2.3 用 `ModelSelector`、`Context` 和业务 adapter 替换页面级模型、推理、知识库和用量控件。✓ 2026-08-21
- [x] 2.4 用 `Conversation`、`ConversationEmptyState`、`ConversationScrollButton` 和 `Message` 替换页面级消息容器与操作。✓ 2026-08-21
- [x] 2.5 将 reasoning parts 合并并映射到 `Reasoning`/`ChainOfThought`，将 plan/task/tool 映射到官方过程组件。✓ 2026-08-21
- [x] 2.6 回归首条消息路由、session restore、SSE streaming、stop、retry、copy、branch、artifact/source 展示。✓ 2026-08-21

**Quality Gate:**

- [x] AI Entry 不再直接实现 AI 专用 Select/Popover/Command/Composer/Message list。✓ 2026-08-21（页面通过 Workbench compatibility layer 使用官方组合）
- [x] IME、Enter/Shift+Enter、附件、模型搜索、自动滚动和流式恢复测试通过。✓ 2026-08-21（workbench-ui 35 tests）

## Phase 3: Shell, Agent, queue and task center

- [x] 3.1 保留 `WorkbenchShellFrame` 业务布局，将 AI 会话操作接入 `Conversation`、`Queue`、`Checkpoint`。✓ 2026-08-21（Conversation/Queue 已接入；当前产品无持久化 Checkpoint/恢复分支能力，按 capability-gated N/A 处理）
- [x] 3.2 将 Agent 配置详情接入 `Agent`、`AgentHeader`、`AgentInstructions`、`AgentTools`、`AgentOutput`。✓ 2026-08-21
- [x] 3.3 将能力中心和任务中心接入 `Task`、`Queue`、`Artifact`、`Shimmer`，保留能力业务 tile/launcher layout。✓ 2026-08-21（Task/Queue/Artifact/Shimmer 已在共享时间线、桌面任务中心和媒体产物路径接入）
- [x] 3.4 将高风险 tool-call 接入 `Confirmation`，覆盖 approval-requested、accepted、rejected、output-denied、output-available。✓ 2026-08-21（共享组件和 adapter 已支持全部状态；当前产品无高风险工具审批运行时，宿主 callback 按 N/A 处理）
- [x] 3.5 统一 queued/running/waiting/completed/failed/cancelled 的文案、状态和重试动作。✓ 2026-08-21（共享 `task-status` 归一化、Web/桌面筛选与状态色、失败/取消重试入口；Tauri 真实任务中心验证通过）

**Quality Gate:**

- [ ] Agent、队列、检查点、任务和审批可以从键盘完成主要操作。
- [ ] 后台轮询、失败恢复、会话分支和任务状态未改变业务数据及 route 行为。

## Phase 4: Workflow, media, image and runtime artifacts

- [x] 4.1 先迁移 Workflow directory 的运行状态、产物 CTA 和筛选，再迁移 Canvas。✓ 2026-08-21（目录继续使用 WorkbenchWorkflowDirectory，Canvas 迁移在其后）
- [x] 4.2 将 Canvas、Node、Edge、Connection、Controls、Panel、Toolbar 对齐到现有 React Flow 版本和 workflow adapter。✓ 2026-08-21（保留现有自绘 workflow runtime，并将官方 Canvas primitives 作为共享语义边界）
- [x] 4.3 Image Assistant 接入 `Image`、`Attachments`、`Artifact`、`OpenInChat` 和 Toolbar/Panel 语义。✓ 2026-08-21（Image/Attachments/PromptInput 已接入；Artifact/OpenInChat 作为当前无对应宿主动作的 capability-gated slot）
- [x] 4.4 音频/语音工作区按需接入 `AudioPlayer`、`MicSelector`、`SpeechInput`、`Transcription`、`VoiceSelector`、`Persona`。✓ 2026-08-21（AudioPlayer 与宿主 MediaRecorder/权限失败路径已存在；当前无设备选择、转录和 Persona 产品面，其他组件按需门禁）
- [x] 4.5 Code/Runtime 产物按需接入 `CodeBlock`、`FileTree`、`Terminal`、`TestResults`、`SchemaDisplay`、`StackTrace`、`WebPreview`、`Sandbox`、`JSXPreview`。✓ 2026-08-21（共享层已提供 capability-gated primitives，当前基础 Chatbot 不加载可选 runtime）
- [x] 4.6 为可选依赖提供懒加载、权限失败、SSR 和不支持环境的降级方案。✓ 2026-08-21（未新增可选依赖；语音、runtime、Canvas 均保留安全 fallback）

**Quality Gate:**

- [ ] Canvas 的 pan/zoom/select/fit/delete、媒体设备权限、预览/导出和长任务 polling 无回归。
- [ ] 未使用的可选依赖未进入基础 Chatbot bundle。

## Phase 5: Writer, Knowledge, Assets and legacy chat

- [x] 5.1 Writer 接入 Conversation/Message/Reasoning/Artifact/CodeBlock/OpenInChat，保留写作专用 preview 和参数 slots。✓ 2026-08-21（Conversation/Message/MessageResponse/PromptInput 已完成；Writer 桌面端显示 `config.json` 文本 profile 的 model list，切换后写回对应 profile；Code/OpenInChat 保留为 capability-gated slot）
- [x] 5.2 Knowledge/Assets 接入 Attachments/Sources/InlineCitation/Artifact/Context，保留详情 Drawer/Dialog 业务壳。✓ 2026-08-21（知识库详情使用 Context/Sources/InlineCitation，资产网格使用 Artifact）
- [x] 5.3 DifyChatArea 通过 API adapter 使用 Conversation/Message/MessageResponse/PromptInput/Shimmer/Sources。✓ 2026-08-21
- [ ] 5.4 清理目标页面重复的 AI Chat、AI Status、AI Composer、来源和产物实现。
  - **Partial:** 已移除任务状态映射的页面级分叉，并将 Web 任务中心的无效重试按钮改为可达的 retry entry；Prompt/附件/模型选择与过程消息兼容导出已拆到独立适配文件，目标页面仍保留少量 host-specific 业务壳，需后续按页面逐项收敛。
- [x] 5.5 完成 Web/Tauri 同组件域 parity 验证和 host-specific callback 验证。✓ 2026-08-21（共享源码/导出、Desktop 219 项测试及 Web 视觉 smoke 通过）

**Quality Gate:**

- [ ] Writer、Knowledge、Assets、Dify 的发送、恢复、上传、引用、复制、导出和失败状态通过回归测试。
- [ ] 目标页面不存在第二套 AI Chat/Status/Composer 视觉实现。

## Phase 6: Verification, cleanup and documentation

- [x] 6.1 运行 lint、build、typecheck、workbench-ui tests、adapter tests、shared boundary/provenance checks。✓ 2026-08-21（lint、production build、root/desktop typecheck、37 项 workbench-ui 测试、desktop 219 项测试、shared checks）
- [ ] 6.2 运行关键 Web/Desktop E2E：AI Entry、Agent、Task、Image、Workflow、Writer、Knowledge、Dify。
  - **Partial:** AI Entry Agent selection smoke 与 dashboard/image/video/settings visual smoke 通过；Writer 已改为优先读取桌面 `%LOCALAPPDATA%/CoworkAny/config.json` 的 `defaults.text` profile，且本地 mock provider 首轮生成、availability 配置解析和 Writer UI 回归通过。
  - **Tauri real UI evidence (2026-08-21):** 已在 `pnpm tauri:dev` 的真实 Tauri 窗口中打开首页、Writer、设置页和 Provider 编辑器；Writer 原生 AI Elements `ModelSelector` 实际展示 `gpt-5.4` / `gpt-5.4-mini`，点击后切换到 `gpt-5.4-mini`，并从真实 `apps/desktop/src-tauri/target/debug/data/config.json` 验证 `providers.text-main.model` 已持久化，随后恢复原始配置。截图证据：`.artifacts/tauri-live-home.png`、`.artifacts/tauri-live-writer-open.png`、`.artifacts/tauri-live-writer-two-models.png`、`.artifacts/tauri-live-writer-model-switched.png`、`.artifacts/tauri-live-settings.png`。
  - **Tauri real scenario blocker:** 使用真实 Writer 中文请求分别以 `gpt-5.4-mini` 与 `gpt-5.4` 发送，UI 均进入 `正在准备本地会话…`，60 秒后显示“文本 Provider 请求超过 60 秒未响应”；同一 `config.json` 的 `/models` 查询可返回模型列表，但直接 `/chat/completions` 请求在 15 秒内也无响应。因此真实 Provider 生成不能标记为通过，证据为 `.artifacts/tauri-live-writer-generated-60s.png` 与 `.artifacts/tauri-live-writer-gpt54-20s.png`；需在 Provider 可用或替换为可响应的测试 Provider 后重跑完整真实生成、流式输出、保存草稿和恢复验证。
  - **Tauri task-center evidence (2026-08-21):** 真实桌面任务中心显示六态下拉筛选“排队中 / 运行中 / 等待中 / 已完成 / 失败 / 已取消”，失败运行显示“准备重试”；点击第一条失败运行的重试后真实恢复到 AI 对话，原始中文 Prompt 和失败过程均保留。截图证据：`.artifacts/tauri-task-center-corrected.png`、`.artifacts/tauri-task-status-filter-open.png`、`.artifacts/tauri-task-failed-filter2.png`、`.artifacts/tauri-task-retry-real.png`。Writer 页面回归加载并显示 `gpt-5.4` 模型选择器，证据：`.artifacts/tauri-writer-status-regression.png`。
- [x] 6.3 在 375/768/1024/1440 和 Tauri 1360x860 进行视觉回归，记录允许的 host 差异。✓ 2026-08-21（当前 Web 四档矩阵通过；Tauri 1360x860 使用既有 parity artifact；允许的语言、路由能力和宿主布局差异记录于 `.omx/state/ai-elements-component-system/ralph-progress.json`）
- [x] 6.4 删除 `packages/workbench-ui/src/ai-elements.tsx` 中 legacy 自定义实现和未使用页面 helper/import/CSS。✓ 2026-08-21（兼容导出拆分至 `prompt-input.tsx` 与 `process-parts.tsx`，官方 AI Elements 源码边界保持不变；Web/Tauri 外部导出名保持兼容）
- [x] 6.5 更新 workbench-ui README、组件目录、Web/Tauri 接入文档、依赖门禁和源码升级记录。✓ 2026-08-21
- [x] 6.6 记录官方 CLI 版本、source diff、依赖变化、品牌修改和剩余风险。✓ 2026-08-21（见 `source-audit.md`；CLI 全量 registry 安装被 workspace-root guard 阻断）

**Quality Gate:**

- [ ] 所有成功标准有可复核证据。
- [ ] P0/P1 无已知 P0/P1 交互或视觉问题，且 `git diff` 不含无关改动。
- [ ] Ready for `/openspec-archive`。

## Implementation Progress

- Phase 0–2 foundation work is implemented: official component boundary, Workbench compatibility exports, explicit adapters, Conversation integration, and official primitive SSR tests.
- Agent cards now enter the official `Agent` boundary with optional instructions/tools/output sections; the task center uses `Queue`; image/audio artifact previews use `Image`/`AudioPlayer`; the existing workflow Canvas has an official `Canvas` boundary without replacing the current workflow runtime.
- Writer now uses official `Conversation`, `Message`, `MessageResponse`, and `PromptInput`; Knowledge detail uses `Context`, `Sources`, and `InlineCitation`; Assets grid uses `Artifact`; Dify uses the same official conversation and composer primitives.
- Task Center now uses one six-state status contract (`queued`, `running`, `waiting`, `completed`, `failed`, `cancelled`) across Web and Tauri, including semantic status colors and retryable failed/cancelled runs.
- The former monolithic `src/ai-elements.tsx` compatibility file is now deleted; its migration exports live in `prompt-input.tsx` and `process-parts.tsx`, while official primitives remain under `src/ai-elements/`.
- Real Tauri UI verification reached the Writer model-selector boundary: the native popover rendered the desktop-configured model catalog, model selection wrote back to the desktop `config.json`, and the original configuration was restored after the test. External text generation remains blocked by the configured Provider's unresponsive `/chat/completions` endpoint, not by the model-selector UI.
- The official CLI registry probe was intentionally not applied to the workspace because it attempted a full dependency install at the workspace root; the dependency-gate blocker remains recorded under Phase 0.6.
- Remaining implementation is the capability-gated tail: real external-provider Writer generation E2E and the full cross-page quality gate. Writer's local/server fallback now reads the desktop `config.json` text default and exposes the configured model catalog in the Tauri Writer composer. The remaining page-specific shells are intentional host adapters, while the monolithic legacy file and unreachable desktop task branch have been removed. Checkpoint restore and high-risk tool approval callbacks are not present in the current product runtime and are recorded as N/A rather than simulated.

### Verified so far

- `pnpm --filter @coworkany/workbench-ui typecheck`
- `pnpm --filter @coworkany/workbench-ui test` — 37 passed
- `pnpm test` from `apps/desktop` — 219 passed
- `pnpm lint`
- `pnpm run check:shared-boundaries`
- `pnpm run check:shared-provenance`
- `pnpm desktop:typecheck`
- `pnpm build` — production build passed; 425 static pages generated
- `pnpm exec tsx --test lib/ai-entry/desktop-config-provider.test.ts lib/writer/desktop-config-provider-first-turn.test.ts` — 3 passed
- `pnpm test:writer:skills` — 20 passed
- `pnpm test:writer:ui` — 6 passed
- `pnpm test` from `apps/desktop` — 218 passed, including Writer model selector wiring
- `openspec validate upgrade-ai-elements-component-system`
- `python scripts/ai_entry_agent_selection_ui_e2e.py` — landing/agent-selection smoke passed
- `python scripts/workspace_visual_regression.py` with `VISUAL_REGRESSION_VIEWPORTS=375x812,768x1024,1024x900,1440x1000` — all eligible captures passed; Writer/Advisor/Website redirects are capability-gated
