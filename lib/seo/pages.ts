export type SeoGroup = "alternatives" | "solutions" | "agents" | "compare" | "use-cases" | "prompts"

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
  sections: SeoSection[]
  faqs: SeoFaq[]
  cta: SeoCta
  comparison?: {
    firstLabel: string
    secondLabel: string
    rows: SeoComparisonRow[]
  }
}

const sharedComparisonRows: SeoComparisonRow[] = [
  {
    dimension: "Model access",
    first: "Strong native model experience from one vendor",
    second: "Multiple AI models available from one shared marketing workspace",
  },
  {
    dimension: "Best fit",
    first: "General assistant work and vendor-native features",
    second: "Marketing workflows, shared context, and small-team execution",
  },
  {
    dimension: "Team controls",
    first: "Enterprise-grade controls for larger organizations",
    second: "Lightweight permissions, shared credits, and workspace ownership",
  },
  {
    dimension: "Context",
    first: "General project or chat context",
    second: "Company, brand, campaign, and marketing decision context",
  },
]

function alternativePage(input: {
  slug: string
  product: string
  audience: string
  competitorStrength: string
  aiMarketingFit: string
  primaryKeyword: string
}) : SeoPage {
  return {
    slug: input.slug,
    group: "alternatives",
    title: `${input.product} Alternative for Small Marketing Teams`,
    description: `Compare ${input.product} with AI Marketing for small teams that need multiple models, marketing agents, shared context, and a lower-cost AI workspace.`,
    h1: `${input.product} Alternative for Small Marketing Teams`,
    intro: `${input.product} can be a strong AI tool, but many small teams also need multi-model access, marketing-specific workflows, image generation, website copy, video scripts, and shared company context without buying a separate seat in every tool.`,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: [
      `${input.product} alternative`,
      "AI workspace for small teams",
      "multi-model AI marketing workspace",
      "save money on AI subscriptions",
    ],
    audience: input.audience,
    comparison: {
      firstLabel: input.product,
      secondLabel: "AI Marketing",
      rows: sharedComparisonRows,
    },
    sections: [
      {
        heading: `Why teams look for a ${input.product} alternative`,
        body: [
          "Small marketing teams rarely use only one AI tool. They often combine a chat assistant, writing product, image generator, search assistant, website copy workflow, and internal knowledge docs.",
          "That stack creates subscription sprawl, scattered prompts, duplicated context, and no clear way for the team to reuse decisions across campaigns.",
        ],
        bullets: [
          "Separate per-seat subscriptions are hard to justify for part-time users.",
          "Marketing work needs brand and campaign context, not only a blank chat box.",
          "Teams need repeatable outputs such as articles, landing page copy, scripts, images, and campaign plans.",
        ],
      },
      {
        heading: `When ${input.product} is better`,
        body: [
          input.competitorStrength,
          "If your team mainly wants the official product experience, vendor-native features, or a mature enterprise admin surface from that provider, staying with the original tool can be the better choice.",
        ],
      },
      {
        heading: "When AI Marketing is better",
        body: [
          input.aiMarketingFit,
          "AI Marketing is designed for teams that want one place for multiple models, specialist marketing agents, shared company context, team permissions, and reusable campaign history.",
        ],
      },
      {
        heading: "Marketing workflows you can run",
        body: ["Instead of treating every task as a new prompt, your team can keep the work inside a shared marketing workspace."],
        bullets: [
          "Build a positioning brief and turn it into landing page copy.",
          "Draft SEO articles, social posts, and email campaigns from the same brand context.",
          "Generate image directions, campaign visuals, and video scripts without switching tools.",
          "Keep conversation history and decisions available for the next campaign.",
        ],
      },
      {
        heading: "Cost and usage guardrails",
        body: [
          "AI Marketing should be evaluated as a workspace with shared credits and optional BYOK, not as an unlimited model-usage promise.",
          "Heavy users can upgrade or connect their own API keys, while lighter teams can consolidate routine marketing production in one workspace.",
        ],
      },
    ],
    faqs: [
      {
        question: `Is AI Marketing a full replacement for ${input.product}?`,
        answer: `Not always. ${input.product} may still be better for teams that need its official vendor-native experience. AI Marketing is better when the job is multi-model marketing production with shared team context.`,
      },
      {
        question: "Does AI Marketing promise unlimited GPT, Claude, or Gemini usage?",
        answer: "No. The workspace uses credits and fair-use limits. High-frequency teams can upgrade or connect their own API keys.",
      },
      {
        question: "Who is this alternative page for?",
        answer: input.audience,
      },
    ],
    cta: {
      primaryLabel: "Start your team workspace",
      primaryHref: "/register",
      secondaryLabel: "Calculate AI tool savings",
      secondaryHref: "/resources/ai-subscription-cost-calculator",
    },
  }
}

