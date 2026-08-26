## Context

线上页面是 thin route wrappers，但其客户端工作区直接耦合 Next navigation、SaaS API、浏览器 storage 与大量页面状态。Desktop 则通过 `WorkbenchClient`、Tauri invoke/listen 和本地 SQLite/OpenCode 工作。共享目标不是让两个宿主调用同一后端，而是让相同产品 surface 使用同一 view/state implementation，同时把网络、文件、导航、catalog 和任务执行留在 adapter。

## Goals / Non-Goals

**Goals:**

- 一个已有 package 承载共享 React、CSS、页面模型和交互状态。
- Web/Desktop 的差异只存在于显式 host ports 和 capability flags。
- 消息、图片任务、工作流和 catalog 的 persisted/domain contract 可恢复、可测试。
- 每个 route 独立切换并在删除分叉前有回归证据。

**Non-Goals:**

- 把 Next server code、SaaS auth 或 Web API routes 打进桌面 bundle。
- 用 iframe/远程网页替代本地绿色版工作台。
- 在本 change 重新设计线上信息架构。

## Decisions

1. **扩展现有 `@aimarketing/workbench-ui`。** 公共组件、页面状态和 CSS 均从该 package 导出；不创建平行 design-system/workspace package。选择已有 package 可复用现有 route/icon/theme 契约并减少迁移层。
2. **Ports 包围共享工作区。** Navigation、conversation/run、image task、workflow persistence、catalog、file/export 等均通过 typed props/clients 注入。共享 UI 不导入 Next route、Tauri API、SQLite 或 provider SDK。
3. **结构化消息为 canonical model。** `WorkbenchMessage` 包含固定 `createdAt` 与有序 parts。文本、tool、status、usage、artifact/source/report 均是 part；旧 flat content 仍可映射为 text part。事件 sequence 与 timestamp 不能在 adapter 中丢失。
4. **按 route 纵向切换。** 顺序为消息基础 → 对话 → Agent Center/能力目录 → workflow list/builder → 图片助手。每个 route 在同源测试、交互测试和视觉证据通过后删除桌面旧实现。
5. **线上 workflow list 是入口基线。** `/dashboard/workflows` 不直接替换为整屏 Canvas；用户打开/新建工作流后进入共享 Builder/Canvas。
6. **显式 capability policy。** Desktop 隐藏云/企业/发布动作；本地支持但未配置的能力保留卡片并返回结构化 unavailable reason。Agent Center 只读，启动动作导航到本地对话并携带 agent/skill 标识。
7. **CSS 与组件共同同源。** 仅共享 class 名不足以证明同源；两个宿主必须导入 package CSS export，并由 provenance test 禁止目标路由回退到桌面副本。

## Data and Interface Changes

- `WorkbenchMessage.parts?: readonly WorkbenchMessagePart[]`
- `WorkbenchMessage.status?: WorkbenchRunStatus`
- 每个 part 具有稳定 id/type；运行事件相关 part 保留 `sequence`、`createdAt` 与状态。
- Desktop `messages.parts_json` 读写上述结构；旧记录在读取时生成 text part，不做破坏性迁移。
- Shared workspace props 接收 locale、model/capability state 与 host actions；host actions 返回 domain objects，不返回宿主 UI。

## Migration Plan

1. 以 RED tests 锁定公共 message renderer、parts round-trip、Agent route 和 CSS provenance。
2. 增量扩展公共 types 与 SQLite command，保证旧 flat records 兼容。
3. 将共享组件接到 Web，验证线上行为不变。
4. 将相同组件接到 Desktop adapters，逐 route 替换旧组件。
5. 删除确认不再引用的桌面实现与 CSS，并执行全量验证。

## Risks / Trade-offs

- 公共 package 可能变成大杂烩：按 domain 文件组织、host-neutral，公共入口只导出稳定 surface。
- SQLite JSON schema 漂移：parts 解码必须 fail-safe，未知 part 保留或降级为文本，而不是阻断会话。
- 截图像素存在 Windows WebView 字体差异：verdict 允许明确列出的渲染差异，但结构、间距、颜色与交互状态必须一致。

## Rollback

每个 route 保持独立 adapter 和提交边界；若某 route 未通过门禁，只回退该 route 的 composition，不撤销已验证的公共消息/类型基础。现有 SQLite content 列继续保留，parts_json 为向后兼容扩展。
