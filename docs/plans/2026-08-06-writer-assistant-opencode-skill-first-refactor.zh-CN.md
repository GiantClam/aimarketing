# Writer Assistant OpenCode + Skill First 重构实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Writer Assistant 一刀切重构为由持久化 OpenCode 会话和可替换平台 Skill 主导的多平台写作系统，确保新写、追问、调研、修改、翻译、跨平台改编和图片生成都在同一上下文中完成。

**Architecture:** 应用层只负责鉴权、计费、任务、持久化、Skill 解析、资产生成和展示；OpenCode 持久化会话负责每轮推理；`writer-orchestrator` 负责公共协议；每个平台只绑定一个主 Skill。数据库中的完整消息和当前文章版本是可恢复的事实源，OpenCode session 是连续执行环境，二者不能相互替代。

**Tech Stack:** Next.js App Router、TypeScript、Drizzle/PostgreSQL、Railway OpenCode runtime、OpenCode Skills、R2、异步 Assistant Task、现有 Writer/Image 资产链路。

**Status:** Proposed，待按 Task 1-9 实施与验收。

## Global Constraints

- Writer 默认使用现有共享 OpenCode runtime URL 和 provider 配置，不新增每个平台或每个 Writer 功能的环境变量。
- 不保留旧 Writer 生成路径，不做双写、灰度分流或运行时回退；切换完成后只有 OpenCode + Skill 一条写作路径。
- `khazix-writer` 是微信公众号场景唯一主 Skill，不再作为 `writer-wechat` 之上的附加 style Skill。
- 平台 Skill 可以独立替换，但必须通过统一的 Writer Skill Contract；替换平台 Skill 不得修改 Writer API、任务、数据库和前端主流程。
- 应用层不得用正则、状态枚举或穷举规则决定“新写/修改/追问/调研/翻译”；这些决策由 OpenCode + Skill 完成。
- 应用层保留安全校验：鉴权、计费、SSRF 防护、文件/网络权限、输出大小、图片配额和数据隔离不能移入 Skill。
- 当前完整文章必须作为独立上下文对象保存和恢复，不能被聊天摘要、token 截断或 `drafting` 状态排除。
- 每张图片单独计算超时；多图任务耗时按单图累计，不设置覆盖全部图片的整体生成超时。
- 不新增第三方依赖；优先复用现有 runtime、任务、R2、Skill catalog 和测试设施。

---

## 1. 决策摘要

### 1.1 采用的目标方案

采用“Skill-first、session-first、application-governed”架构：

1. 每个 Writer conversation 对应一个稳定 OpenCode `sessionKey`。
2. 每轮只运行一次 Writer OpenCode turn，不再先执行应用层 brief LLM，再执行 draft LLM。
3. OpenCode runtime 让 registry 中允许的平台 Skill 可发现；`writer-orchestrator` 每轮只能激活一个主 Skill，再按兼容关系加载用户明确选择的可选 style Skill。
4. `writer-orchestrator` 判断是否发生平台切换；选定的平台 Skill 判断当前请求是追问、创建、修改、翻译、扩写、缩写、调研还是跨平台改编。
5. 应用层向 OpenCode 提供当前用户输入、完整 active draft、必要的持久化恢复上下文、企业知识和 memory/soul；不再重新解释写作意图。
6. OpenCode 返回结构化 turn result 和用户可见文本；应用层按结果保存文章版本、状态、Skill 证据和图片意图。

### 1.2 不采用的方案

| 方案 | 不采用原因 |
| --- | --- |
| 继续修补 `conversationStatus` 和正则路由 | 同一意图在应用层和 Skill 中重复判断，后续仍会出现语义冲突。 |
| 每轮创建全新 OpenCode run，仅拼接历史 prompt | 长文章会被截断；会话状态、Skill 工作流和工具调用无法自然延续。 |
| 只依赖 OpenCode session，不保存完整文章 | runtime 重启、容器休眠或 session 损坏后无法可靠恢复。 |
| 每个平台建立独立 API/环境变量/runtime | 平台越多，部署和维护复杂度线性增加，且无法原子替换 Skill。 |
| 同时加载多个同类平台 Skill，让模型自行竞争 | 输出权威不明确，平台约束冲突，无法稳定验收。 |

### 1.3 责任边界

| 能力 | 应用层 | OpenCode runtime | Writer/平台 Skill |
| --- | --- | --- | --- |
| 鉴权、租户隔离、计费、限流 | 负责 | 不负责 | 不负责 |
| conversation/session 映射 | 负责 | 续接 | 不负责 |
| 消息和文章版本事实源 | 负责 | 使用 | 使用 |
| 当前 turn 意图判断 | 不判断 | 执行 | 负责 |
| 是否需要多轮追问 | 不判断 | 执行 | 负责 |
| URL 调研 | 提供安全工具 | 调用工具 | 决定何时调用 |
| 平台格式和写作质量 | 不写规则 | 装载 Skill | 负责 |
| Skill 选择 | 提供 registry、UI 默认平台和允许集合 | 强制最多激活一个主 Skill | orchestrator 解析显式切换；平台 Skill 不自行切换 |
| 图片意图 | 校验并持久化 | 返回意图 | 决定封面/配图需求 |
| 图片生成、存储、进度 | 负责 | 不生成 | 不伪造 URL |
| 输出后处理 | 仅做安全、schema 和长度硬限制 | 返回结果 | 负责标题、结构、语气和正文 |

