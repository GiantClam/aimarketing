# Image Design Assistant MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MVP image design workspace that supports AI image generation/editing, canvas-based refinement, version history, and export inside the current dashboard product.

**Architecture:** Reuse the current dashboard workspace pattern and add a new session-based image assistant route family. Put AI generation and editing behind authenticated Next.js route handlers, persist sessions/versions/canvas data in Postgres via Drizzle, and store binaries in object storage. Keep canvas interaction browser-local and only sync structured layer data plus snapshots to the server.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, Postgres, R2/S3 object storage, Aiberm Gemini image API, `konva` + `react-konva`, Zod, existing enterprise permission system.

---

## 1. 排期假设

团队假设：

- 1 名全栈工程师
- 1 名前端工程师
- 1 名 QA/产品联调

节奏假设：

- 总工期：4 周
- 每周 5 个工作日
- 每周末保留 0.5~1 天回归与缓冲

交付目标：

- 第 2 周末跑通 AI 生成闭环
- 第 3 周末跑通 Canvas 闭环
- 第 4 周完成稳定性、权限、验收与上线准备

---

## 2. 里程碑总览

| 周次 | 目标 | 核心产出 |
|------|------|----------|
| Week 1 | 基础设施与工作台壳子 | 路由、权限、表结构、会话与素材上传 |
| Week 2 | AI 生图/改图闭环 | generate/edit 接口、结果卡片、版本树 |
| Week 3 | Canvas 精修闭环 | 画布、图层、自动保存、Canvas -> AI |
| Week 4 | 导出、验收、上线准备 | 导出、埋点、E2E、性能与错误处理 |

---

## 3. 任务拆解

### Task 1: 导航、权限与工作台路由

**Owner:** FE + FS  
**Estimate:** 2 天  
**Dependencies:** 无

**Files:**
- Create: `app/dashboard/image-assistant/page.tsx`
- Create: `app/dashboard/image-assistant/[sessionId]/page.tsx`
- Create: `components/image-assistant/image-assistant-workspace.tsx`
- Modify: `components/dashboard-layout.tsx`
- Modify: `lib/enterprise/constants.ts`
- Modify: `lib/runtime-features.ts`
- Modify: `lib/auth/guards.ts`

**Deliverables:**
- 新侧栏入口可见
- 新 feature key 生效
- 进入空工作台不报错
- 未授权用户看到正确的不可用状态

**Verification:**
- `pnpm exec eslint app components lib`
- `pnpm exec tsc --noEmit`

---

### Task 2: 数据表与迁移

**Owner:** FS  
**Estimate:** 2 天  
**Dependencies:** Task 1

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `scripts/run-image-assistant-migration.js`
- Modify: `package.json`

**Tables:**
- `image_design_sessions`
- `image_design_messages`
- `image_design_assets`
- `image_design_versions`
- `image_design_version_candidates`
- `image_design_canvas_documents`
- `image_design_canvas_layers`
- `image_design_masks`
- `image_design_exports`

**Deliverables:**
- 本地和测试库可执行迁移
- 能创建空会话记录
- 能保存基础素材和版本记录

**Verification:**
- `node scripts/run-image-assistant-migration.js`
- `pnpm exec tsc --noEmit`

---

### Task 3: Repository 与类型层

**Owner:** FS  
**Estimate:** 2 天  
**Dependencies:** Task 2

**Files:**
- Create: `lib/image-assistant/types.ts`
- Create: `lib/image-assistant/repository.ts`
- Create: `lib/image-assistant/config.ts`

**Deliverables:**
- 会话 CRUD
- 消息分页读取
- 版本树读取
- Canvas document 与 layers 读写

**Verification:**
- 新增脚本 smoke test 或临时验证脚本
- `pnpm exec tsc --noEmit`

---

### Task 4: 素材上传链路

**Owner:** FS + FE  
**Estimate:** 2 天  
**Dependencies:** Task 2

**Files:**
- Create: `app/api/image-assistant/assets/upload/route.ts`
- Create: `app/api/image-assistant/assets/[assetId]/complete/route.ts`
- Create: `components/image-assistant/reference-upload.tsx`
- Create: `components/image-assistant/asset-library.tsx`

**Deliverables:**
- 支持 PNG/JPG/WebP
- 单张大小限制与前端提示
- 最多 5 张参考图
- 参考图角色标记

**Verification:**
- 登录态下获取 presign 成功
- 上传完成后 asset 状态从 `pending` 变 `ready`

