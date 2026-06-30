import { claudeFablePages } from "@/lib/seo/claude-fable-pages"

export type SeoGroup = "alternatives" | "solutions" | "agents" | "compare" | "use-cases" | "prompts" | "claude"

export type SeoSection = {
  heading: string
  body: string[]
  bullets?: string[]
}

export type SeoFaq = {
  question: string
  answer: string
}

export type SeoCta = {
  primaryLabel: string
  primaryHref: string
  secondaryLabel?: string
  secondaryHref?: string
}

export type SeoComparisonRow = {
  dimension: string
  first: string
  second: string
}

export type SeoRelatedLink = {
  href: string
  label: string
  description: string
}

export type SeoPage = {
  slug: string
  group: SeoGroup
  title: string
  description: string
  h1: string
  intro: string
  primaryKeyword: string
  secondaryKeywords: string[]
  audience: string
  highlights: string[]
  sections: SeoSection[]
  faqs: SeoFaq[]
  cta: SeoCta
  relatedLinks: SeoRelatedLink[]
  comparison?: {
    firstLabel: string
    secondLabel: string
    rows: SeoComparisonRow[]
  }
}

type TopicProfile = {
  keyword: string
  deliverable: string
  decisionLens: string
  contextSignals: string[]
  reviewFocus: string
}

const TITLE_TOPIC_PROFILES: Array<{ pattern: RegExp; profile: TopicProfile }> = [
  {
    pattern: /marketing strategy/i,
    profile: {
      keyword: "marketing strategy",
      deliverable: "positioning decisions, audience definitions, and campaign narratives",
      decisionLens: "audience fit, positioning clarity, channel priority, and offer focus",
      contextSignals: ["target audience", "offer", "category context", "growth goal"],
      reviewFocus: "positioning clarity, strategic focus, and whether the strategy is actionable",
    },
  },
  {
    pattern: /video script/i,
    profile: {
      keyword: "video script",
      deliverable: "video scripts, hooks, scenes, and CTAs",
      decisionLens: "hook strength, scene order, pacing, and CTA clarity",
      contextSignals: ["audience pain point", "offer", "runtime target", "distribution channel"],
      reviewFocus: "retention, clarity, and whether the CTA lands quickly enough",
    },
  },
  {
    pattern: /website copy/i,
    profile: {
      keyword: "website copy",
      deliverable: "homepage, landing page, and section-level website copy",
      decisionLens: "clarity, differentiation, objections, proof, and CTA flow",
      contextSignals: ["page goal", "audience", "offer", "proof points"],
      reviewFocus: "message clarity, conversion friction, and how well the CTA matches intent",
    },
  },
  {
    pattern: /seo article|writing/i,
    profile: {
      keyword: "SEO article",
      deliverable: "search-intent-driven outlines, drafts, FAQs, and internal links",
      decisionLens: "intent match, topical depth, evidence, and internal-link fit",
      contextSignals: ["primary keyword", "search intent", "reader stage", "internal links"],
      reviewFocus: "search intent coverage, proof quality, and link opportunities",
    },
  },
  {
    pattern: /image generation/i,
    profile: {
      keyword: "image generation",
      deliverable: "campaign visuals, creative directions, and image prompts",
      decisionLens: "subject clarity, brand consistency, and channel fit",
      contextSignals: ["campaign goal", "brand style", "format", "usage channel"],
      reviewFocus: "visual consistency, prompt specificity, and whether the asset feels on-brand",
    },
  },
  {
    pattern: /market research/i,
    profile: {
      keyword: "market research",
      deliverable: "research briefs, competitor notes, and positioning implications",
      decisionLens: "evidence quality, segment clarity, and decision usefulness",
      contextSignals: ["decision to support", "target segment", "competitors", "known evidence"],
      reviewFocus: "signal quality, bias risk, and whether the output changes a real decision",
    },
  },
  {
    pattern: /growth marketing/i,
    profile: {
      keyword: "growth marketing",
      deliverable: "experiment backlogs, channel plans, and offer-testing ideas",
      decisionLens: "channel fit, experiment priority, speed to learning, and measurement quality",
      contextSignals: ["growth goal", "audience", "channel mix", "budget constraint"],
      reviewFocus: "experiment sequencing, measurement clarity, and realism of execution",
    },
  },
  {
    pattern: /brand strategy/i,
    profile: {
      keyword: "brand strategy",
      deliverable: "positioning briefs, messaging architecture, and differentiation angles",
      decisionLens: "positioning clarity, distinctiveness, proof, and narrative consistency",
      contextSignals: ["target audience", "competitors", "product proof", "current messaging"],
      reviewFocus: "positioning sharpness, proof quality, and whether the message is actually defensible",
    },
  },
  {
    pattern: /copywriting/i,
    profile: {
      keyword: "copywriting",
      deliverable: "conversion copy across pages, emails, ads, and social posts",
      decisionLens: "clarity, specificity, emotional pull, and CTA strength",
      contextSignals: ["offer", "channel", "tone", "audience pain points"],
      reviewFocus: "specificity, persuasion, and whether the copy sounds like the brand",
    },
  },
  {
    pattern: /business consultant|business/i,
    profile: {
      keyword: "business decisions",
      deliverable: "decision briefs, options, risks, and recommended next steps",
      decisionLens: "tradeoffs, risk, sequencing, and execution feasibility",
      contextSignals: ["decision question", "constraints", "current data", "desired outcome"],
      reviewFocus: "decision quality, risk visibility, and whether next steps are actionable",
    },
  },
  {
    pattern: /agency|agencies/i,
    profile: {
      keyword: "agency delivery",
      deliverable: "client-facing campaign assets, briefs, and handoff-ready work",
      decisionLens: "client context reuse, approval speed, and asset consistency",
      contextSignals: ["client context", "campaign brief", "review process", "delivery format"],
      reviewFocus: "handoff quality, revision risk, and reuse across accounts",
    },
  },
  {
    pattern: /startup/i,
    profile: {
      keyword: "startup marketing",
      deliverable: "launch messaging, growth experiments, and founder-led content",
      decisionLens: "speed, message clarity, experiment learning, and resource constraints",
      contextSignals: ["ICP", "launch goal", "offer", "resource constraint"],
      reviewFocus: "speed to publish, clarity, and whether the message is strong enough for early traction",
    },
  },
  {
    pattern: /consultant/i,
    profile: {
      keyword: "consulting delivery",
      deliverable: "client-ready strategy drafts, articles, and website copy",
      decisionLens: "client specificity, speed, and how reusable the context becomes",
      contextSignals: ["client notes", "deliverable type", "tone", "approval expectation"],
      reviewFocus: "client readiness, clarity, and separation between accounts",
    },
  },
  {
    pattern: /workspace|subscription|small business|small marketing teams|marketing teams/i,
    profile: {
      keyword: "AI workspace for marketing teams",
      deliverable: "shared model access, reusable context, and repeatable campaign assets",
      decisionLens: "seat efficiency, context reuse, model flexibility, and review visibility",
      contextSignals: ["team size", "tool stack", "recurring workflows", "approval process"],
      reviewFocus: "cost clarity, workflow fit, and whether the team can reuse past decisions",
    },
  },
  {
    pattern: /foreign trade/i,
    profile: {
      keyword: "foreign trade marketing",
      deliverable: "English outreach, product pages, LinkedIn posts, and campaign visuals",
      decisionLens: "market fit, language quality, and export-oriented trust signals",
      contextSignals: ["target market", "product line", "buyer type", "channel"],
      reviewFocus: "language quality, buyer trust, and channel-specific usefulness",
    },
  },
]

function humanizeToken(token: string) {
  const directMap: Record<string, string> = {
    ai: "AI",
    seo: "SEO",
    gpt: "GPT",
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    jasper: "Jasper",
    poe: "Poe",
    byok: "BYOK",
    icp: "ICP",
  }

  const mapped = directMap[token.toLowerCase()]
  if (mapped) return mapped
  return token.charAt(0).toUpperCase() + token.slice(1)
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((token) => humanizeToken(token))
    .join(" ")
}

function formatList(items: string[]) {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0] || ""
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

