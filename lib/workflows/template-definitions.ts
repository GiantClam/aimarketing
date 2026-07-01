import { getDefaultWorkflowNodeTitle, type WorkflowDefinitionEdge, type WorkflowDefinitionNode, type WorkflowLocale } from "@/lib/workflows/schema"

type LocalizedText = {
  zh: string
  en: string
}

const CONTENT_REPURPOSE_SEO_AGENT_PROMPT: LocalizedText = {
  zh: [
    "基于上游资产与复用目标，输出给下一个写作节点直接使用的 SEO 复用 brief。",
    "必须按以下小节输出并给出具体内容：1) 核心主题一句话 2) 目标受众 3) 搜索意图 4) 关键词簇（主关键词、长尾关键词、问题簇） 5) 文章结构（标题、3-6 个小节、每节要点） 6) 渠道改写要求（按用户指定渠道逐项写）。",
    "不要先做点评，不要给泛泛建议，不要解释过程。",
  ].join(" "),
  en: [
    "Using the upstream asset and repurpose goal, produce an SEO repurpose brief that the next writing node can use directly.",
    "Output these exact sections with specific content: 1) Core theme in one sentence 2) Target audience 3) Search intent 4) Keyword clusters (primary, long-tail, question clusters) 5) Article structure (headline, 3-6 sections, key points per section) 6) Channel adaptation requirements (one block per requested channel).",
    "Do not start with critique, generic advice, or process commentary.",
  ].join(" "),
}

const CONTENT_REPURPOSE_DISTRIBUTION_AGENT_PROMPT: LocalizedText = {
  zh: [
    "基于上游成稿，输出可执行的分发计划，而不是内容点评。",
    "必须按以下小节输出并给出明确动作：1) 渠道优先级 2) 每个渠道的改写动作 3) 发布时间节奏 4) CTA 与承接动作 5) 实验假设与衡量指标 6) 需要沉淀到资产库的内容。",
    "不要评价文章好坏，不要给空泛建议。",
  ].join(" "),
  en: [
    "Based on the upstream draft, output an executable distribution plan instead of a content critique.",
    "Use these exact sections with concrete actions: 1) Channel priority 2) Rewrite action per channel 3) Publishing cadence 4) CTA and handoff action 5) Experiment hypotheses and metrics 6) Assets that should be stored in the asset library.",
    "Do not evaluate the draft or give generic advice.",
  ].join(" "),
}

const CONTENT_REPURPOSE_LEGACY_PROMPTS = {
  seoAgent: {
    zh: "抽取关键词、问题簇、文章结构改写建议和复用方向。",
    en: "Extract keywords, question clusters, article rewrite structure, and reuse directions.",
  },
  distributionAgent: {
    zh: "把上游内容改写成分发节奏、渠道改编和下一步实验建议。",
    en: "Turn the upstream content into a distribution cadence, channel adaptations, and next experiments.",
  },
} as const

export type WorkflowTemplateDefinitionKey =
  | "campaign-launch"
  | "content-repurpose"
  | "lead-to-outreach"
  | "visual-ad-pipeline"
  | "sales-proposal"
  | "paid-media-creative-pipeline"
  | "seo-aeo-growth-engine"
  | "short-video-growth"
  | "brand-asset-factory"
  | "reputation-guard"
  | "compliance-review"
  | "training-enablement"
  | "knowledge-asset-loop"

export type WorkflowTemplateInputField = {
  key: string
  label: LocalizedText
  kind: "text" | "asset"
  required: boolean
}

export type WorkflowTemplateDefinition = {
  key: WorkflowTemplateDefinitionKey
  title: LocalizedText
  description: LocalizedText
  suitableTeams: LocalizedText[]
  outputs: LocalizedText[]
  qualityGates: LocalizedText[]
  customizationParams: LocalizedText[]
  inputFields: WorkflowTemplateInputField[]
  recommendedAgentIds: string[]
  buildGraph(locale: WorkflowLocale): {
    nodes: WorkflowDefinitionNode[]
    edges: WorkflowDefinitionEdge[]
  }
}

function text(value: string): Record<string, unknown> {
  return { text: value }
}

function prompt(value: string): Record<string, unknown> {
  return { prompt: value }
}

function mergeConfig(
  base: Record<string, unknown>,
  extra?: Record<string, unknown>,
) {
  return {
    ...base,
    ...(extra ?? {}),
  }
}

function agentNode(input: {
  locale: WorkflowLocale
  nodeKey: string
  title: LocalizedText
  positionX: number
  positionY: number
  agentId: string
  prompt: LocalizedText
}) {
  return {
    nodeKey: input.nodeKey,
    type: "agent_execute" as const,
    title: input.locale === "zh" ? input.title.zh : input.title.en,
    positionX: input.positionX,
    positionY: input.positionY,
    config: {
      agentId: input.agentId,
      prompt: input.locale === "zh" ? input.prompt.zh : input.prompt.en,
    },
  } satisfies WorkflowDefinitionNode
}

function fixedNode(input: {
  locale: WorkflowLocale
  nodeKey: string
  type: WorkflowDefinitionNode["type"]
  title?: string
  positionX: number
  positionY: number
  config?: Record<string, unknown>
}) {
  return {
    nodeKey: input.nodeKey,
    type: input.type,
    title: input.title || getDefaultWorkflowNodeTitle(input.type, input.locale),
    positionX: input.positionX,
    positionY: input.positionY,
    config: input.config ?? {},
  } satisfies WorkflowDefinitionNode
}

