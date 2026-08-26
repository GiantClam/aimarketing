# Proposal: Adopt AI Elements Workbench Primitives

**Change ID:** `adopt-ai-elements-workbench-primitives`
**Created:** 2026-08-20
**Status:** Draft

---

## Problem Statement

线上端已经拥有 PromptInput、Message、Reasoning、Tool、Task 等成熟交互，但桌面端仍在 [`apps/desktop/src/App.tsx`](../../../apps/desktop/src/App.tsx) 中维护多套手写输入框、模型控件和消息过程渲染。现有 `WorkbenchMessageTimeline` 只覆盖部分过程消息，线上 `MessagePart` 与桌面 `WorkbenchMessagePart` 也存在结构差异。

结果是：

- 首页、AI 对话、专家 Agent、写作助手的消息和 composer 行为不完全一致。
- reasoning、plan、task、tool-call 的流式状态无法通过同一套组件渲染。
- 线上和 Tauri 端容易继续产生新的 JSX/CSS 分叉。
- 现有共享 UI 方案缺少对 AI Elements 组件族和完整过程消息协议的明确规格。

## Proposed Solution

在现有 `@aimarketing/workbench-ui` 基础上增加 AI Elements 风格的 host-neutral 组件族，并引入版本化的 `WorkbenchMessagePartV2`：

- 共享实现 Attachments、Message、Prompt Input、Reasoning、Plan、Task、Tool、Model Selector。
- 线上 SSE/AI SDK 与桌面 OpenCode/Tauri 事件均适配为 V2 parts。
- P0 入口统一使用共享对话组件：首页、AI 对话、专家 Agent、写作助手、创作工作台。
- P1 入口按专用布局接入：图片助手、视频/音频助手、工作流 Canvas。
- 保留现有 Workbench theme、CSS token、Tauri 本地文件和网络边界，不复制 Next.js 或 AI SDK runtime。

组件交互参考 [AI Elements 组件目录](https://elements.ai-sdk.dev/components)，其中 Message、Prompt Input、Plan、Model Selector 和 Attachments 均采用可组合、可访问、支持流式状态的设计。

## Dependencies

- `unify-web-desktop-workbench-ui`：现有 Web/Desktop 共享 Workbench UI 基础。
- `extract-shared-application-core`：共享客户端和 host ports。
- `add-local-opencode-workbench`：桌面 OpenCode/Tauri 运行时和本地会话边界。

## Capabilities

### New Capabilities

- `ai-elements-workbench-primitives`：共享 AI Elements 风格组件及其 host-neutral 组合契约。
- `workbench-message-parts-v2`：支持 reasoning、plan、task、tool-call、附件和产物的版本化消息 part 协议。

### Modified Capabilities

- `shared-workbench-ui-parity`：目标入口必须使用 AI Elements 共享组件，而不是仅复用基础 timeline。
- `desktop-workspace-parity`：桌面端必须消费 V2 parts，并通过 OpenCode/Tauri adapter 保留完整过程消息。

## Scope

### In Scope

- `packages/workbench-ui/src/ai-elements/` 组件源码和 CSS。
- `packages/workbench-client` 的 V2 message/part 类型及兼容解码。
- 线上 SSE 和桌面 OpenCode 事件适配器。
- P0/P1 入口的组件接入、旧 JSX/CSS 清理和回归测试。
- 键盘、ARIA、流式、失败、取消、恢复和会话隔离测试。

### Out of Scope

- 更换 Tauri、OpenCode、Next.js 或 AI SDK runtime。
- 把媒体和 Canvas 页面改造成普通聊天布局。
- 引入完整线上 Tailwind/shadcn 技术栈到桌面端。
- Agent 发布、市场、企业管理、计费和云同步。

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| `packages/workbench-ui` | Yes | 增加 AI Elements 组件族、共享 CSS 和导出入口 |
| `packages/workbench-client` | Yes | 增加 V2 message parts、版本和兼容解析器 |
| Online AI entry | Yes | SSE 事件转换为 V2 parts，替换线上重复 renderer |
| Desktop App | Yes | 接入共享 Prompt Input/Message/Process 组件，删除重复 composer |
| Tauri/OpenCode adapter | Yes | 保留 sequence、createdAt、tool input/output 和终态 |
| Database | No schema migration initially | 读取旧 flat content，逐步写入 `parts_json` 或等价版本字段 |
| Provider/API | No | 不改变 Provider 请求和网络边界 |

## Architecture Considerations

组件必须保持 host-neutral：不得导入 Next navigation、Tauri invoke、SQLite、Provider SDK 或网络请求。入口通过 typed props 和 adapter actions 注入提交、停止、重试、复制、文件打开和模型选择行为。

消息协议结构参考 AI SDK `UIMessage.parts`，但不直接让桌面端依赖 `useChat`。事件适配器负责将线上 SSE 与 OpenCode/Tauri 事件转换为同一 V2 parts；UI 只消费结构化数据。

AI Elements 官方组件以源码组件方式安装，Model Selector 基于可搜索命令面板，Plan 支持折叠和流式状态，Attachments 支持 grid/inline/list。项目应迁移这些交互契约，并复用现有 Workbench token，而不是复制独立设计系统。[Message](https://elements.ai-sdk.dev/components/message)、[Prompt Input](https://elements.ai-sdk.dev/components/prompt-input)、[Model Selector](https://elements.ai-sdk.dev/components/model-selector)、[Plan](https://elements.ai-sdk.dev/components/plan)、[Attachments](https://elements.ai-sdk.dev/components/attachments)

## Success Criteria

- [ ] P0 入口全部使用共享 Message、Prompt Input、Attachments、Reasoning、Plan、Task、Tool、Model Selector。
- [ ] Web 和 Desktop 共享同一套 V2 part 类型、顺序语义和组件 CSS。
- [ ] 流式 reasoning/plan/task/tool-call 不丢失、不重复，刷新后可恢复。
- [ ] Tool input/output/error/status、附件和本地产物均可查看或打开。
- [ ] 专家 Agent、AI 对话、写作助手和创作工作台会话归属保持隔离。
- [ ] 键盘、ARIA、窄屏、Tauri 文件和旧消息兼容测试通过。
- [ ] 删除目标入口中不再使用的重复 composer、model selector 和 process renderer。

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| 线上和桌面事件字段不一致 | High | High | 所有事件先进入 V2 adapter，UI 禁止读取原始事件 |
| 直接复制 AI Elements 引入依赖膨胀 | Medium | High | 源码迁移、复用已有基础组件和 Workbench token |
| 旧消息没有 parts | High | Medium | 读取时将 flat content 映射为 text part，不做破坏性迁移 |
| 共享组件影响多个入口 | Medium | High | 按 P0/P1 分阶段接入，每阶段有 route contract 和回滚边界 |
| 过程消息刷新后丢失 | Medium | High | 持久化 id、sequence、createdAt、status，并增加恢复测试 |