---

## 2. 当前实现审计与问题

### 2.1 540 会话暴露的上下文丢失

当前 `/api/writer/chat` 会先读取历史，再调用 `createPendingWriterConversation()`；该函数会把已有 conversation 状态改为 `drafting`。随后 `runWriterSkillsTurnWithRuntime()` 虽然找到了 `latestDraft`，但只有状态不是 `drafting` 时才把全文放进 prompt。最终 OpenCode 只拿到每条最多 360 字符的对话摘要，因此把“修改已有文章”执行成“基于主题重新写文章”。

这不是单一条件判断错误，而是三个概念被混用：

- `conversationStatus` 同时表示 UI 进度和文章是否存在；
- chat history 同时承担对话记忆和当前文章事实源；
- pending turn 写入动作改变了后续推理需要读取的业务状态。

目标方案必须拆开 `taskStatus`、`turnOutcome`、`activeDraft` 和 `conversationLifecycle`。

### 2.2 OpenCode 没有真正持久化 Writer 会话

当前 `runWriterOpenCodeText()` 构造 runtime input 时使用 `sessionKey: null`，每轮主要依赖应用层重新拼接 `history`。即使 runtime profile 支持 session，Writer 也没有建立稳定的 conversation -> OpenCode session 映射。

后果：

- 多轮 Skill 工作流无法由 OpenCode 原生延续；
- 历史长度受应用层 12 轮和 prompt 字符预算限制；
- 修改文章时必须猜测哪条 assistant message 是正文；
- runtime 失去前一轮工具、Skill 和工作状态，只能重新解释。

### 2.3 平台 Skill 权威关系不清晰

当前 catalog 将 `khazix-writer` 放在 `styleSkills`，公众号路由会同时加载 `writer-wechat` 和 `khazix-writer`。这与“公众号完全按照 khazix-writer”的产品决策冲突。

目标关系必须是：

```text
writer-orchestrator（公共协议）
  + khazix-writer（WeChat 唯一主 Skill）
  + optional style skill（仅在主 Skill 声明兼容且用户明确选择时）
```

其他平台同理，每个平台恰好一个主 Skill。

### 2.4 Skill 发布源重复

目前 `content/skills/*` 与 `infra/cloudflare/opencode-runner/runtime/skills/*` 同时存在。人工同步容易造成应用 catalog 与线上 runtime 实际 Skill 不一致。

目标方案规定：

- `content/skills/` 是唯一源；
- runtime 目录是构建产物；
- catalog、Skill 文件、references 和 digest 由同步脚本一次生成；
- CI 比较生成结果，发现漂移立即失败。

### 2.5 平台扩展仍依赖代码

当前 `WriterPlatform` 是固定联合类型，catalog 解析又依赖 `WRITER_PLATFORM_CONFIG`；新增 Reddit 等平台即使已有 Skill，也无法只改 catalog 完成上线。`resolveWriterOpenCodeSkillIds()` 还硬编码了 WeChat 默认 style。

目标方案将“产品已启用的平台”保留为受控 registry，但平台 Skill 的目录、能力、版本、输出形式、图片策略和替换关系全部数据化。新增/替换 Skill 不修改 Writer 主链路。

---

## 3. 目标架构

```text
Writer UI
  -> POST /api/writer/chat { conversation_id, platform_id, query }
  -> auth / rate limit / billing reserve
  -> load conversation state + active full draft + skill binding
  -> enqueue writer_turn
  -> WriterTurnService
       -> derive stable writer sessionKey
       -> build WriterRuntimeContext
       -> invoke shared OpenCode runtime once
            -> writer-orchestrator
            -> resolve current/default or explicitly requested target platform
            -> activate exactly one primary platform Skill
            -> optional compatible style Skill
            -> writer_webfetch when Skill decides research is needed
            -> writer_submit_result
       -> validate WriterTurnResult
       -> persist message/version/diagnostics
       -> finalize billing
       -> enqueue writer_assets when requested
  -> UI polls task events and renders persisted result
```

### 3.1 稳定 sessionKey

`sessionKey` 必须由稳定业务身份派生，不得使用 `runId`：

```ts
type WriterSessionIdentity = {
  environment: "production" | "preview" | "development"
  enterpriseId: number | null
  userId: number
  conversationId: string
  agentId: "writer"
}

function deriveWriterSessionKey(input: WriterSessionIdentity): string
// sha256(`writer:v1:${environment}:${enterpriseId ?? "personal"}:${userId}:${conversationId}`)
```

约束：

- 同一 conversation 的所有 text turn 使用同一 key；
- 图片任务不占用该 session；
- 不同用户、企业、环境和 conversation 不共享 session；
- key 只能出现在内部日志，前端只看到 conversation ID；
- runtime session 丢失时根据数据库中的 `WriterRecoverySnapshot` 恢复。

### 3.2 双事实模型：持久化状态 + OpenCode session

OpenCode session 提供连续推理，但数据库仍是最终事实源。

```ts
type WriterRecoverySnapshot = {
  schemaVersion: 1
  conversationId: string
  revision: number
  platformId: string
  primarySkill: WriterResolvedSkill
  activeDraft: {
    messageId: string
    markdown: string
    title: string | null
    contentHash: string
  } | null
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>
  memoryContext: string | null
}
```

