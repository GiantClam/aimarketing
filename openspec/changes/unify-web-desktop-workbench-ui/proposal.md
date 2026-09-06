## Why

Windows Desktop v1 已经具备可运行的本地宿主和若干工作台，但当前桌面 UI 仍在 `apps/desktop/src/App.tsx` 与 `styles.css` 中维护对话、媒体、工作流和资料库的独立实现。线上 `aimarketingsite.com` 则使用另一组 React 工作区，导致相同产品在消息时间线、图片助手、工作流、能力中心和智能体中心上持续分叉。仅复制 CSS 或 JSX 会把差异固化为第二套实现，无法满足后续同步维护。

本 change 把当前线上 `/dashboard/*` 作为 UI 与交互基线，将可复用 React、CSS、消息模型与页面状态机收敛到现有 `@coworkany/workbench-ui`，Web 与 Tauri 只保留宿主 adapter。它同时根据产品负责人的新批准，显式取代 `add-local-opencode-workbench` 中“Windows v1 不包含 Agent Platform/市场”的旧页面排除：Windows v1 新增只读本地智能体中心，但仍不包含发布、市场、企业管理或云绑定。

## What Changes

- 扩展 `@coworkany/workbench-ui` 为 Web/Desktop 共同消费的 React 与 CSS 单一来源，禁止在桌面复制线上工作区或建立第二个设计系统包。
- 建立结构化 `WorkbenchMessage` / message-part 时间线契约，保留创建时间、事件顺序、工具状态、usage、产物与消息操作；流式完成不得重写 `createdAt`。
- 让 Web 与 Desktop 复用对话消息组件和交互状态，由 Web API adapter 与 Tauri/OpenCode adapter 提供数据与动作。
- 让 Desktop `/dashboard/image-assistant` 复用线上图片助手的会话、澄清、引用图续接、任务轮询/恢复、候选结果、Canvas/layers 与导出交互；本地 adapter 负责文件与 provider 能力。
- 让 Desktop `/dashboard/workflows` 首屏与当前线上列表/指标/卡片/模板/最近运行一致，打开工作流后进入共享 Builder/Canvas。
- 让 Desktop 能力中心复用线上布局与交互，只呈现 Windows v1 可执行能力；未配置能力可见并说明配置要求，云/企业能力隐藏。
- 新增 Desktop `/dashboard/agent-platform` 本地只读智能体中心，复用线上分组、搜索、筛选和卡片；主动作是启动本地对话，缺失模型或依赖时展示原因。
- 增加共享来源、交互契约、同 viewport 截图和关键 E2E 门禁。

## Capabilities

### New Capabilities

- `shared-workbench-ui-parity`: Web 与 Desktop 的共享 React/CSS、结构化消息时间线与可证明的同源门禁。
- `desktop-local-agent-directory`: Windows v1 本地只读智能体中心及其能力/依赖可用性规则。

### Modified Capabilities

- `desktop-workspace-parity`: 对话、图片助手、工作流与能力中心以当前线上工作区为基线，并由宿主 adapter 提供不同运行能力。

## Scope

### In Scope

- 当前线上 `/dashboard/ai`、`/dashboard/image-assistant`、`/dashboard/workflows`、`/dashboard/capabilities` 和 `/dashboard/agent-platform` 的共享 UI/交互抽取。
- 现有 `@coworkany/workbench-ui`、`@coworkany/workbench-client`、Web adapters、Tauri adapters 与必要的本地 SQLite message parts 读写。
- Windows 本地只读 Agent/Skill catalog 和启动本地对话动作。
- 桌面分叉组件/CSS 的逐路由删除以及自动化 parity 证据。

### Out of Scope

- Agent 创建、发布、市场、企业管理、计费、身份或云同步。
- 改写当前线上 `/dashboard/workflows` 为新的 canvas-first 首页；首屏保持线上列表，Builder 才以 Canvas 为主。
- 引入新的 UI 框架、设计系统包或复制整块线上源码到桌面目录。
- Windows 安装签名和 clean-VM 发布结论。

## Impact

- 修改 `packages/workbench-ui` 与 `packages/workbench-client` 的公共契约。
- 修改线上工作区使其消费共享组件，同时保持 SaaS API 与行为不回归。
- 修改 Desktop route manifest、Tauri message repository、local adapters 和页面 composition。
- 删除或缩减 `apps/desktop/src/App.tsx`、`apps/desktop/src/styles.css` 中重复页面实现。

## Success Criteria

- [ ] Web 与 Desktop 对五个目标工作区共同消费 `@coworkany/workbench-ui` 导出的公共组件和 CSS。
- [ ] 消息创建时间在持久化、恢复和流式完成前后稳定；工具、usage、产物和状态按 sequence 显示。
- [ ] Desktop 图片助手支持线上交互状态和本地任务恢复/导出。
- [ ] Desktop workflows 首屏与线上 `/dashboard/workflows` 一致，Builder 以共享 Canvas 为主。
- [ ] 能力中心和本地智能体中心满足已批准的 Windows v1 能力过滤规则。
- [ ] 共享来源测试、交互 contract tests、typecheck、lint、unit/integration/E2E 通过。
- [ ] 同 viewport Web/Desktop 截图经 visual verdict 达到 90 分；只允许字体渲染、原生滚动条/文件选择器及已批准宿主能力差异。

## Risks

- 线上工作区体积很大，直接搬运会把 Next/API 依赖带入 Tauri；通过小步抽取 view/state contract 与 host adapters 控制风险。
- 公共消息类型扩展可能影响 SaaS adapter；先增加兼容字段与回归测试，再切换 renderer。
- 工作区同时重构可能使视觉回归难定位；按 route 切换，每个视觉迭代运行 verdict 并保存证据。
