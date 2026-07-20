# Shared Agent Multi-Skill Runtime Phase 1 Implementation Plan

> **状态：ARCHIVED / RETIRED（2026-07-18）**。本方案曾用于 Cloudflare OpenCode Session/Skill Bundle；当前所有 Agent Runtime 已迁移 Railway，本文仅保留历史实现记录，不得作为当前部署、接口或存储依据。当前方案以 `docs/plans/2026-07-16-workflow-canvas-infinite-canvas-optimization-plan.zh-CN.md` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有 Agent 管理和界面的前提下，让智能体中台的共享 Agent 在 Cloudflare OpenCode 会话中同时加载多个同名可覆盖 Skill，并通过私有 R2 bundle 与会话本地缓存避免每轮重复装载。

**Architecture:** 现有 Agent 管理、`skillBindings`、Agent 路由和 Skill registry 继续是第一阶段的唯一控制面。Next.js 从这些现有定义编译并直接覆盖私有 R2 中同一 Agent 的 Skill Set bundle；Cloudflare Session Durable Object 固定 Agent 与 Skill 名称选择，Sandbox 将当前 bundle 解包为多个 OpenCode Skill 目录并在活跃会话缓存。第一阶段不新增 Skill 管理、Agent 管理、审计或相应 UI。

**Tech Stack:** Next.js 15、TypeScript、现有 Postgres Custom Agent Store、R2 S3 API、Cloudflare Workers、Cloudflare Sandbox SDK `0.12.3`、Cloudflare Containers、Durable Objects、OpenCode、SSE。

## Global Constraints

- 仅覆盖智能体中台的 `agency-*`、`business-*`、现有企业自定义 Agent 及其轻量文本 Skill。
- **绝不迁移、重构、动态加载或修改** `ppt-master`、`dashi-ppt-skill`、`executive-ppt`、`executive-presentation-ppt` 的容器、工作区、质量检查、artifact 或回退链路。
- Writer、Lead Hunter、图像助手、视频助手和 Workflow executor 不在本计划范围内。
- 不新增 Skill 管理页面、Skill CRUD、Agent CRUD、Agent 版本管理、审计表、审计 API 或管理端 UI 改动。
- 复用现有 `enterprisePlatformCustomAgents.skillBindings`、`lib/ai-entry/skill-registry.ts`、`lib/ai-entry/skill-router.ts`、`lib/ai-entry/agent-runtime-policy.ts` 和现有 Agent UI。
- 保持 AI Entry URL、`/api/ai/chat` 请求形状、业务入口、模型选择、计费、artifact 发布和 native fallback 行为不变。
- Shared Skill 仅允许 UTF-8 文本：`SKILL.md`、Markdown reference、JSON/YAML manifest；禁止脚本、二进制、依赖安装、MCP 安装与自定义可执行文件。
- OpenCode 不得访问数据库、Supabase service key、支付密钥、平台管理密钥或其它会话目录。
- 不引入第三方 warm-pool 依赖；预热默认关闭。
- 不存在 Skill Version、Skill 发布、Skill 回滚或历史版本读取；同名 Skill 更新直接覆盖当前 R2 对象，只保证新会话或容器恢复使用新内容。
- 每个提交必须遵守仓库 Lore Commit Protocol。

---

## 1. 范围与裁决

### 1.1 覆盖范围

| 分类 | 当前来源 | Phase 1 行为 |
| --- | --- | --- |
| 导入专家 Agent | `content/skills/agency-agents/**`，`agency-*` | 保持现有 catalog/import loader；运行时将已解析角色和已允许 Skill 编译为 bundle。 |
| 本地业务专家 | `content/skills/business-agents/**`，`business-*` | 保持现有入口和提示词；运行时使用其路由出的多个 Skill。 |
| 企业自定义 Agent | `enterprisePlatformCustomAgents` | 保持现有 CRUD 和界面；已有 `skillBindings` 决定可装载 Skill。 |
| 通用轻量 Skill | 已注册的 `content/skills/*/SKILL.md` | 只读编译为 R2 runtime bundle，不提供新增、编辑、删除或发布界面。 |