```ts
type WriterRuntimeContextV1 = {
  schemaVersion: 1
  currentTurn: string
  defaultPlatformId: string
  allowedPlatforms: Array<{
    platformId: string
    primarySkillId: string
    aliases: string[]
  }>
  activeDraft: WriterRecoverySnapshot["activeDraft"]
  conversationRevision: number
  recentTurns: WriterRecoverySnapshot["recentTurns"]
  recoverySnapshot: WriterRecoverySnapshot | null
}
```

恢复规则：

1. 只要 active draft 存在，每轮都发送完整 active draft；OpenCode session 用于延续工作流和工具状态，不能成为文章正文的唯一保存位置。
2. runtime 报告 `session_not_found`、checkpoint 无效或上下文 hash 不一致时，只重试一次，并携带完整 snapshot。
3. `activeDraft.markdown` 不参与聊天摘要，最多允许到 Writer 正文硬上限；超限时返回明确错误，不静默截断正文中部。
4. `recentTurns` 可以摘要或裁剪，但 active draft、用户当前指令、用户指定标题和来源 URL 不得裁剪。
5. session 中的文本不反向覆盖数据库，只有通过 `writer_submit_result` 校验的结果才持久化。

### 3.3 单轮单次 OpenCode 执行

删除应用层独立的 brief extraction LLM call。一个 turn 内由平台 Skill 完成：

1. 读取当前请求和 active draft；
2. 判断 operation；
3. 判断是否需要追问；
4. 必要时使用 `writer_webfetch`；
5. 写作或修改；
6. 自检；
7. 提交结构化结果。

这样既减少一次模型调用，也避免 briefing Skill 和主平台 Skill 对“是否应该写”的判断不一致。

---

## 4. Writer Skill Contract

### 4.1 Registry schema

将 `content/skills/writer-catalog.json` 升级为 schema version 2：

```ts
type WriterSkillRegistry = {
  schemaVersion: 2
  orchestrator: WriterSkillRef
  platforms: WriterPlatformBinding[]
  optionalStyles: WriterStyleBinding[]
}

type WriterSkillRef = {
  id: string
  sourceDir: string
  interfaceVersion: 1
  release: string
  digestSha256: string
}

type WriterResolvedSkill = WriterSkillRef & {
  platformId: string | null
  activatedAt: string
}

type WriterPlatformBinding = {
  platformId: string
  label: string
  aliases: string[]
  listed: boolean
  primarySkill: WriterSkillRef
  capabilities: {
    modes: Array<"article" | "post" | "thread" | "script">
    operations: WriterOperation[]
    research: boolean
    coverImage: "required" | "optional" | "unsupported"
    inlineImages: { min: number; max: number }
  }
  outputContract: {
    format: "markdown" | "plain_text"
    title: "required" | "optional" | "forbidden"
    maxChars: number
  }
  compatibleStyleSkillIds: string[]
}

type WriterOperation =
  | "clarify"
  | "create"
  | "revise"
  | "rewrite"
  | "translate"
  | "shorten"
  | "expand"
  | "adapt_platform"
  | "research_and_write"
```

首批绑定：

| platformId | 唯一主 Skill | 说明 |
| --- | --- | --- |
| `wechat` | `khazix-writer` | 取代 `writer-wechat + khazix-writer` 叠加模式。 |
| `xiaohongshu` | `writer-xiaohongshu` | 小红书图文。 |
| `weibo` | `writer-weibo` | 微博单帖/线程。 |
| `douyin` | `writer-douyin` | 抖音脚本。 |
| `x` | `writer-x` | X/Twitter 单帖/线程。 |
| `linkedin` | `writer-linkedin` | LinkedIn。 |
| `instagram` | `writer-instagram` | Instagram caption/carousel 文案。 |
| `tiktok` | `writer-tiktok` | TikTok 脚本。 |
| `facebook` | `writer-facebook` | Facebook 帖文。 |
| `reddit` | `writer-reddit` | Reddit post/comment；补入产品平台配置后启用。 |

### 4.2 平台 Skill 必须实现的行为

每个主 Skill 的 `SKILL.md` 必须明确：

- 如何从当前 turn 和 active draft 判断 operation；
- 哪些缺失信息需要追问，哪些可采用平台默认值；
- 如何修改已有文章并保留未要求变化的标题、事实、结构和图片意图；
- 如何处理 URL、来源文本和最新信息；
- 平台结构、长度、标题、标签、CTA 和禁忌；
- cover/inline image intent；
- 输出前自检；
- 必须调用 `writer_submit_result`，不得只输出游离文本；
- 不访问数据库、secret、平台发布 API 或文件系统；
- 不安装 Skill，不自行切换到 registry 之外的平台 Skill。

平台选择规则：

1. 应用提供 UI 当前选择作为 `defaultPlatformId`，不分析自然语言中的平台词。
2. `writer-orchestrator` 只在用户当前 turn 明确要求切换平台时，从 `allowedPlatforms` 中选择目标。
3. 未明确切换时沿用 default/active platform；不能因正文中出现平台名称而误切换。
4. runtime 对实际 `skill_activated` 事件做约束：每轮必须且只能激活 result `platformId` 绑定的 primary Skill。
5. 未知平台不动态安装 Skill；返回简短的受支持平台提示。

### 4.3 结构化结果

新增平台治理工具 `writer_submit_result`：

