# AI Marketing 免费引流工具整改方案：Stackero 对标与 Workflow Fast Profile

> 日期：2026-07-30
>
> 版本：1.0
>
> 状态：设计已确认，待实施计划
>
> 适用范围：公开免费引流工具、SEO 承接、Workflow/Agent 执行衔接
>
> 不包含：视觉主题、页面布局和组件样式调整

## 1. 执行摘要

AI Marketing 当前应继续保持既有视觉主题，不把产品改造成 Stackero 或 Genspark 的外观复制品。对标 Stackero 的重点是免费工具的产品机制：围绕一个明确任务收集结构化输入，快速交付可直接使用的结果，再把高意向用户引导至登录后的深度能力。

本方案确定以下核心架构：

1. 现有 Workflow 继续作为工具配置、能力复用和深度执行底座。
2. 新增 `Fast Profile`，为匿名免费工具提供同步、低延迟、可流式的公开运行面。
3. Fast Profile 只允许确定性代码或单个模型节点，不允许完整 Workflow、Agent 工具循环、搜索研究或多轮反思进入首次结果路径。
4. Fast Profile 使用结构化 SSE 输出，不把模型原始 Token、内部推理或 Workflow 节点状态直接暴露给用户。
5. 用户获得首次结果后，通过“继续完善结果”登录；输入、已生成结果和来源信息必须无损带入 Workspace。
6. 登录后才启动 Full Workflow，并在其中按需使用 Agent、搜索、知识库、质量检查、导出和异步任务。
7. 首发工具为 `SEO Title Generator` 和 `Content Brief Generator`。前者匿名展示完整结果，后者匿名展示可用预览，登录后生成完整 Brief。

目标链路：

```text
Google 搜索
  -> 免费工具页
  -> 结构化输入
  -> Fast Profile 结构化流式结果
  -> 用户先获得价值
  -> 继续完善结果
  -> 登录并认领 Guest Run
  -> Full Workflow + Agent
  -> 保存、研究、迭代与导出
```

## 2. 背景与问题定义

### 2.1 GSC 现状

最近 28 天 Google Search Console 导出显示：

- 页面合计约 5,455 次展示、3 次点击，整体 CTR 约 `0.055%`。
- 约 `95.3%` 的页面展示处于平均排名 20 名以后，当前核心矛盾首先是排名与搜索意图匹配，其次才是摘要点击率。
- 四个主题簇贡献约 `78.1%` 的查询展示：SEO title、Content brief、Content marketing ROI、Content pillar/cluster。
- `/tools/seo-title-generator`：约 1,539 次展示，平均排名约 41.77。
- `/tools/content-brief-generator`：约 280 次展示，平均排名约 54.87；相关 guide 约 851 次展示，平均排名约 49.15。
- 已有较接近首页的机会页包括 content marketing cost calculator（平均排名约 8.22）和 best AI workspace（平均排名约 12.13）。

数据结论：不能只调整标题或视觉来解决问题。必须同时完成技术 SEO 收敛、搜索意图内容增强、工具可用性建设和完整漏斗埋点。

分析底稿：[`analysis/gsc_ctr_2026-07-30.ipynb`](../../../analysis/gsc_ctr_2026-07-30.ipynb)

### 2.2 当前产品问题

1. 免费工具页面获得了展示，但工具价值出现得不够快或不够明确。
2. 如果首次生成直接进入完整 Workflow，用户需要等待队列、节点执行、状态持久化以及多个模型调用。
3. 现有 Workflow 运行 API 要求登录和企业上下文，不适合匿名流量直接调用。
4. 现有 Workflow AI/Agent 节点使用非流式模式，只有节点完成后才返回结果。
5. 直接把免费工具改成通用 Agent，会引入动态工具选择、多轮执行、时延和成本波动。
6. 如果每个免费工具各自建设生成接口，又会复制模型路由、限流、日志、Schema 校验和会话认领能力。

### 2.3 本次目标

- 免费工具首次使用无需登录。
- 尽快产生第一个可用结果，而不是只显示 Workflow 进度。
- 保持结构化、可校验、可保存的最终输出。
- 复用现有 Workflow 的配置与执行能力，不复制第二套完整编排系统。
- 把首次结果自然转化为登录后的深度任务。
- 建立后续免费工具可复用的运行、埋点、SEO 和转化规范。

### 2.4 非目标