### 1.2 明确排除

| 项目 | 必须保持的边界 |
| --- | --- |
| `ppt-master` | 继续使用当前 Python/SVG/PPTX/字体/质量循环和专用 runtime；不读取本方案的 bundle bucket。 |
| `dashi-ppt-skill` | 继续使用当前 Playwright、浏览器、项目工作区和专用 OpenCode 权限；不读取本方案的 bundle bucket。 |
| `executive-ppt` / `executive-presentation-ppt` | runtime gateway 始终走 dedicated route。 |
| Writer / Lead Hunter / Image / Video / Workflow | 继续使用既有 engine、存储和业务流程。 |

### 1.3 关键裁决

1. **不创建 Skill Group。** OpenCode 可以同时加载多个 `.opencode/skills/<skill-id>/SKILL.md`；现有 `selectedSkillIds: string[]` 已是多 Skill 契约。
2. **不创建新的 Skill Store 控制面。** R2 在第一阶段只负责运行时分发和缓存，不是用户可管理的 Skill 数据库。
3. **运行时 bundle 单位是当前 Agent + 当前允许 Skill 集合。** R2 key 由企业范围、Agent ID 与排序后的 Skill 名称集合决定；不同 Skill 组合绝不覆盖彼此，同名 Agent/Skill 更新只覆盖对应组合 key。
4. **会话固定 Agent，不固定 Skill 集合或内容版本。** 每轮按当前输入重新解析 Skill；同一 `sessionKey` 缓存已装载的多个 Skill Set，容器恢复后重新读取当前轮所需的同名 bundle。
5. **上游 Agent frontmatter 不可信。** 只提取角色正文；运行时 Agent 文件由平台模板生成，不继承 upstream `tools`、`permission` 或 provider 配置。

---

## 2. 目标运行时

```text
现有 AI Entry / Business Agent 入口
  -> 现有 agent router + skill router + custom Agent skillBindings
  -> resolveSharedSkillSetSelection()
  -> stable sessionKey
  -> SessionCoordinator
  -> ensureSharedSkillSet(selection)
       -> ready.json 命中：零 R2 读取
       -> 未命中：一次私有 R2 bundle 读取、checksum 校验、原子安装
  -> OpenCode 同时发现多个 .opencode/skills/<skill-id>/SKILL.md
  -> SSE 返回 agent resolved 与实际 Skill 调用状态
```

```ts
export type SharedSkillSetSelection = {
  runtimeKind: "shared-agent"
  agentId: string
  skills: Array<{ id: string; position: number }>
  skillSetId: string
  bundleKey: string
}
```

### 2.1 Bundle 内容与私有存储

R2 bucket：`aimarketing-shared-agent-runtime`，私有且无公开域名。

```text
shared-agent-skillsets/{enterprise-or-global}/{agent-id}/{skill-set-id}.json
```

```ts
type SharedSkillSetBundle = {
  schemaVersion: 1
  agent: { id: string; instructions: string }
  skills: Array<{
    id: string
    position: number
    files: Array<{ path: "SKILL.md" | `references/${string}`; content: string }>
  }>
  checksum: string
}
```

- `skillSetId` 只由 `sorted(skillIds)` 计算，用于区分不同名称集合，不表达内容版本或回滚语义。
- bundle 每次同步或懒生成都计算当前 checksum；同一 `agentId + skillSetId` 的内容变化时直接覆盖该 key，内容未变化时不写入。
- 内置 Skill 文件变更后，`sync-shared-agent-skill-bundles.ts` 必须重编译全部当前内置 Agent/SkillSet 组合；Custom Agent 在下次实际调用时按当前内容懒重编译。
- Next.js 服务端使用已有 `@aws-sdk/client-s3` 和仅有该 bucket 最小权限的 Vercel secret 写入；浏览器与 Sandbox 均不持有 R2 credential。
- Cloudflare Worker 只通过 `SHARED_AGENT_SKILL_BUNDLE_BUCKET` binding 读取 bundle。
- bundle 最大 512 KiB；路径只能为 `SKILL.md` 或 `references/` 下的相对文本文件。
- Phase 1 不做对象历史、引用计数、GC、管理界面、删除或审计。

