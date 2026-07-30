# AI Marketing SEO 引流工具与 SEO Growth Agent 整改方案

> 日期：2026-07-31
>
> 版本：2.1
>
> 状态：设计已确认，待实施计划
>
> 首期范围：`/tools/seo-title-generator`、SEO Growth Agent、首批 SEO Skills/Tools、注册转化
>
> UI 边界：保持现有 AI Marketing 主题；视觉和页面样式另行设计

## 1. 执行摘要

本次整改不再建设 Fast Profile Compiler、Guest Run 状态机或匿名 Agent 平台。目标收敛为一个可验证的增长闭环：

```text
Google 搜索
  -> 匿名使用免费 SEO 工具
  -> 获得完整标题建议、规则评分与预览
  -> 查看被锁定的实时 SERP/DataForSEO 专业模块
  -> 注册并购买订阅或积分
  -> 进入 SEO Growth Agent
  -> 按权限调用付费 Tools、Skills 和 Workflow
```

首期只整改 `SEO Title Generator`。它不再只是现有 SEO Meta 生成器的 `titleOnly` 展示模式，而成为一个包含可解释规则评分、Google 预览和 A/B 建议的免费 SEO 标题工具。DataForSEO、实时 SERP、GSC/GA4 等有直接成本或需要用户授权的能力不向匿名用户执行，只作为明确的锁定模块展示，用于引导注册和付费。

注册后的深度能力采用分层架构：

- `SEO Growth Agent`（内部 ID：`business-seo-growth`）：理解用户目标、选择能力、维护上下文。
- `Skills`：承载专业方法，保留 SEO Machine 的原能力名称，例如 `headline-generator`。
- `Tools`：免费层提供确定性评分；付费层提供 DataForSEO、页面解析、GSC/GA4 等可信数据与计算。
- `Workflow`：组织研究、写作、优化、绩效复盘和发布等长任务。
- `Knowledge`：保存品牌声音、样例、SEO 规则、关键词地图与内部链接地图。

网页工具名称和 Agent 名称可根据市场定位调整；从 SEO Machine 迁移的 Skill 名称保持不变。

## 2. 背景与目标

### 2.1 GSC 基线

最近 28 天 Google Search Console 导出显示：

- 页面合计约 5,455 次展示、3 次点击，整体 CTR 约 `0.055%`。
- 约 `95.3%` 的展示位于平均排名 20 名以后，问题不仅是搜索摘要，也包括搜索意图匹配、页面价值和排名。
- `/tools/seo-title-generator` 约 1,539 次展示，平均排名约 41.77，是当前最适合先验证的工具页。
- SEO Title、Content Brief、Content Marketing ROI、Content Pillar/Cluster 四个主题簇约占查询展示的 `78.1%`。

分析底稿：[`analysis/gsc_ctr_2026-07-30.ipynb`](../../../analysis/gsc_ctr_2026-07-30.ipynb)

### 2.2 当前实现问题

当前 `seo-title-generator` 复用 `SeoMetaWorkbench`，仅通过 `titleOnly` 改变部分文案；实际请求仍使用 `ai-seo-meta-generator`，结果仍是三组 title、description、H1、slug、keywords 和 CTA 的 Meta 套餐。

这带来三个问题：

1. 工具名称与实际能力不一致。
2. 结果与通用 ChatGPT Prompt 相比缺少真实数据、分析深度和专业壁垒。
3. 用户得到结果后没有清晰的注册理由和深度工作入口。

### 2.3 目标

- 匿名用户无需登录即可获得完整、有价值的免费标题报告。
- 匿名报告不得调用或伪造 DataForSEO、实时 SERP、GSC/GA4 等付费数据。
- 页面必须展示付费专业模块能额外解决的问题，但不能展示虚构的数据结果。
- 等待期间展示真实进度和已完成的业务结果。
- 用户看到免费价值后，以“注册并解锁实时 SERP 与竞品分析”为主 CTA。
- 注册后进入 SEO Growth Agent，并复用 Skills、Tools、Workflow 和企业知识。
- 通过页面内容、搜索摘要、内部链接和工具体验共同改善自然搜索表现。