function solutionPage(input: {
  slug: string
  title: string
  audience: string
  workflows: string[]
  primaryKeyword: string
}) : SeoPage {
  return {
    slug: input.slug,
    group: "solutions",
    title: `${input.title} | AI Marketing`,
    description: `A multi-model AI marketing workspace for ${input.audience.toLowerCase()} with specialist agents, shared context, team permissions, and reusable workflows.`,
    h1: input.title,
    intro: `${input.audience} need practical marketing output, not another generic AI chat window. AI Marketing gives the team a shared workspace for models, agents, company context, and repeatable content workflows.`,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["AI marketing workspace", "AI tools for small teams", "marketing agents", "shared AI workspace"],
    audience: input.audience,
    sections: [
      {
        heading: "The small-team problem",
        body: [
          "Marketing work usually moves across strategy docs, chat tools, writing tools, image tools, spreadsheets, and approvals.",
          "For a small team, that creates avoidable cost and context loss. The real need is a shared place where the team can keep decisions and produce assets together.",
        ],
      },
      {
        heading: "Workflows this page supports",
        body: ["Use AI Marketing to turn company context into concrete assets for the channels your team already runs."],
        bullets: input.workflows,
      },
      {
        heading: "Why a multi-model workspace helps",
        body: [
          "Different models are better at different tasks. A shared workspace lets the team choose the right model or agent without moving the brief, brand rules, and campaign history across separate tools.",
        ],
      },
      {
        heading: "How the team stays aligned",
        body: [
          "Company context, permissions, shared credits, and conversation history make the work repeatable. New campaigns can reuse prior decisions instead of starting from a blank prompt.",
        ],
      },
    ],
    faqs: [
      {
        question: `Who should use this ${input.title.toLowerCase()} solution?`,
        answer: input.audience,
      },
      {
        question: "Can this replace every AI tool?",
        answer: "It can consolidate common marketing workflows, but teams with heavy usage or specialized vendor features may still keep selected tools or connect their own API keys.",
      },
      {
        question: "What makes this different from normal ChatGPT?",
        answer: "The workspace is organized around marketing agents, shared company context, team permissions, and reusable production workflows.",
      },
    ],
    cta: {
      primaryLabel: "Create a shared workspace",
      primaryHref: "/register",
      secondaryLabel: "Compare with ChatGPT Team",
      secondaryHref: "/alternatives/chatgpt-team-alternative",
    },
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
}) : SeoPage {
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
    sections: [
      {
        heading: "What problem this agent solves",
        body: [input.problem],
      },
      {
        heading: "Inputs it needs",
        body: ["Better inputs produce better campaign assets. This agent works best when the team supplies clear context."],
        bullets: input.inputs,
      },
      {
        heading: "Outputs it creates",
        body: ["The agent is designed to produce reviewable work that can move into execution."],
        bullets: input.outputs,
      },
      {
        heading: "Example workflow",
        body: [
          "Start with the company context, add the campaign goal, ask the agent for a structured draft, then iterate in the same workspace so the decision history stays attached.",
        ],
      },
      {
        heading: "Example prompt",
        body: [input.prompt],
      },
      {
        heading: "How it differs from normal ChatGPT",
        body: [
          "Normal chat starts from a blank box. AI Marketing agents are organized around marketing jobs, shared company context, team permissions, and repeatable outputs.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can this agent use my company context?",
        answer: "Yes. The workspace is designed around shared company, brand, campaign, and conversation context.",
      },
      {
        question: "Is this agent a first-wave SEO landing page?",
        answer: "Agent pages mainly support solution pages, prompt pages, and alternatives pages. They explain capability and help conversion.",
      },
    ],
    cta: {
      primaryLabel: "Create a team workspace",
      primaryHref: "/register",
      secondaryLabel: "View small-team solution",
      secondaryHref: "/solutions/ai-for-small-marketing-teams",
    },
  }
}