---

### Task 5: Aiberm Provider 适配与可用性接口

**Owner:** FS  
**Estimate:** 2 天  
**Dependencies:** Task 3

**Files:**
- Create: `lib/image-assistant/provider.ts`
- Create: `lib/image-assistant/aiberm.ts`
- Create: `lib/image-assistant/prompts.ts`
- Create: `app/api/image-assistant/availability/route.ts`

**Deliverables:**
- 高质量与低成本模型切换
- 文生图请求封装
- 图编辑请求封装
- provider 环境缺失时返回明确 reason

**Verification:**
- fixture 模式下 generate/edit 返回稳定假数据
- 配置缺失时 `/availability` 返回禁用原因

---

### Task 6: AI 生成与编辑接口

**Owner:** FS  
**Estimate:** 3 天  
**Dependencies:** Task 4, Task 5

**Files:**
- Create: `app/api/image-assistant/generate/route.ts`
- Create: `app/api/image-assistant/edit/route.ts`
- Create: `app/api/image-assistant/sessions/route.ts`
- Create: `app/api/image-assistant/sessions/[sessionId]/route.ts`
- Create: `app/api/image-assistant/messages/route.ts`
- Create: `app/api/image-assistant/versions/route.ts`

**Deliverables:**
- 生成成功后自动写消息、版本、候选图
- 编辑成功后继承父版本关系
- 失败时保留错误消息与可重试状态

**Verification:**
- 本地 smoke：空 prompt 返回 400
- fixture provider：文生图成功
- fixture provider：带参考图改图成功

---

### Task 7: Chat 工作台 UI 与结果卡片

**Owner:** FE  
**Estimate:** 3 天  
**Dependencies:** Task 1, Task 4, Task 6

**Files:**
- Create: `components/image-assistant/session-sidebar.tsx`
- Create: `components/image-assistant/version-tree.tsx`
- Create: `components/image-assistant/chat-panel.tsx`
- Create: `components/image-assistant/candidate-grid.tsx`
- Modify: `components/image-assistant/image-assistant-workspace.tsx`

**Deliverables:**
- 空状态
- 对话流
- 参考图缩略条
- 候选图卡片动作
- 版本树展示

**Verification:**
- 手动流程：输入 prompt -> 看到候选图 -> 切换会话 -> 恢复结果
- `pnpm exec eslint app components lib`

---

### Task 8: Canvas 基础能力

**Owner:** FE  
**Estimate:** 4 天  
**Dependencies:** Task 7

**Files:**
- Create: `components/image-assistant/canvas-panel.tsx`
- Create: `components/image-assistant/canvas-toolbar.tsx`
- Create: `components/image-assistant/layer-panel.tsx`
- Create: `components/image-assistant/property-panel.tsx`
- Create: `lib/image-assistant/canvas.ts`
- Modify: `components/image-assistant/image-assistant-workspace.tsx`

**Deliverables:**
- 候选图进入画布
- 文本、矩形、圆形、箭头、线条、图片贴图
- 图层排序、锁定、隐藏、删除
- 本地 undo/redo

**Verification:**
- 手动流程：进入画布 -> 添加 3 个图层 -> 调整顺序 -> 导航后恢复

---

### Task 9: Canvas 自动保存与版本保存

**Owner:** FE + FS  
**Estimate:** 2 天  
**Dependencies:** Task 8

**Files:**
- Create: `app/api/image-assistant/canvas/route.ts`
- Modify: `lib/image-assistant/repository.ts`
- Modify: `components/image-assistant/image-assistant-workspace.tsx`

**Deliverables:**
- 10 秒自动保存
- 手动保存版本
- revision 冲突保护
- 刷新后恢复最近画布状态

**Verification:**
- 手动流程：修改后等待 autosave -> 刷新页面 -> 状态恢复
- revision 冲突返回 `409`

---

### Task 10: Canvas -> AI 回流

**Owner:** FE + FS  
**Estimate:** 3 天  
**Dependencies:** Task 8, Task 9

**Files:**
- Create: `app/api/image-assistant/canvas-snapshot-edit/route.ts`
- Create: `components/image-assistant/mask-tool.tsx`
- Modify: `lib/image-assistant/aiberm.ts`
- Modify: `components/image-assistant/canvas-panel.tsx`
- Modify: `components/image-assistant/image-assistant-workspace.tsx`

