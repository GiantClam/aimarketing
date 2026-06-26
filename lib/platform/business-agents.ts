import {
  WORKSPACE_BUSINESS_SLUGS,
  type WorkspaceBusinessSlug,
} from "@/lib/platform/workspace-business"

type LocalizedText = {
  zh: string
  en: string
}

export type BusinessAgentArtifactKind =
  | "brief"
  | "plan"
  | "copy"
  | "asset"
  | "workflow_result"
  | "knowledge_note"
  | "report"

export type BusinessAgentConfig = {
  businessSlug: WorkspaceBusinessSlug
  agentId: string
  promptDocumentPath: string
  name: LocalizedText
  summary: LocalizedText
  systemPromptSummary: LocalizedText
  samplePrompts: LocalizedText[]
  workflowSlugs: string[]
  artifactKinds: BusinessAgentArtifactKind[]
}

export type LocalizedBusinessAgentConfig = Omit<
  BusinessAgentConfig,
  "name" | "summary" | "systemPromptSummary" | "samplePrompts"
> & {
  name: string
  summary: string
  systemPromptSummary: string
  samplePrompts: string[]
}

const BUSINESS_AGENTS: BusinessAgentConfig[] = [
  {
    businessSlug: "content-growth",
    agentId: "business-content-growth",
    promptDocumentPath: "content-growth.md",
    name: { zh: "内容增长智能体", en: "Content Growth Agent" },
    summary: {
      zh: "围绕选题、SEO、分发与复用，帮助团队形成可执行的内容增长动作。",
      en: "Helps teams turn planning, SEO, distribution, and reuse into executable content-growth actions.",
    },
    systemPromptSummary: {
      zh: "优先给出内容目标、受众、分发渠道、复用结构与下一步实验建议，不输出空泛灵感清单。",
      en: "Prioritizes audience, distribution, repurposing structure, and next experiments instead of vague ideation.",
    },
    samplePrompts: [
      { zh: "围绕 AI 营销自动化，给我一周的内容选题和 SEO 切入点。", en: "Build a one-week content plan and SEO angles around AI marketing automation." },
      { zh: "把这篇长文拆成公众号、官网和销售外联可复用的三种版本。", en: "Repurpose this long-form article into website, social, and sales-enablement variants." },
      { zh: "根据这个 landing page，找出最值得先做的内容增长实验。", en: "Given this landing page, identify the highest-priority content-growth experiments." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["brief", "copy", "workflow_result", "knowledge_note"],
  },
  {
    businessSlug: "content-growth",
    agentId: "business-seo-repurpose",
    promptDocumentPath: "seo-repurpose.md",
    name: { zh: "SEO 复用智能体", en: "SEO Repurpose Agent" },
    summary: {
      zh: "专注关键词切入、内容复用和搜索流量承接，把单次内容变成持续产出。",
      en: "Specializes in keyword angles, repurposing, and turning one asset into an ongoing search-output loop.",
    },
    systemPromptSummary: {
      zh: "优先输出关键词、结构改写、内容复用序列和搜索承接建议，不做泛泛 SEO 教科书回答。",
      en: "Prioritizes keywords, structure rewrites, repurposing sequences, and search capture recommendations.",
    },
    samplePrompts: [
      { zh: "把这篇文章拆成 5 个更适合搜索流量承接的长尾主题。", en: "Break this article into five long-tail topics better suited for search capture." },
      { zh: "根据这篇内容，整理一版站内 SEO 改写清单。", en: "Turn this article into an onsite SEO rewrite checklist." },
      { zh: "给我一版从长文到 FAQ、案例页和 landing page 的复用路径。", en: "Create a reuse path from one article into FAQ, case study, and landing page outputs." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["copy", "brief", "workflow_result", "report"],
  },
  {
    businessSlug: "content-growth",
    agentId: "business-aeo-foundations",
    promptDocumentPath: "business-aeo-foundations.md",
    name: { zh: "AEO 基础优化智能体", en: "AEO Foundations Agent" },
    summary: {
      zh: "围绕问题簇、实体清晰度、FAQ、页面结构和证据缺口，提升内容被回答引擎理解与引用的基础能力。",
      en: "Improves answer-engine readiness through question clusters, entity clarity, FAQ structure, page fixes, and proof gaps.",
    },
    systemPromptSummary: {
      zh: "优先输出 AEO 诊断、问题簇、实体与证据表、页面结构修正和发布 backlog，不把 AEO 回答成传统 SEO 套话。",
      en: "Prioritizes AEO diagnosis, question clusters, entity and proof tables, page-structure fixes, and a publishing backlog.",
    },
    samplePrompts: [
      { zh: "审查这个产品页，哪些结构会影响它被 AI 搜索答案引用？", en: "Audit this product page for structure issues that affect AI answer citation." },
      { zh: "围绕 AI 营销工具，整理一版可被回答引擎提取的问题簇和 FAQ。", en: "Build answer-engine question clusters and FAQs around AI marketing tools." },
      { zh: "把这些文章改成更适合 AEO 的页面结构和内部链接计划。", en: "Turn these articles into an AEO page-structure and internal-linking plan." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["report", "brief", "plan", "knowledge_note"],
  },
  {
    businessSlug: "content-growth",
    agentId: "business-ai-citation-strategist",
    promptDocumentPath: "business-ai-citation-strategist.md",
    name: { zh: "AI 引用策略智能体", en: "AI Citation Strategist Agent" },
    summary: {
      zh: "审查品牌、产品、专家和页面的 AI 可引用性，补齐实体一致性、公开证据和第三方可信信号。",
      en: "Audits AI citation readiness for brands, products, experts, and pages by strengthening entity consistency, public proof, and third-party signals.",
    },
    systemPromptSummary: {
      zh: "优先输出实体一致性、证据来源、引用缺口、第三方存在感和 60 天路线图，不承诺可操控 AI 答案排名。",
      en: "Prioritizes entity consistency, proof sources, citation gaps, third-party presence, and a 60-day roadmap without claiming control over AI answers.",
    },
    samplePrompts: [
      { zh: "分析我们的网站和资料，为什么 AI 搜索不容易引用我们？", en: "Analyze why AI search systems may not cite our site and materials." },
      { zh: "为这个 SaaS 产品做一版 AI citation readiness 审计。", en: "Create an AI citation readiness audit for this SaaS product." },
      { zh: "围绕这些目标查询，规划一版公开证据和第三方信号补强路线。", en: "Plan public proof and third-party signal improvements for these target queries." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["report", "plan", "knowledge_note", "brief"],
  },
  {
    businessSlug: "content-growth",
    agentId: "business-xiaohongshu-growth-strategist",
    promptDocumentPath: "business-xiaohongshu-growth-strategist.md",
    name: { zh: "小红书增长策略智能体", en: "Xiaohongshu Growth Strategist Agent" },
    summary: {
      zh: "围绕小红书搜索流量、关键词前置、笔记结构、封面标题、评论承接和私域转化设计种草增长系统。",
      en: "Builds Xiaohongshu growth systems around search traffic, keyword-first notes, cover and title strategy, comment conversion, and private-domain handoff.",
    },
    systemPromptSummary: {
      zh: "优先输出账号定位、关键词矩阵、30 天选题、笔记脚本、爆文拆解和风险提醒，不套用英文社媒模板。",
      en: "Prioritizes positioning, keyword matrices, 30-day topics, note scripts, viral teardown, and policy risks instead of translated social templates.",
    },
    samplePrompts: [
      { zh: "为这个 AI 营销产品设计一版小红书账号定位和 30 天选题。", en: "Design Xiaohongshu positioning and a 30-day topic plan for this AI marketing product." },
      { zh: "拆解这些小红书爆文，提炼标题、封面和笔记结构规律。", en: "Teardown these Xiaohongshu viral notes and extract title, cover, and structure patterns." },
      { zh: "写一篇面向老板和市场负责人的小红书种草笔记，带关键词和评论区承接。", en: "Write a Xiaohongshu seeding note for founders and marketing leads with keywords and comment follow-up." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["plan", "copy", "brief", "report"],
  },
  {
    businessSlug: "content-growth",
    agentId: "business-tiktok-growth-strategist",
    promptDocumentPath: "business-tiktok-growth-strategist.md",
    name: { zh: "TikTok 增长策略智能体", en: "TikTok Growth Strategist Agent" },
    summary: {
      zh: "围绕 TikTok 账号定位、前三秒 Hook、UGC/创始人/产品演示脚本、素材测试和投流联动设计增长方案。",
      en: "Plans TikTok growth through positioning, first-three-second hooks, UGC/founder/demo scripts, creative testing, and paid-organic linkage.",
    },
    systemPromptSummary: {
      zh: "优先输出 Hook 矩阵、视频脚本、素材测试计划、发布节奏和复盘指标，不写泛短视频建议。",
      en: "Prioritizes hook matrices, scripts, creative tests, publishing cadence, and review metrics instead of generic short-video advice.",
    },
    samplePrompts: [
      { zh: "为这个产品做一版 TikTok Hook 矩阵和 7 天视频测试计划。", en: "Create a TikTok hook matrix and 7-day video testing plan for this product." },
      { zh: "把这个卖点改成 founder-led、UGC 和 product demo 三种脚本。", en: "Turn this value proposition into founder-led, UGC, and product-demo scripts." },
      { zh: "根据这些视频数据，判断下一轮该保留哪些创意模式。", en: "Use these video metrics to decide which creative patterns to keep next." },
    ],
    workflowSlugs: ["visual-ad-pipeline", "campaign-launch"],
    artifactKinds: ["copy", "plan", "asset", "report"],
  },
  {
    businessSlug: "content-growth",
    agentId: "business-wechat-content-operator",
    promptDocumentPath: "business-wechat-content-operator.md",
    name: { zh: "微信内容与私域运营智能体", en: "WeChat Content Operator Agent" },
    summary: {
      zh: "围绕公众号栏目、服务号/订阅号差异、企微标签、自动回复、社群 SOP 和内容转化路径组织微信私域运营。",
      en: "Structures WeChat content and private-domain operations across columns, account types, WeCom tags, auto-replies, community SOPs, and conversion paths.",
    },
    systemPromptSummary: {
      zh: "优先输出栏目规划、私域承接流程、企微标签、自动回复和社群 SOP，不把微信运营写成普通 newsletter 策略。",
      en: "Prioritizes column plans, private-domain handoff, WeCom tags, auto-replies, and community SOPs instead of generic newsletter strategy.",
    },
    samplePrompts: [
      { zh: "为 AI 营销工具设计公众号栏目、菜单和企微承接流程。", en: "Design Official Account columns, menu structure, and WeCom handoff for an AI marketing tool." },
      { zh: "把这篇文章改成公众号版本，并设计自动回复和私域转化路径。", en: "Rewrite this article for WeChat and design auto-replies plus private-domain conversion." },
      { zh: "给我一版微信社群运营 SOP 和朋友圈内容节奏。", en: "Create a WeChat community SOP and Moments content cadence." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["plan", "copy", "workflow_result", "knowledge_note"],
  },
  {
    businessSlug: "content-growth",
    agentId: "business-content-growth-strategist",
    promptDocumentPath: "business-content-growth-strategist.md",
    name: { zh: "内容增长策略智能体", en: "Content Growth Strategist Agent" },
    summary: {
      zh: "用定位、主题簇、渠道格式、复用分发、转化路径和周复盘搭建可执行内容增长系统。",
      en: "Builds executable content-growth systems across positioning, topic clusters, channel formats, reuse, distribution, conversion, and review loops.",
    },
    systemPromptSummary: {
      zh: "优先输出主题簇、30 天日历、渠道适配矩阵、复用路径和周复盘评分卡，不给零散灵感清单。",
      en: "Prioritizes topic clusters, 30-day calendars, channel adaptation, reuse paths, and weekly scorecards instead of disconnected ideas.",
    },
    samplePrompts: [
      { zh: "围绕 AI 营销平台，搭一版从内容生产到转化的 30 天增长系统。", en: "Build a 30-day content-to-conversion growth system for an AI marketing platform." },
      { zh: "把这组客户问题整理成主题簇、渠道适配和销售复用素材。", en: "Turn these customer questions into topic clusters, channel adaptations, and sales reuse assets." },
      { zh: "审查我们现有内容，找出下月最值得做的增长实验。", en: "Audit our current content and identify next month's highest-priority growth experiments." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["plan", "brief", "copy", "report"],
  },
  {
    businessSlug: "paid-media",
    agentId: "business-ppc-strategist",
    promptDocumentPath: "business-ppc-strategist.md",
    name: { zh: "PPC 搜索广告策略智能体", en: "PPC Strategist Agent" },
    summary: {
      zh: "围绕搜索广告账户结构、关键词意图、预算分配、搜索词报告、否词和转化追踪设计 PPC 优化方案。",
      en: "Plans PPC optimization across account structure, keyword intent, budget allocation, search queries, negatives, and conversion tracking.",
    },
    systemPromptSummary: {
      zh: "优先输出账户结构、关键词矩阵、浪费预算、追踪风险和 30 天优化计划，不在追踪未验证前建议扩量。",
      en: "Prioritizes account structure, keyword matrices, wasted spend, tracking risks, and a 30-day plan before recommending scale.",
    },
    samplePrompts: [
      { zh: "审计我的 Google Ads 账户结构，找出浪费预算和优先修复项。", en: "Audit my Google Ads account structure and identify wasted spend and priority fixes." },
      { zh: "为一个新 SaaS 产品制定 PPC 上线计划和关键词矩阵。", en: "Create a PPC launch plan and keyword matrix for a new SaaS product." },
      { zh: "分析这份搜索词报告，给出否词和匹配方式优化建议。", en: "Analyze this search query report and suggest negative keywords plus match-type changes." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["report", "plan", "brief", "workflow_result"],
  },
  {
    businessSlug: "paid-media",
    agentId: "business-paid-social-strategist",
    promptDocumentPath: "business-paid-social-strategist.md",
    name: { zh: "付费社媒投放策略智能体", en: "Paid Social Strategist Agent" },
    summary: {
      zh: "围绕 Meta、TikTok、LinkedIn 等社媒广告的受众、素材、预算、漏斗和测试节奏设计投放策略。",
      en: "Designs paid social strategy across audiences, creative, budget, funnel stages, and testing cadence for Meta, TikTok, LinkedIn, and similar platforms.",
    },
    systemPromptSummary: {
      zh: "优先输出漏斗结构、受众假设、素材测试矩阵、预算节奏和周复盘规则，不做泛平台建议。",
      en: "Prioritizes funnel structure, audience hypotheses, creative test matrices, budget cadence, and weekly readout rules.",
    },
    samplePrompts: [
      { zh: "为这个 B2B 产品设计 Meta 和 LinkedIn 的付费社媒测试结构。", en: "Design a Meta and LinkedIn paid social test structure for this B2B product." },
      { zh: "根据这些素材和预算，做一版付费社媒 30 天投放计划。", en: "Build a 30-day paid social plan from these assets and budget." },
      { zh: "审查我们的 paid social 账户，判断问题在受众、素材还是落地页。", en: "Audit our paid social account and diagnose whether the issue is audience, creative, or landing page." },
    ],
    workflowSlugs: ["campaign-launch", "visual-ad-pipeline"],
    artifactKinds: ["plan", "report", "asset", "workflow_result"],
  },
  {
    businessSlug: "paid-media",
    agentId: "business-ad-creative-strategist",
    promptDocumentPath: "business-ad-creative-strategist.md",
    name: { zh: "广告创意策略智能体", en: "Ad Creative Strategist Agent" },
    summary: {
      zh: "把卖点、痛点、证据和平台语境转成可测试广告创意、Hook、UGC 脚本和素材生产 brief。",
      en: "Turns offers, pains, proof, and platform context into testable ad concepts, hooks, UGC scripts, and production briefs.",
    },
    systemPromptSummary: {
      zh: "优先输出创意角度、Hook 矩阵、素材 brief、测试假设和风险提示，每条创意都说明验证什么。",
      en: "Prioritizes creative angles, hook matrices, production briefs, test hypotheses, and risk flags with a clear learning goal for each concept.",
    },
    samplePrompts: [
      { zh: "把这个卖点拆成 10 个广告 Hook 和 4 条素材测试路线。", en: "Turn this value proposition into 10 ad hooks and four creative test routes." },
      { zh: "为这个落地页设计一批 UGC、Founder-led 和产品演示广告脚本。", en: "Create UGC, founder-led, and product-demo ad scripts for this landing page." },
      { zh: "审查这些广告素材，判断疲劳、信息层级和下一轮测试方向。", en: "Review these ads for fatigue, message hierarchy, and next test direction." },
    ],
    workflowSlugs: ["visual-ad-pipeline", "campaign-launch"],
    artifactKinds: ["asset", "copy", "brief", "report"],
  },
  {
    businessSlug: "paid-media",
    agentId: "business-paid-media-auditor",
    promptDocumentPath: "business-paid-media-auditor.md",
    name: { zh: "付费投放审计智能体", en: "Paid Media Auditor Agent" },
    summary: {
      zh: "审计付费搜索、社媒、展示和再营销投放，定位浪费预算、追踪缺口、结构问题和误导性指标。",
      en: "Audits paid search, social, display, and retargeting to find wasted spend, tracking gaps, structural issues, and misleading metrics.",
    },
    systemPromptSummary: {
      zh: "优先输出追踪 P0、浪费预算清单、风险评分和 stop/fix/test/scale 行动计划，不直接给模糊 ROI 建议。",
      en: "Prioritizes tracking P0s, wasted-spend findings, risk scores, and stop/fix/test/scale actions instead of vague ROI advice.",
    },
    samplePrompts: [
      { zh: "审计这份跨渠道投放数据，按浪费预算和修复优先级排序。", en: "Audit this cross-channel media data and rank wasted spend plus fixes." },
      { zh: "帮我判断当前付费投放问题是追踪、账户结构、素材还是落地页。", en: "Diagnose whether our paid media problem is tracking, structure, creative, or landing page." },
      { zh: "做一版投放账户的 stop、fix、test、scale 行动清单。", en: "Create a stop, fix, test, and scale action list for this ad account." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["report", "plan", "brief", "knowledge_note"],
  },
  {
    businessSlug: "paid-media",
    agentId: "business-tracking-analytics-specialist",
    promptDocumentPath: "business-tracking-analytics-specialist.md",
    name: { zh: "追踪与归因分析智能体", en: "Tracking Analytics Specialist Agent" },
    summary: {
      zh: "围绕像素、事件、UTM、转化、CRM 回传、看板指标和归因风险建立营销追踪治理体系。",
      en: "Builds marketing tracking governance across pixels, events, UTMs, conversions, CRM feedback, dashboards, and attribution risk.",
    },
    systemPromptSummary: {
      zh: "优先输出事件 taxonomy、UTM 规范、漏斗测量图、QA 清单和归因风险，不只解释平台报表。",
      en: "Prioritizes event taxonomy, UTM rules, funnel measurement maps, QA checklists, and attribution risks beyond platform reports.",
    },
    samplePrompts: [
      { zh: "为这次广告投放做一版 tracking readiness check。", en: "Create a tracking readiness check for this campaign launch." },
      { zh: "整理我们的事件命名、UTM 规则和 CRM 回传字段。", en: "Organize our event naming, UTM rules, and CRM feedback fields." },
      { zh: "审查这个漏斗的归因风险，告诉我哪些数据不能直接用于扩量决策。", en: "Audit attribution risk in this funnel and identify which data should not drive scaling decisions." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["plan", "report", "workflow_result", "knowledge_note"],
  },
  {
    businessSlug: "finance",
    agentId: "business-pricing-analyst",
    promptDocumentPath: "business-pricing-analyst.md",
    name: { zh: "定价分析智能体", en: "Pricing Analyst Agent" },
    summary: {
      zh: "围绕套餐、价值指标、折扣治理、毛利、客户分层和定价实验，帮助团队做可执行定价决策。",
      en: "Supports pricing decisions across packaging, value metrics, discount governance, margin, segmentation, and pricing experiments.",
    },
    systemPromptSummary: {
      zh: "优先输出定价审计、套餐矩阵、折扣规则、敏感性分析和决策备忘录，不把定价写成泛商业建议。",
      en: "Prioritizes pricing audits, package matrices, discount rules, sensitivity briefs, and decision memos instead of generic business advice.",
    },
    samplePrompts: [
      { zh: "审查我们的 SaaS 套餐和折扣规则，找出定价泄漏。", en: "Audit our SaaS packages and discount rules for pricing leakage." },
      { zh: "为这个 AI 营销工具设计三档套餐和升级逻辑。", en: "Design three pricing tiers and upgrade logic for this AI marketing tool." },
      { zh: "根据这些客户反馈，给出一版定价实验和风险控制计划。", en: "Use this customer feedback to design a pricing experiment and risk-control plan." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["report", "plan", "brief", "knowledge_note"],
  },
  {
    businessSlug: "brand-creative",
    agentId: "business-brand-creative",
    promptDocumentPath: "brand-creative.md",
    name: { zh: "品牌创意智能体", en: "Brand Creative Agent" },
    summary: {
      zh: "围绕品牌叙事、创意方向、提案与素材沉淀，组织统一创作工作台。",
      en: "Organizes brand narrative, creative direction, proposals, and asset retention in one creative workbench.",
    },
    systemPromptSummary: {
      zh: "优先产出可落地的品牌叙事、视觉方向、提案结构和素材建议，不停留在风格形容词堆叠。",
      en: "Produces executable narrative, visual direction, proposal structure, and asset guidance instead of adjective-heavy mood talk.",
    },
    samplePrompts: [
      { zh: "给这次新品发布做 3 条品牌叙事方向，并说明适合的视觉语言。", en: "Propose three narrative territories for this launch and the right visual language for each." },
      { zh: "把现有提案改成更适合 CEO 和市场负责人共同评审的版本。", en: "Rewrite the current proposal for a CEO and marketing-lead review setting." },
      { zh: "基于这个 campaign brief，整理图片、PPT 和文案协同生产清单。", en: "Turn this campaign brief into a coordinated copy, deck, and image production plan." },
    ],
    workflowSlugs: ["campaign-launch", "visual-ad-pipeline"],
    artifactKinds: ["brief", "copy", "asset", "workflow_result"],
  },
  {
    businessSlug: "brand-creative",
    agentId: "business-campaign-creative",
    promptDocumentPath: "campaign-creative.md",
    name: { zh: "Campaign 创意智能体", en: "Campaign Creative Agent" },
    summary: {
      zh: "更偏 campaign 执行与创意物料协调，帮助团队组织广告、图片、文案和提案物料。",
      en: "Focuses on campaign execution and creative asset coordination across ads, visuals, copy, and decks.",
    },
    systemPromptSummary: {
      zh: "优先给出 campaign 主题、创意拆分、素材需求和投放前的协同清单。",
      en: "Prioritizes campaign themes, creative breakdowns, asset needs, and pre-launch coordination checklists.",
    },
    samplePrompts: [
      { zh: "围绕这次活动主题，拆 3 组广告创意路线和素材需求。", en: "Break this campaign into three ad-creative routes with asset requirements." },
      { zh: "把这个 brief 变成图片、PPT 和落地页协同生产计划。", en: "Turn this brief into a coordinated production plan for image, deck, and landing page teams." },
      { zh: "根据现有视觉方向，帮我做一版对外提案结构。", en: "Based on the current visual direction, build an external proposal structure." },
    ],
    workflowSlugs: ["campaign-launch", "visual-ad-pipeline"],
    artifactKinds: ["asset", "brief", "copy", "workflow_result"],
  },
  {
    businessSlug: "brand-creative",
    agentId: "business-video-creative",
    promptDocumentPath: "video-creative.md",
    name: { zh: "视频创意智能体", en: "Video Creative Agent" },
    summary: {
      zh: "围绕脚本、镜头结构、视觉节奏和视频卖点包装，帮助团队把创意方向转成可执行视频方案。",
      en: "Turns campaign narrative, shot structure, pacing, and offer framing into executable video concepts.",
    },
    systemPromptSummary: {
      zh: "优先输出脚本结构、镜头节奏、关键信息呈现和素材需求，不停留在抽象创意描述。",
      en: "Prioritizes scripts, pacing, key-message presentation, and asset needs instead of abstract video mood talk.",
    },
    samplePrompts: [
      { zh: "围绕这次新品发布，给我 3 条适合短视频投放的创意脚本路线。", en: "Create three short-form ad script routes for this product launch." },
      { zh: "把这个品牌 campaign brief 转成视频脚本结构、镜头节奏和素材清单。", en: "Turn this campaign brief into a video script structure, pacing plan, and asset checklist." },
      { zh: "根据当前提案，帮我整理 CEO 可快速过稿的视频核心卖点和镜头顺序。", en: "From the current pitch, organize the core video selling points and shot order for a fast CEO review." },
    ],
    workflowSlugs: ["visual-ad-pipeline", "campaign-launch"],
    artifactKinds: ["asset", "brief", "copy", "workflow_result"],
  },
  {
    businessSlug: "lead-conversion",
    agentId: "business-lead-conversion",
    promptDocumentPath: "lead-conversion.md",
    name: { zh: "获客转化智能体", en: "Lead Conversion Agent" },
    summary: {
      zh: "围绕目标客户识别、线索筛选、触达准备与转化动作，组织获客前链路。",
      en: "Structures acquisition work across target selection, qualification, outreach prep, and conversion moves.",
    },
    systemPromptSummary: {
      zh: "优先收敛 ICP、线索优先级、外联角度和下一步转化动作，不输出泛泛的获客建议。",
      en: "Prioritizes ICP, lead ranking, outreach angles, and next conversion steps rather than generic growth advice.",
    },
    samplePrompts: [
      { zh: "帮我定义一版适合 AI 营销平台的 ICP 和优先触达顺序。", en: "Define an ICP and first-pass target-account priority order for an AI marketing platform." },
      { zh: "根据这批线索信息，按成交可能性和切入理由做分层。", en: "Tier this lead batch by close likelihood and best entry angle." },
      { zh: "围绕教育行业客户，生成一版首次外联话术和跟进节奏。", en: "Create first-touch outreach messaging and follow-up pacing for education-sector accounts." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["brief", "plan", "workflow_result", "report"],
  },
  {
    businessSlug: "lead-conversion",
    agentId: "business-outreach-planner",
    promptDocumentPath: "outreach-planner.md",
    name: { zh: "外联转化智能体", en: "Outreach Conversion Agent" },
    summary: {
      zh: "专注线索触达、外联节奏和初次转化推进，让获客动作更像可执行销售前链路。",
      en: "Focuses on outreach, cadence, and first-touch conversion progression for pre-sales teams.",
    },
    systemPromptSummary: {
      zh: "优先给出外联文案、跟进节奏、转化门槛和下一步推进条件。",
      en: "Prioritizes outreach copy, follow-up cadence, conversion thresholds, and the next advancement condition.",
    },
    samplePrompts: [
      { zh: "根据这组客户画像，写一版冷启动外联文案。", en: "Write a cold outreach sequence for this account segment." },
      { zh: "客户第一次回复后，应该怎么分三轮推进？", en: "After the first reply, how should we structure the next three follow-ups?" },
      { zh: "帮我整理一版从线索到 demo 预约的转化节奏。", en: "Design a lead-to-demo cadence for this pipeline stage." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["copy", "plan", "brief", "report"],
  },
  {
    businessSlug: "sales-close",
    agentId: "business-sales-close",
    promptDocumentPath: "sales-close.md",
    name: { zh: "销售成交智能体", en: "Sales Close Agent" },
    summary: {
      zh: "围绕成交推进、异议处理、提案说法与会后跟进，提供销售专家工作台。",
      en: "Provides an expert workbench for close strategy, objections, proposal language, and follow-up actions.",
    },
    systemPromptSummary: {
      zh: "优先给出成交风险、应答策略、提案结构与下一轮推进动作，不输出空洞鼓励语。",
      en: "Prioritizes risks, response strategy, pitch structure, and next-step progression instead of motivational filler.",
    },
    samplePrompts: [
      { zh: "客户说预算不足但想先试点，帮我组织一轮更容易推进的回应。", en: "The buyer says budget is tight but open to a pilot. Draft a response that keeps momentum." },
      { zh: "根据这次会议纪要，整理成交风险和 48 小时内的跟进动作。", en: "Turn this meeting summary into close risks and a 48-hour follow-up plan." },
      { zh: "把当前提案改成更适合 CFO 审阅的版本。", en: "Rewrite the current proposal for a CFO review." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "copy", "report", "knowledge_note"],
  },
  {
    businessSlug: "sales-close",
    agentId: "business-objection-handler",
    promptDocumentPath: "objection-handler.md",
    name: { zh: "异议处理智能体", en: "Objection Handling Agent" },
    summary: {
      zh: "专门处理客户疑虑、报价摩擦和跟进推进，适合销售一线快速复盘与改写回应。",
      en: "Specializes in buyer objections, pricing friction, and follow-up progression for frontline sales teams.",
    },
    systemPromptSummary: {
      zh: "优先识别异议背后的真实阻力，输出回应逻辑、措辞和下一步推进动作。",
      en: "Focuses on the real blocker behind the objection, then drafts response logic, wording, and next steps.",
    },
    samplePrompts: [
      { zh: "客户担心上线成本太高，怎么回应更容易推进试点？", en: "The buyer thinks rollout cost is too high. How do we answer and keep the pilot alive?" },
      { zh: "客户一直拖着不确认下一步，帮我重写跟进话术。", en: "The buyer keeps delaying. Rewrite the follow-up language." },
      { zh: "把这次异议处理整理成团队可复用的话术卡。", en: "Turn this objection pattern into a reusable team response card." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["copy", "report", "knowledge_note", "brief"],
  },
  {
    businessSlug: "enterprise-operations",
    agentId: "business-enterprise-operations",
    promptDocumentPath: "enterprise-operations.md",
    name: { zh: "企业运营智能体", en: "Enterprise Operations Agent" },
    summary: {
      zh: "围绕任务、工作流、用量、协作与治理，帮助企业运营团队看清执行状态。",
      en: "Helps operations teams make sense of tasks, workflows, usage, collaboration, and governance posture.",
    },
    systemPromptSummary: {
      zh: "优先输出执行状态、瓶颈、协作风险与治理建议，不做泛管理学总结。",
      en: "Focuses on execution state, bottlenecks, collaboration risks, and governance actions instead of generic management talk.",
    },
    samplePrompts: [
      { zh: "根据最近任务和工作流状态，帮我总结本周的运营风险。", en: "Summarize this week’s operational risks from recent task and workflow status." },
      { zh: "如果下周要扩 20 个席位，平台治理和支持动作该怎么准备？", en: "If we expand by 20 seats next week, what governance and enablement steps should we prepare?" },
      { zh: "把最近的任务积压整理成可执行的运营复盘框架。", en: "Turn the current task backlog into an actionable operations review framework." },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["plan", "report", "workflow_result", "knowledge_note"],
  },
  {
    businessSlug: "enterprise-operations",
    agentId: "business-governance-capacity",
    promptDocumentPath: "governance-capacity.md",
    name: { zh: "席位与治理智能体", en: "Seats and Governance Agent" },
    summary: {
      zh: "更偏席位规划、算力治理、协作规则和扩容节奏，帮助管理员做平台治理动作。",
      en: "Focuses on seat planning, compute governance, collaboration rules, and expansion pacing for admins.",
    },
    systemPromptSummary: {
      zh: "优先输出席位、用量、算力和协作边界建议，不做空泛治理口号。",
      en: "Prioritizes seat, usage, compute, and collaboration-boundary recommendations.",
    },
    samplePrompts: [
      { zh: "按当前任务量，帮我估算下一阶段席位和算力规划。", en: "Estimate the next seat and compute plan from current task volume." },
      { zh: "如果要给营销和销售团队分别开放能力，治理边界怎么设？", en: "How should we define governance boundaries when opening capabilities to marketing and sales separately?" },
      { zh: "帮我整理一版管理员每周治理检查清单。", en: "Create a weekly governance checklist for admins." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["plan", "report", "knowledge_note"],
  },
  {
    businessSlug: "knowledge-assets",
    agentId: "business-knowledge-assets",
    promptDocumentPath: "knowledge-assets.md",
    name: { zh: "知识与资产智能体", en: "Knowledge and Assets Agent" },
    summary: {
      zh: "围绕素材、作品、知识沉淀与复用策略，组织企业资产视角下的工作台。",
      en: "Organizes asset, work, knowledge-retention, and reuse strategy in one business-facing workbench.",
    },
    systemPromptSummary: {
      zh: "优先梳理哪些内容该沉淀、如何分类、如何复用，不把知识管理回答成抽象方法论。",
      en: "Prioritizes what should be retained, how it should be categorized, and how it can be reused.",
    },
    samplePrompts: [
      { zh: "根据最近的素材和作品，帮我整理一版可复用的资产分类方案。", en: "Create a reusable taxonomy from the latest artifacts and work items." },
      { zh: "哪些输出值得加入知识库，应该怎么写入和命名？", en: "Which outputs are worth saving into knowledge, and how should we name and file them?" },
      { zh: "帮我规划一个团队复用最近优质内容产物的机制。", en: "Design a team reuse loop for our latest high-quality content outputs." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["asset", "knowledge_note", "report", "workflow_result"],
  },
  {
    businessSlug: "knowledge-assets",
    agentId: "business-asset-curator",
    promptDocumentPath: "asset-curator.md",
    name: { zh: "资产整理智能体", en: "Asset Curator Agent" },
    summary: {
      zh: "更偏素材整理、作品升格和团队复用，帮助把零散输出变成可管理资产。",
      en: "Focuses on asset curation, work-item promotion, and team reuse so outputs become manageable assets.",
    },
    systemPromptSummary: {
      zh: "优先建议哪些内容该保留为素材、哪些该升格为作品、哪些该写入知识库。",
      en: "Prioritizes what should stay as an artifact, what should be promoted to work, and what belongs in knowledge.",
    },
    samplePrompts: [
      { zh: "这批输出里，哪些应该保留为素材，哪些应该升格成作品？", en: "From this batch of outputs, which should remain artifacts and which should be promoted into work items?" },
      { zh: "帮我整理一版作品库命名和归档规范。", en: "Draft a naming and filing policy for the work library." },
      { zh: "从最近的内容产物里挑出最值得写入知识库的条目。", en: "Identify the recent outputs most worth saving into the knowledge base." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["asset", "report", "knowledge_note", "workflow_result"],
  },
  {
    businessSlug: "knowledge-assets",
    agentId: "business-video-asset-ops",
    promptDocumentPath: "video-asset-ops.md",
    name: { zh: "视频资产智能体", en: "Video Asset Agent" },
    summary: {
      zh: "围绕视频素材沉淀、复用拆条、命名归档和知识写入，帮助团队把视频输出变成可复用资产。",
      en: "Helps teams retain, repurpose, name, and archive video outputs as reusable assets and knowledge items.",
    },
    systemPromptSummary: {
      zh: "优先建议哪些视频该保留、如何拆条复用、如何归档命名，以及哪些内容值得进入知识库。",
      en: "Prioritizes what video outputs to retain, how to repurpose them, how to archive them, and what belongs in knowledge.",
    },
    samplePrompts: [
      { zh: "把最近的视频产物整理成素材、成片、可拆条片段三层资产结构。", en: "Organize our recent video outputs into source assets, final works, and repurposable clips." },
      { zh: "帮我设计一版短视频素材库的命名、标签和归档规范。", en: "Design a naming, tagging, and filing policy for the short-form video library." },
      { zh: "从这批视频内容里挑出最值得沉淀到知识库的脚本、卖点和镜头模式。", en: "Identify which scripts, hooks, and shot patterns from these videos should be retained in knowledge." },
    ],
    workflowSlugs: ["content-repurpose", "visual-ad-pipeline"],
    artifactKinds: ["asset", "knowledge_note", "report", "workflow_result"],
  },
  {
    businessSlug: "brand-creative",
    agentId: "business-pr-communications",
    promptDocumentPath: "pr-communications.md",
    name: { zh: "PR 传播智能体", en: "PR Communications Agent" },
    summary: {
      zh: "围绕媒体叙事、危机沟通、发布节奏和高管观点输出传播方案。",
      en: "Plans media narrative, crisis communication, launch cadence, and executive thought leadership.",
    },
    systemPromptSummary: {
      zh: "优先输出受众、媒体角度、消息层级、风险口径和发布动作，不写空泛公关套话。",
      en: "Prioritizes audiences, media angles, message hierarchy, risk language, and release actions.",
    },
    samplePrompts: [
      { zh: "为这次产品发布写一版媒体传播角度和新闻稿结构。", en: "Build media angles and a press-release structure for this product launch." },
      { zh: "这次客户投诉可能发酵，帮我准备一版危机沟通口径。", en: "Prepare crisis communication language for a customer complaint that may escalate." },
      { zh: "把 CEO 的观点整理成适合 LinkedIn 和媒体采访的表达。", en: "Turn the CEO's point of view into LinkedIn and interview-ready messaging." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["brief", "copy", "report", "knowledge_note"],
  },
  {
    businessSlug: "brand-creative",
    agentId: "business-ui-design-system",
    promptDocumentPath: "ui-design-system.md",
    name: { zh: "UI 设计系统智能体", en: "UI Design System Agent" },
    summary: {
      zh: "把产品界面、组件规范、视觉层级和可访问性转成设计系统建议。",
      en: "Turns interface work into component rules, visual hierarchy, accessibility, and design-system guidance.",
    },
    systemPromptSummary: {
      zh: "优先给出组件、状态、层级、间距和可访问性建议，不停留在审美偏好。",
      en: "Prioritizes components, states, hierarchy, spacing, and accessibility over subjective taste.",
    },
    samplePrompts: [
      { zh: "根据这个业务页，帮我整理一版组件和状态规范。", en: "Turn this business page into component and state guidelines." },
      { zh: "审查这组界面，指出层级、间距和可访问性问题。", en: "Review this UI for hierarchy, spacing, and accessibility issues." },
      { zh: "把这个功能设计成可复用的 dashboard 组件模式。", en: "Design this feature as a reusable dashboard component pattern." },
    ],
    workflowSlugs: ["visual-ad-pipeline"],
    artifactKinds: ["brief", "asset", "report", "knowledge_note"],
  },
  {
    businessSlug: "brand-creative",
    agentId: "business-ux-architect",
    promptDocumentPath: "ux-architect.md",
    name: { zh: "UX 架构智能体", en: "UX Architect Agent" },
    summary: {
      zh: "围绕用户任务、信息架构、页面结构和交互路径设计可落地体验方案。",
      en: "Designs task flows, information architecture, page structure, and interaction paths for usable experiences.",
    },
    systemPromptSummary: {
      zh: "优先输出任务路径、页面结构、交互状态和工程实现边界，不只给视觉建议。",
      en: "Prioritizes task flows, screen structure, interaction states, and implementation boundaries.",
    },
    samplePrompts: [
      { zh: "帮我把这个多 agent 工作台的信息架构重新梳理一遍。", en: "Restructure the information architecture for this multi-agent workbench." },
      { zh: "用户要从业务类型进入 agent，对这个流程做 UX 风险审查。", en: "Review UX risks in the flow from business type to agent workbench." },
      { zh: "把这个需求拆成页面结构、主要状态和交互边界。", en: "Break this requirement into page structure, key states, and interaction boundaries." },
    ],
    workflowSlugs: ["visual-ad-pipeline"],
    artifactKinds: ["brief", "plan", "report", "knowledge_note"],
  },
  {
    businessSlug: "sales-close",
    agentId: "business-proposal-strategist",
    promptDocumentPath: "proposal-strategist.md",
    name: { zh: "销售提案智能体", en: "Proposal Strategist Agent" },
    summary: {
      zh: "围绕 RFP、销售提案、赢单主题和高层摘要设计可成交材料。",
      en: "Structures RFP responses, proposals, win themes, and executive summaries for sales teams.",
    },
    systemPromptSummary: {
      zh: "优先输出买方标准、赢单主题、证明材料和提案结构，不堆功能清单。",
      en: "Prioritizes buyer criteria, win themes, proof, and proposal structure instead of feature dumps.",
    },
    samplePrompts: [
      { zh: "根据这个客户需求，帮我重构销售提案目录和高层摘要。", en: "Restructure the proposal outline and executive summary for this customer need." },
      { zh: "把这份 RFP 要求转成赢单主题、证明材料和风险问题。", en: "Turn this RFP into win themes, proof points, and risk questions." },
      { zh: "客户是 CFO 主导，提案应该怎么重写？", en: "Rewrite the proposal structure for a CFO-led buyer process." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "copy", "report", "knowledge_note"],
  },
  {
    businessSlug: "compliance-risk",
    agentId: "business-compliance-auditor",
    promptDocumentPath: "compliance-auditor.md",
    name: { zh: "合规审计智能体", en: "Compliance Auditor Agent" },
    summary: {
      zh: "围绕 SOC 2、ISO 27001、HIPAA、PCI 等控制框架做证据与缺口审查。",
      en: "Reviews control evidence and readiness gaps across SOC 2, ISO 27001, HIPAA, PCI, and similar frameworks.",
    },
    systemPromptSummary: {
      zh: "优先输出控制目标、证据缺口、整改动作和审计升级点，不假装完成正式认证。",
      en: "Prioritizes control objectives, evidence gaps, remediation, and audit escalation points without claiming certification.",
    },
    samplePrompts: [
      { zh: "根据这些流程材料，帮我做一版 SOC 2 准备差距清单。", en: "Create a SOC 2 readiness gap list from these process notes." },
      { zh: "这些数据处理流程有哪些审计证据缺口？", en: "What audit evidence gaps exist in these data-handling processes?" },
      { zh: "把这个 AI 工作流上线前的合规检查项列出来。", en: "List compliance checks before launching this AI workflow." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["report", "plan", "knowledge_note"],
  },
  {
    businessSlug: "compliance-risk",
    agentId: "business-privacy-officer",
    promptDocumentPath: "privacy-officer.md",
    name: { zh: "隐私官智能体", en: "Privacy Officer Agent" },
    summary: {
      zh: "围绕 GDPR、CCPA、数据流、DPIA、DSAR 和供应商隐私风险做实务筛查。",
      en: "Screens GDPR, CCPA, data mapping, DPIA, DSAR, and vendor privacy risks.",
    },
    systemPromptSummary: {
      zh: "优先输出数据分类、合法依据、风险等级、用户权利和整改建议，不提供无边界法律结论。",
      en: "Prioritizes data classes, lawful basis, risk levels, user rights, and remediation without unbounded legal conclusions.",
    },
    samplePrompts: [
      { zh: "帮我审查这个营销自动化流程里的个人信息风险。", en: "Review personal-data risk in this marketing automation flow." },
      { zh: "根据这些字段，整理一版数据分类和处理依据。", en: "Create data classification and processing-basis notes for these fields." },
      { zh: "这个供应商接入前，隐私尽调应该问哪些问题？", en: "What privacy diligence questions should we ask before onboarding this vendor?" },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["report", "plan", "knowledge_note"],
  },
  {
    businessSlug: "compliance-risk",
    agentId: "business-healthcare-marketing-compliance",
    promptDocumentPath: "healthcare-marketing-compliance.md",
    name: { zh: "医疗营销合规智能体", en: "Healthcare Marketing Compliance Agent" },
    summary: {
      zh: "针对中国医疗、药品、器械、保健品营销内容做广告法和行业规则风险筛查。",
      en: "Screens China healthcare, drug, device, and supplement marketing content against advertising and industry rules.",
    },
    systemPromptSummary: {
      zh: "优先指出绝对化用语、功效宣称、资质证据、患者隐私和需法务升级事项。",
      en: "Prioritizes absolute claims, efficacy claims, qualification evidence, patient privacy, and legal escalation points.",
    },
    samplePrompts: [
      { zh: "审查这段医疗广告文案，有哪些高风险表述？", en: "Review this healthcare ad copy for high-risk claims." },
      { zh: "这个保健品 landing page 哪些地方需要改成更合规？", en: "Which parts of this supplement landing page need compliance revisions?" },
      { zh: "把这组宣传语改成更稳妥的合规表达。", en: "Rewrite these promotional claims into safer compliant language." },
    ],
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["copy", "report", "knowledge_note"],
  },
  {
    businessSlug: "training-enablement",
    agentId: "business-training-designer",
    promptDocumentPath: "training-designer.md",
    name: { zh: "培训设计智能体", en: "Training Designer Agent" },
    summary: {
      zh: "用 ADDIE、SAM 和 Kirkpatrick 思路把能力缺口转成课程、练习和评估方案。",
      en: "Uses ADDIE, SAM, and Kirkpatrick-style thinking to turn capability gaps into curriculum, practice, and measurement.",
    },
    systemPromptSummary: {
      zh: "优先输出学习目标、课程结构、练习任务、评估方式和落地节奏。",
      en: "Prioritizes learning objectives, curriculum, practice tasks, measurement, and rollout cadence.",
    },
    samplePrompts: [
      { zh: "为销售团队设计一套 AI 营销平台上手培训。", en: "Design onboarding training for a sales team learning an AI marketing platform." },
      { zh: "把这份 SOP 变成 60 分钟培训课和练习任务。", en: "Turn this SOP into a 60-minute training session and practice tasks." },
      { zh: "如何评估这次销售赋能培训有没有真正生效？", en: "How should we measure whether this sales enablement training worked?" },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["plan", "brief", "knowledge_note", "report"],
  },
  {
    businessSlug: "talent-recruiting",
    agentId: "business-recruitment-specialist",
    promptDocumentPath: "recruitment-specialist.md",
    name: { zh: "招聘专家智能体", en: "Recruitment Specialist Agent" },
    summary: {
      zh: "围绕岗位画像、渠道策略、候选人筛选、面试题和招聘合规组织招聘动作。",
      en: "Structures role profiles, sourcing channels, candidate screening, interview questions, and recruiting compliance.",
    },
    systemPromptSummary: {
      zh: "优先输出岗位要求、筛选标准、面试信号、渠道建议和用工风险提示。",
      en: "Prioritizes role requirements, screening criteria, interview signals, channels, and employment-risk notes.",
    },
    samplePrompts: [
      { zh: "帮我为增长营销负责人写岗位画像和面试题。", en: "Create a role profile and interview questions for a growth marketing lead." },
      { zh: "根据这些候选人简历，设计一版初筛评分表。", en: "Design an initial screening scorecard from these resumes." },
      { zh: "这个岗位在中国招聘，有哪些劳动用工风险要注意？", en: "What employment-law risks should we consider when hiring this role in China?" },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "plan", "report", "knowledge_note"],
  },
  {
    businessSlug: "talent-recruiting",
    agentId: "business-hr-onboarding",
    promptDocumentPath: "hr-onboarding.md",
    name: { zh: "入职赋能智能体", en: "HR Onboarding Agent" },
    summary: {
      zh: "围绕员工入职、合规材料、角色学习路径和 30/60/90 天计划组织 onboarding。",
      en: "Plans employee onboarding, compliance materials, role learning paths, and 30/60/90-day ramp plans.",
    },
    systemPromptSummary: {
      zh: "优先输出入职清单、角色目标、学习路径、合规材料和前 90 天节奏。",
      en: "Prioritizes onboarding checklists, role goals, learning paths, compliance materials, and first-90-day cadence.",
    },
    samplePrompts: [
      { zh: "为新入职的销售经理设计 30/60/90 天计划。", en: "Design a 30/60/90-day plan for a new sales manager." },
      { zh: "把这些公司资料整理成新员工入职学习路径。", en: "Turn these company materials into a new-hire learning path." },
      { zh: "新员工入职前后，HR、直属主管和 IT 分别要做什么？", en: "What should HR, the manager, and IT each do before and after onboarding?" },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["plan", "brief", "knowledge_note", "report"],
  },
  {
    businessSlug: "legal-ops",
    agentId: "business-legal-document-review",
    promptDocumentPath: "legal-document-review.md",
    name: { zh: "合同审查智能体", en: "Legal Document Review Agent" },
    summary: {
      zh: "围绕合同、条款、版本差异和商业风险做结构化法律风险初筛。",
      en: "Screens contracts, clauses, version differences, and commercial legal risks in a structured way.",
    },
    systemPromptSummary: {
      zh: "优先输出条款风险、缺失信息、谈判建议和律师升级问题，不替代正式法律意见。",
      en: "Prioritizes clause risks, missing facts, negotiation points, and attorney escalation questions without replacing legal advice.",
    },
    samplePrompts: [
      { zh: "帮我审查这份 SaaS 合同的高风险条款。", en: "Review high-risk clauses in this SaaS contract." },
      { zh: "比较这两个合同版本，哪些变化需要重点关注？", en: "Compare these two contract versions and highlight changes that matter." },
      { zh: "把这份合作协议整理成给律师的风险摘要。", en: "Turn this partnership agreement into an attorney-ready risk summary." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["report", "brief", "knowledge_note"],
  },
  {
    businessSlug: "legal-ops",
    agentId: "business-legal-client-intake",
    promptDocumentPath: "legal-client-intake.md",
    name: { zh: "法律 Intake 智能体", en: "Legal Client Intake Agent" },
    summary: {
      zh: "围绕案件事实、相关方、时间线、利益冲突和律师交接材料组织 intake。",
      en: "Organizes facts, parties, timeline, conflicts, and attorney handoff materials for legal intake.",
    },
    systemPromptSummary: {
      zh: "优先收集事实、证据、时间线、目标和冲突检查事项，不给无依据法律结论。",
      en: "Prioritizes facts, evidence, timeline, goals, and conflict-check items without unsupported legal conclusions.",
    },
    samplePrompts: [
      { zh: "根据这段描述，整理一版给律师的案件 intake 摘要。", en: "Turn this description into an attorney intake summary." },
      { zh: "客户只给了零散信息，还需要追问哪些事实？", en: "What facts should we ask for when the client gave scattered information?" },
      { zh: "把这起合同争议整理成时间线、证据清单和待确认问题。", en: "Organize this contract dispute into a timeline, evidence list, and open questions." },
    ],
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "report", "knowledge_note"],
  },
]

const BUSINESS_AGENT_ID_MAP = new Map(
  BUSINESS_AGENTS.map((agent) => [agent.agentId, agent] as const),
)

const BUSINESS_AGENT_SLUG_MAP = new Map<WorkspaceBusinessSlug, BusinessAgentConfig[]>(
  WORKSPACE_BUSINESS_SLUGS.map((slug) => [
    slug,
    BUSINESS_AGENTS.filter((agent) => agent.businessSlug === slug),
  ]),
)

function localize(locale: "zh" | "en", value: LocalizedText) {
  return locale === "zh" ? value.zh : value.en
}

function localizeConfig(
  locale: "zh" | "en",
  config: BusinessAgentConfig,
): LocalizedBusinessAgentConfig {
  return {
    ...config,
    name: localize(locale, config.name),
    summary: localize(locale, config.summary),
    systemPromptSummary: localize(locale, config.systemPromptSummary),
    samplePrompts: config.samplePrompts.map((prompt) => localize(locale, prompt)),
  }
}

export function listBusinessAgentConfigs() {
  return BUSINESS_AGENTS
}

export function getBusinessAgentConfigById(agentId: string | null | undefined) {
  if (!agentId) return null
  return BUSINESS_AGENT_ID_MAP.get(agentId) || null
}

export function listBusinessAgentConfigsBySlug(
  slug: WorkspaceBusinessSlug | string | null | undefined,
) {
  if (!slug) return []
  return BUSINESS_AGENT_SLUG_MAP.get(slug as WorkspaceBusinessSlug) || []
}

export function getBusinessAgentConfigBySlug(
  slug: WorkspaceBusinessSlug | string | null | undefined,
) {
  return listBusinessAgentConfigsBySlug(slug)[0] || null
}

export function listLocalizedBusinessAgentConfigsBySlug(
  locale: "zh" | "en",
  slug: WorkspaceBusinessSlug | string | null | undefined,
) {
  return listBusinessAgentConfigsBySlug(slug).map((config) => localizeConfig(locale, config))
}

export function listLocalizedBusinessAgentConfigs(locale: "zh" | "en") {
  return BUSINESS_AGENTS.map((config) => localizeConfig(locale, config))
}

export function getLocalizedBusinessAgentConfigBySlug(
  locale: "zh" | "en",
  slug: WorkspaceBusinessSlug | string | null | undefined,
): LocalizedBusinessAgentConfig | null {
  const config = getBusinessAgentConfigBySlug(slug)
  if (!config) return null
  return localizeConfig(locale, config)
}

export function getLocalizedBusinessAgentConfigById(
  locale: "zh" | "en",
  agentId: string | null | undefined,
): LocalizedBusinessAgentConfig | null {
  const config = getBusinessAgentConfigById(agentId)
  if (!config) return null
  return localizeConfig(locale, config)
}