### 2.2 会话生命周期与性能

- 共享 Agent Sandbox ID 必须由 `enterprise + user + conversation + agent` 的稳定 `sessionKey` 派生，不能由 `runId` 派生。
- 共享 Agent 默认 `keepAlive: false`、`sleepAfter: "15m"`；通过 `SHARED_AGENT_SESSION_SLEEP_AFTER` 可调整为 5-30 分钟。
- 仅后台长任务临时 `setKeepAlive(true)`，在 `finally` 中 `setKeepAlive(false)`；PPT/Dashi 的当前 keepAlive 行为不变。
- Session DO 固定 `agentId` 并持久化 `latestCheckpoint`，但每轮接收并校验当前 `sharedSkillSetSelection`；同一 Agent 下不同 `skillSetId` 可以共存于同一会话。
- checkpoint 必须排除 `.opencode/skills` 和 `.platform/shared-skill-cache`。容器睡眠后先 restore 业务 workspace，再读取当前同名 bundle；恢复失败时清理不完整目录并重新装载当前 bundle。
- 用户明确选择共享 Agent 后立即调用非阻塞 `prepare-session`，预热同一 `sessionKey` 的 Container、OpenCode 进程和 bundle 本地缓存。`forcedAgentId` 业务入口视为已明确选择，可在进入该入口时预热；历史会话列表、未选择 Agent 的页面加载与 PPT 路由不得触发预热。
- `prepare-session` 不调用模型、不创建 artifact、不写对话消息；失败只记录运行时事件，正式发送仍按正常路径执行。
- 不使用 R2 FUSE 作为在线 Skill 目录；R2 是持久层，Sandbox 本地只读目录是热路径。