```ts
type WriterTurnResult = {
  schemaVersion: 1
  outcome: "needs_clarification" | "draft_ready"
  operation: WriterOperation
  platformId: string
  userMessage: string
  draft: {
    markdown: string
    title: string | null
    basedOnRevision: number | null
  } | null
  assets: Array<{
    id: "cover" | `inline-${number}`
    kind: "cover" | "inline"
    prompt: string
    placementAfterHeading: string | null
    aspectRatio: string
  }>
  research: {
    requested: boolean
    completed: boolean
    sourceUrls: string[]
  }
}
```

校验规则：

- `needs_clarification` 时 `draft` 必须为 `null`，问题放在 `userMessage`；
- `draft_ready` 时 `draft.markdown` 必须非空；
- `revise/rewrite/translate/shorten/expand/adapt_platform` 必须有 `basedOnRevision`；
- `basedOnRevision` 与当前 revision 不一致时拒绝覆盖，返回 `writer_revision_conflict`；
- asset 数量、比例和标题规则按 registry 校验；
- 用户指定标题时，除非明确要求修改标题，否则输出标题必须保持一致；
- Skill 未调用 tool 时，本轮失败为 `writer_result_not_submitted`，不使用模型最后一段文本猜结果。

### 4.4 Skill 替换流程

替换任一平台 Skill 只允许修改以下内容：

1. 在 `content/skills/<new-skill>/` 放置 `SKILL.md` 和 references；
2. 更新 registry 中该 `platformId.primarySkill`；
3. 运行 contract validator 和平台 fixture；
4. 生成 runtime bundle 和 digest；
5. 同一提交发布应用和 runtime 镜像。

不得修改：

- `/api/writer/chat`；
- Writer task payload 主结构；
- conversation/session 映射；
- billing；
- assets API；
- Writer UI 消息协议。

替换是原子的一刀切：新请求只装载 registry 当前 primary Skill；不并行调用旧 Skill，不按用户分流。历史 conversation 继续使用当前 registry Skill，但恢复 snapshot 会记录“上轮 Skill + 当前 Skill”，供新 Skill 理解迁移，不再运行旧 Skill。

---

## 5. 对话、文章版本与编辑语义

### 5.1 状态拆分

```ts
type WriterTaskStatus = "pending" | "running" | "success" | "failed" | "cancelled"
type WriterTurnOutcome = "needs_clarification" | "draft_ready"
type WriterAssetStatus = "not_requested" | "generating" | "ready" | "partial" | "failed"

type WriterConversationState = {
  revision: number
  activeDraftMessageId: string | null
  turnOutcome: WriterTurnOutcome | null
  assetStatus: WriterAssetStatus
  platformId: string
  runtimeContextHash: string | null
}
```

废除使用 `drafting/text_ready/image_generating/ready/failed` 一个字段同时表达任务、文章和图片状态的做法。数据库迁移期间可以保留旧列供旧 UI 读取，但切换提交中前后端必须同时改用新字段，之后删除旧语义分支。

### 5.2 修改已有文章

修改 turn 的固定输入：

```text
Current user turn: 用户修改要求
Active draft revision: N
Active draft: 完整 Markdown
Recent conversation: 可裁剪的对话上下文
Selected platform Skill: 当前唯一主 Skill
```

固定结果：

- 创建 revision N+1，不原地销毁 revision N；
- UI 默认显示新 revision，历史版本仍可查看；
- 没有明确要求时保留原标题、事实、链接和未涉及段落；
- 不因 pending task 将 active draft 清空；
- 用户在页面内直接编辑正文时，PATCH 同样创建 revision N+1，并更新 OpenCode recovery snapshot/context hash；下一次聊天修改以新版本为准。

### 5.3 新写与跨平台改编

- 新 conversation 没有 active draft，平台 Skill 可以追问或直接生成。
- 同一 conversation 中用户明确切换平台时，orchestrator 从 allowed registry 选择目标主 Skill，目标 Skill 返回 operation=`adapt_platform`，输入仍包含原完整文章。
- Skill 返回新的 `platformId` 后，应用校验它与本轮实际激活的 primary Skill 一致；未知平台返回可读错误，不动态安装 Skill。
- 适配后新版本成为 active draft，旧版本保留原平台诊断信息。

---

## 6. URL 调研、企业知识与 Memory

### 6.1 URL 调研

- 应用层不再用正则提取和穷举 URL。
- 原始用户输入原样进入 OpenCode。
- 平台 Skill 判断是否需要调研，并将 URL 传给 `writer_webfetch`。
- `writer_webfetch` 保留应用治理：仅 HTTP/HTTPS、DNS/IP SSRF 检查、响应大小、类型、重定向次数、超时和审计。
- tool 返回可读正文和最终 URL；Skill 区分来源事实与推断。
- 调研失败时 result 中 `requested=true, completed=false`，Skill 不得声称已阅读来源。

### 6.2 企业知识

企业知识仍由应用鉴权和检索，但不由应用决定当前 turn 是否必须使用。方案采用受控工具或预加载摘要：

- Skill 请求企业知识时调用只读 `writer_enterprise_search`；
- tool 自动绑定当前 enterprise，不接受 Skill 提供 enterpriseId；
- 返回片段带 dataset/title/scope，不暴露 secret；
- 结果计入 diagnostics 和计费，不写入公开引用。

### 6.3 Memory/Soul

- 应用按 `userId + agentType=writer` 读取 memory/soul；
- 作为独立 context block 注入，不混入 active draft；
- memory 不能覆盖用户当前明确要求、平台 Skill 规则或企业事实；
- 隐式提炼只在 `draft_ready` 成功持久化后异步执行。

---