**Deliverables:**
- 选区遮罩
- 导出快照 + mask
- 新候选图挂到版本树
- 支持“整图编辑”和“选区引导编辑”

**Verification:**
- 手动流程：画布框选 -> 输入指令 -> 新结果回到工作台

---

### Task 11: 导出与下载

**Owner:** FE + FS  
**Estimate:** 2 天  
**Dependencies:** Task 8, Task 9

**Files:**
- Create: `components/image-assistant/export-dialog.tsx`
- Create: `app/api/image-assistant/export/route.ts`
- Create: `lib/image-assistant/export.ts`

**Deliverables:**
- PNG / JPG / WebP
- 尺寸预设
- 透明背景导出
- 导出日志记录

**Verification:**
- 手动导出三种格式
- 导出记录可查询

---

### Task 12: 埋点、错误处理与稳定性

**Owner:** FS + FE  
**Estimate:** 2 天  
**Dependencies:** Task 6-11

**Files:**
- Modify: `components/image-assistant/*`
- Modify: `app/api/image-assistant/*`
- Create: `lib/image-assistant/analytics.ts`

**Deliverables:**
- 关键埋点补齐
- 网络失败重试
- 超时提示
- 上传与生成错误态统一

**Verification:**
- 人工断网或模拟 500 场景
- 校验前端提示与日志

---

### Task 13: E2E 验收与上线前回归

**Owner:** QA + FS  
**Estimate:** 3 天  
**Dependencies:** 全部完成

**Files:**
- Create: `scripts/image_assistant_e2e.py`
- Create: `scripts/run_image_assistant_e2e_with_server.py`
- Modify: `package.json`

**Deliverables:**
- fixture provider 模式 E2E
- provider missing 模式 E2E
- 产出截图与结果报告

**Verification:**
- `python scripts/run_image_assistant_e2e_with_server.py`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint app components lib`

---

## 4. 推荐周排期

## Week 1

- Task 1
- Task 2
- Task 3
- Task 4

**周目标:** 工作台能打开，会话和素材底座可用。

## Week 2

- Task 5
- Task 6
- Task 7

**周目标:** 能完成“上传参考图 -> 发起生成/编辑 -> 看到候选图 -> 存版本”。

## Week 3

- Task 8
- Task 9
- Task 10

**周目标:** 能完成“候选图 -> 进入画布 -> 保存 -> 回流 AI”闭环。

## Week 4

- Task 11
- Task 12
- Task 13

**周目标:** 能导出、能回归、能上线验收。

---

## 5. 并行建议

可以并行的工作：

1. 前端在 Week 1 后半段先做空工作台与静态三栏布局。
2. 后端在 Week 2 提前完成 provider abstraction 与 fixture mode。
3. QA 在 Week 2 即开始写 E2E 基础骨架，而不是等全部功能结束。

不可并行的关键依赖：

1. 迁移未完成前，不要开始真实 repository 联调。
2. Canvas 自动保存依赖画布结构稳定，不要过早固化接口。
3. Canvas -> AI 回流依赖导出快照能力，需在 Task 8 完成后进行。

---

## 6. 验收标准映射

| MVP 要求 | 对应任务 |
|----------|----------|
| 文字生成图片 | Task 5, 6, 7 |
| 上传垫图做图片编辑 | Task 4, 5, 6 |
| 多轮对话修改 | Task 6, 7 |
| 结果放入画布 | Task 7, 8 |
| 画布支持图形、文字、贴图 | Task 8 |
| 版本保存和导出 | Task 9, 11 |
| 当前画布再次送去 AI 编辑 | Task 10 |
| 错误提示、加载状态、失败重试完整 | Task 12 |

---

## 7. 风险与缓冲

建议保留 3 类缓冲：

1. Provider 波动缓冲：1 天
2. Canvas 交互修正缓冲：1 天
3. 上线前回归缓冲：1 天

若工期被压缩，优先级调整建议：

1. 保留 generate/edit + Canvas 基础 + 导出
2. 弱化复杂选区编辑
3. 暂时减少候选图数量与对比视图复杂度

---

## 8. 发布建议

发布分两段：

1. 内测发布
   - 仅开放给企业管理员或指定白名单
   - 使用 `image_design_generation` feature gate
2. 正式发布
   - 扩大成员权限
   - 打开全部导出能力

Plan complete and saved to `docs/plans/2026-03-15-image-design-assistant-mvp.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
