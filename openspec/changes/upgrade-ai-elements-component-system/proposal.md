# Proposal: Upgrade the AI Marketing Workbench to the Official AI Elements Component System

**Change ID:** `upgrade-ai-elements-component-system`
**Created:** 2026-08-21
**Status:** Draft

---

## Problem Statement

当前项目已经有 `WorkbenchPromptInput`、`WorkbenchModelSelector`、`WorkbenchAttachments`、消息 timeline、Reasoning、Plan、Task、Tool 等共享实现，但 AI Entry、Writer、Knowledge、Image Assistant、Workflow、媒体工作区和 Dify Chat 仍存在大量页面级 `Select`、`Popover`、`Command`、Dialog、状态卡和结果卡。

这会造成三类问题：

- 输入框之外的消息、推理、工具审批、计划、任务、产物、来源、语音和工作流交互无法保持同一套 AI 体验。
- 当前自定义 `Ai*`/`Workbench*` 实现逐渐形成平行 API，与 AI Elements 官方组件的组合方式和状态语义分叉。
- Web 与 Tauri 共享了部分 token，但页面仍可能重复实现行为和 CSS，导致键盘、窄屏、流式恢复和视觉 parity 回归。

AI Elements 官方文档将组件按 Chatbot、Code/Artifact、Voice、Workflow、Utilities 分域，并以可组合源码形式提供 `PromptInput`、`Conversation`、`Message`、`Reasoning`、`Plan`、`Task`、`Tool`、`ModelSelector`、`Canvas` 等组件。本 change 将现有计划转换为可执行的正式规格：采用官方组件源码作为交互契约，同时保留 AI Marketing 的品牌色、网格背景、字体和 Workbench 业务布局。

## Proposed Solution

1. 将经过审查的 AI Elements 官方源码纳入 `packages/workbench-ui/src/ai-elements/`，按官方组件边界拆分，不再扩展单文件自定义 `Ai*` API。
2. 保留 `Workbench*` 迁移期兼容导出，但其内部改为官方组件组合；业务 adapter 只负责把现有消息、附件、任务、媒体和工作流数据映射为官方 props/parts。
3. 以 `PromptInput` + `Attachments` 统一 Composer，以 `Conversation` + `Message` 统一会话，以 `Reasoning`/`ChainOfThought`/`Plan`/`Task`/`Tool`/`Confirmation` 统一 AI 过程和审批。
4. 将 `Context`、`ModelSelector`、`Sources`、`InlineCitation`、`Artifact`、`CodeBlock`、`Image`、`OpenInChat` 接入上下文、产物和引用链路。
5. 按需接入 `Agent`、Queue/Checkpoint、Voice 组件和 React Flow Workflow 组件；可选依赖实行组件级门禁，不提前安装完整示例依赖。
6. 用 `WORKBENCH_THEME` 和 CSS variables 覆盖官方组件样式，保留品牌黄色 canonical token、黑白层级、显示字体、clipped-corner 和网格识别点。
7. 按 Phase 0–6 逐域迁移，并用 SSR、键盘、流式、E2E、视觉和 Web/Tauri parity 检查作为阶段停止条件。