## 7. 图片和文章资产

### 7.1 图片意图

Skill 返回结构化 `assets[]`，应用生成稳定占位并持久化。Skill 不直接生成、不上传、不伪造图片 URL。

最低能力：

- WeChat/`khazix-writer`：必须支持 1 张封面图，正文配图数量由 Skill 按文章需要决定；
- 小红书/Instagram：支持封面或首图及多张内容图；
- X/Reddit/LinkedIn/Facebook：按 registry 声明 optional；
- 视频脚本平台：可只返回封面/缩略图意图，不把视频生成混入 Writer turn。

### 7.2 执行时长

```ts
for (const asset of assets) {
  await generateWithPerImageTimeout(asset, perImageTimeoutMs)
  await persistAssetProgress(asset)
}
```

- 每张图片拥有独立 timeout；
- 多张图总耗时自然累计；
- 不使用包围整个循环的 Writer asset task timeout；
- 单张失败不覆盖已完成图片，最终状态可为 `partial`；
- 每次进度写入串行化，防止 recovery 覆盖已完成状态；
- worker 重启后从未完成 asset 继续，不重新生成 ready asset。

---

## 8. 可观测性与质量指标

每个 turn 记录：

```ts
type WriterTurnDiagnosticsV2 = {
  sessionKeyHash: string
  contextMode: "continued" | "recovered"
  activeDraftRevision: number | null
  activeDraftChars: number
  operation: WriterOperation
  outcome: WriterTurnOutcome
  platformId: string
  orchestratorSkill: WriterResolvedSkill
  primarySkill: WriterResolvedSkill
  optionalStyleSkills: WriterResolvedSkill[]
  researchRequested: boolean
  researchCompleted: boolean
  toolCallCount: number
  inputTokens: number
  outputTokens: number
  latencyMs: number
}
```

日志不得记录完整正文、用户隐私、provider key 或企业知识原文。线上排障必须可以回答：

- 本轮是否续接同一个 session；
- 使用了哪个 Skill release/digest；
- 是否携带 active draft 以及字符数；
- operation 是 revise 还是 create；
- Skill 是否真实激活并提交结果；
- 图片完成到第几张。

质量门槛：

- 修改任务的事实/标题/未要求修改段落保持率；
- 平台结构合规率；
- URL 使用真实性；
- 无依据数据和案例的幻觉率；
- 封面图生成成功率；
- 与当前线上相同 prompt 的盲评胜率；
- p50/p95 总时延和单图时延。

---

## 9. 文件结构与职责

### 新建

| 文件 | 单一职责 |
| --- | --- |
| `lib/writer/runtime/session-key.ts` | 派生稳定 Writer sessionKey。 |
| `lib/writer/runtime/contracts.ts` | Writer runtime context/result/recovery 类型和 schema。 |
| `lib/writer/runtime/context.ts` | 从数据库状态构建正常/恢复上下文。 |
| `lib/writer/runtime/invoke.ts` | 单次调用 OpenCode 并收集事件。 |
| `lib/writer/runtime/result.ts` | 校验 `writer_submit_result` 和 revision。 |
| `lib/writer/service/turn.ts` | Writer turn 事务编排、计费和持久化。 |
| `lib/writer/skill-registry.ts` | 读取和校验 schema v2 registry。 |
| `lib/writer/skill-contract.ts` | 平台 Skill contract validator。 |
| `content/opencode-tools/writer_submit_result.ts` | OpenCode 结构化提交工具。 |
| `scripts/sync-writer-runtime-skills.ts` | 从唯一源生成 runtime Skill bundle。 |
| `scripts/validate-writer-platform-skills.ts` | 校验 registry、Skill 和 fixtures。 |

### 修改

| 文件 | 目标修改 |
| --- | --- |
| `app/api/writer/chat/route.ts` | 只做入口校验、pending turn 和任务入队，不读取/裁剪生成 prompt。 |
| `lib/assistant-async.ts` | `writer_turn` 委托给 `WriterTurnService`，移除内联 Writer 编排。 |
| `lib/writer/skills.ts` | 拆出 runtime 后删除 brief extraction、正则意图、prompt 拼接和双阶段模型调用。 |
| `lib/writer/repository.ts` | 增加 conversation state、revision、active draft 和 recovery snapshot 读写。 |
| `lib/writer/types.ts` | 使用拆分后的 task/turn/asset 状态和 diagnostics v2。 |
| `lib/writer/skill-catalog.ts` | 替换为 schema v2 registry，不硬编码 WeChat style。 |
| `content/skills/writer-catalog.json` | 升级 registry；WeChat 主 Skill 指向 `khazix-writer`；加入 Reddit binding。 |
| `content/skills/writer-orchestrator/SKILL.md` | 改为统一 Writer turn 和 tool contract。 |
| 所有 `content/skills/writer-*/SKILL.md` | 实现统一 platform contract。 |
| `content/skills/khazix-writer/SKILL.md` | 实现公众号主 Skill contract、修改语义和图片意图。 |
| `lib/ai-runtime/contracts.ts` | 增加 Writer result tool event/恢复上下文所需字段。 |
| `lib/ai-runtime/opencode-prompt.ts` | 删除 Khazix 特判，只保留通用安全和 runtime 边界。 |
| Railway OpenCode runner | 支持稳定 Writer session、Skill digest 和 `writer_submit_result`。 |
| `components/writer/writer-workspace.tsx` | 使用新状态、revision 和 operation；pending 时不清空 active draft。 |