- 不调整 AI Marketing 当前主题、颜色、字体或整体视觉语言。
- 不在本阶段重做首页或 Workspace UI。
- 不把所有 Workflow 都改造成同步流式执行。
- 不向匿名用户开放通用 Agent、任意工具调用或自由 Prompt。
- 不以“增加工具数量”代替对首发工具的质量和转化验证。

## 3. Stackero 对标结论

参考站点：[Stackero 官网](https://stackero.co/)（检查日期：2026-07-30）。

Stackero 的公开定位是“选择工具、输入信息、获得可立即使用的输出”，强调 `No Extra Workflows` 和 `Instant Outputs`。对其公开前端资源和可访问免费工具的检查显示，其免费工具并不统一运行在一个长链路 Workflow 中，而主要采用两类方式：

1. 确定性本地生成：前端规则或模板直接根据表单输入组装报告，并在浏览器内保存或导出。
2. 单次专用 API：提交结构化数据，显示等待状态，服务端一次性返回完整 JSON。

可借鉴的不是其 UI，而是以下原则：

- 一个工具解决一个清晰问题。
- 表单替用户完成 Prompt 结构化。
- 首次结果链路短且可预测。
- 用户先拿到结果，再进入更深的产品关系。
- 工具目录负责发现和转化，工具运行面负责交付，不把平台复杂度暴露给用户。

不直接照搬的部分：

- AI Marketing 已经拥有 Workflow、Agent、知识库和多模型能力，应让免费工具成为这些能力的轻量入口，而不是建设一批永久孤立的小应用。
- 对生成型工具，完全本地规则无法覆盖质量要求，需要受限的单模型 Fast Profile。

## 4. 方案选择

### 4.1 备选方案

#### 方案 A：匿名用户直接运行完整 Workflow

优点：最大程度复用现有能力，配置灵活。

缺点：现有 API 需要登录和企业上下文；关键路径包含任务记录、恢复机制、节点持久化及多级依赖；总时延由最长串行节点累加，不符合引流工具首次价值目标。

结论：不采用。

#### 方案 B：免费工具直接调用通用 Agent

优点：开发入口简单，Agent 可自主决定步骤和工具。

缺点：工具调用次数和完成时间不可预测；结构化输出稳定性较差；成本、超时和错误处理更复杂。对标题和 Brief 预览这类已知任务，自主规划没有必要。

结论：只在登录后的深度阶段使用，不作为公开首次生成路径。

#### 方案 C：Workflow 发布双 Profile

同一个工具绑定两个运行配置：

- `publicFastProfile`：匿名、低延迟、受限、结构化流式输出。
- `workspaceFullProfile`：登录后执行完整 Workflow，可使用 Agent 和研究能力。

优点：既复用 Workflow 的配置能力，又为免费工具提供明确的性能边界；运行面可以分别优化，避免复制整个能力栈。

结论：采用。

## 5. 总体架构

### 5.1 组件边界

#### Tool Definition

负责工具对外契约，不执行模型：

```ts
type ToolDefinition = {
  slug: string
  version: number
  inputSchema: JsonSchema
  publicResultSchema: JsonSchema
  anonymousOutputPolicy: "complete" | "preview"
  publicFastProfile: FastProfileDefinition
  workspaceFullProfile: WorkflowBinding
  continuationPolicy: ContinuationPolicy
}
```

#### Fast Profile Compiler

在工具发布时验证公开运行配置。允许：

- 确定性代码节点；或
- 一个文本模型节点；以及
- 必要的输入映射、输出映射和 Schema 校验。

拒绝：

- 多个模型节点；
- foreach、循环或反思；
- Agent 工具循环；
- Web 搜索、知识库检索和长时媒体生成；
- 需要用户或企业私有数据的节点；
- 无确定超时和降级策略的节点。

#### Fast Profile Runtime

负责匿名公开执行：

- 输入校验和规范化；
- 访客限流与滥用防护；
- 模型/确定性执行；
- 结构化 SSE 转换；
- 最终 Schema 校验；
- 结果缓存和 Guest Run 保存；
- 生成短时 continuation token。

它复用底层模型路由或 Workflow 节点执行器，但不创建完整 Workflow 的逐节点执行记录，不进入通用队列、Lease 和恢复调度。

#### Workflow Adapter

负责把 Guest Run 转换为登录后的 Workflow 输入：

- 校验工具版本和 Workflow 发布版本；
- 把公开输入与结果映射成 Full Workflow seed input；
- 防止客户端篡改服务端保存的公开结果；
- 登录后把 Guest Run 认领至用户与企业空间；
- 启动完整 Workflow 并返回 Workspace 任务地址。

#### Full Workflow Runtime

继续使用现有 Workflow 基础设施，负责：

- 多节点编排和依赖层并行；
- Agent、Web 搜索、知识库和多模型调用；
- 节点持久化、重试、取消和恢复；
- 高质量结果、Artifact、保存和导出。

### 5.2 Workflow、Fast Profile 与 Agent 的关系

```text
Workflow = 配置、编排、治理和深度执行底座
Fast Profile = Workflow 发布出的受限公开运行配置
Agent = 可被 Full Workflow 使用的一类动态执行能力
```

Agent 不是 Workflow 的替代品，也不是默认的加速器。只有任务步骤无法预先确定、确实需要动态选择工具时才使用 Agent。

### 5.3 当前实现基础

现有代码已提供可复用能力：

- [`lib/workflows/execution.ts`](../../../lib/workflows/execution.ts)：同一依赖层并行执行节点。
- [`lib/workflows/capability-invoker.ts`](../../../lib/workflows/capability-invoker.ts)：Workflow 能力调用与模型路由，但当前 AI 节点使用 `stream: false`。
- [`app/api/ai/chat/route.ts`](../../../app/api/ai/chat/route.ts)：已具备 `ReadableStream` 和 SSE 事件输出。
- [`lib/useSSEStream.ts`](../../../lib/useSSEStream.ts)：已有 SSE 客户端处理基础，但正式工具组件应使用统一的 Tool Stream 契约。
- [`lib/lead-tools/runtime.ts`](../../../lib/lead-tools/runtime.ts)：现有 Lead Tool Runtime 可作为扩展起点。

## 6. Fast Profile 结构化流式输出

### 6.1 为什么采用语义事件流

直接展示原始 Token 会产生半截标题、无效 JSON、布局跳动，并可能泄露内部推理或工具细节。Fast Profile 应在服务端消费模型 Token 流，识别完成的业务单元后再发送语义事件。

流式输出改善感知速度，不等于缩短真实执行时间。因此低延迟模型、短 Prompt、无工具调用和浅执行链仍是强制要求。

### 6.2 API

```text
POST /api/tools/[slug]/generate
Accept: text/event-stream
Content-Type: application/json
```

响应头至少包含：

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

客户端使用 `fetch()` 读取 Response body，不依赖只支持 GET 的原生 `EventSource`。

### 6.3 事件契约

```ts
type ToolStreamEvent =
  | { event: "generation_started"; runId: string; toolVersion: number }
  | { event: "stage_changed"; stage: "validating" | "generating" | "finalizing" }
  | { event: "item_completed"; index: number; item: unknown }
  | { event: "section_completed"; section: string; value: unknown }
  | { event: "result_completed"; result: unknown; continuationToken: string }
  | { event: "error"; code: string; retryable: boolean; partialResult?: unknown }
```

约束：

- `item_completed` 和 `section_completed` 必须是已完成、可单独展示的业务对象。
- `result_completed` 必须通过 `publicResultSchema` 校验，是唯一权威最终结果。
- 不发送 Chain of Thought、原始系统 Prompt、Provider 密钥或内部节点状态。
- 每个事件携带单调递增序号，便于去重；断线重试不得重复写入结果。
- 客户端可展示部分结果，但只有收到 `result_completed` 后才能标记运行成功。

### 6.4 断流与恢复

- 首个业务事件前失败：返回可重试错误，并提供确定性降级结果时立即展示。
- 已产生部分结果后断流：保留已完成条目，显示“生成未完成”，允许基于同一 run id 重试。
- 最终 Schema 校验失败：不发送伪成功；服务端尝试一次受限修复，仍失败则返回 `invalid_model_output`。
- 客户端主动取消：终止 Provider 请求，不创建 Full Workflow。
- 不对模型 Token 级别事件做服务端持久化，只保存最终结果和必要的运行指标。

## 7. 数据流与生命周期

### 7.1 匿名生成

```text
提交表单
  -> 校验 inputSchema
  -> 生成 anonymousId / guestRunId
  -> 检查限流与幂等键
  -> 执行 publicFastProfile
  -> 流式发送业务结果
  -> 校验 publicResultSchema
  -> 保存 Guest Run
  -> 签发 continuation token
```

### 7.2 登录后继续

```text
点击“继续完善结果”
  -> 若未登录，进入登录流程
  -> 登录回跳携带 continuation token
  -> 服务端校验 token、工具版本和 Guest Run
  -> 将 Guest Run 认领给当前用户
  -> Workflow Adapter 构造 seed input
  -> 启动 workspaceFullProfile
  -> 跳转 Workspace 任务页
```

登录过程中禁止要求用户重新填写输入或重新生成公开结果。

### 7.3 保存期限

- continuation token：24 小时有效，签名且不可包含敏感输入明文。
- 未认领 Guest Run：保存 7 天后清理。
- 已认领运行：遵循 Workspace 正式任务和 Artifact 保留策略。
- 原始 IP 仅用于限流和安全日志；业务数据使用匿名标识关联。

## 8. 首发工具设计

### 8.1 SEO Title Generator

匿名策略：完整输出。

Fast Profile：

- 一个低延迟模型节点；
- 输入包括主关键词、页面类型、受众、语气和可选品牌名；
- 输出 8–12 个标题，每个标题包含字符数、关键词位置、角度标签和简要评分；
- 每完成一个标题发送 `item_completed`；
- 最终发送排序后的完整标题集合；
- 模型超时或输出失败时，使用规则模板生成基础标题作为降级结果。

Full Workflow：

- 关键词分组和搜索意图分析；
- SERP 标题模式研究；
- A/B 测试矩阵；
- 品牌语气适配；
- 保存为内容任务或导出。

不使用通用 Agent，因为任务步骤固定、输出结构明确。

### 8.2 Content Brief Generator

匿名策略：公开可用预览，登录解锁完整 Brief。

Fast Profile：

- 一个低延迟模型节点；
- 输入包括关键词、受众、内容目标、地区和可选产品背景；
- 输出搜索意图、推荐角度、工作标题、H2/H3 骨架和基础 FAQ；
- 按 `intent`、`angle`、`outline`、`faq` 发送 `section_completed`；
- 不在公开路径执行实时 SERP 搜索或多轮研究。

Full Workflow：

- 实时 SERP 与竞品研究；
- 实体词、问题簇和证据来源；
- 内部链接建议；
- 差异化内容机会；
- 完整 FAQ、CTA 和编辑验收清单；
- Agent 可用于动态研究，但必须受工具白名单、预算和超时限制。

## 9. SEO 与转化整改

### 9.1 P0：技术 SEO 和测量

1. 统一 apex 与 `www` 的唯一主域重定向。
2. 明确裸路径、`/en` 与 `/zh` 的 canonical 规则，避免同语言页面相互竞争。
3. 校正 hreflang、sitemap 和内部链接，使所有信号指向同一 canonical URL。
4. 检查工具页可索引性、服务端元数据、结构化数据和状态码。
5. 建立从搜索落地到登录后继续的完整事件漏斗。
6. 对平均排名 1–20 的页面优先改写 title/description，避免把排名问题误判为纯 CTR 文案问题。

### 9.2 P1：两项工具与主题簇

- 以 SEO Title 和 Content Brief 为首发工具，不扩张新的免费工具数量。
- 每个工具页围绕单一搜索意图建立示例、步骤、FAQ 和相关指南内链。
- 指南页负责解释和教育，工具页负责执行；两者使用明确 canonical 和差异化标题，避免关键词互食。
- 工具结果页继续推荐相邻内容，但主 CTA 固定为“继续完善结果”。

### 9.3 P2：已有近首页机会

- 优先增强 content marketing cost calculator 和 best AI workspace 等平均排名接近首页的页面。
- 改进摘要、FAQ、内部链接和更新信号，争取比远排名页面更快获得点击增长。

### 9.4 UI 边界

本方案只定义信息、状态和交互契约，不规定视觉实现。后续 UI 专项必须：

- 保持当前 AI Marketing 主题；
- 删除冗余说明，突出输入、结果和单一 CTA；
- 不把 Genspark 或 Stackero 的视觉风格直接复制到现有站点。

## 10. 埋点与指标

### 10.1 漏斗事件

```text
tool_impression
tool_input_started
tool_generate_submitted
tool_first_result_received
tool_result_completed
tool_result_failed
tool_continue_clicked
login_started
login_completed
guest_run_claimed
full_workflow_started
full_workflow_completed
```

事件必须携带：

- `tool_slug`
- `tool_version`
- `anonymous_id` 或 `user_id`
- `guest_run_id`
- `source_page`
- `utm_*`
- `locale`
- `latency_ms`
- `result_mode`
- `error_code`

不得将完整用户输入直接发送到通用分析平台。

### 10.2 运行指标

- `queue_wait_ms`：Fast Profile 应为 0 或接近 0。
- `provider_time_to_first_token_ms`
- `time_to_first_semantic_result_ms`
- `time_to_complete_ms`
- `schema_repair_count`
- `fallback_rate`
- `stream_disconnect_rate`
- `guest_run_claim_rate`
- `full_workflow_completion_rate`

### 10.3 首期验收目标

SEO Title Generator：

- P75 首个标题不超过 3 秒；
- P75 完整结果不超过 8 秒；
- 完整结果成功率不低于 95%；
- 降级结果也必须满足标题数量和长度约束。

Content Brief Generator：

- P75 首个可用章节不超过 4 秒；
- P75 公开预览完成不超过 10 秒；
- 完整预览成功率不低于 92%。

转化和 SEO 指标：

- 单独观察展示、工具启动、结果完成、继续完善、登录完成和 Guest Run 认领率；
- GSC 按页面和排名区间评估 CTR，不用全站平均 CTR 掩盖排名结构；
- 首个 28 天以建立可信基线为目标，第二个 28 天再按相同排名区间比较 CTR 和点击变化。

## 11. 性能与容量策略

### 11.1 延迟预算

Fast Profile 总预算由以下部分组成：

```text
输入校验 + 限流 < 100ms
Provider 首 Token 目标 < 2.5s
首个语义对象解析 < 500ms
完整生成目标 < 8–10s
最终 Schema 校验与保存 < 500ms
```

该预算是产品 SLO，不是对单次请求的绝对保证。上线前必须用真实模型、生产区域和并发流量验证。

### 11.2 优化顺序

1. 测量 queue、provider、解析、持久化各阶段耗时。
2. 缩短 Prompt 和上下文，选择低延迟模型。
3. 删除首次结果前不必要的模型节点和研究步骤。
4. 缓存相同规范化输入的安全公共结果。
5. 将最终保存移到结果完成后，不阻塞首个语义事件。
6. 最后才考虑更复杂的连接预热或 Provider 多路竞速。

### 11.3 限流

- anonymousId、IP 哈希和工具 slug 组合限流。
- 设置单日和短时间窗口限额；限额由配置控制，不写死在页面。
- 对重复输入使用幂等键，防止双击产生重复成本。
- Provider 429 时优先执行一次指数退避；仍失败则使用降级或返回明确错误。

## 12. 错误、安全与治理

- 输入长度、字段数量、URL 和文件类型必须由 ToolDefinition 限制。
- Fast Profile 只允许已发布、系统拥有、带版本号的定义，客户端不能提交任意节点或 Prompt。
- continuation token 必须签名、限时、一次认领，并绑定工具版本与 Guest Run。
- 公开结果必须经过内容安全和输出 Schema 校验。
- 不在 SSE 中发送内部推理、密钥、数据库标识或企业上下文。
- 模型、Prompt、Fallback 和 Workflow binding 的变更必须产生新工具版本，历史 Guest Run 继续绑定原版本。
- Full Workflow 中 Agent 的工具列表、最大调用次数、预算和总超时必须显式配置。

## 13. 测试策略

### 13.1 单元测试

- Fast Profile 编译器允许/拒绝规则。
- ToolDefinition 和输入/输出 Schema 校验。
- SSE 编码、分帧、序号和最终结果组装。
- continuation token 签发、过期、篡改和一次认领。
- SEO Title 规则降级和 Content Brief 部分结果合并。

### 13.2 集成测试

- 匿名请求可执行 Fast Profile，现有完整 Workflow 路由仍要求登录。
- Provider 流被转换为业务事件，不泄露原始内部事件。
- 断流、超时、429、无效 JSON 和 Schema 修复路径。
- 登录回跳后 Guest Run 被正确认领，输入和结果不丢失。
- Full Workflow seed input 与公开结果映射正确。

### 13.3 端到端测试

- Google 落地页 -> 输入 -> 首个结果 -> 完整结果 -> 继续完善 -> 登录 -> Workspace。
- SEO Title 匿名完整输出。
- Content Brief 匿名预览与登录后完整生成。
- 刷新、返回、重复提交、断网恢复和移动端交互。

### 13.4 性能测试

- 使用真实 Provider 测量冷启动、热启动和 P50/P75/P95。
- 验证 1、5、20 并发下的首结果时间、完成时间和错误率。
- 检查反向代理和部署平台不会缓冲 SSE。
- 不以本地 Mock 的响应速度作为上线依据。

### 13.5 SEO 验证

- canonical、hreflang、robots、sitemap 和结构化数据自动测试。
- 检查服务端 HTML 中标题、描述、FAQ 和主内容可被抓取。
- 上线后按 7/14/28 天检查索引、排名区间、CTR 和漏斗数据。

## 14. 实施阶段

### Phase 0：技术 SEO 与观测基线

- 收敛主域、canonical、hreflang、sitemap 和内部链接。
- 上线工具漏斗事件及延迟分段指标。
- 固化 GSC 基线查询和页面分组。

### Phase 1：Fast Profile 基础设施

- 扩展 ToolDefinition。
- 建设 Fast Profile Compiler 和 Runtime。
- 定义结构化 SSE 契约。
- 建设 Guest Run、continuation token、限流和结果校验。
- 复用现有 AI 流式 Provider 能力。

### Phase 2：首发两项工具

- SEO Title Generator 完整匿名结果与规则降级。
- Content Brief Generator 匿名预览。
- “继续完善结果”登录与 Guest Run 认领。
- 绑定各自 Full Workflow。

### Phase 3：深度 Workflow 与增长优化

- 完整 Brief 研究工作流。
- SEO Title A/B 与搜索意图工作流。
- 优化已有近首页页面和四个核心主题簇。
- 根据真实漏斗数据决定是否扩展第三个免费工具。

### Phase 4：UI 专项

- 单独进行工具页信息密度、结果展示和 Workspace 过渡设计。
- 保持当前主题，不改变本方案的 API、数据和运行契约。

## 15. 建议代码落点

```text
app/api/tools/[slug]/generate/route.ts
app/api/tools/[slug]/continue/route.ts

lib/lead-tools/
  catalog.ts
  runtime.ts
  fast-profile.ts
  fast-profile-compiler.ts
  stream-events.ts
  result-schema.ts
  guest-runs.ts
  continuation-token.ts
  rate-limit.ts
  workflow-adapter.ts

components/lead-tools/
  tool-runtime-controller.tsx
  tool-result-stream.tsx
  continue-to-workspace.tsx
```

具体文件拆分可在实施计划中根据现有模块规模调整，但必须保持 Fast Profile、Guest Run、SSE 契约和 Workflow Adapter 的边界独立。

## 16. 验收清单

- [ ] 匿名用户无需账号即可运行两项首发工具。
- [ ] 首次结果前不创建或执行完整 Workflow。
- [ ] Fast Profile 发布时拒绝多模型、循环、搜索和 Agent 工具链。
- [ ] 页面逐条或逐节收到结构化 SSE 事件。
- [ ] 最终结果通过版本化 Schema 校验。
- [ ] SSE 不包含原始推理和内部节点状态。
- [ ] SEO Title 模型失败时存在可用规则降级。
- [ ] Content Brief 免费结果与登录后完整结果边界明确。
- [ ] 登录后输入、结果和来源信息完整保留。
- [ ] Guest Run 只能被合法用户一次认领。
- [ ] Full Workflow 可接收公开结果并继续执行。
- [ ] 延迟、成功率、断流、降级和转化漏斗均可观测。
- [ ] canonical、hreflang、sitemap 和关键页面服务端内容通过检查。
- [ ] UI 变更未混入本阶段实现范围。

## 17. 最终决策

AI Marketing 不在“优化完整 Workflow”与“直接使用 Agent”之间二选一，而是建立分层执行模型：

```text
公开首次价值：Fast Profile + 结构化 SSE
登录后深度价值：Full Workflow + 受控 Agent
统一配置与治理：ToolDefinition + Workflow 发布版本
```

这套结构保留了当前 Workflow 投资，使免费工具达到引流所需的响应速度和稳定性，同时为登录后的研究、协作、保存和导出提供自然升级路径。