官方依据：[AI Elements Components](https://elements.ai-sdk.dev/components)、[Prompt Input](https://elements.ai-sdk.dev/components/prompt-input)、[Message](https://elements.ai-sdk.dev/components/message)、[Canvas](https://elements.ai-sdk.dev/components/canvas)。

## Scope

### In Scope

- `packages/workbench-ui/src/ai-elements/` 官方组件源码、共享导出、WorkBench token 和必要的 client boundaries。
- AI Entry 的 PromptInput、Attachments、ModelSelector、Context、Conversation、Message、Reasoning、Plan、Task、Tool、Sources、Artifact。
- Shell 中与 AI 相关的 Conversation、Queue、Checkpoint、Confirmation 语义；保留 `WorkbenchShellFrame` 作为业务壳。
- Agent 目录/配置、能力中心、任务中心、工作流目录和工作流 Canvas。
- Image Assistant、音频/语音工作区、Writer、Knowledge/Assets、Dify Chat 和 Code/Runtime 产物。
- `ai-entry-adapter`、`message-parts-adapter`、`media-adapter`、`workflow-adapter`、`desktop-adapter`。
- 官方源码审查、组件级依赖门禁、迁移期 alias、组件/集成/E2E/视觉测试和迁移文档。

### Out of Scope

- AI provider routing、model policy、reasoning policy、SSE 协议、任务轮询、数据库 schema、API route 或 Tauri/OpenCode runtime 的替换。
- 将普通业务 UI 强行改造成 AI Elements 组件。
- 一次性安装或使用所有 Code、Voice、Persona、Sandbox、tokenlens、Shiki、media-chrome 等可选依赖。
- 把媒体工作区或 Workflow Canvas 改造成普通聊天页面。
- 新增另一套第三方 AI UI 库或新的页面级 `Ai*` 组件 API。

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| `packages/workbench-ui` | Yes | 纳入官方组件源码、主题 token、公共导出和兼容组合 |
| `packages/workbench-ui/src/adapters` | Yes | 增加业务数据到官方 props/parts 的显式映射 |
| `app/globals.css` | Conditional | 仅在采用 `MessageResponse` 等组件时增加官方依赖的 source 扫描配置 |
| `package.json`/lockfile | Conditional | 按实际使用组件审查并引入依赖，不安装未使用模块 |
| AI Entry | Yes | 替换页面级 Composer、模型/知识库/附件控件和消息容器 |
| Shell/Agent/Capability/Task | Yes | 对齐 AI 会话、Agent、队列、审批、任务和产物状态 |
| Workflow/Media/Image/Writer/Knowledge/Dify | Yes | 按专用布局接入对应官方组件，不改变业务工作流 |
| Web/Tauri host | Yes | 共享组件与 token；host 只提供数据、导航、文件和执行 callbacks |
| Database/API/Provider | No | 保持现有数据、协议和网络边界 |

## Architecture Considerations

### Official source boundary

官方组件通过组件级 CLI 源码注入项目。每次引入必须在隔离分支审查生成源码、依赖、Tailwind class、Radix primitive、client boundary 和许可证，再同步到 `packages/workbench-ui/src/ai-elements/`。页面不得直接依赖临时生成目录。

### Host-neutral composition

共享组件不得导入 Next navigation、Tauri invoke、SQLite、Provider SDK 或网络客户端。打开本地产物、发送、停止、重试、选择模型、设备权限等外部动作必须通过 typed props、callbacks 或 adapter interface 注入。

### Data mapping

不将所有 `WorkbenchMessagePart` 强行伪装为 AI SDK `UIMessage`。先建立显式 mapper，将 reasoning、plan、task、tool、source、citation、artifact、image、code 和未知 part 映射到官方组件；未知类型必须有安全 fallback，增量事件必须幂等合并。

### Theme and brand

官方组件只提供结构、语义、键盘和默认视觉状态；Workbench 通过 token、class、CSS variable、slot 和业务外壳覆盖主题。推荐 `#F4F254` 为 canonical brand yellow，现有 `#ffd000` 仅作为迁移 alias，最终页面不得散落硬编码品牌色。

### Optional dependency gates

- `MessageResponse`：只有确认采用 Streamdown 后才引入 `streamdown` 和 Tailwind source 配置。
- `CodeBlock`/JSX/Sandbox：只有 Code/Runtime 产物需要时才评估 Shiki 和运行时依赖。
- Voice/Persona：只有音频、录音、转录和角色可视化需要时才评估 media-chrome、Rive 和浏览器权限。
- `Context` cost：先消费已有 usage 数据，只有需要模型级成本计算时才评估 tokenlens。
- Workflow：优先复用仓库已有 React Flow 版本，版本不兼容时做 adapter，不重复安装第二套画布运行时。

## Success Criteria

- [ ] P0 AI Entry、对话、Agent、Writer 和创作工作台使用官方 PromptInput、Conversation、Message、Attachments、ModelSelector 和过程组件组合。
- [ ] P1/P2 组件域完成对应迁移：Queue/Checkpoint/Confirmation、Agent、Artifact/Code、Voice、Workflow Canvas 和 Image。
- [ ] Web 与 Tauri 共享同一组件源码导出、token、状态命名和核心键盘交互。
- [ ] reasoning/plan/task/tool 流式增量不丢失、不重复，刷新和恢复后顺序、状态、createdAt 保持一致。
- [ ] 发送、停止、重试、复制、打开产物、引用、文件上传/移除、工具审批等操作均通过 typed callback 保留原业务行为。
- [ ] 375px、768px、1024px、1440px 与 Tauri 1360x860 无关键横向溢出，普通文本对比度满足 WCAG AA，状态不只依赖颜色。
- [ ] lint、build、typecheck、workbench-ui 测试、adapter 测试、关键 E2E、视觉回归和共享边界检查通过。
- [ ] 迁移完成后删除页面级重复 AI 控件和 legacy 自定义实现，保留必要的 Workbench 业务 adapter。

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| 官方源码升级带来 prop/class/依赖变化 | Medium | High | 锁定源码快照和版本；升级前执行 source diff、类型、SSR、键盘和视觉回归 |
| 复制示例导致可选依赖膨胀 | Medium | High | 组件级依赖门禁；未使用的 Code/Voice/Persona/Sandbox 不进入基础包 |
| 自定义 message parts 与官方 parts 不完全一致 | High | High | 显式 mapper、未知类型 fallback、重复事件幂等和 V2 contract tests |
| 新旧 token 并存导致视觉漂移 | Medium | Medium | Phase 0 建立 token 表，禁止新增硬编码，按域删除旧样式 |
| PromptInput 迁移破坏中文 IME 或快捷键 | Medium | High | 先写 Enter/Shift+Enter/IME/stop tests，保留迁移期兼容导出 |
| Web/Tauri 专用能力被过度抽象 | Medium | High | 共享层只统一语义、状态和几何；媒体参数、Canvas、Shell 保留业务 slots |