### 删除/停止维护

- 应用层 writer turn intent 正则；
- 应用层 URL 提取；
- 独立 writer brief extraction 模型调用；
- `conversationStatus !== drafting` 才注入 latest draft 的条件；
- WeChat 同时加载 `writer-wechat` 和 `khazix-writer`；
- 手工维护 `infra/.../runtime/skills` 副本；
- Writer 专属 OpenCode enabled 环境变量。

---

## 10. 实施任务

### Task 1: 用失败测试锁定完整文章编辑和稳定会话契约

**Files:**
- Create: `lib/writer/runtime/context.test.ts`
- Create: `lib/writer/runtime/session-key.test.ts`
- Modify: `app/api/writer/chat/route.test.ts`
- Modify: `lib/writer/skills.regression.test.ts`

**Interfaces:**
- Produces: `deriveWriterSessionKey()` 和 `buildWriterRuntimeContext()` 的验收行为。
- Consumes: 现有 `WriterHistoryEntry`、conversation 和 assistant task fixtures。

- [ ] 写失败测试：已有 6000 字文章、状态进入 pending 后，runtime context 仍包含全文首尾 marker 和同一 revision。
- [ ] 写失败测试：同一 conversation 两轮得到相同 sessionKey；不同 user/conversation/environment 得到不同 key。
- [ ] 写失败测试：修改指令进入 task 后 operation 由 Skill 返回，API payload 不含应用层 rewrite/direct_draft 判断。
- [ ] 写失败测试：session recovery context 包含完整 active draft，recent turns 可以裁剪但 active draft 不裁剪。
- [ ] 运行 `pnpm exec tsx --test lib/writer/runtime/context.test.ts lib/writer/runtime/session-key.test.ts app/api/writer/chat/route.test.ts`；预期新增测试 FAIL，错误指向缺少新接口。
- [ ] 提交（Lore Protocol）：`Protect complete Writer drafts across persistent editing turns`。

### Task 2: 建立 Writer runtime contract 和稳定 session

**Files:**
- Create: `lib/writer/runtime/session-key.ts`
- Create: `lib/writer/runtime/contracts.ts`
- Create: `lib/writer/runtime/context.ts`
- Modify: `lib/ai-runtime/contracts.ts`
- Modify: `lib/ai-entry/runtime/context-builder.ts`

**Interfaces:**
- Produces: `WriterRuntimeContextV1`、`WriterRecoverySnapshot`、`WriterTurnResult`、`deriveWriterSessionKey()`。
- Consumes: Task 1 的测试契约。

- [ ] 实现稳定 sessionKey，输入仅使用 environment/enterprise/user/conversation/agent，输出固定长度 hash。
- [ ] 使用 Zod schema 定义 `WriterTurnResult`，拒绝 outcome/draft、operation/revision 和 assets 能力不一致的结果。
- [ ] 实现正常续接 context 和一次性恢复 snapshot；active draft 使用独立字段，不进入 history clipping。
- [ ] 为 runtime input 增加 `writerContext`，只允许 `agentId=writer` 使用，其他 agent 传入时拒绝。
- [ ] 运行 Task 1 测试和 `pnpm exec tsc --noEmit`；预期 PASS。
- [ ] 提交（Lore Protocol）：`Keep Writer conversations continuous without sacrificing durable recovery`。

### Task 3: 升级可替换平台 Skill registry

**Files:**
- Create: `lib/writer/skill-registry.ts`
- Create: `lib/writer/skill-contract.ts`
- Create: `lib/writer/skill-contract.test.ts`
- Modify: `content/skills/writer-catalog.json`
- Modify: `lib/writer/skill-catalog.ts`
- Modify: `lib/writer/skill-catalog.test.ts`

**Interfaces:**
- Produces: `resolveWriterPlatformBinding(platformId)`、`resolveWriterSkillSet(platformId, styleIds)`。
- Consumes: `WriterSkillRegistry` schema version 2。

- [ ] 写失败测试：每个 listed platform 恰好一个 primary Skill；WeChat 只返回 `writer-orchestrator + khazix-writer`。
- [ ] 写失败测试：将 Xiaohongshu primary Skill fixture 换成另一个目录后，解析结果变化但 Writer 主流程 fixture 不变。
- [ ] 写失败测试：重复 platform、未知 Skill、缺失 contract、digest 不一致、style 不兼容全部 fail closed。
- [ ] 升级 catalog 并补入 Reddit；移除 `isWechat -> khazix style` 硬编码。
- [ ] 运行 `pnpm exec tsx --test lib/writer/skill-contract.test.ts lib/writer/skill-catalog.test.ts`；预期 PASS。
- [ ] 提交（Lore Protocol）：`Make every Writer platform replaceable behind one Skill contract`。

### Task 4: 让 OpenCode 单轮完成决策、调研和写作

**Files:**
- Create: `content/opencode-tools/writer_submit_result.ts`
- Create: `lib/writer/runtime/result.ts`
- Create: `lib/writer/runtime/result.test.ts`
- Modify: `content/opencode-tools/writer_webfetch.ts`
- Modify: `content/skills/writer-orchestrator/SKILL.md`
- Modify: `lib/ai-runtime/opencode-prompt.ts`
- Modify: Railway OpenCode runner tool/runtime files

**Interfaces:**
- Produces: `invokeWriterOpenCodeTurn(context, skillSet)` 所需的结构化 result event。
- Consumes: Task 2/3 的 runtime context 和 resolved Skill set。

