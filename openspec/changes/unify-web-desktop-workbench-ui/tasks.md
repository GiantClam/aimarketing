## 1. Lock contracts before refactoring

- [x] 1.1 添加共享来源测试，证明 Web/Desktop 导入同一 message/workspace component 与 package CSS。
- [x] 1.2 将 Desktop `/dashboard/agent-platform` 从排除断言改为本地只读 route contract。
- [x] 1.3 添加结构化消息/时间线 RED tests：稳定时间、sequence、tool/status/usage/artifact 和 action。
- [x] 1.4 添加 Desktop SQLite `parts_json` round-trip 与旧记录兼容 tests。

**Quality Gate:** tests 先失败于缺失公共契约，而不是 fixture 或环境错误。

## 2. Establish shared message and style foundations

- [x] 2.1 扩展 `@aimarketing/workbench-client` message/part 与 ordered event contracts。
- [x] 2.2 扩展 Desktop repository/Tauri commands 读写 `parts_json`，保留旧 content fallback。
- [x] 2.3 在 `@aimarketing/workbench-ui` 实现公共 message timeline、actions 和 CSS export。
- [x] 2.4 Web 与 Desktop 对话 renderer 切换到公共 timeline，修复流式完成重写时间问题。

**Quality Gate:** shared UI/client、Web AI、Desktop client/storage tests、typecheck 通过。

## 3. Align Agent and Capability centers

- [x] 3.1 抽取共享 catalog grouping/search/filter/cards 与 availability reason UI。
- [x] 3.2 让线上 Agent/Capability 页面消费共享目录组件且 SaaS 行为不回归。
- [x] 3.3 注册 Desktop `/dashboard/agent-platform`，使用 canonical local Agent/Skill catalog，动作启动本地对话。
- [x] 3.4 让 Desktop 能力中心按 Windows capability policy 显示可执行与待配置能力，隐藏云/企业项。

**Quality Gate:** route、catalog、no-SaaS-boundary、keyboard/accessibility 与 local launch tests 通过。

## 4. Align workflow surfaces

- [x] 4.1 抽取线上 workflow list/metrics/cards/templates/recent-runs view model 与共享 UI。
- [ ] 4.2 抽取 Builder/Canvas 共享组件和 host-neutral persistence/run actions。
- [x] 4.3 Web 保持现有 `/dashboard/workflows` 行为，Desktop 切换到同一 list → Builder/Canvas flow。
- [ ] 4.4 删除 Desktop workflow list/canvas 分叉及对应重复 CSS。

**Quality Gate:** list/create/open/edit/save/run/recovery contract tests 与 Web/Desktop workflow E2E 通过。

## 5. Align image assistant

- [ ] 5.1 抽取线上图片助手的 session/chat/clarification/reference/task/candidate/canvas state contract。
- [ ] 5.2 实现 Web API 与 Desktop local media/file adapters，保证 provider/model/task shape 一致。
- [ ] 5.3 Desktop 接入 polling、restart recovery、候选结果、Canvas/layers 和本地导出。
- [ ] 5.4 删除 Desktop media/image assistant 分叉及对应重复 CSS。

**Quality Gate:** generate/edit/mask、引用图续接、失败重试、重启恢复、导出 tests 与 E2E 通过。

## 6. Prove parity and finish migration

- [ ] 6.1 对五个目标 route 运行相同 viewport 的 Web/Desktop 截图。
- [ ] 6.2 每轮视觉修改执行 visual verdict，保存 `.omx/state/workbench-ui-parity/ralph-progress.json`，最终分数至少 90。
- [ ] 6.3 运行 typecheck、lint、unit/integration、Rust、build 与关键 E2E。
- [ ] 6.4 检查并删除不再引用的 Desktop 页面分叉/CSS，记录允许差异与剩余风险。
- [ ] 6.5 严格校验 OpenSpec 并更新全部完成证据。

**Completion Gate:** 无目标 route 使用桌面私有副本；所有质量门禁通过且未宣称 release readiness。

## Current implementation evidence

- Shared message, Agent, Workflow directory, and Capability center tests are under `packages/workbench-ui/test/`.
- Web adapters: `components/workflows/workflow-list-page.tsx`, `components/platform/workspace-agent-platform-directory.tsx`, and `components/platform/workspace-capabilities-media-workspace.tsx`.
- Desktop Workflow list → Canvas screenshots: `output/playwright/desktop-workflows-shared.png` and `output/playwright/desktop-workflow-canvas.png`.
- Desktop Agent/Capability screenshots: `output/playwright/desktop-agent-platform-shared.png`, `output/playwright/desktop-capabilities-shared.png`, and `output/playwright/desktop-capabilities-voice.png`.
- Pending work remains explicitly unchecked: shared Builder extraction, duplicate CSS removal, full image assistant, and final five-route release verification.