function sentenceCase(value: string) {
  if (!value) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function resolveTopicProfile(title: string, fallbackKeyword: string): TopicProfile {
  const match = TITLE_TOPIC_PROFILES.find((entry) => entry.pattern.test(title))
  if (match) return match.profile

  return {
    keyword: fallbackKeyword,
    deliverable: fallbackKeyword,
    decisionLens: "brief quality, context reuse, review quality, and speed to execution",
    contextSignals: ["goal", "audience", "offer", "constraints"],
    reviewFocus: "clarity, specificity, and whether the team can publish with less rework",
  }
}

function resolveAlternativeTopicProfile(product: string): TopicProfile {
  if (/jasper|copy\.ai/i.test(product)) {
    return resolveTopicProfile("copywriting", "copywriting")
  }
  if (/chatgpt|claude/i.test(product)) {
    return resolveTopicProfile("marketing teams workspace", "AI workspace for marketing teams")
  }
  if (/typingmind|team-gpt|poe/i.test(product)) {
    return resolveTopicProfile("workspace", "shared AI workspace")
  }
  return resolveTopicProfile("shared AI workspace", "shared AI workspace")
}

function makeRelatedLink(href: string, description: string): SeoRelatedLink {
  const slug = href.split("/").filter(Boolean).pop() || href
  return {
    href,
    label: humanizeSlug(slug),
    description,
  }
}

function normalizeSeoRelatedLinks(page: SeoPage) {
  const currentPath = seoPathForPage(page)
  const seen = new Set<string>()

  return page.relatedLinks.filter((link) => {
    if (link.href === currentPath || seen.has(link.href)) {
      return false
    }
    seen.add(link.href)
    return true
  })
}

function topicRelatedLinks(title: string): SeoRelatedLink[] {
  if (/video script/i.test(title)) {
    return [
      makeRelatedLink("/agents/video-script-agent", "See the structured agent workflow for hooks, scenes, and CTA-driven scripts."),
      makeRelatedLink("/prompts/video-script-prompts", "Use the matching prompt library when you need reusable script starters."),
    ]
  }
  if (/website copy/i.test(title)) {
    return [
      makeRelatedLink("/agents/website-copy-agent", "Move from one-off prompts to a repeatable website copy workflow."),
      makeRelatedLink("/prompts/website-copy-prompts", "Use website-copy prompt patterns for hero, proof, and CTA sections."),
    ]
  }
  if (/seo article|writing/i.test(title)) {
    return [
      makeRelatedLink("/agents/seo-article-agent", "Use the article workflow built around search intent and internal links."),
      makeRelatedLink("/prompts/seo-article-prompts", "Start from reusable article prompt structures instead of a blank prompt."),
    ]
  }
  if (/image generation/i.test(title)) {
    return [
      makeRelatedLink("/agents/image-generation-agent", "See the image workflow for channel-fit creative directions."),
      makeRelatedLink("/prompts/image-generation-prompts", "Browse reusable prompt patterns for product, social, and ad visuals."),
    ]
  }
  if (/brand strategy/i.test(title)) {
    return [
      makeRelatedLink("/prompts/marketing-strategy-prompts", "Use prompt structures for positioning, audience, and narrative work."),
      makeRelatedLink("/use-cases/ai-workspace-for-marketing-teams", "See how marketing teams turn positioning into repeatable execution."),
    ]
  }
  if (/growth marketing/i.test(title)) {
    return [
      makeRelatedLink("/prompts/growth-marketing-prompts", "Use experiment and channel-planning prompts that match this workflow."),
      makeRelatedLink("/use-cases/save-money-on-ai-subscriptions", "Compare growth output against the cost of separate AI tools."),
    ]
  }
  if (/market research/i.test(title)) {
    return [
      makeRelatedLink("/compare/best-ai-model-for-market-research", "Compare research workflows before choosing a single model."),
      makeRelatedLink("/use-cases/chatgpt-claude-gemini-in-one-workspace", "See how teams keep research context in one workspace."),
    ]
  }

  return [
    makeRelatedLink("/use-cases/ai-workspace-for-marketing-teams", "See how the shared workspace fits a broader marketing-team operating stack."),
    makeRelatedLink("/resources/ai-subscription-cost-calculator", "Estimate the cost of staying with separate subscriptions."),
  ]
}

function promptHrefForAgentSlug(slug: string) {
  const promptByAgentSlug: Record<string, string> = {
    "brand-strategy-agent": "/prompts/marketing-strategy-prompts",
    "growth-marketing-agent": "/prompts/growth-marketing-prompts",
    "seo-article-agent": "/prompts/seo-article-prompts",
    "website-copy-agent": "/prompts/website-copy-prompts",
    "video-script-agent": "/prompts/video-script-prompts",
    "image-generation-agent": "/prompts/image-generation-prompts",
  }

  return promptByAgentSlug[slug]
}

function alternativePage(input: {
  slug: string
  product: string
  audience: string
  competitorStrength: string
  aiMarketingFit: string
  primaryKeyword: string
  switchSignals: string[]
  migrationSteps: string[]
  customSections?: SeoSection[]
  customFaqs?: SeoFaq[]
}) : SeoPage {
  const topic = resolveAlternativeTopicProfile(input.product)

  return {
    slug: input.slug,
    group: "alternatives",
    title: `${input.product} Alternative for Marketing Teams`,
    description: `Compare ${input.product} with AI Marketing for marketing teams that need multiple models, shared context, and one workspace for content, research, visuals, and workflows.`,
    h1: `${input.product} Alternative for Marketing Teams`,
    intro: `${input.product} can be a strong AI tool, but many marketing teams also need multi-model access, marketing-specific workflows, image generation, website copy, video scripts, and shared company context without buying a separate seat in every tool.`,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: [
      `${input.product} alternative`,
      "AI workspace for marketing teams",
      "multi-model AI marketing workspace",
      "marketing AI workflow workspace",
    ],
    audience: input.audience,
    highlights: [
      `${input.product} is strongest when the team wants its native workflow and vendor-specific experience.`,
      `${input.product} alternative searches usually start when ${topic.deliverable} need to live beside shared context and more than one model.`,
      "Best fit for buyers comparing fragmented subscriptions against one workspace for recurring marketing execution.",
    ],
    comparison: {
      firstLabel: input.product,
      secondLabel: "AI Marketing",
      rows: [
        {
          dimension: "Where teams start",
          first: `${input.product} usually starts as a focused workflow inside one product stack.`,
          second: "AI Marketing usually starts as a shared workspace for multiple marketing jobs and models.",
        },
        {
          dimension: "Context reuse",
          first: `${input.product} keeps work inside its own product experience, but surrounding campaign context may stay scattered.`,
          second: "AI Marketing keeps company, brand, and campaign context attached across related tasks.",
        },
        {
          dimension: "Asset coverage",
          first: `${input.product} may cover one major part of the workflow well, depending on the team.`,
          second: "AI Marketing is positioned for briefs, copy, research, visuals, and follow-on campaign work in one place.",
        },
        {
          dimension: "Buying logic",
          first: `Choose ${input.product} when the team mainly wants the native ${input.product} experience.`,
          second: "Choose AI Marketing when the team wants lower tool sprawl and reusable marketing context.",
        },
      ],
    },
    sections: [
      {
        heading: `Why "${input.product} alternative" searches happen`,
        body: [
          `Teams searching for a ${input.product} alternative are usually not rejecting ${input.product}; they are reacting to friction around shared context, seat sprawl, and the extra tools needed to finish a full campaign.`,
          `For ${sentenceCase(input.audience)}, the real comparison is whether ${input.product} can stay the center of the workflow once ${topic.deliverable} need to connect with broader marketing execution.`,
        ],
        bullets: [
          `Separate per-seat subscriptions are harder to justify when only part of the team uses ${input.product} daily.`,
          `Marketing work needs brand and campaign context, not only a clean ${input.product} workspace.`,
          `Teams usually need related assets beyond the initial output, which is where context duplication starts.`,
        ],
      },
      {
        heading: `Where ${input.product} still makes sense`,
        body: [
          input.competitorStrength,
          `If the review process is already centered on ${input.product} and the team does not need to connect ${topic.deliverable} with broader research, website copy, images, or cross-campaign history, staying native can still be the simpler choice.`,
        ],
      },
      {
        heading: "Where AI Marketing becomes the better fit",
        body: [
          input.aiMarketingFit,
          `The switch becomes easier to justify when the same brief needs to produce ${topic.deliverable}, supporting assets, and reusable decisions the rest of the team can see without rewriting the background.`,
        ],
      },
      {
        heading: `Questions to test before switching from ${input.product}`,
        body: [`A better alternative is not the tool with the longest feature list; it is the workflow that reduces friction around ${topic.decisionLens}.`],
        bullets: input.switchSignals,
      },
      {
        heading: "How to compare total workflow cost",
        body: [
          `Subscription math should include seats, context switching, and the extra tools needed to finish ${topic.deliverable}, not just the headline monthly price.`,
          "For many small teams, the bigger savings come from consolidating routine production and keeping high-intensity users on upgrades or BYOK only when needed.",
        ],
      },
      {
        heading: `Migration checklist before leaving ${input.product}`,
        body: [`Teams usually get a cleaner transition when they evaluate the workflow, not just the feature table.`],
        bullets: input.migrationSteps,
      },
      {
        heading: `A realistic pilot before replacing ${input.product}`,
        body: [
          `The best pilot is not a synthetic prompt test. It is one live marketing workflow where the team can compare ${input.product} and AI Marketing against the same brief, reviewer, and deadline.`,
          `For this page, a good pilot usually starts when ${sentenceCase(input.switchSignals[0] || `the team can identify one repeatable ${topic.keyword} workflow`)} and ends by checking whether ${sentenceCase(input.migrationSteps[0] || "the new workflow can actually replace the old one")}.`,
        ],
      },
      ...(input.customSections || []),
    ],
    faqs: [
      {
        question: `Is AI Marketing a full replacement for ${input.product}?`,
        answer: `Not always. ${input.product} may still be better for teams that need its official vendor-native experience. AI Marketing is better when the job is multi-model marketing production with shared team context.`,
      },
      {
        question: `What usually pushes a team off ${input.product}?`,
        answer: `The trigger is often not output quality alone. It is usually the need to connect ${input.product} with other models, more teammates, or adjacent campaign workflows without copying context over and over.`,
      },
      {
        question: `Who should compare ${input.product} against AI Marketing?`,
        answer: input.audience,
      },
      {
        question: `What is the cleanest way to test a ${input.product} alternative?`,
        answer: `Run one real workflow with the same brief in both setups, then compare asset coverage, review speed, and how much context the team had to rewrite outside ${input.product}.`,
      },
      ...(input.customFaqs || []),
    ],
    cta: {
      primaryLabel: "Start your team workspace",
      primaryHref: "/register",
      secondaryLabel: "Calculate AI tool savings",
      secondaryHref: "/resources/ai-subscription-cost-calculator",
    },
    relatedLinks: [
      makeRelatedLink("/compare/best-ai-workspace-for-marketing-teams", "Compare shared workspace options for marketing teams before switching."),
      makeRelatedLink("/use-cases/chatgpt-claude-gemini-in-one-workspace", "See how teams keep multiple models in one workspace."),
      makeRelatedLink("/resources/ai-subscription-cost-calculator", "Estimate whether replacing stacked subscriptions changes the economics."),
    ],
  }
}

function solutionPage(input: {
  slug: string
  title: string
  audience: string
  workflows: string[]
  primaryKeyword: string
  painPoints: string[]
  rolloutMetrics: string[]
  customSections?: SeoSection[]
  customFaqs?: SeoFaq[]
}) : SeoPage {
  const topic = resolveTopicProfile(input.title, input.primaryKeyword)

  return {
    slug: input.slug,
    group: "solutions",
    title: `${input.title} | AI Marketing`,
    description: `A multi-model AI workspace for ${input.audience.toLowerCase()} with shared context, team visibility, and reusable workflows for content, research, and campaign execution.`,
    h1: input.title,
    intro: `${input.audience} need practical marketing output, not another generic AI chat window. AI Marketing gives the team a shared workspace for models, agents, company context, and repeatable content workflows.`,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["AI marketing workspace", "AI workspace for marketing teams", "marketing workflows", "shared AI workspace"],
    audience: input.audience,
    highlights: [
      `Built for ${sentenceCase(input.audience)} instead of a generic AI chat surface.`,
      `Organized around ${topic.deliverable} rather than one isolated content task.`,
      `Best when the team needs repeatable workflows, shared context, and visible campaign history.`,
    ],
    sections: [
      {
        heading: `What ${input.title.toLowerCase()} needs beyond a generic chatbot`,
        body: [
          `Teams looking for ${input.title.toLowerCase()} usually need more than isolated generation. They need a place where the brief, review notes, and final assets can stay attached to the same workstream.`,
          `For ${sentenceCase(input.audience)}, the real pain is often not model access itself. It is the cost of rebuilding context whenever the work moves from strategy to ${topic.deliverable} to approvals.`,
        ],
        bullets: input.painPoints,
      },
      {
        heading: `Workflows that matter for ${sentenceCase(input.audience)}`,
        body: ["Use AI Marketing to turn company context into concrete assets for the channels and deliverables this audience actually runs."],
        bullets: input.workflows,
      },
      {
        heading: `How a shared workspace improves ${topic.deliverable}`,
        body: [
          `Different models are better at different parts of ${topic.deliverable}. A shared workspace lets the team switch models or agents without moving the brief, brand rules, and campaign history across separate tools.`,
          `That matters most when the team wants a workflow built around ${topic.decisionLens} instead of another pile of disconnected prompts.`,
        ],
      },
      {
        heading: `What a good rollout looks like for ${input.title.toLowerCase()}`,
        body: [
          "Start by loading shared company context, defining who owns approvals, and mapping the recurring deliverables that should move into the workspace first.",
          "Company context, permissions, shared credits, and conversation history make the work repeatable. New campaigns can reuse prior decisions instead of starting from a blank prompt.",
        ],
      },
      {
        heading: `What to measure after launching ${input.title.toLowerCase()}`,
        body: ["A better workflow should reduce friction in ways the team can actually notice within a few weeks."],
        bullets: input.rolloutMetrics,
      },
      {
        heading: `First workflow to launch for ${input.title.toLowerCase()}`,
        body: [
          `Do not move every marketing task at once. Start with the one recurring workflow where ${sentenceCase(input.painPoints[0] || "context gets rebuilt too often")} and the team can quickly prove a better operating model.`,
          `For most teams on this page, the strongest first candidate is ${sentenceCase(input.workflows[0] || "one repeatable campaign workflow")} because it exposes whether shared context and approvals are actually saving time.`,
        ],
      },
      ...(input.customSections || []),
    ],
    faqs: [
      {
        question: `Who should use this ${input.title.toLowerCase()} solution first?`,
        answer: input.audience,
      },
      {
        question: `What kind of work should move into this ${input.title.toLowerCase()} workflow first?`,
        answer: `Start with recurring work where context reuse matters most, especially assets tied to ${topic.deliverable} and adjacent campaign execution.`,
      },
      {
        question: "What makes this different from normal ChatGPT?",
        answer: "The workspace is organized around marketing agents, shared company context, team permissions, and reusable production workflows.",
      },
      {
        question: `What should this audience migrate first?`,
        answer: `Start with one high-frequency workflow where reusable context matters, then expand only after the team can see stronger review speed and clearer campaign history.`,
      },
      ...(input.customFaqs || []),
    ],
    cta: {
      primaryLabel: "Create a shared workspace",
      primaryHref: "/register",
      secondaryLabel: "Compare with ChatGPT Team",
      secondaryHref: "/alternatives/chatgpt-team-alternative",
    },
    relatedLinks: [
      makeRelatedLink("/alternatives/chatgpt-team-alternative", "Compare a marketing-specific workspace against a general team chat product."),
      makeRelatedLink("/compare/best-ai-workspace-for-marketing-teams", "See how marketing teams compare workspace options instead of separate point tools."),
      makeRelatedLink("/resources/ai-subscription-cost-calculator", "Estimate whether consolidation creates a real cost advantage."),
    ],
  }
}

function agentPage(input: {
  slug: string
  title: string
  problem: string
  inputs: string[]
  outputs: string[]
  prompt: string
  primaryKeyword: string
  useCases: string[]
  reviewChecklist: string[]
  customSections?: SeoSection[]
  customFaqs?: SeoFaq[]
}) : SeoPage {
  const topic = resolveTopicProfile(input.title, input.primaryKeyword)
  const promptHref = promptHrefForAgentSlug(input.slug)

  return {
    slug: input.slug,
    group: "agents",
    title: `${input.title} | AI Marketing`,
    description: `${input.title} for small teams that want structured marketing output from company context, reusable workflows, and multiple AI models.`,
    h1: input.title,
    intro: `${input.title} helps small teams turn scattered ideas into structured marketing work inside a shared AI Marketing workspace.`,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["AI marketing agent", "marketing workflow agent", "AI workspace for teams"],
    audience: "Small teams that need a reusable marketing workflow rather than one-off prompts.",
    highlights: [
      `Built around ${topic.decisionLens}.`,
      `Strong briefs usually include ${formatList(input.inputs.slice(0, 3)).toLowerCase()}.`,
      `Outputs are designed to be reviewed, revised, and reused instead of pasted into a blank chat thread.`,
    ],
    sections: [
      {
        heading: `Where ${input.title} helps most`,
        body: [
          input.problem,
          `This matters when the team needs ${topic.deliverable} that can survive review, edits, and follow-on campaign work without losing the original context.`,
        ],
        bullets: input.useCases,
      },
      {
        heading: `Inputs that change the quality of ${topic.deliverable}`,
        body: [`Better inputs produce better outputs. This workflow works best when the team supplies the context signals that affect ${topic.decisionLens}.`],
        bullets: input.inputs,
      },
      {
        heading: "Outputs the team can review before shipping",
        body: [`The agent is designed to produce reviewable work that can move into execution, especially when the reviewer cares about ${topic.reviewFocus}.`],
        bullets: input.outputs,
      },
      {
        heading: "A realistic team workflow",
        body: [
          `Start with the company context, add the campaign goal, ask the agent for a structured draft, then iterate in the same workspace so the history behind the ${topic.deliverable} stays attached.`,
        ],
      },
      {
        heading: "Example prompt",
        body: [input.prompt],
      },
      {
        heading: "Why this is different from a blank chat box",
        body: [
          `Normal chat starts from a blank box. This workflow is organized around ${topic.deliverable}, shared company context, team permissions, and outputs that can be reviewed against ${topic.reviewFocus}.`,
        ],
      },
      {
        heading: `Review checklist before shipping ${topic.keyword} work`,
        body: ["Use a short checklist so the team evaluates the output against the real job, not just surface fluency."],
        bullets: input.reviewChecklist,
      },
      {
        heading: `A brief that usually produces stronger ${topic.keyword} output`,
        body: [
          `This agent usually performs best when the team is explicit about the job to be done, the approval standard, and the inputs that most affect ${topic.decisionLens}.`,
          `A practical starting brief on this page usually begins with ${formatList(input.inputs.slice(0, 3)).toLowerCase()}, then asks for ${formatList(input.outputs.slice(0, 2)).toLowerCase()} that can be reviewed before the team publishes anything.`,
        ],
      },
      ...(input.customSections || []),
    ],
    faqs: [
      {
        question: `What should the team review before using this ${topic.keyword} output publicly?`,
        answer: `Review the output for ${topic.reviewFocus}, then confirm it still matches the brand, offer, and channel before publishing.`,
      },
      {
        question: "Can this agent use my company context?",
        answer: "Yes. The workspace is designed around shared company, brand, campaign, and conversation context.",
      },
      {
        question: `When should we use this agent instead of a blank prompt?`,
        answer: `Use the agent when the same task repeats often enough that the team benefits from saved context, structured outputs, and a consistent review checklist.`,
      },
      ...(input.customFaqs || []),
    ],
    cta: {
      primaryLabel: "Create a team workspace",
      primaryHref: "/register",
      secondaryLabel: "View marketing-team use case",
      secondaryHref: "/use-cases/ai-workspace-for-marketing-teams",
    },
    relatedLinks: [
      ...(promptHref
        ? [makeRelatedLink(promptHref, "Start from the matching prompt library when the team needs reusable starters.")]
        : []),
      makeRelatedLink("/use-cases/ai-workspace-for-marketing-teams", "See where this workflow fits inside a shared team setup."),
      makeRelatedLink("/resources/ai-subscription-cost-calculator", "Compare this workflow against the cost of separate point tools."),
    ],
  }
}

function makeUseCasePage(input: {
  slug: string
  title: string
  intro: string
  steps: string[]
  primaryKeyword: string
  hiddenCosts: string[]
  successSignals: string[]
  customSections?: SeoSection[]
  customFaqs?: SeoFaq[]
}) : SeoPage {
  const topic = resolveTopicProfile(input.title, input.primaryKeyword)
  const currentPath = `/use-cases/${input.slug}`

  return {
    slug: input.slug,
    group: "use-cases",
    title: `${input.title} | AI Marketing`,
    description: `${input.intro} Learn how marketing teams can consolidate AI tools with a shared multi-model workspace for content, research, and workflows.`,
    h1: input.title,
    intro: input.intro,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["save money on AI tools", "one AI subscription", "multi-model AI workspace"],
    audience: "Marketing teams comparing separate AI subscriptions against a shared workspace.",
    highlights: [
      input.intro,
      `Useful when the team wants to reduce tool sprawl without losing ${topic.deliverable}.`,
      "Best for buyers who care about the operating model, not just the sticker price of one seat.",
    ],
    sections: [
      {
        heading: `What "${input.title}" is really fixing`,
        body: [
          "AI subscriptions add up quickly when every person buys a separate chat assistant, writing tool, image tool, and search assistant.",
          `The deeper problem is that each tool restart also resets context. Teams end up paying twice: once in software spend and again in the time it takes to rebuild the brief before producing ${topic.deliverable}.`,
        ],
      },
      {
        heading: `A practical audit for ${input.title.toLowerCase()}`,
        body: ["Use a simple audit before adding another tool or cancelling the wrong one first."],
        bullets: input.steps,
      },
      {
        heading: "Where teams usually overpay",
        body: [
          `Overspending usually happens when occasional users have full paid seats, or when teams keep separate subscriptions just because ${topic.deliverable} and related work live in different tools.`,
          "That is why a shared workspace should be evaluated as an operating model, not as a promise that every premium model becomes unlimited.",
        ],
        bullets: input.hiddenCosts,
      },
      {
        heading: "Where AI Marketing fits without overpromising",
        body: [
          `AI Marketing combines multiple models, marketing agents, shared context, permissions, and credits so small teams can consolidate routine work around ${topic.deliverable}.`,
          "The right operating model is shared credits, fair-use limits, upgrades, and BYOK for high-frequency users.",
        ],
      },
      {
        heading: `What to measure after consolidating this use case`,
        body: ["A good consolidation project should change both spend and execution quality."],
        bullets: input.successSignals,
      },
      {
        heading: "What consolidation changes in practice",
        body: [
          `The change is operational, not just financial. Instead of restarting the same brief in several tools, the team can keep the brief, review notes, and final assets attached to one workflow.`,
          `On this page, the shift usually becomes obvious when ${sentenceCase(input.hiddenCosts[0] || "the team identifies duplicated spend")} and the team can point to an early win like ${sentenceCase(input.successSignals[0] || "lower monthly cost without losing output quality")}.`,
        ],
      },
      ...(input.customSections || []),
    ],
    faqs: [
      {
        question: `What is the first signal that this use case applies to our team?`,
        answer: `If the team keeps reopening the same brief across tools before creating ${topic.deliverable}, the workflow likely needs consolidation rather than another point solution.`,
      },
      {
        question: "Can we keep our own API keys?",
        answer: "Teams with heavy or specialized usage can use BYOK-style workflows where supported instead of relying only on included credits.",
      },
      {
        question: "What should we track first after consolidation starts?",
        answer: "Track both spending and workflow quality. The most useful early signals are whether context reuse improves and whether the team still needs the old subscriptions for real work.",
      },
      ...(input.customFaqs || []),
    ],
    cta: {
      primaryLabel: "Calculate AI tool savings",
      primaryHref: "/resources/ai-subscription-cost-calculator",
      secondaryLabel: "Start your team workspace",
      secondaryHref: "/register",
    },
    relatedLinks: [
      makeRelatedLink("/resources/ai-subscription-cost-calculator", "Run the numbers before adding or cancelling tools."),
      makeRelatedLink("/use-cases/ai-workspace-for-marketing-teams", "See how the shared workspace fits recurring marketing-team delivery."),
      makeRelatedLink("/compare/best-ai-workspace-for-marketing-teams", "Compare workspace options instead of only model vendors."),
    ].filter((link) => link.href !== currentPath),
  }
}

function comparePage(input: {
  slug: string
  title: string
  first: string
  second: string
  primaryKeyword: string
  firstWinsWhen: string[]
  secondWinsWhen: string[]
  decisionChecklist: string[]
  customSections?: SeoSection[]
  customFaqs?: SeoFaq[]
}) : SeoPage {
  const topic = resolveTopicProfile(input.title, input.primaryKeyword)
  const currentPath = `/compare/${input.slug}`

  return {
    slug: input.slug,
    group: "compare",
    title: `${input.title} | AI Marketing`,
    description: `Compare ${input.first} and ${input.second} for marketing work, then see when a shared multi-model workspace is a better fit for marketing teams.`,
    h1: input.title,
    intro: "Choosing the best AI model is easier when you separate model strengths from workflow needs. Marketing teams often need several models plus shared context.",
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["best AI model for marketing", "AI tools comparison", "multi-model AI workspace"],
    audience: "Marketing teams deciding which AI model or AI workspace should support recurring execution.",
    highlights: [
      `${input.first} and ${input.second} solve different parts of ${topic.deliverable}.`,
      `The better answer usually depends on ${topic.decisionLens}, not only brand preference.`,
      "Best for teams choosing a repeatable workflow instead of another isolated subscription.",
    ],
    comparison: {
      firstLabel: input.first,
      secondLabel: input.second,
      rows: [
        {
          dimension: "Where teams start",
          first: `${input.first} may be stronger when the team prefers its native workflow for part of ${topic.deliverable}.`,
          second: `${input.second} may be stronger when another part of ${topic.decisionLens} matters more.`,
        },
        {
          dimension: "What still needs human review",
          first: `${input.first} still needs a strong brief, approvals, and a review pass for ${topic.reviewFocus}.`,
          second: `${input.second} still needs the same review discipline even if the first draft feels stronger.`,
        },
        {
          dimension: "Team operations",
          first: "Separate model accounts can scatter decisions and hide the reasoning behind final assets.",
          second: "A shared workspace keeps the winning brief and review notes available for the next campaign.",
        },
      ],
    },
    sections: [
      {
        heading: `What ${input.title} actually depends on`,
        body: [
          `There is no single best answer to ${input.title.toLowerCase()} in every situation. The better pick depends on the job shape, the briefing quality, and what kind of review the team can realistically do.`,
          `For work centered on ${topic.deliverable}, teams usually get more leverage by defining the workflow first and then choosing the model that supports it best.`,
        ],
      },
      {
        heading: `Where ${input.first} can win`,
        body: [
          `${input.first} tends to win when the team likes its default working style and the job can stay inside that experience without much handoff overhead.`,
          `If your reviewers mainly care about one slice of ${topic.decisionLens}, ${input.first} may feel like the cleaner first choice.`,
        ],
        bullets: input.firstWinsWhen,
      },
      {
        heading: `Where ${input.second} can win`,
        body: [
          `${input.second} tends to win when a different reasoning or drafting pattern better supports the deliverable, or when the team needs another angle before it commits.`,
          `That can matter a lot when reviewers care more about ${topic.reviewFocus} than about staying loyal to one native interface.`,
        ],
        bullets: input.secondWinsWhen,
      },
      {
        heading: "When the better answer is a shared workspace",
        body: [
          `If the same team needs to compare outputs, preserve context, and reuse the winning brief across campaigns, the workspace matters as much as the model choice.`,
          "AI Marketing is positioned so the team does not need to settle every future debate about model choice up front. It can route the work through multiple models and specialist workflows in one place.",
        ],
      },
      {
        heading: `Decision checklist for ${input.title}`,
        body: ["Teams usually make better comparison decisions when they score the workflow, not only the draft quality."],
        bullets: input.decisionChecklist,
      },
      {
        heading: `How to run a fair ${input.title.toLowerCase()} test`,
        body: [
          `Use one live brief, not three different experiments. A fair comparison keeps the task, deadline, and reviewer constant so the team can see whether model strength or workflow strength is carrying the result.`,
          `If ${sentenceCase(input.firstWinsWhen[0] || `${input.first} fits the current workflow`)}, weight ${input.first} more heavily. If ${sentenceCase(input.secondWinsWhen[0] || `${input.second} fits the review process better`)}, give that side more credit before you decide.`,
        ],
      },
      ...(input.customSections || []),
    ],
    faqs: [
      {
        question: `Does ${input.title.toLowerCase()} have one permanent winner?`,
        answer: `Usually no. The winner changes with the brief, the reviewer, and which part of ${topic.decisionLens} matters most for the task.`,
      },
      {
        question: "Does a shared workspace replace model judgment?",
        answer: "No. It helps route work, preserve context, and keep team output organized while still letting users choose suitable models.",
      },
      {
        question: `What is the fastest way to compare ${input.first} and ${input.second}?`,
        answer: `Run the same real brief through both options, then score the result on output quality, review friction, and how well the team can reuse the winning context next time.`,
      },
      ...(input.customFaqs || []),
    ],
    cta: {
      primaryLabel: "Start your team workspace",
      primaryHref: "/register",
      secondaryLabel: "Estimate subscription savings",
      secondaryHref: "/resources/ai-subscription-cost-calculator",
    },
    relatedLinks: [
      ...topicRelatedLinks(input.title).filter((link) => link.href !== currentPath),
      makeRelatedLink("/resources/ai-subscription-cost-calculator", "Estimate whether separate subscriptions are worth the added complexity."),
    ],
  }
}

function promptPage(input: {
  slug: string
  title: string
  promptTypes: string[]
  agentHref: string
  primaryKeyword: string
  contextPack: string[]
  commonMistakes: string[]
  customSections?: SeoSection[]
  customFaqs?: SeoFaq[]
}) : SeoPage {
  const topic = resolveTopicProfile(input.title, input.primaryKeyword)
  const relatedAgentLabel = makeRelatedLink(input.agentHref, "").label
  const currentPath = `/prompts/${input.slug}`

  return {
    slug: input.slug,
    group: "prompts",
    title: `${input.title} | AI Marketing`,
    description: `${input.title} for small teams. Use these prompt structures manually or run them with company context inside AI Marketing.`,
    h1: input.title,
    intro: `${input.title} help teams get started faster, but they become more valuable when the prompt carries the right brief for ${topic.deliverable} instead of generic background text.`,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["marketing prompts", "AI prompts for teams", "AI marketing agent prompts"],
    audience: "Marketers who want reusable prompt patterns for campaign and content production.",
    highlights: [
      `Built for ${topic.deliverable}, not generic catch-all prompting.`,
      `Covers ${formatList(input.promptTypes.slice(0, 3)).toLowerCase()} so teams can rotate prompt structures instead of repeating one template.`,
      `Pairs naturally with ${relatedAgentLabel} when the team wants saved context and a more structured workflow.`,
    ],
    sections: [
      {
        heading: `What good ${input.title.toLowerCase()} need`,
        body: [
          `Good prompt libraries are useful because they focus the model on the parts of the job that decide quality, especially ${topic.decisionLens}.`,
          `Use these prompts as structured starting points, then adapt them to the product, audience, channel, and campaign goal before you ask for final ${topic.deliverable}.`,
        ],
      },
      {
        heading: "Prompt patterns included",
        body: ["These patterns are most useful when you rotate them based on what the team needs to decide next."],
        bullets: input.promptTypes,
      },
      {
        heading: `Context to add before running ${input.title.toLowerCase()}`,
        body: [
          `Store brand rules, audience notes, product facts, offers, objections, and prior campaign decisions in the workspace before running the prompt.`,
          `For this topic, the details that usually move quality most are ${formatList(topic.contextSignals)}.`,
        ],
        bullets: input.contextPack,
      },
      {
        heading: `How to review ${topic.keyword} output`,
        body: [
          `Do not judge the prompt only by whether the first draft sounds fluent. Review it for ${topic.reviewFocus}, because that is where generic prompting usually falls short.`,
        ],
      },
      {
        heading: `When to move from prompts to ${relatedAgentLabel}`,
        body: [
          `Prompts are great for fast starts. When the team wants the brief, revisions, and decision history to stay attached to the work, move the workflow into ${relatedAgentLabel}.`,
        ],
      },
      {
        heading: `Common failure modes in ${input.title.toLowerCase()}`,
        body: ["Prompt libraries are most useful when the team also knows what usually makes the output go off track."],
        bullets: input.commonMistakes,
      },
      {
        heading: `Starter brief example for ${input.title.toLowerCase()}`,
        body: [
          `A stronger starter brief for this page usually names ${formatList(input.contextPack.slice(0, 3)).toLowerCase()} before it asks for final ${topic.deliverable}.`,
          `If the team needs ${formatList(input.promptTypes.slice(0, 2)).toLowerCase()}, say that up front so the prompt shapes the output around a real decision instead of a generic draft.`,
        ],
      },
      ...(input.customSections || []),
    ],
    faqs: [
      {
        question: `Are these ${input.title.toLowerCase()} better for first drafts or final assets?`,
        answer: `They are best for first drafts, option generation, and structured iteration. Final assets still need review for ${topic.reviewFocus}.`,
      },
      {
        question: "Which agent matches this prompt page?",
        answer: `Use ${relatedAgentLabel} for a more structured workflow with saved company context and reusable revisions.`,
      },
      {
        question: `What should we add before running these ${input.title.toLowerCase()}?`,
        answer: `Add the real brief first: audience, offer, context, and channel constraints. The prompt structure matters, but missing context is usually what makes these pages feel generic.`,
      },
      ...(input.customFaqs || []),
    ],
    cta: {
      primaryLabel: "Run with company context",
      primaryHref: "/register",
      secondaryLabel: "View related agent",
      secondaryHref: input.agentHref,
    },
    relatedLinks: [
      makeRelatedLink(input.agentHref, "Open the matching structured agent workflow for this prompt set."),
      ...topicRelatedLinks(input.title).filter((link) => link.href !== input.agentHref && link.href !== currentPath),
      makeRelatedLink("/use-cases/ai-workspace-for-marketing-teams", "See where reusable prompts fit inside a broader team workflow."),
    ],
  }
}

const rawSeoPages: SeoPage[] = [
  ...claudeFablePages,
  alternativePage({
    slug: "chatgpt-team-alternative",
    product: "ChatGPT Team",
    audience: "Small marketing teams that like ChatGPT but also need Claude, Gemini, image generation, marketing agents, and shared company context.",
    competitorStrength: "ChatGPT Team is often better when your team wants the official OpenAI workspace, direct access to OpenAI-native features, and a general-purpose assistant for many departments.",
    aiMarketingFit: "AI Marketing is better when the buying reason is marketing execution: strategy, copy, SEO content, images, website copy, video scripts, shared context, and lower tool sprawl.",
    primaryKeyword: "ChatGPT Team alternative",
    switchSignals: [
      "You keep ChatGPT for drafting but still pay other tools for images, website copy, or campaign handoffs.",
      "Team members need Claude or Gemini for review, but the winning brief lives in ChatGPT threads only.",
      "Marketing approvals happen outside ChatGPT because the workspace does not hold the full campaign package.",
      "Occasional users need access to shared context without buying another full premium seat.",
    ],
    migrationSteps: [
      "List which OpenAI-native features the team actually uses every week and which ones are nice-to-have.",
      "Move one recurring campaign workflow into AI Marketing with the same brand and offer context.",
      "Compare total seat cost across ChatGPT Team, image tools, and other writing tools before cutting anything.",
      "Keep ChatGPT Team only for users who truly need OpenAI-native workflows after the pilot.",
    ],
  }),
  alternativePage({
    slug: "claude-team-alternative",
    product: "Claude Team",
    audience: "Teams that value Claude for writing and reasoning but need a broader marketing production workspace.",
    competitorStrength: "Claude Team is often better when your team wants Anthropic's official product experience and uses Claude heavily for long-form reasoning or document-heavy workflows.",
    aiMarketingFit: "AI Marketing is better when the team wants Claude-style work alongside other models, content agents, image generation, shared credits, and marketing-specific workflows.",
    primaryKeyword: "Claude Team alternative",
    switchSignals: [
      "Claude remains great for long-form reasoning, but the team still needs other tools to turn decisions into campaign assets.",
      "Writers prefer Claude while designers or marketers want other models in the same workspace.",
      "Campaign context is copied from Claude into landing-page, image, or SEO workflows every week.",
      "Leadership wants one place to review outputs instead of chasing drafts across separate subscriptions.",
    ],
    migrationSteps: [
      "Identify the document-heavy or reasoning-heavy tasks where Claude still outperforms the rest of the stack.",
      "Pilot AI Marketing on one workflow that needs Claude plus follow-on copy, image, or website tasks.",
      "Bring brand docs and campaign history into the shared workspace before judging first-draft quality.",
      "Keep Claude Team for the small set of users whose daily work still depends on its native environment.",
    ],
  }),
  alternativePage({
    slug: "jasper-alternative",
    product: "Jasper",
    audience: "Small teams and founders comparing dedicated AI writing tools with a broader marketing workspace.",
    competitorStrength: "Jasper can be better for teams that want a mature AI writing product with dedicated brand and campaign features.",
    aiMarketingFit: "AI Marketing is better when writing is only one part of the job and the team also needs strategy, images, website copy, video scripts, and multi-model access.",
    primaryKeyword: "Jasper alternative",
    switchSignals: [
      "Jasper handles copy well, but the same launch also needs strategy, visuals, video, and multi-model review.",
      "Your team wants brand-aware writing without paying for a separate image or script workflow beside Jasper.",
      "Campaign briefs start in Jasper but final approvals still depend on tools outside the writing stack.",
      "The team needs shared credits and broader marketing coverage more than a writing-only workspace.",
    ],
    migrationSteps: [
      "Export the brand voice, product proof, and recurring campaign prompts the team uses in Jasper today.",
      "Rebuild one live writing workflow in AI Marketing and compare how much extra context setup it needs.",
      "Check whether related work like visuals, scripts, and landing pages can move into the same workspace.",
      "Keep Jasper only if the writing-specific workflow still clearly beats the broader team setup after review.",
    ],
    customSections: [
      {
        heading: "What a Jasper-heavy workflow usually leaves outside the writing tool",
        body: [
          "Jasper often covers the drafting step well, but the surrounding work still spills into separate tools for campaign strategy, visuals, video, and review notes.",
          "That matters because the true replacement test is not just copy quality. It is whether the team can keep the full campaign workflow in one place after the draft is written.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "What should a Jasper user compare besides writing quality?",
        answer: "Compare the full campaign workflow: where brand context lives, how adjacent assets get produced, and whether reviewers can see the same brief without jumping across tools.",
      },
    ],
  }),
  alternativePage({
    slug: "copy-ai-alternative",
    product: "Copy.ai",
    audience: "Agencies, consultants, and small marketing teams that need copy plus shared execution workflows.",
    competitorStrength: "Copy.ai can be better for teams focused mainly on copy generation and established go-to-market templates.",
    aiMarketingFit: "AI Marketing is better when copy needs to connect with brand strategy, research, images, landing pages, and team context in one place.",
    primaryKeyword: "Copy.ai alternative",
    switchSignals: [
      "Copy.ai produces drafts, but your team still manages research, visuals, and approvals in other tools.",
      "Agency or consultant work requires client-specific context reuse across more than copy alone.",
      "The team wants one workflow for campaign assets instead of separate go-to-market templates and design tools.",
      "Seat cost rises because even occasional reviewers need paid access to see the latest copy context.",
    ],
    migrationSteps: [
      "Collect the go-to-market templates and messaging patterns that actually drive results in Copy.ai today.",
      "Test whether those same jobs can run in AI Marketing with saved client or brand context.",
      "Compare the handoff quality for copy plus adjacent outputs like landing-page sections or visuals.",
      "Retire only the workflows that become redundant after the shared workspace pilot proves out.",
    ],
  }),
  alternativePage({
    slug: "typingmind-alternative",
    product: "TypingMind",
    audience: "Teams that like multi-model chat but need marketing workflows and team production assets.",
    competitorStrength: "TypingMind can be better for power users who want a flexible multi-model chat interface.",
    aiMarketingFit: "AI Marketing is better when multi-model access must connect to marketing agents, shared company context, and output workflows.",
    primaryKeyword: "TypingMind alternative",
    switchSignals: [
      "Power users love the flexible chat layer, but the team still needs structured workflows for recurring marketing jobs.",
      "Model exploration is easy in TypingMind, yet campaign history and approvals live somewhere else.",
      "Non-technical teammates need guided workflows, not just a powerful multi-model interface.",
      "You want multi-model access plus assets like SEO drafts, website copy, and scripts in one workspace.",
    ],
    migrationSteps: [
      "Note which model-switching and prompt-management behaviors the team relies on inside TypingMind.",
      "Pilot a recurring marketing workflow in AI Marketing where shared context matters more than interface flexibility.",
      "Compare how easily occasional marketers can use the workflow without help from a power user.",
      "Keep TypingMind only for advanced exploration if the production workflow clearly belongs elsewhere.",
    ],
  }),
  alternativePage({
    slug: "team-gpt-alternative",
    product: "Team-GPT",
    audience: "Teams comparing collaborative AI workspaces for marketing execution.",
    competitorStrength: "Team-GPT can be better for general team collaboration around AI chat and prompts.",
    aiMarketingFit: "AI Marketing is better when the workflow is specifically marketing production with agents for growth, copy, websites, images, and video.",
    primaryKeyword: "Team-GPT alternative",
    switchSignals: [
      "The team collaborates well in Team-GPT, but marketing still lacks specialist workflows for assets and reviews.",
      "Prompt sharing exists, yet campaign execution depends on separate systems for copy, images, or research.",
      "Leaders want the workspace to be organized around deliverables instead of general chat collaboration.",
      "The buying decision is now about marketing throughput, not only shared prompting.",
    ],
    migrationSteps: [
      "List the collaborative habits Team-GPT currently supports that the team would not want to lose.",
      "Recreate one end-to-end marketing workflow in AI Marketing including brief, draft, review, and final asset.",
      "Check whether specialist agents reduce prompt maintenance compared with the current setup.",
      "Decide whether Team-GPT should stay for broad collaboration or whether the marketing lane can consolidate fully.",
    ],
  }),
  alternativePage({
    slug: "poe-alternative",
    product: "Poe",
    audience: "Small teams that want broad model access but need more structured marketing output.",
    competitorStrength: "Poe can be better for users who want quick access to many bots and broad exploration.",
    aiMarketingFit: "AI Marketing is better when the team needs reusable workflows, permissions, shared credits, and company context for marketing campaigns.",
    primaryKeyword: "Poe alternative",
    switchSignals: [
      "Poe is useful for exploration, but the final campaign workflow still has no shared operational home.",
      "The team samples many bots yet cannot easily preserve the winning context for later campaigns.",
      "Marketing managers need permissions, credits, and review structure rather than open-ended bot browsing.",
      "You want broad model access tied to repeatable content or campaign production, not only experimentation.",
    ],
    migrationSteps: [
      "Separate exploratory use cases from recurring production workflows before moving anything.",
      "Test one campaign workflow in AI Marketing where shared context and approvals matter more than bot variety.",
      "Measure whether the team actually reuses previous prompts and outputs once they live in one workspace.",
      "Leave exploratory users on Poe only if they still need its broad bot catalog after the production pilot.",
    ],
  }),
  makeUseCasePage({
    slug: "save-money-on-ai-subscriptions",
    title: "Save Money on AI Subscriptions for Your Team",
    intro: "Separate AI tools can quietly become a large monthly software bill. A shared workspace helps small teams consolidate common marketing production.",
    primaryKeyword: "save money on AI subscriptions",
    steps: [
      "List every AI subscription the team pays for today.",
      "Separate heavy daily users from occasional users.",
      "Identify duplicated capabilities such as writing, image generation, and research.",
      "Estimate what can move into a shared credit-based workspace.",
    ],
    hiddenCosts: [
      "Occasional users keep premium seats active just to review output once or twice a month.",
      "Teams buy overlapping writing, image, and research tools because each one stores a different slice of context.",
      "Admins lose time managing renewals and permissions across products that solve adjacent jobs.",
      "Campaign rework rises when each subscription starts from a different brief and history.",
    ],
    successSignals: [
      "Total monthly AI spend drops without cutting off the people who ship campaign work every week.",
      "Occasional users can review or contribute without needing their own stack of personal subscriptions.",
      "The team produces the same core marketing assets with fewer copied prompts and fewer tool handoffs.",
      "Leaders can see which workflows still justify premium seats and which ones do not.",
    ],
    customSections: [
      {
        heading: "A finance-friendly way to audit AI subscriptions",
        body: [
          "Start by grouping subscriptions into heavy daily use, occasional review use, and overlapping point-tool use. That makes it easier to see which spend is actually tied to output and which spend exists only because the workflow is fragmented.",
          "Most teams find the biggest savings when they stop paying premium-seat prices for occasional access and move repeatable campaign work into a shared workspace.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "Where do teams usually find the first real savings?",
        answer: "Usually in occasional-user seats and duplicated point tools. Those costs tend to be easier to remove than the subscriptions used by true daily power users.",
      },
    ],
  }),
  makeUseCasePage({
    slug: "one-ai-subscription-for-teams",
    title: "One AI Subscription for Small Teams",
    intro: "A shared AI workspace can be easier to manage than separate subscriptions for every person and every task.",
    primaryKeyword: "one subscription for multiple AI models",
    steps: [
      "Define which team members need regular AI access.",
      "Map recurring jobs such as strategy, copy, images, landing pages, and scripts.",
      "Move repeatable workflows into a shared workspace.",
      "Keep vendor-native subscriptions only where they are clearly necessary.",
    ],
    hiddenCosts: [
      "A so-called single subscription fails if the team still needs side tools for images, scripts, or research.",
      "People keep shadow subscriptions when the shared workspace does not match their real deliverables.",
      "Context gets fragmented when the one subscription is only a chat tool instead of a workflow hub.",
      "Managers underestimate the cost of re-briefing every task that moves between isolated products.",
    ],
    successSignals: [
      "Most recurring marketing work can start inside one company-owned workspace.",
      "The team knows which users need heavier access and which ones can share pooled credits.",
      "Approval history, brand context, and prompts stay in one place instead of personal accounts.",
      "New teammates can join the workflow without inheriting a stack of disconnected subscriptions.",
    ],
  }),
  makeUseCasePage({
    slug: "chatgpt-claude-gemini-in-one-workspace",
    title: "ChatGPT, Claude, and Gemini in One Marketing Workspace",
    intro: "Small teams should not need a new workspace every time a different model is better for a marketing task.",
    primaryKeyword: "ChatGPT Claude Gemini in one app",
    steps: [
      "Use different models for research, drafting, critique, and ideation.",
      "Keep briefs and brand context in one workspace.",
      "Route tasks through specialist marketing agents.",
      "Track output and decisions across campaigns.",
    ],
    hiddenCosts: [
      "Model-specific subscriptions look efficient until the same team must duplicate the same brief three times.",
      "Output comparison becomes messy when each model lives in a separate account or interface.",
      "The real cost is not just seats but the time lost deciding which model saw the best context.",
      "Cross-model workflows break down when nobody can see the review notes that led to the final draft.",
    ],
    successSignals: [
      "Teams can compare model output without rebuilding context for every run.",
      "The winning brief and final decision stay visible for the next campaign or launch.",
      "Users route work by task type instead of arguing about one permanent best model.",
      "Spending becomes easier to forecast because the models live inside one operating workflow.",
    ],
    customSections: [
      {
        heading: "What changes when three models share one marketing workflow",
        body: [
          "The gain is not only convenience. It is the ability to keep one brief, one set of review notes, and one campaign history while different models handle research, drafting, critique, or revision.",
          "That makes model choice a tactical decision inside the workflow instead of a political decision about which vendor should own the whole team.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "Does one workspace mean every task should use all three models?",
        answer: "No. The value is optionality and context reuse. Most teams still settle into patterns where only some tasks benefit from cross-model comparison.",
      },
    ],
  }),
  makeUseCasePage({
    slug: "share-ai-tools-with-team",
    title: "Share AI Tools With Your Team Without Losing Context",
    intro: "Shared AI access should include permissions, history, and company context, not only a shared login.",
    primaryKeyword: "share AI tools with team",
    steps: [
      "Create a workspace owned by the company.",
      "Invite members with the right permissions.",
      "Use shared credits instead of unmanaged personal subscriptions.",
      "Preserve campaign decisions in reusable conversation history.",
    ],
    hiddenCosts: [
      "Shared logins create security and ownership problems while still hiding the reasoning behind final assets.",
      "Teams lose context when key prompts and approval notes live in one person's personal account.",
      "New hires take longer to ramp because nothing explains how earlier campaign decisions were made.",
      "Tool sharing fails when reviewers cannot see the same brand context as the original creator.",
    ],
    successSignals: [
      "Each teammate can access the right workflows without borrowing someone else's account.",
      "Campaign context, prompts, and review notes stay attached to the company workspace.",
      "Permissions match real responsibilities across creators, reviewers, and managers.",
      "The team can revisit past decisions and reuse them instead of rebuilding everything from memory.",
    ],
  }),
  makeUseCasePage({
    slug: "ai-workspace-for-marketing-teams",
    title: "AI Workspace for Marketing Teams",
    intro: "Give marketing teams one workspace for content, research, visuals, and campaign workflows instead of scattering the job across separate AI tools.",
    primaryKeyword: "AI workspace for marketing teams",
    steps: [
      "Map the recurring workflows that move from research to copy, visuals, and review.",
      "Load shared audience, offer, and brand context before the team starts drafting.",
      "Decide which workflows should stay multi-model and which ones need structured review.",
      "Route the team through one shared workspace before buying another specialist point tool.",
    ],
    hiddenCosts: [
      "Marketing teams lose time when every launch brief gets rebuilt inside different chat, writing, and image tools.",
      "Research decisions disappear when they never reach the same workspace as the content and visual assets they should guide.",
      "Reviewers cannot reuse winning context if the final output is assembled from disconnected subscriptions.",
      "Homepage, SEO, and campaign work drift apart when each task starts with a different prompt history.",
    ],
    successSignals: [
      "The same brief can move from research to copy, visuals, and review without re-explaining the project.",
      "Marketing output becomes easier to reuse because the team can see what context and decisions produced the final asset.",
      "Internal links, pricing, and use-case pages tell one product story instead of separate cost or prompt stories.",
      "The team reduces tool switching without forcing every task into one model.",
    ],
  }),
  makeUseCasePage({
    slug: "ai-workspace-for-seo-teams",
    title: "AI Workspace for SEO Teams",
    intro: "Keep search intent, outlines, drafts, and refresh workflows in one AI workspace instead of spreading SEO work across isolated chats and writing tools.",
    primaryKeyword: "AI workspace for SEO teams",
    steps: [
      "Collect the recurring SEO jobs that reuse the same product, ICP, and SERP context.",
      "Store the target keyword, search intent, internal links, and editorial constraints in one shared workspace.",
      "Use the same context for research, article outlines, refreshes, and review passes.",
      "Compare model output without losing the SEO brief or the editorial history behind it.",
    ],
    hiddenCosts: [
      "SEO teams repeat SERP research because the winning brief never stays attached to the draft workflow.",
      "Writers and reviewers lose time when internal links, primary keywords, and factual constraints live in different systems.",
      "Content refresh work becomes inconsistent when the old reasoning is missing from the current tool.",
      "A general chat tool rarely preserves the workflow detail needed to scale SEO production cleanly.",
    ],
    successSignals: [
      "The team can move from search intent to publishable draft faster without dropping key constraints.",
      "Article updates inherit the earlier context instead of restarting from zero.",
      "Editors can compare model output while keeping the same SEO brief and review criteria.",
      "SEO work stops competing with campaign work for context because both live in one operating workspace.",
    ],
  }),
  makeUseCasePage({
    slug: "ai-workspace-for-content-creators",
    title: "AI Workspace for Content Creators",
    intro: "Creators need one workspace for ideation, scripting, repurposing, visuals, and launch context instead of a stack of disconnected AI tabs.",
    primaryKeyword: "AI workspace for content creators",
    steps: [
      "Start with the audience, offer, and content angle that should carry through every asset.",
      "Reuse one shared brief across outlines, scripts, repurposed posts, and visual directions.",
      "Keep revision notes attached to the same workspace so future content starts with the right context.",
      "Only add specialist tools when the shared workflow cannot cover a real production need.",
    ],
    hiddenCosts: [
      "Creators lose momentum when every asset starts with a new prompt and a different set of reference notes.",
      "Repurposing takes longer when the original brief and final decisions are not visible in the same system.",
      "Visual direction drifts away from the script when image and content tools never share context.",
      "Publishing speed falls when review notes are scattered across chats, docs, and design tools.",
    ],
    successSignals: [
      "One brief can power scripts, repurposed posts, visuals, and launch copy with less rework.",
      "The creator can revisit what worked and reuse it instead of improvising from scratch.",
      "Content output scales across channels without forcing every task into one model or one template.",
      "The workflow stays consistent enough that collaborators can step in without losing the thread.",
    ],
  }),
  makeUseCasePage({
    slug: "ai-workspace-for-indie-founders",
    title: "AI Workspace for Indie Founders",
    intro: "Indie founders need one AI workspace to connect positioning, research, launch copy, and workflow decisions while keeping spend and context under control.",
    primaryKeyword: "AI workspace for indie founders",
    steps: [
      "Capture the product, target buyer, and launch goal once before drafting anything.",
      "Run research, positioning, homepage copy, and launch assets from the same shared context.",
      "Use cost and compare pages to decide where the shared workspace should replace separate subscriptions first.",
      "Keep advanced setup options in reserve until the core workflow is already working.",
    ],
    hiddenCosts: [
      "Founders often buy more tools than they can operationalize because each promise sounds useful in isolation.",
      "Positioning work gets diluted when the research, homepage copy, and launch assets are produced in separate tools.",
      "Tool sprawl hides the true workflow bottleneck, which is usually context loss rather than raw model quality.",
      "A fragmented stack makes it harder to see which AI spending actually improves launch output.",
    ],
    successSignals: [
      "The founder can move from positioning and research to launch assets without restarting the story every time.",
      "Cost comparisons become clearer because the workflow already lives in one place.",
      "The product narrative stays more consistent across homepage copy, SEO pages, and launch materials.",
      "Advanced options like BYOK or private deployment become additive instead of being the first thing to explain.",
    ],
  }),
  solutionPage({
    slug: "ai-for-small-marketing-teams",
    title: "AI Workspace for Small Marketing Teams",
    audience: "2-20 person marketing teams that need strategy, copy, images, website content, and campaign execution",
    primaryKeyword: "AI tools for small marketing teams",
    workflows: [
      "Turn a positioning brief into campaign messaging and landing page sections.",
      "Draft SEO articles, social posts, and email copy from one brand context.",
      "Generate image prompts and video scripts for campaign assets.",
      "Share decisions across teammates without copying context into every tool.",
    ],
    painPoints: [
      "The same team handles strategy, copy, images, and launch tasks without enough headcount for separate specialist tools.",
      "Brand context gets copied from chat to doc to design brief every time a new asset is needed.",
      "Small teams need approvals and history, not only fast one-off drafts.",
      "Tool sprawl grows quickly when every deliverable starts in a different AI product.",
    ],
    rolloutMetrics: [
      "Campaigns move from brief to first draft faster without losing brand consistency.",
      "The team reuses saved prompts, context, and prior decisions across multiple assets.",
      "Fewer subscriptions are needed to ship the same core marketing workflow.",
      "Reviewers spend less time asking for missing context before approving work.",
    ],
  }),
  solutionPage({
    slug: "ai-for-agencies",
    title: "AI Tools for Agencies",
    audience: "small agencies managing campaign ideas, client copy, visuals, and delivery notes",
    primaryKeyword: "AI tools for agencies",
    workflows: [
      "Create client-specific brand and campaign context.",
      "Draft campaign options, ad copy, social posts, and landing page copy.",
      "Generate image directions and visual concepts for client review.",
      "Keep reusable decisions in the client workspace.",
    ],
    painPoints: [
      "Agencies juggle multiple client voices and cannot afford to mix context between accounts.",
      "Client review cycles slow down when copy, visuals, and notes live in separate tools.",
      "Account teams need reusable client context for recurring deliverables, not isolated prompt threads.",
      "Margins shrink when premium AI seats are scattered across strategists, writers, and reviewers.",
    ],
    rolloutMetrics: [
      "Client-specific context is reused across briefs, drafts, and revisions without manual cleanup.",
      "Creative review cycles shorten because account teams can show copy and supporting assets together.",
      "Agencies reduce duplicate AI tooling without reducing client output coverage.",
      "Project handoffs improve because the next teammate can see the full workspace history.",
    ],
  }),
  solutionPage({
    slug: "ai-for-startups",
    title: "AI Marketing Agents for Startups",
    audience: "startup teams that need positioning, content, website copy, launch assets, and growth experiments",
    primaryKeyword: "AI marketing agents for startups",
    workflows: [
      "Clarify positioning and ICP before writing launch copy.",
      "Draft homepage sections, product explainers, and email sequences.",
      "Generate social launch content and founder-led posts.",
      "Iterate growth experiments with campaign history attached.",
    ],
    painPoints: [
      "Startups need fast output, but weak positioning makes every downstream asset more expensive to fix.",
      "Founders and marketers keep rewriting the same product story across launches, pages, and investor-facing content.",
      "Small startup teams cannot maintain a separate AI workflow for each channel they test.",
      "Launch decisions move quickly, so the workspace must preserve reasoning and revisions automatically.",
    ],
    rolloutMetrics: [
      "Positioning and launch messaging become more consistent across site, email, and social assets.",
      "Growth experiments are planned and reviewed from the same shared context instead of fresh chats.",
      "Founders spend less time re-explaining the product before each new content task.",
      "The team ships more launch collateral without adding another layer of point tools.",
    ],
  }),
  solutionPage({
    slug: "ai-for-consultants",
    title: "AI Marketing Workspace for Consultants",
    audience: "consultants and solo operators producing strategy, decks, articles, and client-facing marketing assets",
    primaryKeyword: "AI tools for consultants",
    workflows: [
      "Turn discovery notes into positioning and strategy drafts.",
      "Produce client-ready content outlines and campaign plans.",
      "Generate website copy and thought-leadership drafts.",
      "Keep client context organized without mixing projects.",
    ],
    painPoints: [
      "Consultants switch between client strategy, delivery notes, and content production all day.",
      "Personal AI accounts create risk when confidential client context is mixed across projects.",
      "Reusable frameworks matter, but every client still needs tailored positioning and deliverables.",
      "Solo operators need leverage without creating a messy chain of disconnected prompts and docs.",
    ],
    rolloutMetrics: [
      "Client work stays separated while reusable consulting frameworks remain easy to apply.",
      "Discovery notes turn into drafts and recommendations with fewer manual rewrites.",
      "Thought-leadership and client-delivery workflows can share context without leaking between accounts.",
      "The consultant can take on more recurring deliverables without adding another specialized AI tool.",
    ],
  }),
  solutionPage({
    slug: "ai-for-foreign-trade-companies",
    title: "AI Marketing Tools for Foreign Trade Companies",
    audience: "foreign trade companies that need English outreach, product pages, LinkedIn content, and campaign visuals",
    primaryKeyword: "AI marketing tools for foreign trade companies",
    workflows: [
      "Research customer industries and target account context.",
      "Generate English outreach emails and follow-up sequences.",
      "Create product introduction articles and landing page copy.",
      "Generate LinkedIn content, product image ideas, and campaign visuals.",
    ],
    painPoints: [
      "Foreign trade teams need export-ready English content, not generic translated copy.",
      "Product context has to travel across outreach, product pages, and trade-show or LinkedIn materials.",
      "Sales and marketing teams often share too little history about which buyer messages actually land.",
      "Separate tools make it harder to keep language quality and buyer trust signals consistent across markets.",
    ],
    rolloutMetrics: [
      "Outreach, product-page copy, and social content align more closely around the same product story.",
      "The team reuses market and buyer context instead of retranslating every new asset from scratch.",
      "English-language review becomes faster because drafts start closer to export-ready quality.",
      "Campaign asset production expands without requiring a separate stack for every language or channel task.",
    ],
  }),
  agentPage({
    slug: "brand-strategy-agent",
    title: "AI Brand Strategy Agent for Small Teams",
    problem: "It helps teams clarify positioning, audience, differentiation, messaging, and campaign angles before jumping into production.",
    primaryKeyword: "AI brand strategy agent",
    inputs: ["Company description", "Target audience", "Competitors", "Product proof points", "Current messaging"],
    outputs: ["Positioning brief", "Messaging hierarchy", "Differentiation angles", "Campaign narrative"],
    prompt: "Analyze our company context and create a positioning brief for a small-team AI marketing workspace targeting agencies and startups.",
    useCases: [
      "A team needs sharper positioning before rewriting the homepage or launch campaign.",
      "Founders and marketers disagree on audience or differentiation and need one working brief.",
      "Campaign planning has started too early and now needs a stronger strategic spine.",
      "An agency or consultant wants to turn discovery notes into a client-ready messaging framework.",
    ],
    reviewChecklist: [
      "Confirm the positioning is specific enough to exclude the wrong audience, not just attract everyone.",
      "Check whether each differentiation claim is backed by real proof or product evidence.",
      "Review the messaging hierarchy to see whether the primary promise survives across channels.",
      "Test whether the final strategy gives downstream copy and creative teams clear next moves.",
    ],
    customSections: [
      {
        heading: "Signals that the team needs brand strategy before more content",
        body: [
          "If every new asset starts by re-debating the audience, the value proposition, or what makes the product different, the bottleneck is probably strategy rather than copy volume.",
          "This agent is most useful when better positioning will unblock multiple downstream assets at once, from homepage messaging to launch campaigns.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "When is brand strategy the bottleneck instead of copywriting?",
        answer: "Usually when drafts keep changing because the core positioning is still unsettled. Better copy will not fix that until the team agrees on audience, differentiation, and proof.",
      },
    ],
  }),
  agentPage({
    slug: "growth-marketing-agent",
    title: "AI Growth Marketing Agent for Small Teams",
    problem: "It turns goals, channels, constraints, and campaign history into practical growth experiments and execution plans.",
    primaryKeyword: "AI growth marketing agent",
    inputs: ["Growth goal", "Current channels", "Offer", "Audience", "Budget or time constraint"],
    outputs: ["Experiment backlog", "Channel plan", "Campaign copy angles", "Measurement checklist"],
    prompt: "Create a four-week growth plan for a small SaaS team with limited budget and existing website traffic.",
    useCases: [
      "A small team needs a prioritized experiment backlog instead of a generic list of ideas.",
      "Channel owners want campaign recommendations shaped by real budget or bandwidth limits.",
      "A founder needs to turn one growth goal into coordinated copy, offers, and measurement.",
      "The team wants to keep past experiment outcomes attached to the next planning cycle.",
    ],
    reviewChecklist: [
      "Check that the plan sequences experiments by speed to learning, not only by channel popularity.",
      "Confirm each experiment has a defined owner, target metric, and practical launch scope.",
      "Review whether the offer and audience assumptions match what the team already knows.",
      "Make sure the measurement plan can be executed with the analytics the team actually has.",
    ],
  }),
  agentPage({
    slug: "copywriting-agent",
    title: "AI Copywriting Agent for Small Teams",
    problem: "It helps teams produce copy that uses shared brand context instead of one-off generic prompts.",
    primaryKeyword: "AI copywriting agent",
    inputs: ["Product facts", "Audience pain points", "Tone", "Channel", "Offer"],
    outputs: ["Landing page copy", "Email copy", "Ad angles", "Social copy"],
    prompt: "Write three landing page hero options for our product using the saved brand voice and target audience context.",
    useCases: [
      "A marketer needs fast first drafts across multiple channels without losing the brand voice.",
      "The same offer must be rewritten for landing pages, email, ads, and social posts.",
      "A small team wants shared copy context so every contributor stops reinventing the message.",
      "Founders need cleaner draft options before handing copy to a final reviewer or editor.",
    ],
    reviewChecklist: [
      "Verify the copy makes a concrete promise instead of leaning on empty marketing language.",
      "Check whether objections, proof, and CTA flow match the awareness level of the reader.",
      "Review the tone to make sure it sounds like the brand rather than a generic AI draft.",
      "Confirm channel-specific constraints such as length, scannability, and offer clarity are met.",
    ],
  }),
  agentPage({
    slug: "seo-article-agent",
    title: "AI SEO Article Writer for Teams",
    problem: "It structures articles around search intent, audience fit, internal links, and brand context.",
    primaryKeyword: "AI article writer for teams",
    inputs: ["Primary keyword", "Search intent", "Audience", "Internal links", "Product positioning"],
    outputs: ["Article outline", "Draft sections", "FAQ ideas", "Internal link suggestions"],
    prompt: "Create an SEO article outline for 'save money on AI subscriptions' and connect it to our calculator page.",
    useCases: [
      "A content team needs search-intent-driven outlines before drafting long-form content.",
      "Marketers want articles that connect naturally to product pages, calculators, or related assets.",
      "The team publishes frequently and needs a repeatable structure for keyword, FAQ, and link planning.",
      "Writers need saved brand context so every article does not drift into generic SEO filler.",
    ],
    reviewChecklist: [
      "Confirm the outline matches the actual search intent instead of only repeating the keyword.",
      "Check whether the draft includes enough evidence, examples, or specificity to earn trust.",
      "Review internal links to make sure they support the reader journey instead of looking forced.",
      "Make sure the article advances product positioning without turning into a sales page too early.",
    ],
    customSections: [
      {
        heading: "What separates an SEO draft from a publishable article",
        body: [
          "A publishable article usually has clearer intent coverage, sharper examples, and more deliberate internal-link choices than the average AI draft.",
          "This workflow is meant to help the team move from keyword-shaped content toward articles that can actually support product discovery and conversions.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "What should an editor check before publishing an AI SEO article?",
        answer: "Check whether the article genuinely solves the searcher's problem, adds specific proof, and links naturally into the broader site journey rather than just filling space around a keyword.",
      },
    ],
  }),
  agentPage({
    slug: "market-research-agent",
    title: "AI Market Research Agent",
    problem: "It organizes market notes, competitor context, audience insights, and campaign implications into usable research summaries.",
    primaryKeyword: "AI market research agent",
    inputs: ["Market question", "Target segment", "Known competitors", "Data sources", "Decision to support"],
    outputs: ["Research brief", "Competitor notes", "Opportunity map", "Messaging implications"],
    prompt: "Research the market for multi-model AI workspaces for small marketing teams and summarize positioning gaps.",
    useCases: [
      "A founder needs quick research before choosing a target segment, market angle, or pricing story.",
      "Marketing teams want competitor and audience notes tied directly to a real decision.",
      "Agencies need fast research summaries before presenting positioning or campaign recommendations.",
      "The team wants one place to keep research findings and the messaging choices they influenced.",
    ],
    reviewChecklist: [
      "Check whether the research brief distinguishes evidence from inference or assumption.",
      "Review competitor summaries for accuracy and relevance to the decision at hand.",
      "Confirm the insights actually change positioning, messaging, or campaign decisions.",
      "Make sure the summary does not overstate confidence where source quality is still weak.",
    ],
  }),
  agentPage({
    slug: "website-copy-agent",
    title: "AI Website Copy Generator",
    problem: "It turns positioning and offer context into clear website sections that explain the product and drive action.",
    primaryKeyword: "AI website copy generator",
    inputs: ["Page goal", "Audience", "Offer", "Proof points", "Primary CTA"],
    outputs: ["Hero copy", "Section flow", "Feature copy", "FAQ content"],
    prompt: "Create homepage copy for an AI marketing workspace that helps small teams reduce AI subscription costs.",
    useCases: [
      "A homepage or landing page needs a stronger message before design or development moves forward.",
      "The team wants one shared workflow for hero copy, proof sections, objections, and CTA structure.",
      "A launch or repositioning requires rewriting multiple page sections from the same brief.",
      "Marketers need website copy that stays aligned with saved offer and audience context.",
    ],
    reviewChecklist: [
      "Verify the hero explains the offer clearly before introducing secondary features or claims.",
      "Check whether proof, objections, and CTA flow support the actual conversion goal of the page.",
      "Review section transitions so the page tells one consistent story instead of isolated fragments.",
      "Confirm the copy reflects real product proof rather than vague benefit language.",
    ],
    customSections: [
      {
        heading: "Where website copy quality usually breaks down",
        body: [
          "Most weak website copy fails before the wording stage. The offer is unclear, the proof is too thin, or the page is trying to speak to too many audiences at once.",
          "This agent is most useful when the team wants to turn one clear brief into a full page narrative instead of generating disconnected section snippets.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "Why does website copy still feel generic even after multiple prompt passes?",
        answer: "Usually because the page strategy is still vague. If the audience, offer, proof, and CTA are not explicit, better prompting only produces cleaner generic language.",
      },
    ],
  }),
  agentPage({
    slug: "video-script-agent",
    title: "AI Video Script Generator",
    problem: "It converts campaign ideas into scripts, hooks, scenes, and visual direction for marketing videos.",
    primaryKeyword: "AI video script generator",
    inputs: ["Video goal", "Audience", "Offer", "Runtime", "Channel"],
    outputs: ["Hook options", "Script draft", "Scene outline", "Visual direction"],
    prompt: "Write a 45-second product video script for a small-team AI marketing workspace with a clear savings angle.",
    useCases: [
      "A marketer needs short-form scripts that connect hook, structure, and CTA around one offer.",
      "Creative teams want a shared brief for scenes and messaging before filming or editing begins.",
      "The same campaign idea must be adapted for product explainers, social clips, or ad variations.",
      "Small teams need video drafts that already reflect saved product and audience context.",
    ],
    reviewChecklist: [
      "Check whether the hook lands the audience pain point within the first few seconds.",
      "Review pacing so each scene earns its place within the intended runtime.",
      "Confirm the script and visual direction support the same offer instead of competing for attention.",
      "Make sure the CTA is explicit enough for the channel and stage of awareness.",
    ],
    customSections: [
      {
        heading: "How teams usually turn one video brief into several assets",
        body: [
          "A strong video brief can support more than one script. Teams often use the same core message to create a paid ad variation, a short social edit, and a longer product explainer with different hooks and CTA emphasis.",
          "That is why keeping the brief and review history in one workflow matters. The next script can reuse the message without starting from zero.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "Should one video prompt create the final script in a single pass?",
        answer: "Usually no. The best workflow is to use the first pass for hook and structure, then tighten pacing, scenes, and CTA once the team agrees on the angle.",
      },
    ],
  }),
  agentPage({
    slug: "image-generation-agent",
    title: "AI Image Generator for Teams",
    problem: "It helps teams create campaign visuals and image prompts that stay aligned with brand and product context.",
    primaryKeyword: "AI image generator for teams",
    inputs: ["Campaign goal", "Brand style", "Product subject", "Format", "Usage channel"],
    outputs: ["Image prompts", "Visual directions", "Variant ideas", "Review notes"],
    prompt: "Create image prompts for a launch campaign that shows one shared AI workspace replacing scattered tool subscriptions.",
    useCases: [
      "A campaign needs visual directions before the team spends time generating dozens of random images.",
      "Marketers want image prompts that stay tied to brand style and channel requirements.",
      "The team needs multiple creative variants for ads, social, or product storytelling from one brief.",
      "Design or marketing reviewers need clearer prompt logic before handing assets to the final production step.",
    ],
    reviewChecklist: [
      "Verify the prompt specifies subject, composition, and channel intent clearly enough to avoid drift.",
      "Check that the visual direction still feels on-brand across multiple generated variants.",
      "Review whether the asset format matches the placement or campaign requirement.",
      "Make sure the prompt avoids generic stock-photo language when a sharper concept is needed.",
    ],
  }),
  agentPage({
    slug: "business-consulting-agent",
    title: "AI Business Consultant Agent",
    problem: "It helps founders and operators reason through business, marketing, and execution decisions with saved company context.",
    primaryKeyword: "AI business consultant",
    inputs: ["Business context", "Decision question", "Constraints", "Current data", "Desired outcome"],
    outputs: ["Decision brief", "Options", "Risks", "Recommended next steps"],
    prompt: "Evaluate whether our startup should position around cost savings, marketing workflow, or multi-model access first.",
    useCases: [
      "A founder needs a structured decision brief before choosing a positioning or go-to-market direction.",
      "Operators want to compare options while keeping company constraints and previous decisions visible.",
      "A small team needs help sequencing next steps when resources are limited.",
      "Business and marketing choices need to be reasoned through in the same workspace as campaign execution.",
    ],
    reviewChecklist: [
      "Check whether the recommendation is tied to the stated constraints rather than generic best practice.",
      "Review the risks and tradeoffs to see whether any major downside is missing.",
      "Confirm the next steps are concrete enough for an operator to execute this week.",
      "Make sure the advice separates assumptions from what the current data really supports.",
    ],
  }),
  comparePage({
    slug: "chatgpt-vs-claude-for-marketing",
    title: "ChatGPT vs Claude for Marketing",
    first: "ChatGPT",
    second: "Claude",
    primaryKeyword: "ChatGPT vs Claude for marketing",
    firstWinsWhen: [
      "The team wants the official OpenAI workflow and already uses ChatGPT heavily across departments.",
      "Marketers need a familiar interface for drafting, ideation, and general campaign support.",
      "The surrounding workflow can stay simple enough that native ChatGPT usage is not a bottleneck.",
      "The buyer values OpenAI-native access more than deeper multi-model workflow control.",
    ],
    secondWinsWhen: [
      "Writers or strategists prefer Claude's style for longer reasoning and document-heavy review.",
      "The team needs another drafting angle before committing to final messaging or structure.",
      "Reviewers care more about nuanced writing quality than staying inside one vendor's default flow.",
      "Marketing work depends on reasoning through complex tradeoffs before generating the final asset.",
    ],
    decisionChecklist: [
      "Compare the same brief in both tools and score the result on clarity, specificity, and revision quality.",
      "Check which interface better fits the real team workflow, not only the strongest first draft.",
      "Measure how often the work still spills into other tools for images, website copy, or research.",
      "Decide whether this is really a model decision or a workspace decision for a multi-person team.",
    ],
  }),
  comparePage({
    slug: "chatgpt-vs-gemini-vs-claude-for-business",
    title: "ChatGPT vs Gemini vs Claude for Business",
    first: "ChatGPT and Gemini",
    second: "Claude",
    primaryKeyword: "ChatGPT vs Gemini vs Claude for business",
    firstWinsWhen: [
      "The business already lives in Google or OpenAI ecosystems and wants that native operating model.",
      "Teams need broad productivity support alongside marketing work, not only long-form reasoning.",
      "Model choice is influenced by existing workspace habits, admin preferences, or vendor alignment.",
      "The team values quick access to common drafting and summarization workflows across departments.",
    ],
    secondWinsWhen: [
      "Decision makers care most about writing quality, reasoning depth, or document-heavy review flows.",
      "Teams regularly need a second point of view on messaging, strategy, or long-form drafts.",
      "The business is comfortable using Claude as the strongest writer even if other tools stay in the stack.",
      "The workflow benefits from slower, more deliberate reasoning before execution begins.",
    ],
    decisionChecklist: [
      "Test one business workflow that includes research, draft generation, and reviewer comments end to end.",
      "Score each option on admin fit, writing quality, context reuse, and total seat cost.",
      "Check whether marketing work still requires a separate workspace even after choosing a business AI suite.",
      "Decide if the team needs one vendor or a multi-model workspace that can keep all three available.",
    ],
    customSections: [
      {
        heading: "What business buyers often miss in a three-way model comparison",
        body: [
          "Business buyers often compare admin features, drafting quality, and vendor trust, but skip the question of where recurring marketing workflows will actually live after the purchase.",
          "That matters because the best business suite on paper can still leave the team buying extra tools once campaigns need research, copy, images, and approvals in one operating flow.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "Why can this comparison still end in a multi-model workspace?",
        answer: "Because the real winner may be operational flexibility. If different teams or tasks keep preferring different models, one workspace can be more useful than forcing a single-vendor answer.",
      },
    ],
  }),
  comparePage({
    slug: "best-ai-model-for-writing",
    title: "Best AI Model for Writing",
    first: "Single-model writing workflow",
    second: "Multi-model writing workflow",
    primaryKeyword: "best AI model for writing",
    firstWinsWhen: [
      "One model already produces drafts close enough to final quality for the team's main writing tasks.",
      "The workflow is simple and the team prefers lower operational overhead over comparison depth.",
      "A solo operator or tight team does not need multiple review styles on every draft.",
      "Most writing work stays within one consistent tone and approval pattern.",
    ],
    secondWinsWhen: [
      "Different writing tasks benefit from different strengths such as ideation, editing, or critique.",
      "The team wants to compare alternate drafts before choosing a final direction.",
      "Editors, strategists, and channel owners need different perspectives from the same brief.",
      "The cost of rewriting weak drafts is higher than the cost of testing more than one model.",
    ],
    decisionChecklist: [
      "Benchmark the same writing brief across your most common channels, not just one format.",
      "Measure revision time after the first draft, because that often matters more than the opening output.",
      "Check whether brand voice and proof survive consistently across multiple assignments.",
      "Choose the workflow that reduces editing friction, not only the one with the flashiest first pass.",
    ],
  }),
  comparePage({
    slug: "best-ai-model-for-market-research",
    title: "Best AI Model for Market Research",
    first: "Research-focused model usage",
    second: "Workspace-based research workflow",
    primaryKeyword: "best AI model for market research",
    firstWinsWhen: [
      "A single analyst needs quick synthesis from one model and can manage the context manually.",
      "The research question is narrow enough that collaboration or history reuse is not the main problem.",
      "The team cares more about immediate synthesis quality than about preserving the decision trail.",
      "Research is occasional and does not yet justify a shared multi-step workflow.",
    ],
    secondWinsWhen: [
      "Research findings need to feed messaging, positioning, or campaign decisions across the team.",
      "Multiple people contribute notes, competitors, or evidence to the same research effort.",
      "The team wants the final brief and the reasoning behind it available for later campaigns.",
      "Research becomes much more useful when it stays attached to follow-on execution tasks.",
    ],
    decisionChecklist: [
      "Decide whether the main problem is synthesis quality or the team's ability to reuse the findings.",
      "Compare how easily each workflow turns research into clear next decisions for marketing.",
      "Score the outputs on evidence quality, bias visibility, and decision usefulness.",
      "Check whether the same workspace can carry the research into messaging, content, or strategy work.",
    ],
    customSections: [
      {
        heading: "How market research becomes more valuable after the first summary",
        body: [
          "The first summary is only the start. Research gets more valuable when the team can carry the same findings into positioning, campaign planning, and content decisions without re-explaining the market every time.",
          "That is why some teams outgrow a single research chat and need a workspace that keeps the research trail attached to later work.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "What makes a market research workflow more useful than a one-off summary?",
        answer: "A useful workflow keeps the evidence, competitor notes, and decisions connected so later messaging or campaign work can build on the same research instead of restarting it.",
      },
    ],
  }),
  comparePage({
    slug: "best-ai-model-for-image-generation",
    title: "Best AI Model for Image Generation",
    first: "Standalone image generation",
    second: "Campaign-context image workflow",
    primaryKeyword: "best AI model for image generation",
    firstWinsWhen: [
      "A designer or marketer mostly needs direct image output and is comfortable driving prompts manually.",
      "The visual task is isolated enough that brand and campaign context can be added ad hoc.",
      "Fast creative exploration matters more than tying the asset into a wider marketing workflow.",
      "The team already has another system for approvals and campaign planning.",
    ],
    secondWinsWhen: [
      "Image prompts need to stay aligned with the same brief used for copy, landing pages, or ads.",
      "Multiple team members review creative direction before the final asset is generated.",
      "The campaign depends on consistent brand treatment across many channels or variants.",
      "The team needs prompt logic and asset decisions preserved for future launches.",
    ],
    decisionChecklist: [
      "Compare not just image quality but how easily the team can repeat the result next month.",
      "Check whether the prompt workflow captures brand style, product details, and channel requirements clearly.",
      "Measure how many revisions come from missing context rather than model limitations.",
      "Choose the option that makes campaign asset production more repeatable, not only more impressive once.",
    ],
  }),
  comparePage({
    slug: "best-ai-tools-for-small-business",
    title: "Best AI Tools for Small Business",
    first: "Separate AI tools",
    second: "Shared AI Marketing workspace",
    primaryKeyword: "best AI tools for small business",
    firstWinsWhen: [
      "A small business has one or two heavy users with very specific vendor preferences.",
      "Different functions can stay independent without much shared context or approval flow.",
      "The team is still experimenting and does not yet know which workflows should standardize.",
      "Best-in-class point tools matter more than centralized operations at the current stage.",
    ],
    secondWinsWhen: [
      "Marketing, content, and growth work increasingly depend on the same company and campaign context.",
      "The business wants to reduce seat sprawl without cutting off the people who ship work weekly.",
      "Occasional users need access to outputs and history without each owning a full premium stack.",
      "Leaders want clearer visibility into what AI workflows are actually driving results.",
    ],
    decisionChecklist: [
      "Map which jobs genuinely need separate best-of-breed tools and which ones are just legacy overlap.",
      "Compare total cost including approvals, duplicated context, and occasional-user access.",
      "Check whether the business would benefit more from shared workflows than from another isolated point tool.",
      "Choose the stack that fits the operating model of the team, not only the preferences of the loudest power user.",
    ],
  }),
  comparePage({
    slug: "compare-ai-tool-costs",
    title: "Compare AI Tool Costs for Marketing Teams",
    first: "Separate AI subscriptions",
    second: "Shared AI workspace",
    primaryKeyword: "compare AI tool costs",
    firstWinsWhen: [
      "Different specialists genuinely need vendor-native workflows every day and the overlap is low.",
      "The team is still testing categories and does not yet know which workflows should standardize.",
      "A cost comparison would be misleading because the current stack is mostly exploratory rather than operational.",
      "Model-specific features matter more than keeping briefs and review history in one system.",
    ],
    secondWinsWhen: [
      "The same marketing brief keeps moving between research, copy, visuals, and approval workflows.",
      "Occasional contributors need access to the output and context without each buying their own premium stack.",
      "Leaders want one place to compare total spend against the operating friction caused by tool sprawl.",
      "The team needs cost clarity without giving up multiple models or reusable workflow context.",
    ],
    decisionChecklist: [
      "Count the subscriptions attached to real weekly output, not just the tools someone tested once.",
      "Score how often the same brief is copied across chat, writing, image, and review tools.",
      "Compare the cost of seats together with the cost of context loss, review friction, and duplicated workflows.",
      "Use the calculator only after the team has mapped which workflows should actually live in the shared workspace.",
    ],
    customSections: [
      {
        heading: "Why cost comparisons fail without workflow context",
        body: [
          "A cheaper stack on paper can still be more expensive in practice if the team keeps rebuilding research, rewriting briefs, and reviewing assets across separate tools.",
          "The point of this page is to connect spend with workflow design. Marketing teams usually need both views before they can make a confident consolidation decision.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "Should cost savings lead the positioning?",
        answer: "Usually no. Cost savings help support the decision, but the stronger positioning is a multi-model workspace for marketing content, research, and workflows.",
      },
    ],
  }),
  comparePage({
    slug: "best-ai-workspace-for-marketing-teams",
    title: "Best AI Workspace for Marketing Teams",
    first: "Generic AI workspace",
    second: "AI Marketing workspace",
    primaryKeyword: "best AI workspace for marketing teams",
    firstWinsWhen: [
      "The team wants a neutral AI collaboration layer that serves many departments the same way.",
      "Marketing workflows are still light enough that the workspace does not need opinionated content or review flows.",
      "General chat collaboration matters more than keeping campaign execution, research, and visuals in one system.",
      "No single team yet owns a repeatable marketing operating model inside the workspace.",
    ],
    secondWinsWhen: [
      "The main buying job is recurring marketing execution across content, research, visuals, and workflow handoffs.",
      "The team needs multiple models but does not want to lose the shared brief and campaign context between tools.",
      "Leaders want use-case, compare, pricing, and workflow pages to point to one coherent product story.",
      "The workspace should help marketers ship work, not just collaborate around prompts.",
    ],
    decisionChecklist: [
      "Decide whether the workspace is mainly for generic AI collaboration or for recurring marketing delivery.",
      "Compare how each option handles context reuse from research to content, visuals, and team review.",
      "Check whether the workspace supports the product story you want Google and buyers to understand first.",
      "Choose the system that matches the team's highest-frequency marketing workflows rather than the broadest feature list.",
    ],
  }),
  comparePage({
    slug: "best-ai-workspace-for-small-teams",
    title: "Best AI Workspace for Small Teams",
    first: "Generic AI workspace",
    second: "AI Marketing workspace",
    primaryKeyword: "best AI workspace for small teams",
    firstWinsWhen: [
      "The team wants a flexible AI collaboration layer for broad company usage beyond marketing.",
      "Specialist marketing workflows are less important than general prompt sharing or chat collaboration.",
      "Different departments need a neutral workspace more than a marketing-specific operating model.",
      "The team is early enough that process standardization around deliverables is still light.",
    ],
    secondWinsWhen: [
      "The main buying job is marketing execution across strategy, copy, images, website content, and scripts.",
      "Small teams need reusable context and workflows organized around campaign outputs.",
      "Decision makers care about reducing tool sprawl inside the marketing stack specifically.",
      "The workspace should help non-experts ship assets, not just talk to models collaboratively.",
    ],
    decisionChecklist: [
      "Clarify whether the workspace is mainly for general AI collaboration or for marketing production.",
      "Compare how each option handles reusable context, approvals, and repeatable asset workflows.",
      "Score the amount of tool overlap that would still remain after adopting each workspace.",
      "Pick the workspace that matches the team's highest-frequency jobs, not the broadest feature grid.",
    ],
  }),
  promptPage({
    slug: "marketing-strategy-prompts",
    title: "Marketing Strategy Prompts",
    primaryKeyword: "marketing strategy prompts",
    agentHref: "/agents/brand-strategy-agent",
    promptTypes: ["Positioning prompts", "Audience prompts", "Differentiation prompts", "Campaign narrative prompts"],
    contextPack: [
      "Target audience, buying stage, and the job the customer is trying to get done.",
      "Current offer, revenue goal, and what decision this strategy should unlock next.",
      "Competitive alternatives, market category language, and proof of why you can win.",
      "Channel constraints such as launch timing, team bandwidth, or budget boundaries.",
    ],
    commonMistakes: [
      "Asking for strategy without sharing the real business constraint or growth goal.",
      "Mixing audience description with wishful thinking instead of observed customer behavior.",
      "Treating the output like final strategy before checking whether the positioning is defensible.",
      "Using one generic strategy prompt for every category without rewriting the context.",
    ],
    customSections: [
      {
        heading: "When strategy prompts are better than jumping into copy",
        body: [
          "Strategy prompts are most useful when the team is still choosing the message, not polishing the wording. They help narrow the audience, offer, and differentiation before downstream assets multiply the confusion.",
          "If the team already knows exactly what it wants to say, copy prompts may be the better starting point. If not, strategy prompts usually save more revision time.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "What is the biggest mistake with marketing strategy prompts?",
        answer: "Using them like copy prompts. Strategy prompts work best when they are tied to a real decision about audience, positioning, or offer direction, not just to generate polished language.",
      },
    ],
  }),
  promptPage({
    slug: "growth-marketing-prompts",
    title: "Growth Marketing Prompts",
    primaryKeyword: "growth marketing prompts",
    agentHref: "/agents/growth-marketing-agent",
    promptTypes: ["Experiment prompts", "Channel planning prompts", "Offer testing prompts", "Measurement prompts"],
    contextPack: [
      "Growth goal, time horizon, and the metric that defines success for this cycle.",
      "Current channels, conversion bottlenecks, and what the team has already tested.",
      "Offer, audience segment, and budget or bandwidth constraints for launch.",
      "Existing performance data or directional signals the prompt should take seriously.",
    ],
    commonMistakes: [
      "Requesting growth ideas without saying what the team can realistically ship this month.",
      "Ignoring channel history so the model repeats experiments that already failed.",
      "Asking for more tactics when the real issue is a weak offer or unclear audience.",
      "Skipping measurement criteria and then calling the experiment plan too generic.",
    ],
  }),
  promptPage({
    slug: "seo-article-prompts",
    title: "SEO Article Prompts",
    primaryKeyword: "SEO article prompts",
    agentHref: "/agents/seo-article-agent",
    promptTypes: ["Search intent prompts", "Outline prompts", "FAQ prompts", "Internal linking prompts"],
    contextPack: [
      "Primary keyword, search intent, and what the reader is hoping to resolve right now.",
      "Audience maturity, product angle, and the point in the journey where the article should help.",
      "Internal links, supporting proof, and product pages the content should connect to.",
      "Topical boundaries such as must-cover subtopics, examples, or expert evidence.",
    ],
    commonMistakes: [
      "Treating keyword inclusion as a substitute for actually matching search intent.",
      "Generating outlines without internal links or product positioning in view.",
      "Publishing FAQ fluff that does not answer real follow-up questions from the searcher.",
      "Letting the draft drift into generic SEO advice with no original proof or examples.",
    ],
  }),
  promptPage({
    slug: "website-copy-prompts",
    title: "Website Copy Prompts",
    primaryKeyword: "website copy prompts",
    agentHref: "/agents/website-copy-agent",
    promptTypes: ["Hero prompts", "Feature prompts", "Objection prompts", "CTA prompts"],
    contextPack: [
      "Page goal, primary CTA, and the audience awareness level for this page.",
      "Offer details, proof points, and the objection the page most needs to resolve.",
      "Brand tone, category alternatives, and what makes the product meaningfully different.",
      "Information hierarchy constraints such as required sections, page length, or funnel stage.",
    ],
    commonMistakes: [
      "Prompting for homepage copy without a clear conversion goal or CTA priority.",
      "Stuffing every feature into the hero instead of clarifying the core promise first.",
      "Leaving out proof so the draft sounds polished but unconvincing.",
      "Using the same page prompt for a homepage, landing page, and product page without adapting structure.",
    ],
  }),
  promptPage({
    slug: "video-script-prompts",
    title: "Video Script Prompts",
    primaryKeyword: "video script prompts",
    agentHref: "/agents/video-script-agent",
    promptTypes: ["Hook prompts", "Scene prompts", "Explainer prompts", "Short-form script prompts"],
    contextPack: [
      "Audience pain point, product offer, and the exact action the viewer should take next.",
      "Runtime target, distribution channel, and whether the script is for ads, explainers, or social clips.",
      "Visual constraints such as available footage, product shots, or on-screen talent.",
      "Brand tone and the single message that should survive even if the viewer drops early.",
    ],
    commonMistakes: [
      "Writing a script prompt with no runtime target, so the output bloats immediately.",
      "Asking for a strong hook without clarifying the audience problem or channel context.",
      "Letting scenes repeat the same idea because the prompt never defines a narrative arc.",
      "Treating CTA lines as an afterthought instead of part of the video's core job.",
    ],
    customSections: [
      {
        heading: "A quick way to adapt one script prompt across channels",
        body: [
          "Keep the core audience problem and offer constant, then change runtime, opening hook style, and CTA based on whether the script is for paid social, organic short-form, or a product explainer.",
          "That approach usually creates more consistent messaging than writing each channel script from scratch.",
        ],
      },
    ],
    customFaqs: [
      {
        question: "What should change first when reusing a video script prompt on another channel?",
        answer: "Change the hook style, runtime, and CTA expectations first. Those three variables usually shift more than the core message or offer.",
      },
    ],
  }),
  promptPage({
    slug: "image-generation-prompts",
    title: "Image Generation Prompts",
    primaryKeyword: "image generation prompts",
    agentHref: "/agents/image-generation-agent",
    promptTypes: ["Campaign visual prompts", "Product image prompts", "Social cover prompts", "Ad creative prompts"],
    contextPack: [
      "Campaign goal, audience mood, and the placement where the image will actually appear.",
      "Brand style references, product details, and visual elements that must stay consistent.",
      "Format, aspect ratio, and whether the output is for ads, social, or website use.",
      "Creative direction such as subject, composition, lighting, and what should be avoided.",
    ],
    commonMistakes: [
      "Using vague aesthetic words with no product or channel context behind them.",
      "Skipping format requirements and then blaming the model for awkward composition.",
      "Prompting for on-brand visuals without describing the brand in any usable detail.",
      "Generating many variants before the team agrees on one clear creative direction.",
    ],
  }),
]

export const seoPages: SeoPage[] = rawSeoPages.map((page) => ({
  ...page,
  relatedLinks: normalizeSeoRelatedLinks(page),
}))

export function seoPathForPage(page: Pick<SeoPage, "group" | "slug">) {
  return `/${page.group}/${page.slug}`
}

export function getSeoPagesByGroup(group: SeoGroup) {
  return seoPages.filter((page) => page.group === group)
}

export function getSeoPage(group: SeoGroup, slug: string) {
  return seoPages.find((page) => page.group === group && page.slug === slug)
}

export function getPublicSeoPaths() {
  return seoPages.map(seoPathForPage)
}
