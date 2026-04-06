# Writer Memory + Soul Implementation Plan (Optimized)

> 在原方案目标不变的前提下，优化为“可灰度、可回滚、可量化”的分阶段落地路径，优先保证隔离正确性和链路性能。

## 1) 目标与范围（保持不变）

**Goal:** 在现有多助手工作台中落地统一 `memory + soul` 机制（Writer / Image / Expert Advisor / Lead Hunter），让助手跨会话持续学习用户偏好并稳定复用到后续生成；并且明确以 `userId + agentType` 为作用域键，实现“同一 agent 类型跨会话共享、不同 agent 类型严格隔离”。

**Scope Key:** `memory_scope = ${userId}:${agentType}`（存储与上报时可加 hash 变体，避免明文暴露）

**AgentType Allowlist:**
- `writer`
- `image`
- `brand-strategy`
- `growth`
- `company-search`
- `contact-mining`

## 2) 关键优化点（相对原方案）

1. 由“11 个任务平铺”改为“4 个发布阶段”，每阶段可独立上线与回滚。
2. 将性能预算前置为硬门槛（每阶段都测），而不是最后一次性验收。
3. 将“隔离正确性”前置为数据库约束 + 仓储层二次断言，避免后续串读串写风险。
4. 读取链路同步、写入链路异步：先保证推理时延，再补齐隐式提炼。
5. Feature Flag 默认关闭，先做 no-op 接线，确保紧急降级路径可用。

## 3) Dify 边界（保持并固化）

1. Dify `chat-messages`：支持 `conversation_id` + `user` 作用域，适合会话连续对话。
2. Dify Chatflow：可用 conversation variables 做会话内短期状态。
3. Dify Workflow（`/workflows/run`）：单次执行，不依赖其内建 memory；统一由外部 memory 注入。
4. 当前仓库：Expert Advisor / Lead Hunter 走 `chat-messages`，Image 走本地 image-assistant。

## 4) 性能与稳定性硬指标（新增）

### Online path（同步）
- `memory retrieval + soul compose` p95 < 120ms
- prompt 注入后 token 增量控制：`<= 350 tokens`（或字符预算 `<= 1200 chars`）
- Writer 主链路总 p95 增量 < 300ms

### Async path（异步）
- implicit extraction 不阻塞主响应
- 单次提炼任务超时：2s（超时直接丢弃，不重试风暴）

### Correctness
- 任意读取/写入必须通过 `userId + agentType` 双条件过滤
- 跨 agentType 互读测试必须 100% 通过（writer/image/brand-strategy/growth/company-search/contact-mining）

## 5) 数据模型优化（优先落地）

## 5.1 表结构
- `writer_soul_profiles`
- `writer_memory_items`
- `writer_memory_events`

## 5.2 必备字段（新增建议）
- `agent_type`（varchar 32，后端 allowlist）
- `scope_hash`（可选：用于 telemetry）
- `is_deleted` + `deleted_at`（软删）
- `dedup_fingerprint`（用于短窗口幂等）
- `source_turn_id`（审计追踪）

## 5.3 约束与索引
- `writer_soul_profiles`: `UNIQUE(user_id, agent_type)`
- `writer_memory_items`: `INDEX(user_id, agent_type, updated_at DESC)`
- `writer_memory_events`: `INDEX(user_id, agent_type, created_at DESC)`
- 去重索引建议：`INDEX(user_id, agent_type, type, dedup_fingerprint)`

## 6) 分阶段执行（优化后的任务编排）

## Phase 0: 基线与降级准备（半天）
**目标:** 在不改变行为的情况下接好开关与观测。

**交付:**
- 增加 env flags（默认 false）：
  - `WRITER_MEMORY_ENABLED`
  - `WRITER_SOUL_ENABLED`
  - `WRITER_MEMORY_EXTRACT_ENABLED`
  - `WRITER_MEMORY_MAX_ITEMS_PER_USER_AGENT`
- 在 `lib/writer/types.ts` 扩展 diagnostics（先填默认值）
- telemetry 埋点壳（可 no-op）

**验证:**
- 关闭 flag 时，行为与当前完全一致
- `npm run test:writer:skills` 通过

## Phase 1: Writer 主链路 MVP（1-2 天）
**目标:** 仅实现 Writer 的显式 memory + retrieval + soul 注入（不做隐式提炼）。

**实施顺序（强依赖）:**
1. 类型契约
   - `lib/writer/memory/types.ts`
   - `lib/writer/memory/types.regression.test.ts`
   - `lib/writer/types.ts`
2. DB schema + migration
   - `lib/db/schema.ts`
   - `scripts/add-writer-memory-schema.sql`
   - `scripts/run-writer-memory-migration.js`
   - `scripts/run-all-db-migrations.js`
3. Repository
   - `lib/writer/memory/repository.ts`
   - `lib/writer/memory/repository.regression.test.ts`
4. Retrieval + Soul Composer
   - `lib/writer/memory/retrieval.ts`
   - `lib/writer/memory/soul-card.ts`
   - `lib/writer/memory/retrieval.regression.test.ts`