- [ ] 写失败测试：Skill 没有调用 `writer_submit_result` 时返回 `writer_result_not_submitted`。
- [ ] 写失败测试：revision 冲突、未知 platform、非法 asset、空 draft 被拒绝。
- [ ] 注册 `writer_submit_result`，工具只接受 schema 数据，不允许数据库或网络访问。
- [ ] 修改 orchestrator：每轮只装载 registry 选定的主 Skill，由主 Skill决定追问/修改/调研。
- [ ] 删除 `opencode-prompt.ts` 的 Khazix 特判和平台写作规则，只保留通用安全边界。
- [ ] 运行 runtime tests、`pnpm lint:skills` 和 `pnpm exec tsc --noEmit`；预期 PASS。
- [ ] 提交（Lore Protocol）：`Let the selected platform Skill own each complete Writer turn`。

### Task 5: 将 Writer task 改为单一 OpenCode turn service

**Files:**
- Create: `lib/writer/runtime/invoke.ts`
- Create: `lib/writer/service/turn.ts`
- Create: `lib/writer/service/turn.test.ts`
- Modify: `app/api/writer/chat/route.ts`
- Modify: `lib/assistant-async.ts`
- Modify: `lib/writer/repository.ts`
- Modify: `lib/db/schema.ts`
- Create: `scripts/add-writer-conversation-state.sql`

**Interfaces:**
- Produces: `runWriterTurn(taskId, payload): Promise<WriterTurnResult>`。
- Consumes: Task 2-4 的 session/context/skill/result contract。

- [ ] 写失败测试：API 不再把 pending 后的 `drafting` 作为 OpenCode context 条件。
- [ ] 写失败测试：正常 turn 使用稳定 sessionKey；`session_not_found` 只重试一次并使用 recovery snapshot。
- [ ] 写失败测试：计费 reserve/finalize/release、task progress 和 writer message 写入保持幂等。
- [ ] 新增 conversation revision/activeDraft/turnOutcome/assetStatus/contextHash 持久化字段和 migration。
- [ ] 实现 service；从 `assistant-async.ts` 删除 Writer 内联编排，改为单函数委托。
- [ ] 运行 route/service/repository/billing/recovery 测试；预期 PASS。
- [ ] 提交（Lore Protocol）：`Route every Writer turn through one durable OpenCode service`。

### Task 6: 将所有平台 Skill 迁移到统一 contract

**Files:**
- Modify: `content/skills/khazix-writer/SKILL.md`
- Modify: `content/skills/writer-{xiaohongshu,weibo,douyin,x,linkedin,instagram,tiktok,facebook,reddit}/SKILL.md`
- Create: `content/skills/writer-fixtures/*.json`
- Create: `scripts/validate-writer-platform-skills.ts`
- Create: `scripts/sync-writer-runtime-skills.ts`
- Modify: `scripts/validate-skill-files.js`

**Interfaces:**
- Produces: 每个平台 contract fixtures 和唯一 runtime bundle。
- Consumes: Task 3/4 的 registry 和 result schema。

- [ ] 为每个平台建立 create、clarify、revise、translate、platform-adapt、URL research fixture。
- [ ] 为 Khazix 增加公众号完整修改、标题保持、封面图、配图、自检 fixture。
- [ ] 实现同步脚本：只从 `content/skills` 生成 runtime skills、references、catalog 和 digest。
- [ ] CI 中先生成再执行 `git diff --exit-code`，阻止双份 Skill 漂移。
- [ ] 运行所有 Skill fixtures 和 `pnpm lint:skills`；预期 PASS。
- [ ] 提交（Lore Protocol）：`Enforce one replaceable contract across every Writer platform Skill`。

### Task 7: 对齐前端编辑、版本和任务状态

**Files:**
- Modify: `components/writer/writer-workspace.tsx`
- Modify: `lib/writer/session-store.ts`
- Modify: `lib/writer/types.ts`
- Modify: `app/api/writer/messages/route.ts`
- Modify: Writer UI regression scripts

**Interfaces:**
- Produces: revision-aware UI 和独立 task/turn/asset 状态展示。
- Consumes: Task 5 的 conversation state 和 turn result。

- [ ] 写 UI 回归：发送修改指令后旧 active draft 保持显示，pending placeholder 不替换正文。
- [ ] 写 UI 回归：成功后出现新 revision，旧版本仍可打开。
- [ ] 内联手改通过 expectedRevision PATCH，冲突返回 409，不静默覆盖。
- [ ] UI 使用 `turnOutcome` 判断显示追问/正文，使用 `assetStatus` 判断图片状态。
- [ ] 运行 Writer UI/E2E、ESLint 和 TypeScript；预期 PASS。
- [ ] 提交（Lore Protocol）：`Preserve visible Writer drafts while new revisions are generated`。

### Task 8: 对齐图片恢复和逐张超时

**Files:**
- Modify: `lib/writer/assets-runtime.ts`
- Modify: `app/api/writer/assets/route.ts`
- Modify: `lib/writer/assets.regression.test.ts`
- Modify: `app/api/writer/assets/route.test.ts`

**Interfaces:**
- Produces: 根据 `WriterTurnResult.assets` 执行的可恢复图片任务。
- Consumes: Task 4 result assets 和 Task 5 assetStatus。

