# Implementation Tasks: Adopt AI Elements Workbench Primitives

**Change ID:** `adopt-ai-elements-workbench-primitives`

---

## 1. Lock contracts before implementation

- [x] 1.1 清点线上 prompt-kit/message-parts、桌面 composer、`WorkbenchMessageTimeline` 的重复能力和保留能力。
- [x] 1.2 定义 `WorkbenchMessagePartV2`、版本字段、sequence/createdAt 规则和旧 flat content 兼容策略。
- [x] 1.3 为线上 SSE 和桌面 OpenCode/Tauri 事件编写 RED tests：reasoning、plan、task、tool-call、attachment、artifact、usage。
- [x] 1.4 添加共享来源测试，禁止目标入口重新引入私有 composer/process renderer。

**Quality Gate:**

- [ ] V2 类型和 adapter tests 先失败于缺失实现，而不是 fixture/环境错误。
- [ ] 旧消息读取和未知 part 降级策略已明确。

## 2. Build shared AI Elements primitives

- [x] 2.1 在共享 `packages/workbench-ui` AI Elements 模块实现 Attachments、Message、Prompt Input、Model Selector。
- [x] 2.2 实现 Reasoning、Plan、Task、Tool 的 streaming、collapsed、success、failed、cancelled、blocked 状态。
- [x] 2.3 复用 Workbench theme/CSS token，补充 ARIA、键盘和窄屏样式。
- [x] 2.4 导出公共组件、props、part renderers 和最小 adapter interface。
- [x] 2.5 为组件增加 unit/component tests，覆盖 loading、empty、error 和 action callback。

**Quality Gate:**

- [x] `packages/workbench-ui` typecheck、unit tests 和 CSS provenance tests 通过。
- [x] 组件不导入 Next、Tauri、SQLite、Provider SDK 或网络客户端。

## 3. Implement V2 message adapters

- [x] 3.1 将线上 SSE/reducer 事件转换为 V2 parts，保留事件顺序和时间戳。
- [x] 3.2 将桌面 OpenCode/Tauri tool/reasoning/status/usage/artifact 事件转换为 V2 parts。
- [x] 3.3 实现同一 part 的增量合并和重复事件幂等。
- [x] 3.4 实现旧 `content`/旧 parts 的兼容读取和未知 part 的安全降级。
- [x] 3.5 增加 round-trip、streaming completion、refresh/recovery 和 duplicate event tests。

**Quality Gate:**

- [ ] 线上和桌面 adapter 使用同一组 V2 contract tests。
- [ ] `createdAt` 在流式完成和恢复后保持不变。

## 4. Migrate P0 conversation surfaces

- [x] 4.1 首页 `/dashboard` 接入共享 Prompt Input、Attachments、Model Selector 和 Message。
- [x] 4.2 `/dashboard/ai` 接入共享组件和 V2 timeline。
- [x] 4.3 专家 Agent 会话接入共享过程消息和会话 scope。
- [x] 4.4 `/dashboard/writer` 与创作工作台助手接入共享组件，保留写作专用参数。
- [x] 4.5 删除 P0 入口重复 textarea、model controls、tool/process renderer 和不可达 CSS。
- [x] 4.6 增加会话创建、首条消息标题、列表归属、工具过程和刷新恢复回归测试。

**Quality Gate:**

- [x] P0 入口共享组件 provenance、route、interaction、accessibility tests 通过。
- [ ] Web/Desktop 同 viewport 行为和结构保持一致。

## 5. Migrate P1 specialized surfaces

- [x] 5.1 图片助手接入 Attachments、Model Selector、Task 和本地产物结果，不改变左表单右结果布局。
- [x] 5.2 视频/音频助手接入适用的 Prompt Input、Attachments、Task 和结果状态。
- [x] 5.3 工作流 Canvas 接入 Plan、Task、Tool 过程证据，保留 Canvas 专用布局和文件节点能力。
- [x] 5.4 增加本地文件上传、Tauri bridge、Provider 未配置和任务恢复回归测试。