5. 注入 Writer 生成链路
   - `lib/writer/skills.ts`
   - `app/api/writer/chat/stream/route.ts`
   - `lib/assistant-async.ts`
   - `lib/writer/skills.regression.test.ts`

**实现要求（新增）:**
- retrieval 并行读 `profile` 与 `memoryItems`，并设置 80ms 本地超时兜底
- 超时或失败时降级为 `Soul Card: none`（不影响主生成）
- `memoryAppliedIds` 仅记录最终入选 Top-K

**验证:**
- `npx tsx --test lib/writer/memory/*.regression.test.ts`
- `npm run test:writer:skills`
- p95 增量测量满足 < 300ms

## Phase 2: 安全治理 + 隐式提炼（1 天）
**目标:** 在不拉高主链路时延的前提下，补齐提炼与安全。

**交付:**
- `lib/writer/memory/safety.ts`
- `lib/writer/memory/telemetry.ts`
- `lib/writer/memory/extractor.ts`
- `lib/writer/memory/extractor.regression.test.ts`
- `lib/writer/memory/safety.regression.test.ts`

**规则:**
- 仅 `draft_ready` 可提炼
- 若当回合已有显式写入，则跳过隐式写入
- 敏感信息命中（密钥/凭据模式）直接拒绝写入并记审计

**验证:**
- 提炼任务异步执行，不阻塞主请求
- 删除后不可读（软删过滤必须覆盖所有 list/retrieval 接口）

## Phase 3: 设置页管理能力（0.5-1 天）
**目标:** 仅在 Settings 提供管理入口，Writer 主工作台不新增独立入口。

**交付:**
- `components/settings/writer-memory-settings-section.tsx`
- `app/dashboard/settings/page.tsx`
- `lib/writer/memory/client.ts`
- `app/api/writer/memory/items/route.ts`
- `app/api/writer/memory/items/[memoryId]/route.ts`
- `app/api/writer/memory/profile/route.ts`
- `lib/writer/memory/validators.ts`
- `lib/writer/memory/api.regression.test.ts`

**UI 必备元素:**
- 添加 feedback memory
- 最近 N 条 memory 列表
- soul 摘要只读
- 当前 scope 标识（badge：`agentType`）

**验证:**
- `python scripts/run_writer_new_features_with_server.py`
- 产物 `artifacts/writer-new-features/*`

## Phase 4: 扩展到 Image / Dify（1-2 天）
**目标:** 复用同一 memory 底座，严格按 agentType 隔离注入。

**Image:**
- `lib/image-assistant/memory-bridge.ts`
- `lib/image-assistant/memory-bridge.regression.test.ts`
- 在 `lib/image-assistant/service.ts` 注入 `image soul hints`

**Dify:**
- `lib/dify/memory-bridge.ts`
- `lib/dify/memory-bridge.regression.test.ts`
- `app/api/dify/chat-messages/route.ts` 注入 `inputs.memory_context` / `inputs.soul_card`

**验证:**
- `brand-strategy` 不可读取 `growth`
- `company-search` 不可读取 `contact-mining`
- payload 注入字段可观测

## 7) 测试策略优化（新增）

1. 单测优先锁定契约：types/repository/retrieval/safety/extractor/bridge。
2. 集成测试仅覆盖关键路径：
   - Writer 一次生成命中 memory
   - Settings 新增后下一次生成生效
   - 跨 agentType 隔离
3. E2E 仅保留一条 happy path + 一条隔离反例，避免过重回归成本。

## 8) 回滚与故障策略（新增）

1. 任一异常先关 `WRITER_SOUL_ENABLED`，保留 memory 存储不注入。
2. 若写入异常，再关 `WRITER_MEMORY_EXTRACT_ENABLED`（仅保留显式写入）。
3. 若仍异常，关 `WRITER_MEMORY_ENABLED` 完全退化到现状行为。
4. 所有开关变更需记录变更时间与责任人。

## 9) 最终验收清单（精简为可执行）

1. 同一 `userId + agentType` 新会话可继承偏好并可感知。
2. 用户可在 Settings 查/增/改/删 memory，Writer 无独立管理入口。
3. `agentType` 隔离测试全通过。
4. p95 时延增量满足预算（< 300ms）。
5. 显式反馈优先于隐式提炼。
6. 关闭 `WRITER_MEMORY_ENABLED=false` 后行为与现状一致。
7. Image / Expert Advisor / Lead Hunter 三链路注入验证通过。

## 10) 建议提交粒度（便于审查）

1. `feat(writer): add memory contracts and flags scaffolding`
2. `feat(writer): add memory schema and migration`
3. `feat(writer): add memory repository and retrieval`
4. `feat(writer): inject soul card into writer pipeline with safe fallback`
5. `feat(writer): add settings memory management APIs and UI`
6. `feat(writer): add implicit extraction safety and telemetry`
7. `feat(image,dify): bridge unified memory scope into non-writer assistants`

---

该优化版保留了原方案的全部目标，但将实施风险从“大爆炸集成”改为“阶段式可验证交付”，并把性能与隔离从“后验检查”提升为“前置门槛”。