Cloudflare 官方说明：Sandbox 睡眠后本地文件、进程和 shell 状态都会丢失；R2/backup 才能恢复状态。[Sandbox lifecycle](https://developers.cloudflare.com/sandbox/concepts/sandboxes/)；[Backups](https://developers.cloudflare.com/sandbox/api/backups/)。

---

## 3. OpenCode Runtime 契约与权限

在 `AgentRuntimeInputV2` 增加可选字段：

```ts
sharedSkillSetSelection?: SharedSkillSetSelection | null
```

规则：

- 只有共享 Agent 可以传入 selection；`executive-ppt` 和 `executive-presentation-ppt` 传入时返回 `runtime_shared_selection_forbidden`。
- `ensureSharedSkillSet()` 校验 checksum、路径白名单、重复 Skill ID 后写入 `${sessionDir}/.platform/shared-skill-cache/${skillSetId}`；完成后原子 rename 并写 `ready.json`。
- 活跃容器命中当前 `skillSetId` 的 `ready.json` 时不得读取 R2；新的 Skill Set 只读取一次。容器恢复后按当前轮 selection 读取当前稳定 R2 key，并解包为多个 `.opencode/skills/<skill-id>/`，而非把所有 Skill 拼成一个 system prompt。
- runtime Agent 文件只包含平台生成的 instructions 和可见 Skill 列表；不得直接复制 `agency-agents` 的 frontmatter。
- shared runtime 只允许 `skill/read/glob/grep/list`；`bash/edit/external_directory`、任意安装、任意 MCP 默认 deny。Dedicated PPT/Dashi config 不变。

### 3.1 SSE 状态

```ts
| { event: "agent_resolved"; agentId: string; runId: string }
| { event: "skill_activated"; skillId: string; runId: string }
| { event: "skill_completed"; skillId: string; runId: string }
| { event: "skill_failed"; skillId: string; message: string; runId: string }
```

- resolver 发送 `agent_resolved`。
- OpenCode `tool_event.tool === "skill"` 时读取 `args.name`/`input.name`；仅名称匹配 selection 中 `skills[].id` 时发送 Skill 生命周期事件。
- 名称缺失或未知时保留通用 `tool_event`，不得声称调用了某个 Skill。
- 聊天 UI 可显示本轮 Agent、已解析 Skill 和实际激活 Skill，但不修改 Agent 管理页面或既有 Agent 选择方式。

---

## 4. 实施任务

### Task 1: 从现有 Agent/Skill 定义解析多 Skill Selection

**Files:**
- Create: `lib/ai-entry/shared-agent-skill-resolver.ts`
- Modify: `lib/skills/runtime/ai-entry-consulting.ts`
- Modify: `lib/ai-entry/runtime/context-builder.ts`
- Modify: `lib/ai-runtime/contracts.ts`
- Test: `lib/ai-entry/shared-agent-skill-resolver.test.ts`

- [ ] 写失败测试：`agency-*`、`business-*` 和 custom Agent 各返回有序 Skill 列表；PPT/Dashi 返回 `null`；未知 `skillBindings` 被过滤。
- [ ] 复用现有 `loadExecutiveSkillForAgent()`、`routeAiEntrySkills()`、`getAiEntrySkillsByIds()` 和 custom Agent `skillBindings`，生成 canonical `SharedSkillSetSelection`。
- [ ] 以企业范围、Agent ID 和 `sha256(JSON.stringify(sorted(skillIds)))` 构造稳定 `skillSetId` 与 `bundleKey`；该 hash 只标识名称集合，Skill 内容不产生版本号或指纹。
- [ ] 不新增数据库表；每轮都生成当前 selection，Session DO 只固定 `agentId` 并允许同一 Agent 的多个 `skillSetId`。
- [ ] 运行：`tsx --test lib/ai-entry/shared-agent-skill-resolver.test.ts lib/ai-entry/runtime/context-builder.test.ts`；预期：PASS。
- [ ] 提交（Lore Protocol）：意图行 `Resolve existing agents into stable multi-Skill runtime inputs`。

### Task 2: 编译私有 R2 Skill Set bundle，不新增管理能力

**Files:**
- Create: `lib/ai-entry/shared-agent-skill-bundle.ts`
- Create: `lib/ai-entry/shared-agent-skill-bundle-store.ts`
- Modify: `scripts/validate-skill-files.js`
- Create: `scripts/sync-shared-agent-skill-bundles.ts`
- Test: `lib/ai-entry/shared-agent-skill-bundle.test.ts`

- [ ] 写失败测试：`../x`、`scripts/run.sh`、二进制、重复 path、超过 512 KiB、上游 `tools` frontmatter 均被拒绝或净化。
- [ ] 实现 `buildSharedSkillSetBundle(selection)`，输出一个包含多个 Skill 的 canonical JSON，并计算 checksum。
- [ ] 实现 `upsertSharedSkillSetBundle(selection)`：比较当前 bundle checksum，内容变化才覆盖同一 `agentId + skillSetId` R2 key；不提供 update/delete/list 管理 API。
- [ ] `sync-shared-agent-skill-bundles.ts` 对当前内置 Agent 的全部 SkillSet 组合执行重编译；Custom Agent 在首次实际调用时懒生成，并在当前 checksum 与 R2 对象不同时覆盖。
- [ ] 写回归测试：同一 Agent 的不同 Skill 集合生成不同 key；单个同名 Skill 内容改变后，所有引用它的内置组合 bundle checksum 改变。
- [ ] `lint:skills` 为共享候选运行文本校验；PPT/Dashi 通过明确 exclude list 保持原样。
- [ ] 运行：`pnpm lint:skills && tsx --test lib/ai-entry/shared-agent-skill-bundle.test.ts`；预期：PASS。
- [ ] 提交（Lore Protocol）：意图行 `Distribute existing multi-Skill agents through replaceable runtime bundles`。

### Task 3: 在 Cloudflare Session Runtime 装载与缓存 bundle

**Files:**
- Create: `infra/cloudflare/opencode-runner/src/shared-agent-skill-loader.ts`
- Modify: `infra/cloudflare/opencode-runner/src/workspace-v2.ts`
- Modify: `infra/cloudflare/opencode-runner/src/session-coordinator.ts`
- Modify: `infra/cloudflare/opencode-runner/src/opencode-server.ts`
- Modify: `infra/cloudflare/opencode-runner/wrangler.jsonc`
- Test: `infra/cloudflare/opencode-runner/src/shared-agent-skill-loader.test.ts`

- [ ] 写测试：首次 run 只读一次 R2；同一 `skillSetId` 的第二轮零读取；新的 `skillSetId` 只读一次后进入同一会话 cache；checksum 不一致失败；PPT/Dashi 从不调用 loader。
- [ ] 新增私有 `SHARED_AGENT_SKILL_BUNDLE_BUCKET` binding；Worker 从 binding 读取，不向 Sandbox 注入 R2 credential。
- [ ] 一个 bundle 解包为多个 `.opencode/skills/*` 和一个平台模板 Agent 文件；所有文件完成才写 `ready.json`。
- [ ] shared runtime 使用 `keepAlive: false` 与 `SHARED_AGENT_SESSION_SLEEP_AFTER`；Dedicated runtime 代码路径和配置保持不变。
- [ ] Session DO 固定 Agent 并记录已装载 `skillSetId`，checkpoint 排除 Skill cache；后续 null-checkpoint 自动恢复后按当前轮 selection 重新读取当前 bundle。
- [ ] 运行：`cd infra/cloudflare/opencode-runner && npm test && npm run typecheck`；预期：PASS。
- [ ] 提交（Lore Protocol）：意图行 `Cache multi-Skill bundles inside stable shared sessions`。

### Task 4: 最小权限、真实 Skill 事件与对话展示

**Files:**
- Modify: `infra/cloudflare/opencode-runner/src/opencode-server.ts`
- Modify: `infra/cloudflare/opencode-runner/src/opencode.ts`
- Modify: `lib/ai-entry/agent-runtime-policy.ts`
- Modify: `lib/ai-runtime/contracts.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `components/ai-entry/ai-entry-workspace.tsx`
- Create: `components/ai-entry/message-parts/skill-activity-part-view.tsx`
- Modify: `lib/ai-entry/message-parts/reducer.ts`
- Test: `infra/cloudflare/opencode-runner/src/opencode.test.ts`
- Test: `app/api/ai/chat/route.test.ts`

- [ ] 测试 shared runtime 允许 `skill/read/glob/grep/list` 并拒绝 `bash/edit/external_directory/MCP`；PPT/Dashi 权限快照不变。
- [ ] 仅对 selection 内的 Skill 名称发送 activated/completed/failed；未知名称保留通用工具事件。
- [ ] AI Entry 显示“已解析”与“已实际调用”的不同状态；不改 Agent 管理和 Agent 选择界面。
- [ ] 运行：`tsx --test infra/cloudflare/opencode-runner/src/opencode.test.ts app/api/ai/chat/route.test.ts`；预期：PASS。
- [ ] 提交（Lore Protocol）：意图行 `Show governed multi-Skill activity without changing agent management`。

### Task 5: 可选预热、灰度与回归验证

**Files:**
- Create: `infra/cloudflare/opencode-runner/src/shared-agent-prewarm.ts`
- Create: `scripts/shared-agent-runtime-smoke.ts`
- Modify: `infra/cloudflare/opencode-runner/src/index.ts`
- Modify: `infra/cloudflare/opencode-runner/wrangler.jsonc`
- Test: `infra/cloudflare/opencode-runner/src/shared-agent-prewarm.test.ts`

- [ ] 预热默认关闭；`SHARED_AGENT_PREWARM_ENABLED=true` 时，用户明确选择 Agent 或通过 `forcedAgentId` 进入业务入口后，预热同一 `sessionKey` 的 Container、OpenCode 进程和当前首轮 Skill Set bundle 本地缓存。
- [ ] `prepare-session` 不调用模型、不创建 artifact、不写对话消息；测试同一 Agent selection 预热幂等、失败不阻塞正式 run、PPT/Dashi 永不预热。
- [ ] 不实现全局 Top-N warm pool、不预热未选择 Agent、不永久 `keepAlive` 容器。
- [ ] smoke 记录 container cold start、bundle miss、bundle hit 的首事件时间，并断言活跃容器 hit 无 R2 read。
- [ ] 通过 `AI_ENTRY_SHARED_AGENT_RUNTIME_ENABLED` 和 `AI_ENTRY_SHARED_AGENT_ALLOWLIST` 灰度 10 个 marketing/business Agent；关闭 flag 时回退现有 loader/runtime。
- [ ] 验证新会话、三轮连续对话、休眠恢复，以及 PPT preview/export、Dashi、Writer、Lead Hunter、native fallback 无回归。
- [ ] 运行：`pnpm lint && pnpm build && pnpm test:ai-entry:chat-interaction && pnpm test:e2e:ai-entry:agent-selection:ui`；预期：PASS。
- [ ] 提交（Lore Protocol）：意图行 `Roll out cached multi-Skill sessions without altering existing management`。

---

## 5. 验收标准

- 不新增 Skill 管理、Agent 管理、审计表、审计 API 或管理端 UI；现有 Custom Agent CRUD 和 `skillBindings` 继续工作。
- 一个共享 Agent 可同时加载多个独立 OpenCode Skill 目录，无 Skill Group 数据模型或运行时概念。
- 同一 Agent 的不同 Skill 名称集合使用不同 bundle key；同名 Skill 内容覆盖后，下一次同步或懒生成会刷新全部受影响组合。
- 同一会话的 Agent 固定，但每轮重新解析当前 Skill 集合；已装载组合命中本地 cache，新组合按需装载一次。
- 同一活跃会话的第二轮不读取 R2 bundle；睡眠恢复后从当前同名 bundle 重建。
- 用户能区分 Agent/Skill 已解析与 Skill 实际调用；现有业务入口与 Agent 管理页面不变。
- `ppt-master`、`dashi-ppt-skill`、PPT Preview/Export、Dashi 会话、Writer、Lead Hunter 均不调用 shared resolver、bundle bucket、loader 或预热。
- 未绑定 Skill、脚本、二进制、MCP、跨企业 bundle 和非文本文件无法在 Sandbox 中加载。
- 预热默认关闭，关闭时功能仍完整；不会永久保活所有用户会话。

---

## 6. 依据与风险

- Cloudflare Containers 冷启动通常约 1-3 秒，容器磁盘在睡眠后是 ephemeral：[Containers FAQ](https://developers.cloudflare.com/containers/faq/)。
- Sandbox 支持稳定 ID、`sleepAfter` 与受控 `keepAlive`；后者会持续占用资源：[Sandbox options](https://developers.cloudflare.com/sandbox/configuration/sandbox-options/)。
- 社区 OpenCode Sandbox 通常持久化 `sandboxId`/`opencodeSessionId` 并用 R2 恢复工作区：[caelinsutch/opencode-sandbox](https://github.com/caelinsutch/opencode-sandbox)。

Phase 1 风险控制：R2 bundle 与当前定义不一致时以 checksum 失败并回退旧 runtime；上游 frontmatter 越权时净化并以平台模板生成 Agent；checkpoint 恢复失败时从当前 bundle 重建；冷启动延迟通过稳定 session 与按需预热缓解。同名覆盖意味着不存在历史复现或回滚能力；Skill/Agent 的独立版本管理、审计、发布/回滚和用户管理界面全部推迟到后续阶段。

## 7. 方案关系

本方案仅在智能体中台共享 Agent/Skill 运行时范围内补充：

- `docs/plans/2026-07-11-opencode-agent-conversation-skill-workflow-state-plan.zh-CN.md`
- `docs/plans/2026-07-09-saas-opencode-cloudflare-container-agent-optimization-plan.zh-CN.md`

它不覆盖对话状态、平台工具、Artifact、计费、Workflow 或复杂 PPT 专用 runtime 的既有裁决。发生冲突时，复杂专用 Skill 保持现状。