### 2.4 非目标

- 不把 OpenCode Agent 直接开放给匿名用户。
- 不允许匿名 API 调用 DataForSEO、GSC/GA4、付费搜索或其他计费 Tool。
- 不建设通用 Fast Profile、Workflow Compiler 或 Guest Run 数据库。
- 不在首期迁移 SEO Machine 全部 Commands、Agents 和 26 个 Marketing Skills。
- 不在匿名链路执行多轮 Agent 搜索、正文抓取、完整内容研究或发布。
- 不承诺固定 15 秒完成；以真实运行指标管理 P75/P95。
- 不改变当前网站主题、颜色和整体视觉语言。

## 3. 外部参考结论

### 3.1 Stackero

参考：[Stackero](https://stackero.co/)。其可借鉴之处不是 UI，而是免费工具机制：围绕一个清晰任务收集结构化输入，尽快交付可使用结果，再把用户导向更深的产品关系。

AI Marketing 不能只复制其简单结果，因为通用大模型也能生成类似内容。我们的差异化必须来自：实时数据、确定性分析、专业方法、可解释评分和后续执行能力。

### 3.2 SEO Machine

参考：[TheCraigHewitt/seomachine](https://github.com/TheCraigHewitt/seomachine)。SEO Machine 不是一个单独 Skill，而是一个 Claude Code 工作区，包含：

- `.claude/commands`：研究、写作、改写、优化、绩效分析和发布入口；
- `.claude/agents`：Content Analyzer、Headline Generator、Meta Creator、SEO Optimizer、CRO Analyst 等专家 Prompt；
- `.claude/skills`：26 个 Marketing Skills；
- `data_sources/modules`：关键词、可读性、内容长度和 SEO 评分等 Python 模块；
- DataForSEO、Google Search Console、Google Analytics 4 等外部数据能力；
- `context/`、`research/`、`drafts/`、`published/` 等项目组织约定。

其 `/research-serp` 会读取更多结果、抓取页面和比较内容长度，官方说明通常需要 1–2 分钟。该完整流程适合登录后的研究 Workflow，不适合匿名 SEO Title 工具。

SEO Machine 使用 MIT License。允许修改和商业复用，但复制实质内容时必须保留版权和许可声明。

## 4. 方案比较与决策

### 4.1 整体封装为一个 Agent

优点：原型快，功能入口统一。

缺点：上下文过大、能力边界模糊、工具调用次数不可控、响应时间长；Commands、Agents、Python 模块和数据连接器也不会因为复制 Prompt 自动可用。

结论：不采用。

### 4.2 每项能力建立一个 Agent

优点：专家角色清晰。

缺点：会产生大量重叠 Agent，增加用户选择和 Agent 间编排成本。

结论：不采用。

### 4.3 一个 SEO Growth Agent + Skills/Tools/Workflow

优点：用户只有一个专业入口；方法、计算、数据和长任务边界清晰；匿名工具与注册后能力复用同一 Skill 和免费评分 Tool，付费数据 Tool 则只存在于登录后的受控运行面。

结论：采用。

## 5. 产品与技术架构

### 5.1 总体分层

```text
公开层
  SEO Title 免费工具
    -> title scoring Tool
    -> 服务端加载 headline-generator Skill 指令
    -> 结构化结果流
    -> 展示付费模块锁定卡片

注册付费层
  SEO Growth Agent（OpenCode Business Agent）
    -> SEO Skills
    -> Entitlement/Credit Check
    -> DataForSEO 与其他付费 Tools
    -> Brand/SEO Knowledge
    -> Long-running Workflows

执行层
  /research、/article、/rewrite、/optimize、/performance-review、/publish-draft
    -> Workflow 模板、Artifact、确认门槛和可恢复任务
```

`headline-generator` 只有一份版本化 `SKILL.md`。匿名网页 API 通过服务端只读 loader 将其指令加入单次结构化模型调用；注册后的 SEO Growth Agent 通过现有 Skill Bundle 将同一文件装载到 OpenCode。两条运行路径不同，但专业方法来源相同。匿名路径只复用免费 Skill 和本地评分 Tool，不获得付费 Tool 权限。

### 5.2 能力映射

| SEO Machine 能力 | AI Marketing 落点 |
| --- | --- |
| `/research`、`/article`、`/rewrite`、`/optimize` | Workflow 模板 |
| `/performance-review`、`/priorities` | 数据分析 Workflow |
| `/publish-draft` | 带明确确认门槛的发布 Workflow |
| Headline Generator、Meta Creator | Skills |
| SEO Optimizer、Editor、CRO Analyst | Skills |
| Keyword density、readability、SEO score | 确定性 Tools |
| DataForSEO、GSC、GA4 | 注册且通过订阅/积分权限校验的数据连接器或 MCP/Tools |
| Brand voice、style guide、SEO guidelines | Agent Knowledge |
| topics/research/drafts/published | Workspace Project 与 Artifacts |

### 5.3 命名规则

- Skill 名称保持 SEO Machine 原命名：`headline-generator`、`meta-creator`、`keyword-mapper`、`content-analyzer`、`seo-optimizer`。
- Skill 的内部实现可以从原 Agent Prompt 转换，但必须保留来源和 MIT notice。
- Agent 对外名称暂定 `SEO Growth Agent`，后续可调整。
- 网页工具保留 `/tools/seo-title-generator` URL，避免破坏已有搜索信号；页面展示名可调整为更专业的 `SEO Title Analyzer` 或其他名称。

### 5.4 Agent 与现有能力复用

项目已经支持 Custom Agent 的 `direct_agent` 与 `workflow_backed` 模式，以及 Skill、Tool、MCP 和知识库绑定；同时，`business-*` Agent 已有明确的 Railway OpenCode 路由。首期新增内置 Business Agent `business-seo-growth`，而不是依赖企业用户临时创建 Custom Agent：

- 对话模式使用 Railway OpenCode Business Agent Runtime；
- Workflow 可以把它作为受控 Agent 节点使用；
- 系统 Prompt 复用已有 `marketing-seo-specialist` 专业规则；
- `business-seo-repurpose` 保持原有“将上游资产转换为 SEO brief”的窄职责，不扩成万能 SEO Agent；
- SEO Growth Agent 与 `business-seo-repurpose` 可以共享 Skills 和 Tools，但不共享角色边界。

## 6. 首期公开工具：免费报告与付费能力预览

### 6.1 输入

必填：

- 主关键词或页面主题；
- 页面类型；
- 目标受众；
- 目标地区与输出语言。

可选：

- 当前标题；
- 品牌或产品名；
- 主要价值主张。

所有字段需要长度限制、枚举校验和服务端规范化。

### 6.2 固定执行流程

```text
校验输入
  -> headline-generator Skill 生成多角度候选标题
  -> 计算关键词位置、标题长度、像素宽度和候选间重复度
  -> 逐条输出带解释性评分的候选标题
  -> 输出完整 Free SEO Title Report
  -> 展示被锁定的实时 SERP/DataForSEO/GSC 专业模块
```

约束：

- 匿名链路对 DataForSEO、GSC/GA4、付费搜索、页面抓取和其他计费 Tool 的调用次数必须为 0。
- 不允许仅通过隐藏按钮实现限制；服务端 Tool Registry 和权限检查必须拒绝匿名身份。
- 模型只执行一次结构化生成，不进行多轮反思。
- 匿名链路不启动 OpenCode 容器，也不运行通用 Agent。
- 服务端使用当前项目的 Provider 路由和结构化输出能力。

### 6.3 匿名免费结果

匿名用户可以查看完整结果：

1. 根据用户输入推断的搜索意图假设，并明确标注“未使用实时 SERP 验证”；
2. 10–12 个不同角度的优化标题；
3. 每个标题的规则评分和模型判断拆解；
4. Google 搜索结果样式预览；
5. 推荐首选标题及理由；
6. 2–3 组 A/B 测试组合；
7. 关键词堆砌、夸张承诺和截断风险提示。

评分用于启发决策，不宣称能预测真实 CTR。可计算项必须来自 Tool：

- 关键词是否出现及位置；
- 字符数和像素宽度风险；
- 标题之间的重复度。

搜索意图匹配、清晰度、角度差异和承诺可信度由模型按显式 rubric 评分并解释。页面必须区分“规则计算”“模型判断”和“尚未使用实时数据验证”。

### 6.4 付费能力展示

免费报告下方展示锁定模块，说明注册付费后可以获得什么：

- 实时 SERP Top 10 标题与竞争模式；
- 搜索量、关键词难度和 SERP features；
- 与竞品标题的相似度和差异化机会；
- GSC 查询归属与关键词互食检查；
- GA4 落地页参与度与转化表现；
- 完整 Content/Competitor Research Workflow。

锁定模块可以展示字段名称、分析方法、示意布局和价值说明，但不得展示伪造的搜索量、排名、竞品、评分或“示例实时结果”。模块必须标记数据来源、权限要求和预计积分/订阅消耗。

### 6.5 真实过程信息

使用独立的结构化 SSE，不转发通用聊天事件。事件保持简单：

```ts
type SeoTitleStreamEvent =
  | { event: "stage"; stage: "input_analyzing" | "titles_generating" | "titles_scoring" | "finalizing" }
  | { event: "insight_completed"; kind: "intent"; value: SeoTitleIntent }
  | { event: "title_completed"; index: number; title: SeoTitleCandidate }
  | { event: "report_completed"; report: SeoTitleReport }
  | { event: "paid_capabilities_available"; capabilities: PaidSeoCapabilitySummary[] }
  | { event: "error"; code: SeoTitleErrorCode; retryable: boolean }
```

页面只展示真实发生的状态，不展示虚假百分比、模型思维过程或内部 Workflow 节点日志。

### 6.6 性能与降级

不能承诺每次 15 秒完成。首期目标：

- P75 首个真实过程事件不超过 2 秒；
- P75 首个标题不超过 8 秒；
- P75 完整免费报告不超过 20 秒；
- P95 完整免费报告不超过 35 秒；
- 整体硬超时 45 秒。

错误处理：

- Provider 失败：保留已完成的确定性指标，允许重新生成标题。
- 流断开：保留当前页面已完成内容，提供重新运行；MVP 不建设服务端断线恢复。
- 超过 45 秒：终止本次运行，避免匿名请求长期占用资源。

## 7. 注册转化与 Agent 承接

### 7.1 转化原则

不在结果前设置登录墙。用户看到完整报告后出现一个主 CTA：

```text
注册并解锁实时 SERP 与竞品分析
```

注册价值必须具体：

- 保存本次报告；
- 使用品牌声音与企业 SEO 规则重新优化；
- 继续生成 Meta、Brief、正文或落地页；
- 使用 DataForSEO 运行实时 SERP、搜索量和竞品研究；
- 连接 GSC/GA4 做页面绩效复盘；
- 把结果交给 Workflow 继续执行。

注册只建立身份，不自动获得无限付费 Tool 权限。执行 DataForSEO 等能力前必须检查当前订阅、功能权限和积分余额，并在用户确认前展示预计消耗。若现有注册策略赠送试用积分，可按统一积分规则使用；本方案不新增匿名额度或绕过计费。

### 7.2 上下文传递

MVP 使用浏览器 `sessionStorage` 保存：

- 原始输入；
- 免费标题报告；
- 来源页面和 UTM；
- schema version。

注册或登录时使用 redirect 返回工具页。成功后前端把保存的数据作为普通用户输入提交给 SEO Growth Agent；服务端重新验证。数据可被用户修改不构成权限提升，因此不需要 Guest Run 数据库、签名 token 或认领状态机。

关闭浏览器导致上下文丢失是 MVP 可接受限制。正式保存只发生在登录后。

### 7.3 注册后的入口

SEO Growth Agent 接收公开报告后，先展示可执行的下一步，而不是重新询问全部输入：

- 基于品牌语气重新优化；
- 生成 Meta title + description；
- 创建 Content Brief；
- 检查关键词互食（需 GSC 权限）；
- 启动完整 SERP Research Workflow（需订阅或积分）；
- 创建 A/B 测试计划。

## 8. 首批 Skills、Tools 与 Workflow

### 8.1 首批 Skills

只迁移五项：

1. `headline-generator`
2. `meta-creator`
3. `keyword-mapper`
4. `content-analyzer`
5. `seo-optimizer`

迁移要求：

- 把原 Agent Prompt 改造成可组合的 `SKILL.md`；
- 删除特定公司占位符和不适用于 AI Marketing 的示例；
- 将外部数据和计算要求改成显式 Tool 调用；
- 不允许在没有数据时伪造 GSC、GA4、DataForSEO 或评分结果；
- 中英文规则分开验证，不能直接套用英文字符长度标准。

### 8.2 首批 Tools

匿名免费 Tool：

- `seo_title_score`：计算长度、像素宽度、关键词位置和候选间重复度。

注册付费 Tool：

- `dataforseo_serp`：查询 SERP 标题、摘要、排名、域名、搜索量、难度和 feature；每次调用前检查订阅/积分并记录费用。

后续再建设：

- GSC query/page 分析；
- GA4 landing page 转化分析；
- readability、keyword density、content length comparison；
- 页面抓取、内部链接和 schema 检查。

公开工具与 OpenCode Agent 复用同一评分 Tool 服务。DataForSEO 只注册到受权限控制的 Agent/Workflow Tool Registry，不注册到匿名工具运行面。

### 8.3 Workflow 模板

SEO Machine 的 Commands 转换为 Workflow 模板或 Agent 动作预设：

- Research Workflow：`/research`、`/research-serp`；
- Content Production Workflow：`/article`、`/write`；
- Existing Content Optimization Workflow：`/analyze-existing`、`/rewrite`、`/optimize`；
- Performance Review Workflow：`/performance-review`、`/priorities`；
- Landing Page Workflow：研究、写作、审计和 CRO 优化；
- Publish Workflow：`/publish-draft`，必须有用户确认和目标站点权限检查。

首期只需让 SEO Growth Agent 能识别这些后续方向，不要求同时实现全部 Workflow。

## 9. 当前项目适配情况

### 9.1 已有基础

- `lib/platform/custom-agents.ts`：支持 `direct_agent`、`workflow_backed`、Skill/Tool/MCP/Knowledge 绑定。
- `lib/ai-entry/shared-agent-skill-resolver.ts`：支持按 Agent 选择 Skill Bundle。
- `lib/ai-entry/shared-agent-skill-bundle.ts`：支持向 OpenCode Runtime 打包 `SKILL.md` 与 references。
- `lib/ai-entry/runtime/gateway.ts`：Business Agent 可路由到 Railway OpenCode Runtime。
- `lib/platform/business-agents.ts`：维护内置 `business-*` Agent 配置与产品入口。
- `lib/workflows/execution.ts`：支持 Workflow 图执行和同层节点并行。
- `content/skills/agency-agents/marketing/marketing-seo-specialist.md`：已有 SEO 专业角色基础。
- `content/skills/business-agents/seo-repurpose.md`：已有窄职责 SEO Repurpose Agent。

### 9.2 必须补齐

- `lib/ai-entry/skill-registry.ts` 当前仅注册少量 Skills，需要增加五个 SEO Skill。
- `lib/ai-entry/shared-agent-skill-bundle.ts` 当前只映射两个通用 Skill，需要增加 SEO Skill 目录映射。
- 增加服务端只读 SEO Skill loader，使匿名工具可以复用同一 `headline-generator/SKILL.md`，但不能加载任意客户端指定 Skill。
- `lib/ai-entry/agent-runtime-policy.ts` 需要增加 SEO Agent 的 Skill、Tool、MCP 白名单和预算。
- `lib/platform/business-agents.ts` 和 `lib/ai-entry/executive-skill-loader.ts` 需要注册 `business-seo-growth` 及其专业 Prompt 来源。
- 增加 DataForSEO 服务端连接器、凭据管理、超时、限流和费用日志。
- 增加可供网页与 Agent 共用的 SEO Title Scoring Tool。
- 增加 SEO Growth Agent 配置及与 Workflow 的绑定。
- 增加 SEO Title 专用页面组件和结构化 SSE API。

### 9.3 建议代码落点

```text
content/skills/
  headline-generator/SKILL.md
  meta-creator/SKILL.md
  keyword-mapper/SKILL.md
  content-analyzer/SKILL.md
  seo-optimizer/SKILL.md
  seo-machine-NOTICE.md

lib/seo-tools/
  dataforseo-serp.ts
  skill-loader.ts
  title-score.ts
  title-schema.ts
  title-report.ts

app/api/tools/seo-title-generator/analyze/route.ts
components/lead-tools/seo-title-analyzer.tsx

lib/ai-entry/skill-registry.ts
lib/ai-entry/shared-agent-skill-bundle.ts
lib/ai-entry/agent-runtime-policy.ts
lib/ai-entry/executive-skill-loader.ts
lib/platform/business-agents.ts
```

具体文件可在实施计划中根据已有模块规模调整，但不能把 DataForSEO、评分、Skill Prompt 和页面流式协议写在同一个文件中。

## 10. SEO 页面整改

### 10.1 搜索意图

页面主意图固定为：免费生成并分析 SEO title。页面应服务工具型查询，而不是变成关于 SEO title 的长篇通用文章。

保留 URL：

```text
/tools/seo-title-generator
```

建议搜索摘要方向：

- Title：`Free SEO Title Generator & Title Score | AI Marketing`
- Description：强调免费标题生成、规则评分、Google 预览和无需登录；不能暗示匿名结果已经使用实时 SERP。

最终文案在 UI 专项中确认，并根据英文/中文页面分别编写。

### 10.2 页面内容

服务端可抓取内容只保留高价值部分：

- 工具是什么、解决什么问题；
- 一个输入和结果示例；
- 评分方法说明；
- 与普通 headline generator 的差异；
- FAQ；
- Content Brief 和相关指南的内部链接。

不堆叠重复卡片、平台介绍或与当前任务无关的 Workflow 说明。

### 10.3 技术 SEO

- 校验 canonical、hreflang、sitemap、robots 和主域重定向；
- 确保 title、description、FAQ 与主内容存在于服务端 HTML；
- 保持同语言页面的 canonical 信号一致；
- 工具页与指南页使用差异化标题和搜索意图，避免关键词互食；
- 从相关指南和工具目录增加描述性内部链接。

## 11. 埋点与成功标准

### 11.1 漏斗事件

```text
tool_impression
tool_input_started
tool_analyze_submitted
tool_first_insight_received
tool_report_completed
tool_report_failed
paid_capability_impression
paid_capability_clicked
registration_started
registration_completed
subscription_or_credit_started
subscription_or_credit_completed
seo_agent_opened
paid_serp_started
paid_serp_completed
seo_workflow_started
```

不得把完整关键词、页面正文、SERP 数据或报告发送到通用分析平台。

### 11.2 运行指标

- Provider 首 Token 延迟；
- 首个洞察时间；
- 完整免费报告时间；
- SSE 断开率；
- 免费分析成功率；
- 单次匿名分析成本；
- 锁定模块曝光到点击率；
- 注册完成率；
- 注册到订阅/积分购买转化率；
- 注册后 SEO Agent 打开率。
- 仅在付费执行中记录 DataForSEO 延迟、错误率和单次成本。

### 11.3 首期验收目标

- 匿名报告成功率不低于 90%；
- P75 完整免费报告不超过 20 秒；
- 用户可以复制任意候选标题和完整报告；
- 完成报告后注册 CTA 点击率达到 8% 作为首期观察目标；
- 注册完成率达到 3% 作为首期观察目标；
- GSC 使用同排名区间 CTR 观察，而不是把排名变化误判为摘要效果；
- 7/14/28 天复盘展示、排名区间、CTR、工具使用和注册漏斗。

这些是产品验证目标，不是排名或转化保证。

## 12. 安全、成本与治理

- 公开 API 只接受固定 Schema，不接受任意 Prompt、Skill、Agent 或 Workflow ID。
- 按 IP 哈希、匿名 cookie 和工具 slug 限流；不保存原始 IP 到业务结果。
- 匿名 Tool Registry 不注册 DataForSEO、GSC/GA4、付费搜索、页面抓取或其他计费 Tool；服务端不能依赖前端隐藏状态判断权限。
- DataForSEO 请求必须同时通过登录身份、功能权限、订阅/积分余额检查，并在执行前预留、执行后结算或释放积分。
- 匿名模型调用单独设置每日预算、单用户窗口限额和硬超时；该预算不能转换为付费 Tool 调用额度。
- SEO Growth Agent 使用明确的 Skill、Tool 和 MCP 白名单。
- GSC、GA4 和发布凭据只能在登录后的用户/企业作用域使用。
- `publish-draft` 必须要求明确确认，不能由匿名工具或 Agent 自动发布。
- 外部页面内容和 SERP 摘要均视为不可信数据，不能覆盖系统指令。
- 从 SEO Machine 复制或改造的文件保留 MIT notice 和来源记录。

## 13. 测试策略

### 13.1 单元测试

- DataForSEO 付费连接器的响应规范化、费用记录和错误映射；
- 标题像素宽度、关键词位置、相似度和重复度评分；
- 中英文标题边界；
- SEO Title 输入、候选和完整报告 Schema；
- SSE 编码、事件顺序和最终报告组装；
- 五个 SEO Skill 的注册、允许列表和 Bundle 打包；
- SEO Growth Agent 的 Skill/Tool 权限。

### 13.2 集成测试

- 匿名请求只能运行固定 SEO Title 分析；
- 匿名请求中的 DataForSEO 和其他付费 Tool 调用次数为 0；
- 匿名用户直接请求付费 Tool API 时被服务端拒绝；
- 登录但无订阅/积分权限的用户不能运行 DataForSEO；
- 权限和余额充足时 DataForSEO 可以执行，并正确记录或结算消耗；
- Provider 只执行一次结构化生成；
- 免费 Provider/SSE 失败路径，以及登录后 DataForSEO 的独立失败和积分释放路径；
- 通用聊天内部事件不会进入工具 SSE；
- 注册后 sessionStorage 内容能带入 SEO Growth Agent；
- Workflow 能调用受控 SEO Agent/Skill。

### 13.3 端到端测试

- Google 落地页 -> 输入 -> 免费分析进度 -> 标题结果 -> 完整报告 -> 付费能力锁定卡片；
- 报告 -> 注册 -> 返回 -> SEO Growth Agent -> 权限/余额检查 -> 运行付费 SERP 分析；
- 匿名用户不能通过修改前端状态或直接调用接口绕过付费 Tool 限制；
- 复制标题、重试、断网和移动端；
- 页面刷新和浏览器关闭时符合 MVP 数据保留限制。

### 13.4 性能验证

- 免费路径只使用真实 Provider 测量冷/热路径，验证没有 DataForSEO 请求；
- 登录付费路径单独使用真实 DataForSEO 测量延迟、成本和超时；
- 记录 1、5、20 并发下的 P50/P75/P95；
- 验证反向代理不缓冲 SSE；
- 不以 Mock 延迟作为上线依据。

## 14. 实施阶段

### Phase 0：SEO 与观测基线

- 修正 SEO Title 页面意图、元数据、内部链接和技术 SEO。
- 上线匿名工具漏斗与延迟指标。
- 固化 GSC 页面和查询基线。

### Phase 1：共享专业能力

- 建设 SEO Title Scoring Tool。
- 将 `headline-generator` 转换为正式 Skill。
- 注册 Skill、Bundle 映射、匿名只读 loader 与免费 Tool 权限策略。

### Phase 2：公开 SEO Title 工具

- 新建专用输入、专业报告和结构化 SSE。
- 替换当前 `SeoMetaWorkbench titleOnly` 实现。
- 完成真实 Provider 性能和错误测试。

### Phase 3：注册与 SEO Growth Agent

- 发布 SEO Growth Agent。
- 完成 sessionStorage -> 注册回跳 -> Agent 上下文传递。
- 接入 DataForSEO 付费连接器、订阅/积分权限检查和费用日志。
- 增加保存、品牌上下文和下一步 Workflow 入口。

### Phase 4：能力扩充

- 依次迁移 `meta-creator`、`keyword-mapper`、`content-analyzer`、`seo-optimizer`。
- 根据 GSC 与漏斗数据决定第二个公开工具。
- 再评估 GSC、GA4、完整 SERP Research 和发布 Workflow。

### Phase 5：UI 专项

- 保持当前主题。
- 精简页面信息密度，突出输入、真实进度、专业报告和单一注册 CTA。
- 视觉调整不得改变本文的数据、权限和执行边界。

## 15. 验收清单

- [ ] 首期只整改 SEO Title 工具。
- [ ] 公开工具只使用一次模型结构化生成，DataForSEO 和其他付费 Tool 调用次数为 0。
- [ ] 匿名用户能看到完整专业报告，不在结果前登录。
- [ ] 免费报告包含意图假设、候选标题、解释性评分、预览和 A/B 建议，并明确标注未使用实时 SERP 验证。
- [ ] 页面展示实时 SERP、搜索量、竞品、GSC/GA4 等锁定模块，但不展示任何伪造的付费数据结果。
- [ ] 可计算评分来自 Tool，模型评分明确标注为判断性指标。
- [ ] 页面展示真实过程信息，不展示内部推理或虚假进度。
- [ ] 匿名链路不启动 OpenCode Agent。
- [ ] 不新增 Guest Run 数据库、Fast Profile Compiler 或通用发布平台。
- [ ] `headline-generator` Skill 名称保持不变。
- [ ] SEO Growth Agent 可在注册后复用 Skill、Tool、Knowledge 和 Workflow。
- [ ] `business-seo-repurpose` 的既有职责不被扩大或破坏。
- [ ] 评分 Tool 可被网页工具与 Agent 复用；DataForSEO 只注册到登录后的 Agent/Workflow Tool Registry。
- [ ] 登录、订阅/功能权限和积分检查在服务端执行，前端状态不能绕过。
- [ ] 注册回跳能恢复同一浏览器 sessionStorage 上下文。
- [ ] SEO Machine 来源与 MIT notice 被保留。
- [ ] 技术 SEO、性能、错误、成本和转化指标均可观测。
- [ ] UI 变更作为独立阶段，保持当前 AI Marketing 主题。

## 16. 最终决策

本方案采用混合结构：

```text
公开获客：不调用付费数据源的专业 SEO 标题报告
付费预览：真实 SERP、竞品、GSC/GA4 等锁定能力
注册承接：SEO Growth Agent + 订阅/积分权限检查
专业方法：保留原名的 SEO Skills
免费依据：确定性评分 Tool + 明确标注的模型判断
付费依据：DataForSEO 与用户授权的数据连接器
长任务执行：Workflow 与 Artifacts
企业差异化：Brand/SEO Knowledge
```

这一结构既解决当前 SEO Title 页面价值不足和注册链路缺失的问题，又复用现有 OpenCode Agent、Skill Runtime、Workflow 和知识库投资。匿名用户获得完整且诚实的免费专业报告，同时清楚看到付费数据能力的增量价值；注册和付费后才允许真实执行 DataForSEO 等计费 Tool。首期不追求迁移 SEO Machine 全部能力，而是先验证自然流量、免费工具使用、锁定能力点击、注册和付费转化，再按数据扩展。
