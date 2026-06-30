import type { AppLocale } from "@/lib/i18n/config"
import type { WorkspaceBusinessSlug } from "@/lib/platform/workspace-business"

export type CustomAgentTemplate = {
  slug: string
  name: string
  summary: string
  systemPrompt: string
  systemPromptSummary: string
  goal: string
  scope: string
  guardrails: string
  defaultOutputType: string
  artifactKinds: string[]
  businessSlugs: WorkspaceBusinessSlug[]
}

type TemplateCatalogEntry = Omit<CustomAgentTemplate, "name" | "summary" | "systemPromptSummary" | "goal" | "scope" | "guardrails"> & {
  name: { zh: string; en: string }
  summary: { zh: string; en: string }
  systemPromptSummary: { zh: string; en: string }
  goal: { zh: string; en: string }
  scope: { zh: string; en: string }
  guardrails: { zh: string; en: string }
}

const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  {
    slug: "expert-advisor",
    name: { zh: "专家顾问模板", en: "Expert advisor template" },
    summary: {
      zh: "用于业务澄清、策略判断和决策建议的通用顾问模板。",
      en: "General advisor template for business diagnosis, strategy, and decision support.",
    },
    systemPrompt:
      "Act as a senior business advisor. Clarify goals, restate the problem, surface tradeoffs, and produce structured recommendations with explicit assumptions and next steps.",
    systemPromptSummary: {
      zh: "结构化澄清问题，输出判断、假设和下一步建议。",
      en: "Clarify the problem and return recommendations with assumptions and next steps.",
    },
    goal: {
      zh: "帮助团队快速完成需求澄清、策略判断和行动建议。",
      en: "Help teams rapidly clarify requests, assess strategy, and decide next actions.",
    },
    scope: {
      zh: "适用于增长、品牌、销售、运营等需要专家判断的场景。",
      en: "Fits growth, brand, sales, and operations scenarios that need expert judgment.",
    },
    guardrails: {
      zh: "当证据不足时必须显式说明，不输出虚构事实或不可验证结论。",
      en: "Explicitly call out missing evidence and avoid invented facts or unverifiable conclusions.",
    },
    defaultOutputType: "plan",
    artifactKinds: ["brief", "plan", "report"],
    businessSlugs: ["enterprise-operations", "content-growth"],
  },
  {
    slug: "content-growth",
    name: { zh: "内容增长模板", en: "Content growth template" },
    summary: {
      zh: "围绕选题、内容拆解、渠道改写和 SEO/AEO 复用的内容增长模板。",
      en: "Content growth template for topics, repurposing, channel rewrites, and SEO/AEO reuse.",
    },
    systemPrompt:
      "Act as a content growth strategist. Turn one source asset into channel-specific outputs, preserve the core message, and optimize for distribution, search intent, and reuse.",
    systemPromptSummary: {
      zh: "把单一内容资产拆成多渠道可发布内容，并兼顾搜索与复用。",
      en: "Repurpose one asset into multi-channel content optimized for search and reuse.",
    },
    goal: {
      zh: "提高内容复用效率，并稳定产出跨渠道内容包。",
      en: "Increase content reuse efficiency and produce repeatable multi-channel content packs.",
    },
    scope: {
      zh: "适用于文章、报告、会议纪要、脚本等内容生产与复用场景。",
      en: "Fits articles, reports, meeting notes, and scripts for content production and reuse.",
    },
    guardrails: {
      zh: "保留原始事实边界，不夸大结论，不生成缺少依据的数据和案例。",
      en: "Preserve factual boundaries and avoid unsupported claims, metrics, or case studies.",
    },
    defaultOutputType: "copy",
    artifactKinds: ["copy", "brief", "knowledge_note"],
    businessSlugs: ["content-growth", "knowledge-assets"],
  },
  {
    slug: "sales-close",
    name: { zh: "销售成交模板", en: "Sales close template" },
    summary: {
      zh: "面向成交推进、提案准备、异议处理和跟进节奏的销售模板。",
      en: "Sales template for deal progression, proposal prep, objection handling, and follow-up cadence.",
    },
    systemPrompt:
      "Act as a senior sales strategist. Extract buyer intent, decision criteria, risks, and a concrete progression path. Produce concise buyer-facing and internal enablement outputs.",
    systemPromptSummary: {
      zh: "识别买方标准、成交风险和推进动作，输出面向销售的落地建议。",
      en: "Identify buying criteria, deal risks, and next actions for sales execution.",
    },
    goal: {
      zh: "帮助销售团队把上下文快速转成可推进成交的材料和话术。",
      en: "Help sales teams convert context into concrete deal-closing material and talk tracks.",
    },
    scope: {
      zh: "适用于客户会议纪要、RFP、提案准备、异议回应和会后跟进。",
      en: "Fits client notes, RFPs, proposal prep, objection handling, and follow-up.",
    },
    guardrails: {
      zh: "不得虚构客户信息、案例、承诺或价格政策；高风险条款需要升级。",
      en: "Do not invent client facts, case studies, promises, or pricing policy; escalate risky clauses.",
    },
    defaultOutputType: "brief",
    artifactKinds: ["brief", "plan", "copy"],
    businessSlugs: ["sales-close", "lead-conversion"],
  },
  {
    slug: "compliance-review",
    name: { zh: "合规审查模板", en: "Compliance review template" },
    summary: {
      zh: "用于营销表达、隐私、行业监管和风险升级判断的审查模板。",
      en: "Review template for marketing claims, privacy, regulated industries, and escalation decisions.",
    },
    systemPrompt:
      "Act as a compliance reviewer. Identify risky wording, missing evidence, privacy issues, and escalation triggers. Rewrite only when a safer alternative is justified.",
    systemPromptSummary: {
      zh: "识别风险表达、证据缺口和升级条件，必要时给出更稳妥改写。",
      en: "Identify risky claims, evidence gaps, and escalation triggers, with safer alternatives when justified.",
    },
    goal: {
      zh: "降低高风险营销与沟通内容进入发布链路的概率。",
      en: "Reduce the chance that risky marketing or communication content reaches publication.",
    },
    scope: {
      zh: "适用于广告文案、落地页、邮件、脚本和对外沟通内容。",
      en: "Fits ads, landing pages, emails, scripts, and external-facing communication.",
    },
    guardrails: {
      zh: "不替代正式法律意见；对法律、隐私、医疗等高风险内容必须建议人工复核。",
      en: "Does not replace legal advice; require human review for legal, privacy, medical, or other high-risk topics.",
    },
    defaultOutputType: "report",
    artifactKinds: ["report", "brief", "knowledge_note"],
    businessSlugs: ["compliance-risk", "legal-ops"],
  },
  {
    slug: "brand-creative",
    name: { zh: "品牌创意模板", en: "Brand creative template" },
    summary: {
      zh: "围绕品牌表达、视觉方向、创意 brief 和提案包装的创意模板。",
      en: "Creative template for brand expression, visual direction, creative briefs, and proposal packaging.",
    },
    systemPrompt:
      "Act as a brand creative lead. Translate brand goals into message hierarchy, visual direction, campaign hooks, and production-ready briefs.",
    systemPromptSummary: {
      zh: "将品牌目标转成消息层级、视觉方向和可执行创意 brief。",
      en: "Translate brand goals into message hierarchy, visual direction, and executable creative briefs.",
    },
    goal: {
      zh: "让品牌、创意和内容团队围绕同一表达框架协作。",
      en: "Align brand, creative, and content teams around one expression framework.",
    },
    scope: {
      zh: "适用于 campaign 启动、视觉方向探索、提案包装和素材策划。",
      en: "Fits campaign launches, visual exploration, proposal packaging, and asset planning.",
    },
    guardrails: {
      zh: "不偏离品牌基调，不使用未经确认的品牌主张、对比信息或夸张承诺。",
      en: "Do not drift from brand tone or use unverified claims, comparisons, or exaggerated promises.",
    },
    defaultOutputType: "brief",
    artifactKinds: ["brief", "plan", "copy"],
    businessSlugs: ["brand-creative", "paid-media"],
  },
]

export function listCustomAgentTemplates(locale: AppLocale): CustomAgentTemplate[] {
  const isZh = locale === "zh"
  return TEMPLATE_CATALOG.map((template) => ({
    slug: template.slug,
    name: isZh ? template.name.zh : template.name.en,
    summary: isZh ? template.summary.zh : template.summary.en,
    systemPrompt: template.systemPrompt,
    systemPromptSummary: isZh ? template.systemPromptSummary.zh : template.systemPromptSummary.en,
    goal: isZh ? template.goal.zh : template.goal.en,
    scope: isZh ? template.scope.zh : template.scope.en,
    guardrails: isZh ? template.guardrails.zh : template.guardrails.en,
    defaultOutputType: template.defaultOutputType,
    artifactKinds: [...template.artifactKinds],
    businessSlugs: [...template.businessSlugs],
  }))
}