function makeUseCasePage(input: {
  slug: string
  title: string
  intro: string
  steps: string[]
  primaryKeyword: string
}) : SeoPage {
  return {
    slug: input.slug,
    group: "use-cases",
    title: `${input.title} | AI Marketing`,
    description: `${input.intro} Learn how small teams can consolidate AI tools with a shared multi-model marketing workspace.`,
    h1: input.title,
    intro: input.intro,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["save money on AI tools", "one AI subscription", "multi-model AI workspace"],
    audience: "Small teams comparing the cost of separate AI subscriptions against a shared workspace.",
    sections: [
      {
        heading: "Why this matters",
        body: [
          "AI subscriptions add up quickly when every person buys a separate chat assistant, writing tool, image tool, and search assistant.",
          "A shared workspace can reduce duplicated subscriptions while keeping the team focused on marketing work.",
        ],
      },
      {
        heading: "How to evaluate the stack",
        body: ["Use a simple audit before adding another tool."],
        bullets: input.steps,
      },
      {
        heading: "Where AI Marketing fits",
        body: [
          "AI Marketing combines multiple models, marketing agents, shared context, permissions, and credits so small teams can consolidate routine work.",
        ],
      },
      {
        heading: "What not to assume",
        body: [
          "Do not treat any shared workspace as unlimited usage of every premium model. The right model is shared credits, fair-use limits, upgrades, and BYOK for high-frequency users.",
        ],
      },
    ],
    faqs: [
      {
        question: "How much can a small team save?",
        answer: "Savings depend on team size and current tools. The calculator estimates a range so teams can compare scenarios without relying on a single fixed number.",
      },
      {
        question: "Can we keep our own API keys?",
        answer: "Teams with heavy or specialized usage can use BYOK-style workflows where supported instead of relying only on included credits.",
      },
    ],
    cta: {
      primaryLabel: "Calculate AI tool savings",
      primaryHref: "/resources/ai-subscription-cost-calculator",
      secondaryLabel: "Start your team workspace",
      secondaryHref: "/register",
    },
  }
}