**Quality Gate:**

- [x] P1 页面不显示重复顶部模型/推理/运行时标签。
- [ ] 媒体和 Canvas 专用布局无回归。

## 6. Verification and cleanup

- [x] 6.1 运行 workbench-client/workbench-ui、desktop route/client contract 和关键交互测试。
- [x] 6.2 运行 `pnpm run typecheck`、桌面 Vite/Tauri build、bundle/network boundary checks。
- [ ] 6.3 运行相同 viewport 的线上/桌面视觉回归并记录允许的宿主差异。
- [x] 6.4 检查并删除不再引用的旧 prompt-kit、message-part renderer 和桌面私有 JSX/CSS。
- [x] 6.5 更新 AI Elements 迁移文档和本 change 的完成证据。

### Implementation evidence

- Shared primitives live in `packages/workbench-ui/src/ai-elements.tsx` and are exported from the package root; desktop loads the package CSS from `apps/desktop/src/main.tsx`.
- V2 contracts and merge adapters live in `packages/workbench-client/src/index.ts` and `packages/workbench-client/src/message-parts.ts`; legacy flat messages are normalized on both web and desktop adapters.
- P0 desktop home, general AI, expert Agent, and writer composers now use `WorkbenchPromptInput`; runtime tool events are stored as structured `tool-call` parts.
- Verified: workbench-ui (29 tests), workbench-client (4 tests), desktop route contract (72 tests), desktop client contract (3 tests), and desktop/workbench typechecks.
- Remaining scope: viewport visual regression still requires an interactive WebView run; source-level structure assertions now lock the active route to the shared Canvas surface.

**Completion Gate:**

- [ ] P0/P1 目标入口无重复组件实现。
- [ ] 全部质量门禁通过，且已记录剩余风险。
- [ ] Ready for `/openspec-archive`。

### Follow-up evidence

- P1 media and Canvas checks: `pnpm --filter @aimarketing/workbench-ui typecheck`, `pnpm --filter @aimarketing/desktop exec tsc -p tsconfig.json --noEmit`, and `pnpm exec tsx --test apps/desktop/test/routes.test.ts` pass (72 tests).
- Desktop build and boundary checks: `pnpm --filter @aimarketing/desktop build`, `pnpm run desktop:verify-network-boundary`, and `pnpm run desktop:verify-bundle` pass after allowing only the provider catalog origins and the documented agency “Creator Marketplace submission pipeline” phrase.
- Root-wide `pnpm exec tsc -p tsconfig.json --noEmit` passes after aligning the local provider environment helper, reasoning event contract, and Node Buffer boundary types; viewport visual regression still needs an interactive WebView run.
- Playwright Web smoke at 1280×900 covers `/dashboard/image-assistant`, `/dashboard/workflows`, `/dashboard/writer`, and `/dashboard/ai` with zero console/page errors; image assistant confirms no header model/reasoning/runtime badges and control-before-preview ordering.
- Startup bootstrap now exposes bridge/state/runtime/repair stages with an accessible live status surface; the shared prompt input exposes AI Elements-compatible header/body/footer/tools slots and was smoke-tested on home, writer, and image assistant routes.
- `apps/desktop/index.html` also includes a zero-JavaScript fallback card so the window shows progress before the React bundle mounts.
- Prompt Input child controls are partitioned into Header context (`composer-selected-agent`, prompt suggestions) and Footer tools (knowledge, reasoning, writer options), preventing controls from floating above the textarea.
- Prompt Input now uses native-like icon actions (plus, send, stop, remove, chevron), status-aware submit/stop behavior, and bounded auto-resizing textarea behavior while retaining the existing yellow brand token.
- Prompt Input interaction parity now includes file drag-and-drop highlighting and dispatch, attachment-menu dismissal on outside click/Escape, model-menu dismissal with trigger focus restoration, IME-safe Enter handling, and a compact home composer without the legacy fixed-height spacer.