const TEMPLATE_DEFINITIONS: Record<WorkflowTemplateDefinitionKey, WorkflowTemplateDefinition> = {
  "campaign-launch": {
    key: "campaign-launch",
    title: {
      zh: "Campaign Launch",
      en: "Campaign Launch",
    },
    description: {
      zh: "把营销 brief 转成品牌定位、增长结构、视觉方向和发布材料的一体化启动流程。",
      en: "Turn a marketing brief into positioning, growth structure, visual direction, and launch materials.",
    },
    suitableTeams: [
      { zh: "品牌团队", en: "Brand team" },
      { zh: "增长团队", en: "Growth team" },
      { zh: "市场负责人", en: "Marketing leads" },
    ],
    outputs: [
      { zh: "Campaign brief", en: "Campaign brief" },
      { zh: "Hero visual", en: "Hero visual" },
      { zh: "Launch deck", en: "Launch deck" },
    ],
    qualityGates: [
      { zh: "品牌定位明确", en: "Clear positioning" },
      { zh: "渠道与实验优先级齐全", en: "Channel and experiment priorities" },
      { zh: "素材与提案保持一致", en: "Visual and deck consistency" },
    ],
    customizationParams: [
      { zh: "品牌语气", en: "Brand voice" },
      { zh: "渠道组合", en: "Channel mix" },
      { zh: "目标受众", en: "Target audience" },
    ],
    inputFields: [
      { key: "launch-brief", label: { zh: "营销 brief", en: "Launch brief" }, kind: "text", required: true },
    ],
    recommendedAgentIds: ["executive-brand", "business-content-growth-strategist"],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "launch-brief",
            type: "text_input",
            positionX: 96,
            positionY: 160,
            config: text(locale === "zh" ? "输入新品或活动 brief。" : "Describe the product or campaign launch brief."),
          }),
          agentNode({
            locale,
            nodeKey: "brand-agent",
            title: { zh: "品牌战略顾问", en: "Brand Strategy Advisor" },
            positionX: 416,
            positionY: 120,
            agentId: "executive-brand",
            prompt: {
              zh: "提炼品牌定位、核心叙事、受众优先级和 campaign message house。",
              en: "Extract positioning, narrative, audience priority, and a launch message house.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "growth-agent",
            title: { zh: "内容增长策略智能体", en: "Content Growth Strategist Agent" },
            positionX: 416,
            positionY: 330,
            agentId: "business-content-growth-strategist",
            prompt: {
              zh: "把上游定位转换成渠道组合、内容结构、实验优先级和发布时间表。",
              en: "Turn the upstream strategy into channels, content structure, experiment priorities, and launch cadence.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "hero-visual",
            type: "image_generate",
            title: locale === "zh" ? "主视觉" : "Hero Visual",
            positionX: 736,
            positionY: 120,
            config: mergeConfig(prompt(locale === "zh" ? "根据上游策略生成品牌主视觉。" : "Create a hero visual based on the upstream launch strategy."), {
              selectedProviderId: "pptoken",
              selectedModelId: "gpt-image-2",
              candidateCount: 1,
            }),
          }),
          fixedNode({
            locale,
            nodeKey: "launch-deck",
            type: "ppt_generate",
            title: locale === "zh" ? "发布提案" : "Launch Deck",
            positionX: 736,
            positionY: 340,
            config: {
              pageCount: 8,
              slideCount: 8,
              language: locale === "zh" ? "zh-CN" : "en-US",
              scenario: "marketing-campaign",
              templateMode: "auto-4",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1056,
            positionY: 230,
            config: {
              libraryTarget: "asset_library",
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "launch-brief", targetNodeKey: "brand-agent", inputName: "text" },
          { sourceNodeKey: "brand-agent", targetNodeKey: "growth-agent", inputName: "text" },
          { sourceNodeKey: "growth-agent", targetNodeKey: "hero-visual", inputName: "text" },
          { sourceNodeKey: "growth-agent", targetNodeKey: "launch-deck", inputName: "text" },
          { sourceNodeKey: "hero-visual", targetNodeKey: "launch-deck", inputName: "images" },
          { sourceNodeKey: "growth-agent", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "hero-visual", targetNodeKey: "asset-library", inputName: "images" },
          { sourceNodeKey: "launch-deck", targetNodeKey: "asset-library", inputName: "presentations" },
        ],
      }
    },
  },
  "content-repurpose": {
    key: "content-repurpose",
    title: {
      zh: "Content Repurpose",
      en: "Content Repurpose",
    },
    description: {
      zh: "把现有内容资产转成搜索友好、渠道适配、可复用的多格式输出。",
      en: "Turn existing content assets into search-ready, channel-adapted, reusable outputs.",
    },
    suitableTeams: [
      { zh: "内容团队", en: "Content team" },
      { zh: "SEO 团队", en: "SEO team" },
      { zh: "社媒团队", en: "Social team" },
    ],
    outputs: [
      { zh: "重写长文", en: "Rewritten article" },
      { zh: "分发计划", en: "Distribution plan" },
      { zh: "复用素材包", en: "Repurpose asset pack" },
    ],
    qualityGates: [
      { zh: "关键词与问题簇明确", en: "Clear keyword and question clusters" },
      { zh: "渠道改写结构完整", en: "Complete channel adaptation" },
      { zh: "可复用到后续内容节奏", en: "Reusable for follow-on publishing" },
    ],
    customizationParams: [
      { zh: "渠道优先级", en: "Channel priority" },
      { zh: "语言", en: "Language" },
      { zh: "品牌禁用词", en: "Brand no-go words" },
    ],
    inputFields: [
      { key: "source-assets", label: { zh: "源内容资产", en: "Source assets" }, kind: "asset", required: true },
      { key: "repurpose-goal", label: { zh: "复用目标", en: "Repurpose goal" }, kind: "text", required: true },
    ],
    recommendedAgentIds: ["business-seo-repurpose", "business-content-growth"],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "source-assets",
            type: "upload",
            positionX: 96,
            positionY: 120,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          fixedNode({
            locale,
            nodeKey: "repurpose-goal",
            type: "text_input",
            positionX: 96,
            positionY: 360,
            config: text(locale === "zh" ? "说明你要复用到哪些渠道、什么语气、什么目标。" : "Describe the target channels, tone, and outcome."),
          }),
          agentNode({
            locale,
            nodeKey: "seo-agent",
            title: { zh: "SEO 复用智能体", en: "SEO Repurpose Agent" },
            positionX: 416,
            positionY: 120,
            agentId: "business-seo-repurpose",
            prompt: CONTENT_REPURPOSE_SEO_AGENT_PROMPT,
          }),
          fixedNode({
            locale,
            nodeKey: "writer-output",
            type: "writer",
            positionX: 736,
            positionY: 120,
            config: {
              platform: locale === "zh" ? "wechat" : "generic",
              mode: "article",
              language: "auto",
            },
          }),
          agentNode({
            locale,
            nodeKey: "distribution-agent",
            title: { zh: "内容增长智能体", en: "Content Growth Agent" },
            positionX: 736,
            positionY: 340,
            agentId: "business-content-growth",
            prompt: CONTENT_REPURPOSE_DISTRIBUTION_AGENT_PROMPT,
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1056,
            positionY: 230,
            config: {
              libraryTarget: "asset_library",
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "source-assets", targetNodeKey: "seo-agent", inputName: "assets" },
          { sourceNodeKey: "repurpose-goal", targetNodeKey: "seo-agent", inputName: "text" },
          { sourceNodeKey: "seo-agent", targetNodeKey: "writer-output", inputName: "text" },
          { sourceNodeKey: "writer-output", targetNodeKey: "distribution-agent", inputName: "text" },
          { sourceNodeKey: "writer-output", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "distribution-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
  "lead-to-outreach": {
    key: "lead-to-outreach",
    title: {
      zh: "Lead-to-Outreach",
      en: "Lead-to-Outreach",
    },
    description: {
      zh: "从 ICP、线索分层到外联节奏和销售推进，形成完整获客外联工作流。",
      en: "From ICP and lead tiering to outreach cadence and sales progression in one flow.",
    },
    suitableTeams: [
      { zh: "获客团队", en: "Pipeline team" },
      { zh: "外联团队", en: "Outbound team" },
      { zh: "销售团队", en: "Sales team" },
    ],
    outputs: [
      { zh: "ICP 与线索分层", en: "ICP and lead tiers" },
      { zh: "外联文案", en: "Outreach copy" },
      { zh: "推进建议", en: "Advancement plan" },
    ],
    qualityGates: [
      { zh: "目标客户画像清晰", en: "Clear ICP" },
      { zh: "线索优先级明确", en: "Clear lead prioritization" },
      { zh: "外联节奏与推进条件一致", en: "Cadence aligned with advancement conditions" },
    ],
    customizationParams: [
      { zh: "行业", en: "Industry" },
      { zh: "成交目标", en: "Commercial goal" },
      { zh: "销售阶段", en: "Pipeline stage" },
    ],
    inputFields: [
      { key: "pipeline-brief", label: { zh: "目标客户与产品说明", en: "Offer and ICP brief" }, kind: "text", required: true },
    ],
    recommendedAgentIds: ["business-lead-conversion", "business-outreach-planner", "business-sales-close"],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "pipeline-brief",
            type: "text_input",
            positionX: 96,
            positionY: 220,
            config: text(locale === "zh" ? "输入目标客户画像、产品卖点和当前销售阶段。" : "Describe the ICP, offer, and current pipeline stage."),
          }),
          agentNode({
            locale,
            nodeKey: "lead-agent",
            title: { zh: "获客转化智能体", en: "Lead Conversion Agent" },
            positionX: 416,
            positionY: 110,
            agentId: "business-lead-conversion",
            prompt: {
              zh: "整理 ICP、线索分层、优先行业和切入理由。",
              en: "Structure the ICP, lead tiers, target segments, and best entry angles.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "outreach-agent",
            title: { zh: "外联规划智能体", en: "Outreach Planner Agent" },
            positionX: 416,
            positionY: 330,
            agentId: "business-outreach-planner",
            prompt: {
              zh: "输出首触达文案、跟进节奏和推进门槛。",
              en: "Generate first-touch copy, follow-up cadence, and advancement thresholds.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "sales-agent",
            title: { zh: "销售成交智能体", en: "Sales Close Agent" },
            positionX: 736,
            positionY: 220,
            agentId: "business-sales-close",
            prompt: {
              zh: "把上游外联与线索分层整合成推进建议、异议处理和 demo 目标。",
              en: "Combine the lead tiers and outreach plan into advancement strategy, objection handling, and demo goals.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1056,
            positionY: 230,
            config: {
              libraryTarget: "asset_library",
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "pipeline-brief", targetNodeKey: "lead-agent", inputName: "text" },
          { sourceNodeKey: "pipeline-brief", targetNodeKey: "outreach-agent", inputName: "text" },
          { sourceNodeKey: "lead-agent", targetNodeKey: "sales-agent", inputName: "text" },
          { sourceNodeKey: "outreach-agent", targetNodeKey: "sales-agent", inputName: "text" },
          { sourceNodeKey: "lead-agent", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "outreach-agent", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "sales-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
  "visual-ad-pipeline": {
    key: "visual-ad-pipeline",
    title: {
      zh: "Visual Ad Pipeline",
      en: "Visual Ad Pipeline",
    },
    description: {
      zh: "把广告创意、关键画面、视频脚本与归因治理放进同一条素材生产链。",
      en: "Move ad concepts, hero frames, video scripts, and attribution setup through one creative production chain.",
    },
    suitableTeams: [
      { zh: "付费投放团队", en: "Paid media team" },
      { zh: "创意团队", en: "Creative team" },
      { zh: "视频团队", en: "Video team" },
    ],
    outputs: [
      { zh: "广告 Hook 矩阵", en: "Ad hook matrix" },
      { zh: "关键画面", en: "Key visual frames" },
      { zh: "视频脚本", en: "Video scripts" },
    ],
    qualityGates: [
      { zh: "创意角度与测试假设明确", en: "Creative angles and test hypotheses are clear" },
      { zh: "视频脚本与关键画面一致", en: "Video scripts stay aligned with visual frames" },
      { zh: "归因与命名规则齐全", en: "Tracking and naming rules are complete" },
    ],
    customizationParams: [
      { zh: "品牌语气", en: "Brand voice" },
      { zh: "投放渠道", en: "Paid channels" },
      { zh: "素材格式", en: "Asset formats" },
    ],
    inputFields: [
      { key: "campaign-brief", label: { zh: "Campaign brief", en: "Campaign brief" }, kind: "text", required: true },
      { key: "brand-assets", label: { zh: "品牌素材", en: "Brand assets" }, kind: "asset", required: true },
    ],
    recommendedAgentIds: [
      "business-ad-creative-strategist",
      "business-video-creative",
      "business-tracking-analytics-specialist",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "campaign-brief",
            type: "text_input",
            positionX: 96,
            positionY: 120,
            config: text(locale === "zh" ? "输入活动主题、卖点、受众与测试目标。" : "Describe the offer, audience, and testing goal."),
          }),
          fixedNode({
            locale,
            nodeKey: "brand-assets",
            type: "upload",
            positionX: 96,
            positionY: 340,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          agentNode({
            locale,
            nodeKey: "creative-agent",
            title: { zh: "广告创意策略智能体", en: "Ad Creative Strategist Agent" },
            positionX: 416,
            positionY: 90,
            agentId: "business-ad-creative-strategist",
            prompt: {
              zh: "输出 Hook 矩阵、创意角度、UGC 路线和素材测试假设。",
              en: "Generate hook matrices, creative angles, UGC routes, and test hypotheses.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "hero-frames",
            type: "image_generate",
            title: locale === "zh" ? "关键画面" : "Hero Frames",
            positionX: 736,
            positionY: 90,
            config: mergeConfig(prompt(locale === "zh" ? "根据创意方向生成广告关键画面。" : "Create key ad frames from the creative direction."), {
              selectedProviderId: "pptoken",
              selectedModelId: "gpt-image-2",
              candidateCount: 2,
            }),
          }),
          agentNode({
            locale,
            nodeKey: "video-agent",
            title: { zh: "视频创意智能体", en: "Video Creative Agent" },
            positionX: 736,
            positionY: 300,
            agentId: "business-video-creative",
            prompt: {
              zh: "把创意方向转成短视频脚本、镜头节奏和素材清单。",
              en: "Turn the concept into short-form scripts, shot pacing, and an asset checklist.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "video-output",
            type: "video_generate",
            title: locale === "zh" ? "视频样片" : "Video Draft",
            positionX: 1056,
            positionY: 300,
            config: prompt(locale === "zh" ? "根据脚本与关键画面生成视频样片。" : "Generate a video draft from the script and key frames."),
          }),
          agentNode({
            locale,
            nodeKey: "tracking-agent",
            title: { zh: "追踪与归因分析智能体", en: "Tracking Analytics Specialist Agent" },
            positionX: 1056,
            positionY: 90,
            agentId: "business-tracking-analytics-specialist",
            prompt: {
              zh: "输出 UTM、事件命名、QA 清单和归因风险。",
              en: "Produce UTMs, event naming, QA checks, and attribution risks.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1376,
            positionY: 210,
            config: {
              libraryTarget: "asset_library",
              persistToWorkLibrary: true,
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "campaign-brief", targetNodeKey: "creative-agent", inputName: "text" },
          { sourceNodeKey: "brand-assets", targetNodeKey: "creative-agent", inputName: "assets" },
          { sourceNodeKey: "creative-agent", targetNodeKey: "hero-frames", inputName: "text" },
          { sourceNodeKey: "creative-agent", targetNodeKey: "video-agent", inputName: "text" },
          { sourceNodeKey: "brand-assets", targetNodeKey: "video-agent", inputName: "assets" },
          { sourceNodeKey: "hero-frames", targetNodeKey: "video-agent", inputName: "images" },
          { sourceNodeKey: "campaign-brief", targetNodeKey: "tracking-agent", inputName: "text" },
          { sourceNodeKey: "video-agent", targetNodeKey: "video-output", inputName: "text" },
          { sourceNodeKey: "hero-frames", targetNodeKey: "video-output", inputName: "images" },
          { sourceNodeKey: "hero-frames", targetNodeKey: "asset-library", inputName: "images" },
          { sourceNodeKey: "video-output", targetNodeKey: "asset-library", inputName: "videos" },
          { sourceNodeKey: "tracking-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
  "sales-proposal": {
    key: "sales-proposal",
    title: {
      zh: "Sales Proposal",
      en: "Sales Proposal",
    },
    description: {
      zh: "把买方标准、提案结构、风险回应和高层汇报整合成一条销售提案链路。",
      en: "Bring buyer criteria, proposal structure, risk handling, and executive packaging into one sales proposal chain.",
    },
    suitableTeams: [
      { zh: "销售团队", en: "Sales team" },
      { zh: "售前团队", en: "Pre-sales team" },
      { zh: "法务与合规", en: "Legal and compliance" },
    ],
    outputs: [
      { zh: "提案目录", en: "Proposal outline" },
      { zh: "异议回应", en: "Objection handling" },
      { zh: "提案 deck", en: "Proposal deck" },
    ],
    qualityGates: [
      { zh: "买方标准与赢单主题清晰", en: "Buyer criteria and win themes are clear" },
      { zh: "风险表达已审查", en: "Risk language has been reviewed" },
      { zh: "可复用模块已沉淀", en: "Reusable modules are retained" },
    ],
    customizationParams: [
      { zh: "买方角色", en: "Buyer role" },
      { zh: "审批规则", en: "Review rules" },
      { zh: "证明材料来源", en: "Proof sources" },
    ],
    inputFields: [
      { key: "proposal-brief", label: { zh: "客户需求 brief", en: "Customer brief" }, kind: "text", required: true },
      { key: "supporting-assets", label: { zh: "证明材料", en: "Supporting assets" }, kind: "asset", required: false },
    ],
    recommendedAgentIds: [
      "business-proposal-strategist",
      "business-objection-handler",
      "business-compliance-auditor",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "proposal-brief",
            type: "text_input",
            positionX: 96,
            positionY: 140,
            config: text(locale === "zh" ? "输入客户背景、决策人、目标结果和当前提案要求。" : "Describe the account, buyer, outcome, and proposal requirements."),
          }),
          fixedNode({
            locale,
            nodeKey: "supporting-assets",
            type: "upload",
            positionX: 96,
            positionY: 360,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-context",
            type: "knowledge_retrieve",
            positionX: 416,
            positionY: 110,
            config: prompt(locale === "zh" ? "检索历史提案、案例、FAQ 和风险条款。" : "Retrieve past proposals, proof, FAQs, and risk clauses."),
          }),
          agentNode({
            locale,
            nodeKey: "proposal-agent",
            title: { zh: "销售提案智能体", en: "Proposal Strategist Agent" },
            positionX: 736,
            positionY: 90,
            agentId: "business-proposal-strategist",
            prompt: {
              zh: "输出赢单主题、高层摘要、提案结构和证明材料清单。",
              en: "Generate win themes, an executive summary, proposal structure, and proof requests.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "objection-agent",
            title: { zh: "异议处理智能体", en: "Objection Handler Agent" },
            positionX: 736,
            positionY: 290,
            agentId: "business-objection-handler",
            prompt: {
              zh: "补充价格、风险、异议和替代表达。",
              en: "Add pricing, risk, objection handling, and fallback language.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "proposal-deck",
            type: "ppt_generate",
            title: locale === "zh" ? "提案 Deck" : "Proposal Deck",
            positionX: 1056,
            positionY: 90,
            config: {
              pageCount: 10,
              slideCount: 10,
              language: locale === "zh" ? "zh-CN" : "en-US",
              scenario: "sales-proposal",
              templateMode: "auto-4",
            },
          }),
          agentNode({
            locale,
            nodeKey: "compliance-agent",
            title: { zh: "合规审计智能体", en: "Compliance Auditor Agent" },
            positionX: 1056,
            positionY: 300,
            agentId: "business-compliance-auditor",
            prompt: {
              zh: "审查敏感承诺、证据缺口和需升级审批的表达。",
              en: "Review sensitive claims, proof gaps, and language that needs escalation.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1376,
            positionY: 110,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "case-study",
              documentTitle: locale === "zh" ? "销售提案复用条目" : "Sales proposal reusable note",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1376,
            positionY: 320,
            config: {
              libraryTarget: "asset_library",
              persistToWorkLibrary: true,
              persistToKnowledgeBase: true,
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "proposal-brief", targetNodeKey: "knowledge-context", inputName: "text" },
          { sourceNodeKey: "supporting-assets", targetNodeKey: "knowledge-context", inputName: "assets" },
          { sourceNodeKey: "proposal-brief", targetNodeKey: "proposal-agent", inputName: "text" },
          { sourceNodeKey: "knowledge-context", targetNodeKey: "proposal-agent", inputName: "text" },
          { sourceNodeKey: "supporting-assets", targetNodeKey: "proposal-agent", inputName: "assets" },
          { sourceNodeKey: "proposal-agent", targetNodeKey: "objection-agent", inputName: "text" },
          { sourceNodeKey: "proposal-agent", targetNodeKey: "proposal-deck", inputName: "text" },
          { sourceNodeKey: "objection-agent", targetNodeKey: "proposal-deck", inputName: "text" },
          { sourceNodeKey: "proposal-agent", targetNodeKey: "compliance-agent", inputName: "text" },
          { sourceNodeKey: "objection-agent", targetNodeKey: "compliance-agent", inputName: "text" },
          { sourceNodeKey: "proposal-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "objection-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "proposal-deck", targetNodeKey: "asset-library", inputName: "presentations" },
          { sourceNodeKey: "compliance-agent", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "proposal-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
  "paid-media-creative-pipeline": {
    key: "paid-media-creative-pipeline",
    title: {
      zh: "Paid Media Creative Pipeline",
      en: "Paid Media Creative Pipeline",
    },
    description: {
      zh: "从账户结构、受众、创意假设到追踪 QA，生成可执行的付费投放创意包。",
      en: "Turn account structure, audience plans, creative hypotheses, and tracking QA into an executable paid-media package.",
    },
    suitableTeams: [
      { zh: "投放团队", en: "Paid media team" },
      { zh: "创意团队", en: "Creative team" },
      { zh: "增长团队", en: "Growth team" },
    ],
    outputs: [
      { zh: "投放结构", en: "Account plan" },
      { zh: "广告素材 brief", en: "Creative brief" },
      { zh: "追踪 QA", en: "Tracking QA" },
    ],
    qualityGates: [
      { zh: "受众与预算结构明确", en: "Audience and budget structure are clear" },
      { zh: "每条创意都有测试目标", en: "Every creative route has a testing goal" },
      { zh: "追踪和归因规则完整", en: "Tracking and attribution are complete" },
    ],
    customizationParams: [
      { zh: "投放渠道", en: "Paid channels" },
      { zh: "预算节奏", en: "Budget cadence" },
      { zh: "审核规则", en: "Review rules" },
    ],
    inputFields: [
      { key: "offer-brief", label: { zh: "Offer brief", en: "Offer brief" }, kind: "text", required: true },
      { key: "campaign-assets", label: { zh: "现有素材", en: "Existing assets" }, kind: "asset", required: false },
    ],
    recommendedAgentIds: [
      "business-ppc-strategist",
      "business-paid-social-strategist",
      "business-ad-creative-strategist",
      "business-tracking-analytics-specialist",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "offer-brief",
            type: "text_input",
            positionX: 96,
            positionY: 130,
            config: text(locale === "zh" ? "输入渠道、预算、受众和主要 offer。" : "Describe the channels, budget, audience, and offer."),
          }),
          fixedNode({
            locale,
            nodeKey: "campaign-assets",
            type: "upload",
            positionX: 96,
            positionY: 350,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          agentNode({
            locale,
            nodeKey: "ppc-agent",
            title: { zh: "PPC 搜索广告策略智能体", en: "PPC Strategist Agent" },
            positionX: 416,
            positionY: 80,
            agentId: "business-ppc-strategist",
            prompt: {
              zh: "输出账户结构、关键词主题和预算分配。",
              en: "Generate account structure, keyword themes, and budget splits.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "paid-social-agent",
            title: { zh: "付费社媒投放策略智能体", en: "Paid Social Strategist Agent" },
            positionX: 416,
            positionY: 280,
            agentId: "business-paid-social-strategist",
            prompt: {
              zh: "输出受众假设、漏斗节奏和创意测试矩阵。",
              en: "Produce audience hypotheses, funnel cadence, and test matrices.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "creative-agent",
            title: { zh: "广告创意策略智能体", en: "Ad Creative Strategist Agent" },
            positionX: 736,
            positionY: 180,
            agentId: "business-ad-creative-strategist",
            prompt: {
              zh: "把上游结构转成 Hook、脚本和素材制作 brief。",
              en: "Turn the upstream plan into hooks, scripts, and production briefs.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "tracking-agent",
            title: { zh: "追踪与归因分析智能体", en: "Tracking Analytics Specialist Agent" },
            positionX: 1056,
            positionY: 90,
            agentId: "business-tracking-analytics-specialist",
            prompt: {
              zh: "输出 UTM、事件、归因风险和 QA 清单。",
              en: "Generate UTMs, events, attribution risks, and QA checks.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "audit-agent",
            title: { zh: "付费投放审计智能体", en: "Paid Media Auditor Agent" },
            positionX: 1056,
            positionY: 290,
            agentId: "business-paid-media-auditor",
            prompt: {
              zh: "输出 stop / fix / test / scale 行动清单。",
              en: "Create a stop / fix / test / scale action plan.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1376,
            positionY: 200,
            config: {
              libraryTarget: "asset_library",
              persistToWorkLibrary: true,
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "offer-brief", targetNodeKey: "ppc-agent", inputName: "text" },
          { sourceNodeKey: "offer-brief", targetNodeKey: "paid-social-agent", inputName: "text" },
          { sourceNodeKey: "campaign-assets", targetNodeKey: "paid-social-agent", inputName: "assets" },
          { sourceNodeKey: "ppc-agent", targetNodeKey: "creative-agent", inputName: "text" },
          { sourceNodeKey: "paid-social-agent", targetNodeKey: "creative-agent", inputName: "text" },
          { sourceNodeKey: "campaign-assets", targetNodeKey: "creative-agent", inputName: "assets" },
          { sourceNodeKey: "creative-agent", targetNodeKey: "tracking-agent", inputName: "text" },
          { sourceNodeKey: "ppc-agent", targetNodeKey: "tracking-agent", inputName: "text" },
          { sourceNodeKey: "creative-agent", targetNodeKey: "audit-agent", inputName: "text" },
          { sourceNodeKey: "tracking-agent", targetNodeKey: "audit-agent", inputName: "text" },
          { sourceNodeKey: "creative-agent", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "tracking-agent", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "audit-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
  "seo-aeo-growth-engine": {
    key: "seo-aeo-growth-engine",
    title: {
      zh: "SEO/AEO Growth Engine",
      en: "SEO/AEO Growth Engine",
    },
    description: {
      zh: "把搜索意图、AEO 结构、AI 引用准备和内容改写收敛到一条增长引擎。",
      en: "Unify search intent, AEO structure, AI citation readiness, and content rewrites into one growth engine.",
    },
    suitableTeams: [
      { zh: "SEO 团队", en: "SEO team" },
      { zh: "内容团队", en: "Content team" },
      { zh: "增长团队", en: "Growth team" },
    ],
    outputs: [
      { zh: "关键词与问题簇", en: "Keyword and question clusters" },
      { zh: "AEO 页面结构", en: "AEO page structures" },
      { zh: "引用准备清单", en: "Citation readiness plan" },
    ],
    qualityGates: [
      { zh: "关键词、实体与问题簇明确", en: "Keywords, entities, and question clusters are clear" },
      { zh: "证据和引用要求完整", en: "Proof and citation requirements are complete" },
      { zh: "最终内容可写入知识库复用", en: "Final content is ready for knowledge reuse" },
    ],
    customizationParams: [
      { zh: "语言", en: "Language" },
      { zh: "渠道重点", en: "Channel focus" },
      { zh: "引用标准", en: "Citation standard" },
    ],
    inputFields: [
      { key: "source-content", label: { zh: "源内容", en: "Source content" }, kind: "asset", required: true },
      { key: "search-goal", label: { zh: "搜索目标", en: "Search goal" }, kind: "text", required: true },
    ],
    recommendedAgentIds: [
      "business-seo-repurpose",
      "business-aeo-foundations",
      "business-ai-citation-strategist",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "source-content",
            type: "upload",
            positionX: 96,
            positionY: 120,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          fixedNode({
            locale,
            nodeKey: "search-goal",
            type: "text_input",
            positionX: 96,
            positionY: 350,
            config: text(locale === "zh" ? "说明目标关键词、受众问题和增长目标。" : "Describe the target keywords, audience questions, and growth goals."),
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-context",
            type: "knowledge_retrieve",
            positionX: 416,
            positionY: 90,
            config: prompt(locale === "zh" ? "检索品牌证据、FAQ、案例和历史页面。" : "Retrieve brand proof, FAQs, cases, and historical pages."),
          }),
          agentNode({
            locale,
            nodeKey: "seo-agent",
            title: { zh: "SEO 复用智能体", en: "SEO Repurpose Agent" },
            positionX: 736,
            positionY: 80,
            agentId: "business-seo-repurpose",
            prompt: {
              zh: "输出关键词、内容结构和复用方向。",
              en: "Generate keywords, content structure, and reuse routes.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "aeo-agent",
            title: { zh: "AEO 基础优化智能体", en: "AEO Foundations Agent" },
            positionX: 736,
            positionY: 260,
            agentId: "business-aeo-foundations",
            prompt: {
              zh: "输出问题簇、实体、FAQ 和页面结构修正。",
              en: "Generate question clusters, entities, FAQs, and page-structure fixes.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "citation-agent",
            title: { zh: "AI 引用策略智能体", en: "AI Citation Strategist Agent" },
            positionX: 1056,
            positionY: 170,
            agentId: "business-ai-citation-strategist",
            prompt: {
              zh: "输出证据缺口、公开信号和 AI 可引用性补齐方案。",
              en: "Produce proof gaps, public signals, and AI citation readiness actions.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "writer-output",
            type: "writer",
            positionX: 1376,
            positionY: 90,
            config: {
              platform: locale === "zh" ? "wechat" : "generic",
              mode: "article",
              language: "auto",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1376,
            positionY: 300,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "general",
              documentTitle: locale === "zh" ? "SEO AEO 增长条目" : "SEO AEO growth note",
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "source-content", targetNodeKey: "knowledge-context", inputName: "assets" },
          { sourceNodeKey: "search-goal", targetNodeKey: "knowledge-context", inputName: "text" },
          { sourceNodeKey: "source-content", targetNodeKey: "seo-agent", inputName: "assets" },
          { sourceNodeKey: "search-goal", targetNodeKey: "seo-agent", inputName: "text" },
          { sourceNodeKey: "knowledge-context", targetNodeKey: "seo-agent", inputName: "text" },
          { sourceNodeKey: "seo-agent", targetNodeKey: "aeo-agent", inputName: "text" },
          { sourceNodeKey: "knowledge-context", targetNodeKey: "aeo-agent", inputName: "text" },
          { sourceNodeKey: "seo-agent", targetNodeKey: "citation-agent", inputName: "text" },
          { sourceNodeKey: "aeo-agent", targetNodeKey: "citation-agent", inputName: "text" },
          { sourceNodeKey: "citation-agent", targetNodeKey: "writer-output", inputName: "text" },
          { sourceNodeKey: "aeo-agent", targetNodeKey: "writer-output", inputName: "text" },
          { sourceNodeKey: "writer-output", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "citation-agent", targetNodeKey: "knowledge-write", inputName: "text" },
        ],
      }
    },
  },
  "short-video-growth": {
    key: "short-video-growth",
    title: {
      zh: "Short Video Growth",
      en: "Short Video Growth",
    },
    description: {
      zh: "把短视频定位、脚本、样片和资产沉淀串成一个可迭代增长流程。",
      en: "Connect short-form positioning, scripts, drafts, and asset retention into an iterative growth workflow.",
    },
    suitableTeams: [
      { zh: "短视频团队", en: "Short-form video team" },
      { zh: "内容团队", en: "Content team" },
      { zh: "增长团队", en: "Growth team" },
    ],
    outputs: [
      { zh: "Hook 矩阵", en: "Hook matrix" },
      { zh: "短视频脚本", en: "Short-form scripts" },
      { zh: "视频资产归档", en: "Video asset archive" },
    ],
    qualityGates: [
      { zh: "前三秒 Hook 与定位明确", en: "First-three-second hook and positioning are clear" },
      { zh: "脚本、镜头节奏和样片对齐", en: "Scripts, pacing, and drafts stay aligned" },
      { zh: "资产命名与知识沉淀完整", en: "Asset naming and knowledge retention are complete" },
    ],
    customizationParams: [
      { zh: "平台", en: "Platform" },
      { zh: "账号风格", en: "Channel style" },
      { zh: "复盘节奏", en: "Review cadence" },
    ],
    inputFields: [
      { key: "video-brief", label: { zh: "视频 brief", en: "Video brief" }, kind: "text", required: true },
      { key: "source-assets", label: { zh: "参考素材", en: "Reference assets" }, kind: "asset", required: false },
    ],
    recommendedAgentIds: [
      "business-tiktok-growth-strategist",
      "business-video-creative",
      "business-video-asset-ops",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "video-brief",
            type: "text_input",
            positionX: 96,
            positionY: 120,
            config: text(locale === "zh" ? "输入产品、受众、视频目标和平台。" : "Describe the product, audience, platform, and video goal."),
          }),
          fixedNode({
            locale,
            nodeKey: "source-assets",
            type: "upload",
            positionX: 96,
            positionY: 340,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          agentNode({
            locale,
            nodeKey: "tiktok-agent",
            title: { zh: "TikTok 增长策略智能体", en: "TikTok Growth Strategist Agent" },
            positionX: 416,
            positionY: 90,
            agentId: "business-tiktok-growth-strategist",
            prompt: {
              zh: "输出定位、Hook 矩阵和 7 天测试计划。",
              en: "Generate positioning, hook matrices, and a seven-day test plan.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "video-agent",
            title: { zh: "视频创意智能体", en: "Video Creative Agent" },
            positionX: 736,
            positionY: 90,
            agentId: "business-video-creative",
            prompt: {
              zh: "输出脚本结构、镜头节奏和素材清单。",
              en: "Generate script structure, pacing, and an asset checklist.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "video-draft",
            type: "video_generate",
            title: locale === "zh" ? "短视频样片" : "Video Draft",
            positionX: 1056,
            positionY: 90,
            config: prompt(locale === "zh" ? "根据脚本生成短视频样片。" : "Generate a short-form video draft from the script."),
          }),
          agentNode({
            locale,
            nodeKey: "asset-agent",
            title: { zh: "视频资产智能体", en: "Video Asset Agent" },
            positionX: 1056,
            positionY: 300,
            agentId: "business-video-asset-ops",
            prompt: {
              zh: "输出命名、标签、拆条和沉淀建议。",
              en: "Generate naming, tagging, repurposing, and retention guidance.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1376,
            positionY: 110,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "campaign",
              documentTitle: locale === "zh" ? "短视频增长复盘" : "Short video growth review",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1376,
            positionY: 320,
            config: {
              libraryTarget: "asset_library",
              persistToWorkLibrary: true,
              persistToKnowledgeBase: true,
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "video-brief", targetNodeKey: "tiktok-agent", inputName: "text" },
          { sourceNodeKey: "source-assets", targetNodeKey: "tiktok-agent", inputName: "assets" },
          { sourceNodeKey: "tiktok-agent", targetNodeKey: "video-agent", inputName: "text" },
          { sourceNodeKey: "source-assets", targetNodeKey: "video-agent", inputName: "assets" },
          { sourceNodeKey: "video-agent", targetNodeKey: "video-draft", inputName: "text" },
          { sourceNodeKey: "video-draft", targetNodeKey: "asset-agent", inputName: "videos" },
          { sourceNodeKey: "video-agent", targetNodeKey: "asset-agent", inputName: "text" },
          { sourceNodeKey: "asset-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "video-draft", targetNodeKey: "knowledge-write", inputName: "videos" },
          { sourceNodeKey: "video-draft", targetNodeKey: "asset-library", inputName: "videos" },
          { sourceNodeKey: "asset-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
  "brand-asset-factory": {
    key: "brand-asset-factory",
    title: {
      zh: "Brand Asset Factory",
      en: "Brand Asset Factory",
    },
    description: {
      zh: "把品牌叙事、视觉方向、页面结构和资产归档放进同一条品牌资产工厂。",
      en: "Bring brand narrative, visual direction, page structure, and asset filing into one brand-asset factory.",
    },
    suitableTeams: [
      { zh: "品牌团队", en: "Brand team" },
      { zh: "设计团队", en: "Design team" },
      { zh: "市场团队", en: "Marketing team" },
    ],
    outputs: [
      { zh: "品牌叙事", en: "Brand narrative" },
      { zh: "视觉方向", en: "Visual direction" },
      { zh: "资产规范", en: "Asset standards" },
    ],
    qualityGates: [
      { zh: "品牌主张与视觉语言一致", en: "Brand claims and visual language align" },
      { zh: "页面结构与组件规范清晰", en: "Page structure and component rules are clear" },
      { zh: "资产归档和命名完整", en: "Asset filing and naming are complete" },
    ],
    customizationParams: [
      { zh: "品牌语气", en: "Brand voice" },
      { zh: "目标页面", en: "Target pages" },
      { zh: "资产库规则", en: "Asset-library rules" },
    ],
    inputFields: [
      { key: "brand-brief", label: { zh: "品牌 brief", en: "Brand brief" }, kind: "text", required: true },
    ],
    recommendedAgentIds: [
      "business-brand-creative",
      "business-ui-design-system",
      "business-ux-architect",
      "business-asset-curator",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "brand-brief",
            type: "text_input",
            positionX: 96,
            positionY: 220,
            config: text(locale === "zh" ? "输入品牌主张、受众、页面目标和资产要求。" : "Describe the brand claim, audience, page goals, and asset requirements."),
          }),
          agentNode({
            locale,
            nodeKey: "brand-agent",
            title: { zh: "品牌创意智能体", en: "Brand Creative Agent" },
            positionX: 416,
            positionY: 90,
            agentId: "business-brand-creative",
            prompt: {
              zh: "输出品牌叙事、视觉方向和提案结构。",
              en: "Generate brand narrative, visual direction, and proposal structure.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "ux-agent",
            title: { zh: "UX 架构智能体", en: "UX Architect Agent" },
            positionX: 416,
            positionY: 300,
            agentId: "business-ux-architect",
            prompt: {
              zh: "输出页面结构、任务路径和交互状态。",
              en: "Produce page structure, task flows, and interaction states.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "ui-agent",
            title: { zh: "UI 设计系统智能体", en: "UI Design System Agent" },
            positionX: 736,
            positionY: 90,
            agentId: "business-ui-design-system",
            prompt: {
              zh: "输出组件规范、层级和可访问性建议。",
              en: "Generate component rules, hierarchy, and accessibility guidance.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "brand-visual",
            type: "image_generate",
            title: locale === "zh" ? "品牌视觉方向" : "Brand Visuals",
            positionX: 736,
            positionY: 300,
            config: mergeConfig(prompt(locale === "zh" ? "根据品牌叙事生成品牌视觉方向。" : "Create brand visuals from the narrative and UX structure."), {
              selectedProviderId: "pptoken",
              selectedModelId: "gpt-image-2",
              candidateCount: 2,
            }),
          }),
          agentNode({
            locale,
            nodeKey: "asset-agent",
            title: { zh: "资产整理智能体", en: "Asset Curator Agent" },
            positionX: 1056,
            positionY: 110,
            agentId: "business-asset-curator",
            prompt: {
              zh: "输出命名、标签、归档和知识升格建议。",
              en: "Generate naming, tagging, filing, and knowledge-promotion suggestions.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "brand-deck",
            type: "ppt_generate",
            title: locale === "zh" ? "品牌资产提案" : "Brand Asset Deck",
            positionX: 1056,
            positionY: 320,
            config: {
              pageCount: 8,
              slideCount: 8,
              language: locale === "zh" ? "zh-CN" : "en-US",
              scenario: "marketing-campaign",
              templateMode: "auto-4",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1376,
            positionY: 110,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "brand",
              documentTitle: locale === "zh" ? "品牌资产规范" : "Brand asset standard",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1376,
            positionY: 320,
            config: {
              libraryTarget: "asset_library",
              persistToWorkLibrary: true,
              persistToKnowledgeBase: true,
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "brand-brief", targetNodeKey: "brand-agent", inputName: "text" },
          { sourceNodeKey: "brand-brief", targetNodeKey: "ux-agent", inputName: "text" },
          { sourceNodeKey: "brand-agent", targetNodeKey: "ui-agent", inputName: "text" },
          { sourceNodeKey: "ux-agent", targetNodeKey: "ui-agent", inputName: "text" },
          { sourceNodeKey: "brand-agent", targetNodeKey: "brand-visual", inputName: "text" },
          { sourceNodeKey: "ux-agent", targetNodeKey: "brand-visual", inputName: "text" },
          { sourceNodeKey: "ui-agent", targetNodeKey: "asset-agent", inputName: "text" },
          { sourceNodeKey: "brand-visual", targetNodeKey: "asset-agent", inputName: "images" },
          { sourceNodeKey: "brand-agent", targetNodeKey: "brand-deck", inputName: "text" },
          { sourceNodeKey: "brand-visual", targetNodeKey: "brand-deck", inputName: "images" },
          { sourceNodeKey: "asset-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "brand-deck", targetNodeKey: "asset-library", inputName: "presentations" },
          { sourceNodeKey: "brand-visual", targetNodeKey: "asset-library", inputName: "images" },
          { sourceNodeKey: "asset-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
  "reputation-guard": {
    key: "reputation-guard",
    title: {
      zh: "Reputation Guard",
      en: "Reputation Guard",
    },
    description: {
      zh: "为舆情响应、口径整理和升级建议保留一条显式工作流骨架。",
      en: "Reserve an explicit workflow skeleton for reputation response, message control, and escalation guidance.",
    },
    suitableTeams: [
      { zh: "PR 团队", en: "PR team" },
      { zh: "品牌团队", en: "Brand team" },
      { zh: "法务团队", en: "Legal team" },
    ],
    outputs: [
      { zh: "事件口径", en: "Response language" },
      { zh: "升级建议", en: "Escalation plan" },
      { zh: "复盘条目", en: "Retrospective note" },
    ],
    qualityGates: [
      { zh: "受众和消息层级明确", en: "Audience and message hierarchy are clear" },
      { zh: "风险边界已审查", en: "Risk boundaries are reviewed" },
      { zh: "复盘材料可沉淀", en: "Retrospective material is ready to retain" },
    ],
    customizationParams: [
      { zh: "事件等级", en: "Incident tier" },
      { zh: "升级阈值", en: "Escalation threshold" },
      { zh: "对外渠道", en: "External channels" },
    ],
    inputFields: [
      { key: "incident-brief", label: { zh: "事件 brief", en: "Incident brief" }, kind: "text", required: true },
      { key: "evidence-pack", label: { zh: "证据材料", en: "Evidence pack" }, kind: "asset", required: false },
    ],
    recommendedAgentIds: [
      "business-pr-communications",
      "business-privacy-officer",
      "business-compliance-auditor",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "incident-brief",
            type: "text_input",
            positionX: 96,
            positionY: 120,
            config: text(locale === "zh" ? "输入事件、受众、影响范围和当前风险。" : "Describe the incident, audience, exposure, and current risk."),
          }),
          fixedNode({
            locale,
            nodeKey: "evidence-pack",
            type: "upload",
            positionX: 96,
            positionY: 340,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-context",
            type: "knowledge_retrieve",
            positionX: 416,
            positionY: 110,
            config: prompt(locale === "zh" ? "检索历史口径、升级规则和外部说明。" : "Retrieve prior playbooks, escalation rules, and public statements."),
          }),
          agentNode({
            locale,
            nodeKey: "pr-agent",
            title: { zh: "PR 传播智能体", en: "PR Communications Agent" },
            positionX: 736,
            positionY: 90,
            agentId: "business-pr-communications",
            prompt: {
              zh: "输出对外口径、消息层级和发布动作。",
              en: "Generate response language, message hierarchy, and release actions.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "privacy-agent",
            title: { zh: "隐私官智能体", en: "Privacy Officer Agent" },
            positionX: 736,
            positionY: 290,
            agentId: "business-privacy-officer",
            prompt: {
              zh: "审查隐私、数据处理和升级边界。",
              en: "Review privacy, data-handling, and escalation boundaries.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "statement",
            type: "writer",
            positionX: 1056,
            positionY: 90,
            config: {
              platform: "generic",
              mode: "article",
              language: "auto",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1056,
            positionY: 300,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "compliance",
              documentTitle: locale === "zh" ? "舆情响应复盘" : "Reputation response retrospective",
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "incident-brief", targetNodeKey: "knowledge-context", inputName: "text" },
          { sourceNodeKey: "evidence-pack", targetNodeKey: "knowledge-context", inputName: "assets" },
          { sourceNodeKey: "incident-brief", targetNodeKey: "pr-agent", inputName: "text" },
          { sourceNodeKey: "knowledge-context", targetNodeKey: "pr-agent", inputName: "text" },
          { sourceNodeKey: "incident-brief", targetNodeKey: "privacy-agent", inputName: "text" },
          { sourceNodeKey: "knowledge-context", targetNodeKey: "privacy-agent", inputName: "text" },
          { sourceNodeKey: "pr-agent", targetNodeKey: "statement", inputName: "text" },
          { sourceNodeKey: "privacy-agent", targetNodeKey: "statement", inputName: "text" },
          { sourceNodeKey: "statement", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "privacy-agent", targetNodeKey: "knowledge-write", inputName: "text" },
        ],
      }
    },
  },
  "compliance-review": {
    key: "compliance-review",
    title: {
      zh: "Compliance Review",
      en: "Compliance Review",
    },
    description: {
      zh: "把控制目标、隐私审查、行业规则和替代表达整理成可追踪的合规审查工作流。",
      en: "Turn control objectives, privacy review, sector rules, and safe alternatives into a traceable compliance workflow.",
    },
    suitableTeams: [
      { zh: "法务团队", en: "Legal team" },
      { zh: "隐私团队", en: "Privacy team" },
      { zh: "市场团队", en: "Marketing team" },
    ],
    outputs: [
      { zh: "证据缺口", en: "Evidence gaps" },
      { zh: "风险表达", en: "Risky claims" },
      { zh: "替代表达", en: "Safer alternatives" },
    ],
    qualityGates: [
      { zh: "控制目标与证据缺口明确", en: "Control objectives and evidence gaps are clear" },
      { zh: "隐私与行业专项已审查", en: "Privacy and sector-specific checks are complete" },
      { zh: "替代表达可复用", en: "Safer alternatives are reusable" },
    ],
    customizationParams: [
      { zh: "行业", en: "Industry" },
      { zh: "审查级别", en: "Review tier" },
      { zh: "升级规则", en: "Escalation rules" },
    ],
    inputFields: [
      { key: "review-material", label: { zh: "审查材料", en: "Review materials" }, kind: "asset", required: true },
      { key: "review-goal", label: { zh: "审查目标", en: "Review goal" }, kind: "text", required: true },
    ],
    recommendedAgentIds: [
      "business-compliance-auditor",
      "business-privacy-officer",
      "business-healthcare-marketing-compliance",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "review-material",
            type: "upload",
            positionX: 96,
            positionY: 120,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          fixedNode({
            locale,
            nodeKey: "review-goal",
            type: "text_input",
            positionX: 96,
            positionY: 340,
            config: text(locale === "zh" ? "输入行业、控制目标和重点风险。" : "Describe the industry, control objectives, and main risks."),
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-context",
            type: "knowledge_retrieve",
            positionX: 416,
            positionY: 110,
            config: prompt(locale === "zh" ? "检索历史审查记录、标准口径和规则说明。" : "Retrieve prior review notes, approved language, and rule references."),
          }),
          agentNode({
            locale,
            nodeKey: "compliance-agent",
            title: { zh: "合规审计智能体", en: "Compliance Auditor Agent" },
            positionX: 736,
            positionY: 80,
            agentId: "business-compliance-auditor",
            prompt: {
              zh: "输出控制目标、证据缺口和整改动作。",
              en: "Generate control objectives, evidence gaps, and remediation actions.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "privacy-agent",
            title: { zh: "隐私官智能体", en: "Privacy Officer Agent" },
            positionX: 736,
            positionY: 250,
            agentId: "business-privacy-officer",
            prompt: {
              zh: "输出数据分类、合法依据和用户权利风险。",
              en: "Generate data classes, lawful basis, and user-right risk notes.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "industry-agent",
            title: { zh: "医疗营销合规智能体", en: "Healthcare Marketing Compliance Agent" },
            positionX: 736,
            positionY: 420,
            agentId: "business-healthcare-marketing-compliance",
            prompt: {
              zh: "输出行业专项高风险表达和替代表达。",
              en: "Generate sector-specific risky claims and safer alternatives.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1056,
            positionY: 210,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "compliance",
              documentTitle: locale === "zh" ? "合规审查结论" : "Compliance review conclusion",
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "review-material", targetNodeKey: "knowledge-context", inputName: "assets" },
          { sourceNodeKey: "review-goal", targetNodeKey: "knowledge-context", inputName: "text" },
          { sourceNodeKey: "review-goal", targetNodeKey: "compliance-agent", inputName: "text" },
          { sourceNodeKey: "knowledge-context", targetNodeKey: "compliance-agent", inputName: "text" },
          { sourceNodeKey: "review-material", targetNodeKey: "privacy-agent", inputName: "assets" },
          { sourceNodeKey: "knowledge-context", targetNodeKey: "privacy-agent", inputName: "text" },
          { sourceNodeKey: "review-material", targetNodeKey: "industry-agent", inputName: "assets" },
          { sourceNodeKey: "review-goal", targetNodeKey: "industry-agent", inputName: "text" },
          { sourceNodeKey: "compliance-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "privacy-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "industry-agent", targetNodeKey: "knowledge-write", inputName: "text" },
        ],
      }
    },
  },
  "training-enablement": {
    key: "training-enablement",
    title: {
      zh: "Training Enablement",
      en: "Training Enablement",
    },
    description: {
      zh: "把 SOP、课程结构、练习任务和培训复盘整理成一条培训赋能流程。",
      en: "Turn SOPs, curriculum design, practice tasks, and training retrospectives into one enablement workflow.",
    },
    suitableTeams: [
      { zh: "培训团队", en: "Enablement team" },
      { zh: "销售团队", en: "Sales team" },
      { zh: "运营团队", en: "Operations team" },
    ],
    outputs: [
      { zh: "课程结构", en: "Curriculum structure" },
      { zh: "练习任务", en: "Practice tasks" },
      { zh: "培训资料", en: "Training materials" },
    ],
    qualityGates: [
      { zh: "学习目标与评估方式明确", en: "Learning objectives and evaluation are clear" },
      { zh: "练习任务可执行", en: "Practice tasks are actionable" },
      { zh: "培训结果可复用", en: "Training outcomes are reusable" },
    ],
    customizationParams: [
      { zh: "受训角色", en: "Learner role" },
      { zh: "培训时长", en: "Training duration" },
      { zh: "评估方式", en: "Assessment mode" },
    ],
    inputFields: [
      { key: "sop-assets", label: { zh: "SOP / 资料", en: "SOP / materials" }, kind: "asset", required: true },
      { key: "training-goal", label: { zh: "培训目标", en: "Training goal" }, kind: "text", required: true },
    ],
    recommendedAgentIds: ["business-training-designer"],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "sop-assets",
            type: "upload",
            positionX: 96,
            positionY: 120,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          fixedNode({
            locale,
            nodeKey: "training-goal",
            type: "text_input",
            positionX: 96,
            positionY: 340,
            config: text(locale === "zh" ? "输入培训对象、时长、目标和考核要求。" : "Describe the learner, duration, goal, and evaluation needs."),
          }),
          agentNode({
            locale,
            nodeKey: "training-agent",
            title: { zh: "培训设计智能体", en: "Training Designer Agent" },
            positionX: 416,
            positionY: 180,
            agentId: "business-training-designer",
            prompt: {
              zh: "输出学习目标、课程结构、练习任务和评估方式。",
              en: "Generate learning objectives, curriculum structure, practice tasks, and evaluation methods.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "training-material",
            type: "writer",
            positionX: 736,
            positionY: 110,
            config: {
              platform: "generic",
              mode: "article",
              language: "auto",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "training-deck",
            type: "ppt_generate",
            positionX: 736,
            positionY: 320,
            config: {
              pageCount: 8,
              slideCount: 8,
              language: locale === "zh" ? "zh-CN" : "en-US",
              scenario: "product-launch",
              templateMode: "auto-4",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1056,
            positionY: 180,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "general",
              documentTitle: locale === "zh" ? "培训赋能条目" : "Training enablement note",
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "sop-assets", targetNodeKey: "training-agent", inputName: "assets" },
          { sourceNodeKey: "training-goal", targetNodeKey: "training-agent", inputName: "text" },
          { sourceNodeKey: "training-agent", targetNodeKey: "training-material", inputName: "text" },
          { sourceNodeKey: "training-agent", targetNodeKey: "training-deck", inputName: "text" },
          { sourceNodeKey: "training-material", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "training-deck", targetNodeKey: "knowledge-write", inputName: "presentations" },
        ],
      }
    },
  },
  "knowledge-asset-loop": {
    key: "knowledge-asset-loop",
    title: {
      zh: "Knowledge Asset Loop",
      en: "Knowledge Asset Loop",
    },
    description: {
      zh: "把最近的输出重新判断、分类、归档并写回知识库，形成素材与知识闭环。",
      en: "Re-evaluate recent outputs, classify them, archive them, and write them back into knowledge to close the loop.",
    },
    suitableTeams: [
      { zh: "知识资产团队", en: "Knowledge and asset team" },
      { zh: "内容团队", en: "Content team" },
      { zh: "运营团队", en: "Operations team" },
    ],
    outputs: [
      { zh: "保留 / 升格建议", en: "Retain / promote guidance" },
      { zh: "命名与标签规范", en: "Naming and tagging rules" },
      { zh: "知识沉淀条目", en: "Knowledge notes" },
    ],
    qualityGates: [
      { zh: "保留、升格、废弃标准清晰", en: "Retain, promote, and discard criteria are clear" },
      { zh: "命名标签规则完整", en: "Naming and tagging are complete" },
      { zh: "知识写回显式可追踪", en: "Knowledge write-back is explicit and traceable" },
    ],
    customizationParams: [
      { zh: "资产类型", en: "Asset types" },
      { zh: "归档规则", en: "Filing rules" },
      { zh: "共享范围", en: "Sharing scope" },
    ],
    inputFields: [
      { key: "recent-outputs", label: { zh: "最近输出", en: "Recent outputs" }, kind: "asset", required: true },
      { key: "loop-goal", label: { zh: "整理目标", en: "Loop goal" }, kind: "text", required: true },
    ],
    recommendedAgentIds: [
      "business-knowledge-assets",
      "business-asset-curator",
      "business-video-asset-ops",
    ],
    buildGraph(locale) {
      return {
        nodes: [
          fixedNode({
            locale,
            nodeKey: "recent-outputs",
            type: "upload",
            positionX: 96,
            positionY: 120,
            config: {
              uploadedFiles: [],
              referencedArtifactIds: [],
            },
          }),
          fixedNode({
            locale,
            nodeKey: "loop-goal",
            type: "text_input",
            positionX: 96,
            positionY: 340,
            config: text(locale === "zh" ? "说明要筛选、命名、归档和沉淀的目标。" : "Describe the retain / name / archive / knowledge goal."),
          }),
          agentNode({
            locale,
            nodeKey: "knowledge-agent",
            title: { zh: "知识与资产智能体", en: "Knowledge and Assets Agent" },
            positionX: 416,
            positionY: 90,
            agentId: "business-knowledge-assets",
            prompt: {
              zh: "判断哪些输出该保留、升格、归档或废弃。",
              en: "Decide what to retain, promote, archive, or discard.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "curator-agent",
            title: { zh: "资产整理智能体", en: "Asset Curator Agent" },
            positionX: 736,
            positionY: 90,
            agentId: "business-asset-curator",
            prompt: {
              zh: "输出命名、标签和库内分类规范。",
              en: "Generate naming, tagging, and library classification rules.",
            },
          }),
          agentNode({
            locale,
            nodeKey: "video-asset-agent",
            title: { zh: "视频资产智能体", en: "Video Asset Agent" },
            positionX: 736,
            positionY: 300,
            agentId: "business-video-asset-ops",
            prompt: {
              zh: "识别可拆条的视频脚本、镜头模式和沉淀建议。",
              en: "Identify reusable video scripts, shot patterns, and retention notes.",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "knowledge-write",
            type: "knowledge_write",
            positionX: 1056,
            positionY: 120,
            config: {
              datasetScope: "enterprise",
              datasetId: 0,
              knowledgeCategory: "general",
              documentTitle: locale === "zh" ? "知识资产闭环条目" : "Knowledge asset loop note",
            },
          }),
          fixedNode({
            locale,
            nodeKey: "asset-library",
            type: "product_store",
            positionX: 1056,
            positionY: 330,
            config: {
              libraryTarget: "asset_library",
              persistToWorkLibrary: true,
              persistToKnowledgeBase: true,
            },
          }),
        ],
        edges: [
          { sourceNodeKey: "recent-outputs", targetNodeKey: "knowledge-agent", inputName: "assets" },
          { sourceNodeKey: "loop-goal", targetNodeKey: "knowledge-agent", inputName: "text" },
          { sourceNodeKey: "knowledge-agent", targetNodeKey: "curator-agent", inputName: "text" },
          { sourceNodeKey: "recent-outputs", targetNodeKey: "video-asset-agent", inputName: "assets" },
          { sourceNodeKey: "knowledge-agent", targetNodeKey: "video-asset-agent", inputName: "text" },
          { sourceNodeKey: "curator-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "video-asset-agent", targetNodeKey: "knowledge-write", inputName: "text" },
          { sourceNodeKey: "curator-agent", targetNodeKey: "asset-library", inputName: "text" },
          { sourceNodeKey: "video-asset-agent", targetNodeKey: "asset-library", inputName: "text" },
        ],
      }
    },
  },
}

export function listWorkflowTemplateDefinitions() {
  return Object.values(TEMPLATE_DEFINITIONS)
}

export function getWorkflowTemplateDefinition(
  key: string | null | undefined,
) {
  if (!key) return null
  return TEMPLATE_DEFINITIONS[key as WorkflowTemplateDefinitionKey] ?? null
}

export function resolveWorkflowTemplateDefinitionKey(input: {
  slug?: string | null
  bindingTarget?: string | null
}) {
  const candidates = [input.slug, input.bindingTarget]
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter(Boolean)

  for (const candidate of candidates) {
    if (candidate in TEMPLATE_DEFINITIONS) {
      return candidate as WorkflowTemplateDefinitionKey
    }
  }

  return null
}

export function getWorkflowTemplatePresentation(input: {
  locale: WorkflowLocale
  slug?: string | null
  bindingTarget?: string | null
}) {
  const key = resolveWorkflowTemplateDefinitionKey(input)
  if (!key) return null
  const definition = getWorkflowTemplateDefinition(key)
  if (!definition) return null

  const localize = (value: LocalizedText) => (input.locale === "zh" ? value.zh : value.en)
  const graph = definition.buildGraph(input.locale)

  return {
    key,
    suitableTeams: definition.suitableTeams.map(localize),
    outputs: definition.outputs.map(localize),
    qualityGates: definition.qualityGates.map(localize),
    customizationParams: definition.customizationParams.map(localize),
    inputFields: definition.inputFields.map((field) => ({
      ...field,
      label: localize(field.label),
    })),
    steps: graph.nodes.map((node) => node.title),
    recommendedAgentIds: [...definition.recommendedAgentIds],
  }
}

export function buildWorkflowFromTemplate(input: {
  key: WorkflowTemplateDefinitionKey
  locale: WorkflowLocale
  titleOverride?: string | null
  descriptionOverride?: string | null
}) {
  const definition = TEMPLATE_DEFINITIONS[input.key]
  const graph = definition.buildGraph(input.locale)
  const localize = (value: LocalizedText) => (input.locale === "zh" ? value.zh : value.en)

  return {
    title: input.titleOverride?.trim() || localize(definition.title),
    description: input.descriptionOverride?.trim() || localize(definition.description),
    nodes: graph.nodes,
    edges: graph.edges,
    metadata: {
      source: "workflow_template",
      templateKey: definition.key,
      presetSchema: {
        supportsMultiplePresets: true,
        fields: [
          "industry",
          "audience",
          "brandVoice",
          "channelTargets",
          "reviewRules",
          "bannedTerms",
          "allowedKnowledgeDatasetIds",
          "notes",
        ],
      },
      enterprisePresets: [],
      defaultPresetId: null,
      suitableTeams: definition.suitableTeams.map(localize),
      outputs: definition.outputs.map(localize),
      qualityGates: definition.qualityGates.map(localize),
      customizationParams: definition.customizationParams.map(localize),
      inputFields: definition.inputFields.map((field) => ({
        key: field.key,
        label: localize(field.label),
        kind: field.kind,
        required: field.required,
      })),
      recommendedAgentIds: [...definition.recommendedAgentIds],
    } satisfies Record<string, unknown>,
  }
}

export function reconcileWorkflowTemplateNodeConfig(input: {
  templateKey: string | null | undefined
  nodeKey: string
  config: Record<string, unknown>
}) {
  const nextConfig = { ...input.config }
  const currentPrompt = typeof nextConfig.prompt === "string" ? nextConfig.prompt.trim() : ""

  if (input.templateKey === "content-repurpose") {
    if (
      input.nodeKey === "seo-agent" &&
      (currentPrompt === CONTENT_REPURPOSE_LEGACY_PROMPTS.seoAgent.zh ||
        currentPrompt === CONTENT_REPURPOSE_LEGACY_PROMPTS.seoAgent.en)
    ) {
      nextConfig.prompt =
        currentPrompt === CONTENT_REPURPOSE_LEGACY_PROMPTS.seoAgent.en
          ? CONTENT_REPURPOSE_SEO_AGENT_PROMPT.en
          : CONTENT_REPURPOSE_SEO_AGENT_PROMPT.zh
    }

    if (
      input.nodeKey === "distribution-agent" &&
      (currentPrompt === CONTENT_REPURPOSE_LEGACY_PROMPTS.distributionAgent.zh ||
        currentPrompt === CONTENT_REPURPOSE_LEGACY_PROMPTS.distributionAgent.en)
    ) {
      nextConfig.prompt =
        currentPrompt === CONTENT_REPURPOSE_LEGACY_PROMPTS.distributionAgent.en
          ? CONTENT_REPURPOSE_DISTRIBUTION_AGENT_PROMPT.en
          : CONTENT_REPURPOSE_DISTRIBUTION_AGENT_PROMPT.zh
    }
  }

  return nextConfig
}