function comparePage(input: {
  slug: string
  title: string
  first: string
  second: string
  primaryKeyword: string
}) : SeoPage {
  return {
    slug: input.slug,
    group: "compare",
    title: `${input.title} | AI Marketing`,
    description: `Compare ${input.first} and ${input.second} for marketing work, then see when a shared multi-model workspace is a better fit for small teams.`,
    h1: input.title,
    intro: `Choosing the best AI model is easier when you separate model strengths from workflow needs. Small teams often need several models plus shared marketing context.`,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["best AI model for marketing", "AI tools comparison", "multi-model AI workspace"],
    audience: "Small teams deciding which AI model or AI workspace should support marketing execution.",
    comparison: {
      firstLabel: input.first,
      secondLabel: input.second,
      rows: [
        {
          dimension: "Writing and ideation",
          first: `${input.first} may be stronger for specific writing styles or native workflows.`,
          second: `${input.second} may be stronger for different reasoning, research, or drafting patterns.`,
        },
        {
          dimension: "Marketing execution",
          first: "A model alone still needs briefs, context, review, and output structure.",
          second: "A shared workspace can route the right model through marketing agents and reusable context.",
        },
        {
          dimension: "Team operations",
          first: "Separate accounts can scatter decisions.",
          second: "Shared workspace history keeps decisions available for the next campaign.",
        },
      ],
    },
    sections: [
      {
        heading: "The practical answer",
        body: [
          "There is no single best model for every marketing task. Strategy, research, long-form writing, visual ideation, and campaign critique can benefit from different model behavior.",
        ],
      },
      {
        heading: "How small teams should decide",
        body: [
          "Pick the workflow first, then the model. If the team needs repeatable assets, shared brand context, and permissioned collaboration, the workspace matters as much as model choice.",
        ],
      },
      {
        heading: "AI Marketing positioning",
        body: [
          "You do not need to decide which model is best for every task. AI Marketing gives your team multiple models and specialist marketing agents in one shared workspace.",
        ],
      },
    ],
    faqs: [
      {
        question: "Should we buy separate subscriptions for every model?",
        answer: "Only if your team truly needs each vendor-native experience. Many small teams can consolidate routine marketing work in a shared workspace.",
      },
      {
        question: "Does the workspace replace model judgment?",
        answer: "No. It helps route work, preserve context, and keep team output organized while still letting users choose suitable models.",
      },
    ],
    cta: {
      primaryLabel: "Start your team workspace",
      primaryHref: "/register",
      secondaryLabel: "Estimate subscription savings",
      secondaryHref: "/resources/ai-subscription-cost-calculator",
    },
  }
}