- [ ] 测试 4 张图片各自接近单图 timeout 时，任务总耗时允许累计且不会触发整体 timeout。
- [ ] 测试第 3 张失败时前 2 张保持 ready，第 4 张继续，最终状态为 partial。
- [ ] 测试 worker 重启后跳过 ready asset，只恢复未完成项。
- [ ] 删除覆盖整个图片循环的 timeout，保留单图 timeout 和串行进度持久化。
- [ ] 运行 assets route/runtime tests；预期 PASS。
- [ ] 提交（Lore Protocol）：`Let Writer image tasks accumulate safe per-image generation time`。

### Task 9: 删除旧混合编排并完成全平台验收

**Files:**
- Modify: `lib/writer/skills.ts`
- Modify: `lib/writer/skills.regression.test.ts`
- Modify: `scripts/writer_new_features_e2e.py`
- Modify: `scripts/writer_real_browser_validation.py`
- Create: `scripts/writer_platform_skill_replacement_e2e.py`
- Modify: CI workflow for Writer tests

**Interfaces:**
- Produces: 唯一生产路径和上线证据。
- Consumes: Task 1-8 全部契约。

- [ ] 删除应用层 brief extraction、turn intent/rewrite/URL 正则和平台 prompt 拼接。
- [ ] 删除 Writer 旧 status 语义和 Khazix 特判；确认没有备用生成路径。
- [ ] 运行所有 Writer 单测、route test、runtime test、Skill validation、TypeScript、ESLint。
- [ ] 本地以同 prompt 对比当前基线：公众号新写、540 型修改、URL 调研、封面和多图。
- [ ] 全平台 E2E：WeChat、小红书、微博、抖音、X、LinkedIn、Instagram、TikTok、Facebook、Reddit。
- [ ] Skill 替换 E2E：只替换 fixture registry 的 primary Skill，Writer API/task/UI 测试保持不变。
- [ ] 发布应用和 OpenCode runtime 镜像，线上重复全平台 smoke；记录 Skill release/digest、operation、activeDraftChars 和图片证据。
- [ ] 提交（Lore Protocol）：`Finish the Writer cutover with replaceable platform Skills and no legacy path`。

---

## 11. 测试矩阵

每个平台至少覆盖：

| 场景 | 断言 |
| --- | --- |
| 信息充分的新写 | 不追问，直接生成平台原生内容。 |
| 信息不足 | Skill 决定是否追问；应用不代替决策。 |
| 修改已有文章 | operation=revise，完整旧稿存在，未要求内容保持。 |
| 标题修改 | 仅用户明确要求时改标题。 |
| 翻译/缩写/扩写 | 基于当前 revision，不重新选题。 |
| 跨平台改编 | operation=adapt_platform，使用目标平台主 Skill。 |
| URL 调研 | OpenCode 调用真实 tool；失败不伪称成功。 |
| 企业知识 | 仅当前 enterprise 可读，diagnostics 可追踪。 |
| session recovery | runtime 重启后通过 snapshot 继续修改。 |
| revision conflict | 旧请求不能覆盖用户已保存的新版本。 |
| 图片 | 按 registry 生成封面/配图；逐张超时、可部分成功。 |
| Skill 替换 | 仅 registry/Skill 改动，主流程测试无需改写。 |

公众号额外质量回归：

- `khazix-writer` 确实激活；
- HKR、文章类型、结构和自检工作流由 Skill 执行；
- 作者标题保持；
- 编辑指令不变成重新写文章；
- 至少支持封面图；
- 不编造个人经历、客户案例、数据和引用；
- 与当前线上相同 prompt 的盲评结果不低于基线，并以文章质量提升为上线条件。

---

## 12. 上线标准

全部满足后才可上线：

- [ ] Writer 生产代码只有 OpenCode + Skill 一条生成路径。
- [ ] 每个 conversation 使用稳定 sessionKey，线上 diagnostics 能证明 continued/recovered。
- [ ] active draft 完整持久化并进入修改 turn，不依赖 `drafting` 状态。
- [ ] WeChat 只装载 `writer-orchestrator + khazix-writer`。
- [ ] 所有 listed platform 恰好一个 primary Skill，registry contract 全通过。
- [ ] 新增或替换平台 Skill 不修改 API/task/UI 主流程。
- [ ] URL 调研在 OpenCode 内通过安全工具完成。
- [ ] cover image 和平台声明的 inline images 可生成、可恢复、逐张计时。
- [ ] 全平台本地与线上 E2E 通过。
- [ ] 同 prompt 质量评测达到或超过当前线上基线。
- [ ] TypeScript、ESLint、Skill validation、runtime tests、billing/recovery tests 全通过。
- [ ] 线上无上下文丢失、跨用户串会话、重复扣费、revision 覆盖或 Skill 漂移。

---

## 13. 实施顺序与发布裁决

依赖顺序：

```text
Task 1 tests
  -> Task 2 session/context contract
  -> Task 3 replaceable registry
  -> Task 4 OpenCode result/tool contract
  -> Task 5 single turn service
  -> Task 6 all platform Skills
  -> Task 7 UI revisions
  -> Task 8 assets
  -> Task 9 legacy deletion + full regression + deployment
```

这是一次一刀切重构，但不等于无验证直接替换。开发期间可以按任务独立提交，生产发布必须在 Task 9 将应用代码、runtime 镜像和 Skill bundle 作为一个兼容版本上线。若任一 contract 或线上 smoke 失败，不启用旧路径兜底，而是停止发布并修复同一目标实现。