function promptPage(input: {
  slug: string
  title: string
  promptTypes: string[]
  agentHref: string
  primaryKeyword: string
}) : SeoPage {
  return {
    slug: input.slug,
    group: "prompts",
    title: `${input.title} | AI Marketing`,
    description: `${input.title} for small teams. Use these prompt structures manually or run them with company context inside AI Marketing.`,
    h1: input.title,
    intro: "Prompt libraries help teams get started, but prompts become more useful when they run with shared company context and reusable workflows.",
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: ["marketing prompts", "AI prompts for teams", "AI marketing agent prompts"],
    audience: "Marketers who want reusable prompt patterns for campaign and content production.",
    sections: [
      {
        heading: "Prompt patterns included",
        body: ["Use these patterns as a starting point, then adapt them to the product, audience, channel, and campaign goal."],
        bullets: input.promptTypes,
      },
      {
        heading: "How to use them with company context",
        body: [
          "Store brand rules, audience notes, product facts, offers, objections, and prior campaign decisions in the workspace before running the prompt.",
        ],
      },
      {
        heading: "Why run prompts inside AI Marketing",
        body: [
          "Want these prompts to run with your company context automatically? Use AI Marketing agents so the team does not rewrite the same background every time.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I use these prompts outside AI Marketing?",
        answer: "Yes. They are useful manually, but the highest leverage comes from running them with saved company context and agent workflows.",
      },
      {
        question: "Which agent matches this prompt page?",
        answer: "Use the related AI Marketing agent linked from this page for a more structured workflow.",
      },
    ],
    cta: {
      primaryLabel: "Run with company context",
      primaryHref: "/register",
      secondaryLabel: "View related agent",
      secondaryHref: input.agentHref,
    },
  }
}

export const seoPages: SeoPage[] = [
  alternativePage({
    slug: "chatgpt-team-alternative",
    product: "ChatGPT Team",
    audience: "Small marketing teams that like ChatGPT but also need Claude, Gemini, image generation, marketing agents, and shared company context.",
    competitorStrength: "ChatGPT Team is often better when your team wants the official OpenAI workspace, direct access to OpenAI-native features, and a general-purpose assistant for many departments.",
    aiMarketingFit: "AI Marketing is better when the buying reason is marketing execution: strategy, copy, SEO content, images, website copy, video scripts, shared context, and lower tool sprawl.",
    primaryKeyword: "ChatGPT Team alternative",
  }),
  alternativePage({
    slug: "claude-team-alternative",
    product: "Claude Team",
    audience: "Teams that value Claude for writing and reasoning but need a broader marketing production workspace.",
    competitorStrength: "Claude Team is often better when your team wants Anthropic's official product experience and uses Claude heavily for long-form reasoning or document-heavy workflows.",
    aiMarketingFit: "AI Marketing is better when the team wants Claude-style work alongside other models, content agents, image generation, shared credits, and marketing-specific workflows.",
    primaryKeyword: "Claude Team alternative",
  }),
  alternativePage({
    slug: "jasper-alternative",
    product: "Jasper",
    audience: "Small teams and founders comparing dedicated AI writing tools with a broader marketing workspace.",
    competitorStrength: "Jasper can be better for teams that want a mature AI writing product with dedicated brand and campaign features.",
    aiMarketingFit: "AI Marketing is better when writing is only one part of the job and the team also needs strategy, images, website copy, video scripts, and multi-model access.",
    primaryKeyword: "Jasper alternative",
  }),
  alternativePage({
    slug: "copy-ai-alternative",
    product: "Copy.ai",
    audience: "Agencies, consultants, and small marketing teams that need copy plus shared execution workflows.",
    competitorStrength: "Copy.ai can be better for teams focused mainly on copy generation and established go-to-market templates.",
    aiMarketingFit: "AI Marketing is better when copy needs to connect with brand strategy, research, images, landing pages, and team context in one place.",
    primaryKeyword: "Copy.ai alternative",
  }),
  alternativePage({
    slug: "typingmind-alternative",
    product: "TypingMind",
    audience: "Teams that like multi-model chat but need marketing workflows and team production assets.",
    competitorStrength: "TypingMind can be better for power users who want a flexible multi-model chat interface.",
    aiMarketingFit: "AI Marketing is better when multi-model access must connect to marketing agents, shared company context, and output workflows.",
    primaryKeyword: "TypingMind alternative",
  }),
  alternativePage({
    slug: "team-gpt-alternative",
    product: "Team-GPT",
    audience: "Teams comparing collaborative AI workspaces for marketing execution.",
    competitorStrength: "Team-GPT can be better for general team collaboration around AI chat and prompts.",
    aiMarketingFit: "AI Marketing is better when the workflow is specifically marketing production with agents for growth, copy, websites, images, and video.",
    primaryKeyword: "Team-GPT alternative",
  }),
  alternativePage({
    slug: "poe-alternative",
    product: "Poe",
    audience: "Small teams that want broad model access but need more structured marketing output.",
    competitorStrength: "Poe can be better for users who want quick access to many bots and broad exploration.",
    aiMarketingFit: "AI Marketing is better when the team needs reusable workflows, permissions, shared credits, and company context for marketing campaigns.",
    primaryKeyword: "Poe alternative",
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
  }),
  agentPage({
    slug: "brand-strategy-agent",
    title: "AI Brand Strategy Agent for Small Teams",
    problem: "It helps teams clarify positioning, audience, differentiation, messaging, and campaign angles before jumping into production.",
    primaryKeyword: "AI brand strategy agent",
    inputs: ["Company description", "Target audience", "Competitors", "Product proof points", "Current messaging"],
    outputs: ["Positioning brief", "Messaging hierarchy", "Differentiation angles", "Campaign narrative"],
    prompt: "Analyze our company context and create a positioning brief for a small-team AI marketing workspace targeting agencies and startups.",
  }),
  agentPage({
    slug: "growth-marketing-agent",
    title: "AI Growth Marketing Agent for Small Teams",
    problem: "It turns goals, channels, constraints, and campaign history into practical growth experiments and execution plans.",
    primaryKeyword: "AI growth marketing agent",
    inputs: ["Growth goal", "Current channels", "Offer", "Audience", "Budget or time constraint"],
    outputs: ["Experiment backlog", "Channel plan", "Campaign copy angles", "Measurement checklist"],
    prompt: "Create a four-week growth plan for a small SaaS team with limited budget and existing website traffic.",
  }),
  agentPage({
    slug: "copywriting-agent",
    title: "AI Copywriting Agent for Small Teams",
    problem: "It helps teams produce copy that uses shared brand context instead of one-off generic prompts.",
    primaryKeyword: "AI copywriting agent",
    inputs: ["Product facts", "Audience pain points", "Tone", "Channel", "Offer"],
    outputs: ["Landing page copy", "Email copy", "Ad angles", "Social copy"],
    prompt: "Write three landing page hero options for our product using the saved brand voice and target audience context.",
  }),
  agentPage({
    slug: "seo-article-agent",
    title: "AI SEO Article Writer for Teams",
    problem: "It structures articles around search intent, audience fit, internal links, and brand context.",
    primaryKeyword: "AI article writer for teams",
    inputs: ["Primary keyword", "Search intent", "Audience", "Internal links", "Product positioning"],
    outputs: ["Article outline", "Draft sections", "FAQ ideas", "Internal link suggestions"],
    prompt: "Create an SEO article outline for 'save money on AI subscriptions' and connect it to our calculator page.",
  }),
  agentPage({
    slug: "market-research-agent",
    title: "AI Market Research Agent",
    problem: "It organizes market notes, competitor context, audience insights, and campaign implications into usable research summaries.",
    primaryKeyword: "AI market research agent",
    inputs: ["Market question", "Target segment", "Known competitors", "Data sources", "Decision to support"],
    outputs: ["Research brief", "Competitor notes", "Opportunity map", "Messaging implications"],
    prompt: "Research the market for multi-model AI workspaces for small marketing teams and summarize positioning gaps.",
  }),
  agentPage({
    slug: "website-copy-agent",
    title: "AI Website Copy Generator",
    problem: "It turns positioning and offer context into clear website sections that explain the product and drive action.",
    primaryKeyword: "AI website copy generator",
    inputs: ["Page goal", "Audience", "Offer", "Proof points", "Primary CTA"],
    outputs: ["Hero copy", "Section flow", "Feature copy", "FAQ content"],
    prompt: "Create homepage copy for an AI marketing workspace that helps small teams reduce AI subscription costs.",
  }),
  agentPage({
    slug: "video-script-agent",
    title: "AI Video Script Generator",
    problem: "It converts campaign ideas into scripts, hooks, scenes, and visual direction for marketing videos.",
    primaryKeyword: "AI video script generator",
    inputs: ["Video goal", "Audience", "Offer", "Runtime", "Channel"],
    outputs: ["Hook options", "Script draft", "Scene outline", "Visual direction"],
    prompt: "Write a 45-second product video script for a small-team AI marketing workspace with a clear savings angle.",
  }),
  agentPage({
    slug: "image-generation-agent",
    title: "AI Image Generator for Teams",
    problem: "It helps teams create campaign visuals and image prompts that stay aligned with brand and product context.",
    primaryKeyword: "AI image generator for teams",
    inputs: ["Campaign goal", "Brand style", "Product subject", "Format", "Usage channel"],
    outputs: ["Image prompts", "Visual directions", "Variant ideas", "Review notes"],
    prompt: "Create image prompts for a launch campaign that shows one shared AI workspace replacing scattered tool subscriptions.",
  }),
  agentPage({
    slug: "business-consulting-agent",
    title: "AI Business Consultant Agent",
    problem: "It helps founders and operators reason through business, marketing, and execution decisions with saved company context.",
    primaryKeyword: "AI business consultant",
    inputs: ["Business context", "Decision question", "Constraints", "Current data", "Desired outcome"],
    outputs: ["Decision brief", "Options", "Risks", "Recommended next steps"],
    prompt: "Evaluate whether our startup should position around cost savings, marketing workflow, or multi-model access first.",
  }),
  comparePage({
    slug: "chatgpt-vs-claude-for-marketing",
    title: "ChatGPT vs Claude for Marketing",
    first: "ChatGPT",
    second: "Claude",
    primaryKeyword: "ChatGPT vs Claude for marketing",
  }),
  comparePage({
    slug: "chatgpt-vs-gemini-vs-claude-for-business",
    title: "ChatGPT vs Gemini vs Claude for Business",
    first: "ChatGPT and Gemini",
    second: "Claude",
    primaryKeyword: "ChatGPT vs Gemini vs Claude for business",
  }),
  comparePage({
    slug: "best-ai-model-for-writing",
    title: "Best AI Model for Writing",
    first: "Single-model writing workflow",
    second: "Multi-model writing workflow",
    primaryKeyword: "best AI model for writing",
  }),
  comparePage({
    slug: "best-ai-model-for-market-research",
    title: "Best AI Model for Market Research",
    first: "Research-focused model usage",
    second: "Workspace-based research workflow",
    primaryKeyword: "best AI model for market research",
  }),
  comparePage({
    slug: "best-ai-model-for-image-generation",
    title: "Best AI Model for Image Generation",
    first: "Standalone image generation",
    second: "Campaign-context image workflow",
    primaryKeyword: "best AI model for image generation",
  }),
  comparePage({
    slug: "best-ai-tools-for-small-business",
    title: "Best AI Tools for Small Business",
    first: "Separate AI tools",
    second: "Shared AI Marketing workspace",
    primaryKeyword: "best AI tools for small business",
  }),
  comparePage({
    slug: "best-ai-workspace-for-small-teams",
    title: "Best AI Workspace for Small Teams",
    first: "Generic AI workspace",
    second: "AI Marketing workspace",
    primaryKeyword: "best AI workspace for small teams",
  }),
  promptPage({
    slug: "marketing-strategy-prompts",
    title: "Marketing Strategy Prompts",
    primaryKeyword: "marketing strategy prompts",
    agentHref: "/agents/brand-strategy-agent",
    promptTypes: ["Positioning prompts", "Audience prompts", "Differentiation prompts", "Campaign narrative prompts"],
  }),
  promptPage({
    slug: "growth-marketing-prompts",
    title: "Growth Marketing Prompts",
    primaryKeyword: "growth marketing prompts",
    agentHref: "/agents/growth-marketing-agent",
    promptTypes: ["Experiment prompts", "Channel planning prompts", "Offer testing prompts", "Measurement prompts"],
  }),
  promptPage({
    slug: "seo-article-prompts",
    title: "SEO Article Prompts",
    primaryKeyword: "SEO article prompts",
    agentHref: "/agents/seo-article-agent",
    promptTypes: ["Search intent prompts", "Outline prompts", "FAQ prompts", "Internal linking prompts"],
  }),
  promptPage({
    slug: "website-copy-prompts",
    title: "Website Copy Prompts",
    primaryKeyword: "website copy prompts",
    agentHref: "/agents/website-copy-agent",
    promptTypes: ["Hero prompts", "Feature prompts", "Objection prompts", "CTA prompts"],
  }),
  promptPage({
    slug: "video-script-prompts",
    title: "Video Script Prompts",
    primaryKeyword: "video script prompts",
    agentHref: "/agents/video-script-agent",
    promptTypes: ["Hook prompts", "Scene prompts", "Explainer prompts", "Short-form script prompts"],
  }),
  promptPage({
    slug: "image-generation-prompts",
    title: "Image Generation Prompts",
    primaryKeyword: "image generation prompts",
    agentHref: "/agents/image-generation-agent",
    promptTypes: ["Campaign visual prompts", "Product image prompts", "Social cover prompts", "Ad creative prompts"],
  }),
]

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
