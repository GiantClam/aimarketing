import assert from "node:assert/strict"
import test from "node:test"

import { frontendSlidesPreviewRuntime } from "./frontend-slides-preview-runtime"
import { getCustomFrontendSlidesRendererKeys } from "./frontend-slides-preview-runtime"
import { pptPreviewStyles } from "@/lib/lead-tools/ppt-preview-data-fixed"

const baseSlides = [
  {
    id: "cover-1",
    layout: "cover" as const,
    intent: "cover" as const,
    kicker: "头版头条",
    title: "Step 3.7 Flash 的叙事架构",
    body: "围绕速度、清晰度和转化动作建立九页高密度预览。",
    bullets: ["首屏判断", "结构推进", "可执行动作", "后续导出"],
    accent: "#ff6f3c",
  },
  {
    id: "agenda-1",
    layout: "agenda" as const,
    intent: "contents" as const,
    kicker: "版面结构",
    title: "Agenda",
    body: "依次处理机会、受众、策略、证据、数据、图示、执行和收束。",
    bullets: ["机会窗口", "受众判断", "策略主轴", "竞争对照", "证据锚点", "关键数据", "扩散图谱", "执行路径", "转化动作"],
    contentsItems: [
      { index: "01", title: "机会窗口", detail: "先定义为什么现在值得讲。" },
      { index: "02", title: "受众判断", detail: "再确认谁会被这页说服。" },
      { index: "03", title: "策略主轴", detail: "把核心判断拉到前台。" },
    ],
    accent: "#ff6f3c",
  },
  {
    id: "insight-1",
    layout: "insight" as const,
    intent: "statement" as const,
    kicker: "核心主张",
    title: "速度不是唯一优势",
    body: "真正的价值在于把主题快速折叠成可比较的叙事结构。",
    bullets: ["先出方向", "再选风格", "最后导出", "全程可判断"],
    accent: "#ff6f3c",
  },
  {
    id: "comparison-1",
    layout: "comparison" as const,
    intent: "comparison" as const,
    kicker: "双栏对照",
    title: "HTML 预览 vs 可编辑 PPTX",
    body: "双引擎分别服务快预览与可编辑导出，不再互相拖累。",
    bullets: ["快预览", "低等待", "可编辑导出", "高保真后处理"],
    comparisonItems: [
      { label: "A", title: "快预览", detail: "先判断方向" },
      { label: "B", title: "可编辑导出", detail: "后完成交付" },
    ],
    accent: "#ff6f3c",
  },
  {
    id: "evidence-1",
    layout: "evidence" as const,
    intent: "spotlight" as const,
    kicker: "证据锚点",
    title: "为什么预览值得优先交付",
    body: "用户真正需要的是先判断表达方式，再决定是否进入完整导出链路。",
    bullets: ["判断门槛更低", "风格差异更直观", "减少无效导出", "提高高意图登录"],
    spotlightItems: [
      { title: "判断门槛", detail: "先看风格是否值得继续。" },
      { title: "无效导出", detail: "先筛掉不需要的方向。" },
      { title: "高意图登录", detail: "把登录留给更强动作。" },
    ],
    accent: "#ff6f3c",
  },
  {
    id: "stats-1",
    layout: "stats" as const,
    intent: "stats" as const,
    kicker: "关键数字",
    title: "9 页结构带来的信息密度",
    body: "内容不再挤在 9 页里，证据、数据和流程可以各自承担独立页面。",
    bullets: ["更少缩略", "更少空白", "图示可独立", "closing 更完整"],
    metricItems: [
      { value: "09", label: "总页数", note: "承载更充分" },
      { value: "04", label: "风格数", note: "并发对比" },
      { value: "02", label: "双引擎", note: "预览与导出分离" },
    ],
    accent: "#ff6f3c",
  },
  {
    id: "chart-1",
    layout: "chart" as const,
    intent: "chart" as const,
    kicker: "扩散图谱",
    title: "预览到导出的双引擎流向",
    body: "内容规划、HTML 预览、打开下载和内部导出被拆成更清晰的路径。",
    bullets: ["故事规划", "HTML runtime", "预览判断", "内部导出"],
    chartItems: [
      { label: "Plan", value: 72, detail: "故事规划" },
      { label: "HTML", value: 58, detail: "预览生成" },
      { label: "Open", value: 44, detail: "打开判断" },
      { label: "Export", value: 88, detail: "内部导出" },
    ],
    accent: "#ff6f3c",
  },
  {
    id: "process-1",
    layout: "process" as const,
    intent: "process" as const,
    kicker: "执行路径",
    title: "上线节奏",
    body: "先扩页，再稳定 renderer，随后校验产物和页面交互。",
    bullets: ["扩生成 contract", "补 4 套 renderer", "更新工作台", "回归验证"],
    processItems: [
      { step: "01", title: "扩 contract", detail: "先让结构化字段可传递" },
      { step: "02", title: "补 renderer", detail: "再让模板原生页法可消费" },
      { step: "03", title: "回归验证", detail: "最后确认预览和下载链路" },
    ],
    accent: "#ff6f3c",
  },
  {
    id: "timeline-1",
    layout: "timeline" as const,
    intent: "closing" as const,
    kicker: "观察节点",
    title: "落地顺序",
    body: "先抽象，再接 HTML runtime，再补校验，再开放下载。",
    bullets: ["抽象层", "HTML runtime", "版式校验", "下载链路"],
    closingItems: [
      { label: "CHOOSE", detail: "锁定最强的叙事方向。" },
      { label: "OPEN", detail: "打开 HTML 成品页做最终判断。" },
      { label: "EXPORT", detail: "仅在需要时进入导出链路。" },
    ],
    accent: "#ff6f3c",
  },
]

const sampleDeck = {
  title: "Step 3.7 Flash",
  scenario: "marketing-campaign" as const,
  language: "zh-CN" as const,
  generatedAt: "2026-06-02T00:00:00.000Z",
  outline: ["机会窗口", "受众判断", "策略主轴", "竞争对照", "证据锚点", "关键数据", "扩散图谱", "执行路径", "转化动作"],
  provider: "pptoken",
  previewModel: "gpt-5.4",
  variants: [
    {
      key: "ppt169_brutalist_ai_newspaper_2026" as const,
      styleKey: "ppt169_brutalist_ai_newspaper_2026" as const,
      name: "Long Table",
      summary: "长桌纪要和节目单气质最强。",
      stylePrompt: "Warm long-table editorial deck.",
      outline: ["Table Stakes", "Seat Map", "Course Logic", "Decision Pour", "Proof Note", "Signal Count", "Impact Map", "Service Route", "Closing Service"],
      palette: {
        background: "#FAF1E2",
        foreground: "#B53D2A",
        accent: "#B53D2A",
        panel: "#FFF7EC",
        border: "#D9BCA6",
      },
      strengths: ["结构感"],
      slides: baseSlides,
    },
    {
      key: "ppt169_sugar_rush_memphis" as const,
      styleKey: "ppt169_sugar_rush_memphis" as const,
      name: "Playful",
      summary: "暖桃纸面和独立品牌感最强。",
      stylePrompt: "Peach indie launch deck.",
      outline: ["Warm Hello", "Spark Drop", "Friendly Proof", "Side-by-Side", "Signal Stickers", "Number Pop", "Spread Map", "Play Route", "Next Bounce"],
      palette: {
        background: "#F0C8A0",
        foreground: "#1A1A1A",
        accent: "#1A1A1A",
        panel: "#F7DEC6",
        border: "#D29A6F",
      },
      strengths: ["亲和", "温暖"],
      slides: baseSlides,
    },
    {
      key: "ppt169_pritzker_2026" as const,
      styleKey: "ppt169_pritzker_2026" as const,
      name: "Broadside",
      summary: "大字报式深色编辑感最强。",
      stylePrompt: "Dark broadside declaration deck.",
      outline: ["Lead Line", "Signal Column", "Proof Block", "Countertext", "Poster Proof", "Figure Board", "Spillover Diagram", "Posting Steps", "Posting Order"],
      palette: {
        background: "#111111",
        foreground: "#F0ECE5",
        accent: "#E85D26",
        panel: "#1A1A18",
        border: "#282826",
      },
      strengths: ["宣言感", "戏剧张力"],
      slides: baseSlides,
    },
    {
      key: "ppt169_swiss_grid_systems" as const,
      styleKey: "ppt169_swiss_grid_systems" as const,
      name: "Neo-Grid Bold",
      summary: "霓黄网格与粗体模块最强。",
      stylePrompt: "Dense neon grid strategy deck.",
      outline: ["Input Grid", "Panel Logic", "Decision Stack", "System Board", "Proof Grid", "Signal Count", "Spread Map", "Action Flow", "Next Sequence"],
      palette: {
        background: "#ECECE8",
        foreground: "#0A0A0A",
        accent: "#E6FF3D",
        panel: "#F5F4EF",
        border: "#CFCFC8",
      },
      strengths: ["可见网格", "粗体模块"],
      slides: baseSlides,
    },
  ],
}

const importedTemplateDeck = {
  ...sampleDeck,
  variants: [
    {
      key: "ppt169_kubernetes_blueprint_2026" as const,
      styleKey: "ppt169_kubernetes_blueprint_2026" as const,
      name: "Kubernetes Blueprint",
      summary: "云原生蓝图与技术治理结构最强。",
      stylePrompt: "Cloud-native platform blueprint deck.",
      outline: ["Control Plane", "Module Map", "Platform Thesis", "Lane Compare", "Governance Signals", "Reliability Metrics", "Dependency Chart", "Rollout Sequence", "Operating Guardrails"],
      palette: {
        background: "#EEF1EF",
        foreground: "#11161B",
        accent: "#88C0FF",
        panel: "#F8FBF9",
        border: "#C8D3CF",
      },
      strengths: ["技术治理", "架构蓝图"],
      slides: baseSlides,
    },
    {
      key: "ppt169_image_text_showcase" as const,
      styleKey: "ppt169_image_text_showcase" as const,
      name: "Image Text Showcase",
      summary: "图文并置与案例陈列节奏最强。",
      stylePrompt: "Portfolio-like showcase deck.",
      outline: ["Hero Spread", "Contact Sheet", "Editor Note", "Side by Side", "Gallery Signals", "Metric Ribbon", "Caption Board", "Sequence Board", "Closing Spread"],
      palette: {
        background: "#F1F0EB",
        foreground: "#141414",
        accent: "#D44B2B",
        panel: "#FBFAF5",
        border: "#D2CEC3",
      },
      strengths: ["案例展示", "图文节奏"],
      slides: baseSlides,
    },
    {
      key: "ppt169_fashion_weekly_digest" as const,
      styleKey: "ppt169_fashion_weekly_digest" as const,
      name: "Fashion Weekly Digest",
      summary: "杂志策展与趋势周报节奏最强。",
      stylePrompt: "Editorial fashion digest deck.",
      outline: ["Issue Cover", "Editorial Spread", "Main Column", "Trend Compare", "Editorial Strip", "Metric Column", "Trend Board", "Run of Show", "Editor Closing"],
      palette: {
        background: "#171412",
        foreground: "#F7E7D8",
        accent: "#FF8B61",
        panel: "#231D19",
        border: "#43362E",
      },
      strengths: ["杂志编辑", "趋势策展"],
      slides: baseSlides,
    },
  ],
}

const importedTemplateDeckBatchTwo = {
  ...sampleDeck,
  variants: [
    {
      key: "ppt169_glassmorphism_demo" as const,
      styleKey: "ppt169_glassmorphism_demo" as const,
      name: "Glassmorphism Demo",
      summary: "玻璃面板与产品演示感最强。",
      stylePrompt: "Glass dashboard demo deck.",
      outline: ["Glass Cover", "Panel Grid", "Insight Split", "Compare Grid", "Spotlight Strip", "Metric Board", "Chart Board", "Process Lane", "Closing Panel"],
      palette: {
        background: "#E9F5FF",
        foreground: "#152433",
        accent: "#4AA8FF",
        panel: "#F5FBFF",
        border: "#BFDCEF",
      },
      strengths: ["产品演示", "玻璃面板"],
      slides: baseSlides,
    },
    {
      key: "ppt169_attention_is_all_you_need" as const,
      styleKey: "ppt169_attention_is_all_you_need" as const,
      name: "Attention Research",
      summary: "研究答辩与方法证明结构最强。",
      stylePrompt: "Research defense deck.",
      outline: ["Abstract", "Outline", "Method", "Compare", "Evidence", "Metrics", "Results", "Procedure", "Conclusion"],
      palette: {
        background: "#F8F6F0",
        foreground: "#111111",
        accent: "#B86A2A",
        panel: "#FFFCF5",
        border: "#D6CAB7",
      },
      strengths: ["研究汇报", "答辩结构"],
      slides: baseSlides,
    },
    {
      key: "ppt169_indie_bookstore_zine_guide" as const,
      styleKey: "ppt169_indie_bookstore_zine_guide" as const,
      name: "Indie Bookstore Zine",
      summary: "文化 zine 与策展叙事节奏最强。",
      stylePrompt: "Editorial zine deck.",
      outline: ["Zine Cover", "Index Board", "Split Spread", "Compare Board", "Quote Wall", "Number Row", "Ledger List", "Runway Board", "Closing Notes"],
      palette: {
        background: "#181512",
        foreground: "#F3E8D7",
        accent: "#D96C3D",
        panel: "#221D19",
        border: "#3A3029",
      },
      strengths: ["文化编辑", "策展节奏"],
      slides: baseSlides,
    },
  ],
}

const importedTemplateDeckBatchThree = {
  ...sampleDeck,
  variants: [
    {
      key: "ppt169_global_ai_capital_2026" as const,
      styleKey: "ppt169_global_ai_capital_2026" as const,
      name: "Global AI Capital 2026",
      summary: "资本简报与董事会判断节奏最强。",
      stylePrompt: "Board-facing capital brief deck.",
      outline: ["Capital Cover", "Brief Grid", "Quote Panel", "Compare Board", "Evidence List", "Metric Strip", "Market Bars", "Runway Grid", "Closing Board"],
      palette: {
        background: "#F7F0E3",
        foreground: "#772919",
        accent: "#C84A23",
        panel: "#FFF8EE",
        border: "#D9BEA5",
      },
      strengths: ["资本叙事", "董事会简报"],
      slides: baseSlides,
    },
    {
      key: "ppt169_home_design_trends_2026" as const,
      styleKey: "ppt169_home_design_trends_2026" as const,
      name: "Home Design Trends 2026",
      summary: "生活方式趋势与审美策展节奏最强。",
      stylePrompt: "Lifestyle trend curation deck.",
      outline: ["Hero Spread", "Tile Grid", "Story Spread", "Compare Grid", "Curation Strip", "Metric Row", "Trend Rows", "Sequence Grid", "Closing Card"],
      palette: {
        background: "#F5EFE7",
        foreground: "#2E2722",
        accent: "#B98053",
        panel: "#FCF8F2",
        border: "#D9C8B8",
      },
      strengths: ["生活方式", "审美策展"],
      slides: baseSlides,
    },
    {
      key: "ppt169_lin_huiyin_architect" as const,
      styleKey: "ppt169_lin_huiyin_architect" as const,
      name: "Lin Huiyin Architect",
      summary: "人物传记与建筑文化叙事节奏最强。",
      stylePrompt: "Architect biography deck.",
      outline: ["Hero Spread", "Index Columns", "Story Board", "Compare Columns", "Evidence Stack", "Metric Columns", "Ledger Lines", "Runway Columns", "Closing Card"],
      palette: {
        background: "#161311",
        foreground: "#F3E8DC",
        accent: "#C67248",
        panel: "#231C18",
        border: "#42352E",
      },
      strengths: ["人物传记", "文化叙事"],
      slides: baseSlides,
    },
  ],
}

const importedTemplateDeckBatchFour = {
  ...sampleDeck,
  variants: [
    {
      key: "ppt169_building_effective_agents" as const,
      styleKey: "ppt169_building_effective_agents" as const,
      name: "Building Effective Agents",
      summary: "智能体编排与能力分层结构最强。",
      stylePrompt: "Agent orchestration deck.",
      outline: ["Hero", "Module Grid", "Thesis", "Compare", "Signals", "Metrics", "Graph", "Runway", "Close"],
      palette: { background: "#EEF2EC", foreground: "#101418", accent: "#B7F36B", panel: "#F9FBF6", border: "#CED8C2" },
      strengths: ["编排", "能力分层"],
      slides: baseSlides,
    },
    {
      key: "ppt169_cangzhuo" as const,
      styleKey: "ppt169_cangzhuo" as const,
      name: "Cangzhuo",
      summary: "中文经营纪要与执行备忘结构最强。",
      stylePrompt: "Chinese executive memo deck.",
      outline: ["封面", "议题", "决策", "对照", "风险", "指标", "图示", "动作", "收束"],
      palette: { background: "#F7F1E8", foreground: "#7A3123", accent: "#B14B32", panel: "#FFF8EF", border: "#D7BEAA" },
      strengths: ["纪要", "执行"],
      slides: baseSlides,
    },
    {
      key: "ppt169_general_dark_tech_claude_code_auto_mode" as const,
      styleKey: "ppt169_general_dark_tech_claude_code_auto_mode" as const,
      name: "General Dark Tech",
      summary: "暗色科技系统感最强。",
      stylePrompt: "Dark system deck.",
      outline: ["Hero", "Nodes", "Thesis", "Compare", "Alerts", "Metrics", "Scan", "Run", "Close"],
      palette: { background: "#0D0F12", foreground: "#F2F2F0", accent: "#F06C3B", panel: "#171B21", border: "#2B3139" },
      strengths: ["科技", "系统"],
      slides: baseSlides,
    },
    {
      key: "ppt169_high_rise_renewal" as const,
      styleKey: "ppt169_high_rise_renewal" as const,
      name: "High Rise Renewal",
      summary: "城市更新与建筑方案结构最强。",
      stylePrompt: "Urban renewal deck.",
      outline: ["Hero", "Plan", "Thesis", "Material", "Evidence", "Metrics", "Ledger", "Phase", "Close"],
      palette: { background: "#12100F", foreground: "#F1E6D8", accent: "#D96E45", panel: "#211B18", border: "#3E332D" },
      strengths: ["建筑", "更新"],
      slides: baseSlides,
    },
    {
      key: "ppt169_kimsoong_loyalty_programme" as const,
      styleKey: "ppt169_kimsoong_loyalty_programme" as const,
      name: "Kimsoong Loyalty Programme",
      summary: "会员体系与留存运营结构最强。",
      stylePrompt: "Membership deck.",
      outline: ["Hero", "Members", "Story", "Tiers", "Proof", "Metrics", "Chart", "Journey", "Close"],
      palette: { background: "#F5D8B6", foreground: "#1E1B19", accent: "#D96C3F", panel: "#FBE8D0", border: "#D2A57A" },
      strengths: ["会员", "留存"],
      slides: baseSlides,
    },
    {
      key: "ppt169_lin_huiyin_architect_revised" as const,
      styleKey: "ppt169_lin_huiyin_architect_revised" as const,
      name: "Lin Huiyin Architect Revised",
      summary: "修订版建筑人物叙事结构最强。",
      stylePrompt: "Revised architecture profile deck.",
      outline: ["Hero", "Index", "Story", "Compare", "Evidence", "Metrics", "Ledger", "Runway", "Close"],
      palette: { background: "#161311", foreground: "#F3E8DC", accent: "#C67248", panel: "#231C18", border: "#42352E" },
      strengths: ["修订", "人物"],
      slides: baseSlides,
    },
    {
      key: "ppt169_liziqi_plant_dye_colors" as const,
      styleKey: "ppt169_liziqi_plant_dye_colors" as const,
      name: "Plant Dye Colors",
      summary: "手作生活方式与柔和叙事结构最强。",
      stylePrompt: "Craft lifestyle deck.",
      outline: ["Hero", "Cards", "Story", "Compare", "Spotlight", "Metrics", "Trend", "Phase", "Close"],
      palette: { background: "#F4E8D8", foreground: "#2B241E", accent: "#7F9A5D", panel: "#FBF6EE", border: "#D9C7B5" },
      strengths: ["手作", "生活方式"],
      slides: baseSlides,
    },
    {
      key: "ppt169_lora_hu_2021" as const,
      styleKey: "ppt169_lora_hu_2021" as const,
      name: "Lora Hu 2021",
      summary: "创作者作品集节奏最强。",
      stylePrompt: "Creator portfolio deck.",
      outline: ["Hero", "Sheets", "Story", "Compare", "Showcase", "Metrics", "Ledger", "Sequence", "Close"],
      palette: { background: "#F3E4D8", foreground: "#2A221E", accent: "#B86D59", panel: "#FBF3EC", border: "#D6C0B3" },
      strengths: ["作品集", "个人品牌"],
      slides: baseSlides,
    },
  ],
}

test("frontend slides runtime materializes HTML documents and poster previews", async () => {
  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(sampleDeck)
  const variant = deck.variants[0]
  const html = variant?.preview?.htmlDocument?.html ?? ""

  assert.equal(deck.previewEngine, "frontend-slides-html")
  assert.equal(frontendSlidesPreviewRuntime.id, "frontend-slides-agent")
  assert.ok(deck.previewSessionId)
  assert.ok(variant?.preview)
  assert.equal(variant?.preview?.slides.length, 9)
  assert.equal(variant?.preview?.cover.mimeType, "image/svg+xml")
  assert.equal(variant?.preview?.htmlDocument?.fileName, "step-37-flash-9p-long-table.html")
  assert.match(html, /<section class="slide">/)
  assert.match(html, /PresentationController/)
  assert.match(html, /aspect-ratio:\s*16\s*\/\s*9/)
  assert.match(html, /width:\s*min\(/)
})

test("frontend slides runtime registers a dedicated renderer for every ppt169 template style", () => {
  const expected = pptPreviewStyles
    .map((style) => style.key)
    .filter((styleKey) => styleKey.startsWith("ppt169_"))
    .sort()

  const actual = getCustomFrontendSlidesRendererKeys().slice().sort()

  assert.deepEqual(actual, expected)
})

test("frontend slides runtime renders materially different HTML structures per variant style", async () => {
  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(sampleDeck)
  const htmlByKey = new Map(
    deck.variants.map((variant) => [variant.key, variant.preview?.htmlDocument?.html ?? ""]),
  )

  assert.match(htmlByKey.get("ppt169_brutalist_ai_newspaper_2026") ?? "", /long-table-header|long-table-quote|long-table-featured|long-table-schedule/)
  assert.match(htmlByKey.get("ppt169_sugar_rush_memphis") ?? "", /playful-orbit|playful-vision-slide|playful-chart-area|timeline-track/)
  assert.match(htmlByKey.get("ppt169_pritzker_2026") ?? "", /broadside-top-chrome|market-barboard|closing-pill/)
  assert.match(htmlByKey.get("ppt169_swiss_grid_systems") ?? "", /neo-grid-ruler|module-strip/)
  assert.match(htmlByKey.get("ppt169_brutalist_ai_newspaper_2026") ?? "", /Table Stakes/)
  assert.match(htmlByKey.get("ppt169_sugar_rush_memphis") ?? "", /机会窗口/)
  assert.match(htmlByKey.get("ppt169_pritzker_2026") ?? "", /09 \/ Closing/)
  assert.match(htmlByKey.get("ppt169_swiss_grid_systems") ?? "", /CHOOSE|机会窗口/)

  const uniqueHtml = new Set(htmlByKey.values())
  assert.equal(uniqueHtml.size, 4)
  assert.match(htmlByKey.get("ppt169_brutalist_ai_newspaper_2026") ?? "", /先判断方向|快预览/)
  assert.match(htmlByKey.get("ppt169_sugar_rush_memphis") ?? "", /72|故事规划|扩 contract/)
  assert.match(htmlByKey.get("ppt169_sugar_rush_memphis") ?? "", /机会窗口|先定义为什么现在值得讲/)
  assert.match(htmlByKey.get("ppt169_swiss_grid_systems") ?? "", /CHOOSE|打开 HTML 成品页做最终判断/)
  assert.doesNotMatch(htmlByKey.get("ppt169_sugar_rush_memphis") ?? "", /⚡|🚢|📈/)
  assert.doesNotMatch(htmlByKey.get("ppt169_sugar_rush_memphis") ?? "", /sticker-band|playful-doodle-frame|doodle-flow/)
})

test("frontend slides runtime gives selected imported ppt-master templates their own html structures", async () => {
  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(importedTemplateDeck)
  const htmlByKey = new Map(
    deck.variants.map((variant) => [variant.key, variant.preview?.htmlDocument?.html ?? ""]),
  )

  const kubernetesHtml = htmlByKey.get("ppt169_kubernetes_blueprint_2026") ?? ""
  const showcaseHtml = htmlByKey.get("ppt169_image_text_showcase") ?? ""
  const fashionHtml = htmlByKey.get("ppt169_fashion_weekly_digest") ?? ""

  assert.match(kubernetesHtml, /kube-control-plane|kube-node-matrix|kube-governance-lane|kube-rollout-board/)
  assert.doesNotMatch(kubernetesHtml, /<div class="neo-grid-ruler">|<aside class="module-strip panel">/)

  assert.match(showcaseHtml, /showcase-contact-sheet|showcase-caption-board|showcase-sequence-board|showcase-editor-note/)
  assert.doesNotMatch(showcaseHtml, /<div class="neo-grid-ruler">|<aside class="module-strip panel">/)

  assert.match(fashionHtml, /digest-masthead|digest-spread-grid|digest-trend-board|digest-run-of-show/)
  assert.doesNotMatch(fashionHtml, /<div class="broadside-top-chrome">|<div class="market-barboard">/)

  assert.match(kubernetesHtml, /Step 3\.7 Flash 的叙事架构/)
  assert.match(showcaseHtml, /HTML 预览 vs 可编辑 PPTX/)
  assert.match(fashionHtml, /9 页结构带来的信息密度/)
})

test("frontend slides runtime gives another three imported ppt-master templates dedicated html structures", async () => {
  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(importedTemplateDeckBatchTwo)
  const htmlByKey = new Map(
    deck.variants.map((variant) => [variant.key, variant.preview?.htmlDocument?.html ?? ""]),
  )

  const glassHtml = htmlByKey.get("ppt169_glassmorphism_demo") ?? ""
  const paperHtml = htmlByKey.get("ppt169_attention_is_all_you_need") ?? ""
  const zineHtml = htmlByKey.get("ppt169_indie_bookstore_zine_guide") ?? ""

  assert.match(glassHtml, /glass-hero-grid|glass-panel-grid|glass-chart-board|glass-closing-panel/)
  assert.doesNotMatch(glassHtml, /<section class="slide playful-cover">|<div class="playful-orbit">/)

  assert.match(paperHtml, /paper-abstract|paper-outline-board|paper-chart-column|paper-conclusion/)
  assert.doesNotMatch(paperHtml, /<div class="neo-grid-ruler">|<div class="signal-grid-board panel">/)

  assert.match(zineHtml, /zine-masthead|zine-index-board|zine-ledger-list|zine-closing-block/)
  assert.doesNotMatch(zineHtml, /<div class="broadside-top-chrome">|<div class="market-barboard">/)

  assert.match(glassHtml, /Step 3\.7 Flash 的叙事架构/)
  assert.match(paperHtml, /HTML 预览 vs 可编辑 PPTX|速度不是唯一优势/)
  assert.match(zineHtml, /Step 3\.7 Flash 的叙事架构|速度不是唯一优势/)
})

test("frontend slides runtime gives a third imported batch dedicated html structures", async () => {
  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(importedTemplateDeckBatchThree)
  const htmlByKey = new Map(
    deck.variants.map((variant) => [variant.key, variant.preview?.htmlDocument?.html ?? ""]),
  )

  const capitalHtml = htmlByKey.get("ppt169_global_ai_capital_2026") ?? ""
  const homeHtml = htmlByKey.get("ppt169_home_design_trends_2026") ?? ""
  const heritageHtml = htmlByKey.get("ppt169_lin_huiyin_architect") ?? ""

  assert.match(capitalHtml, /capital-masthead|capital-brief-grid|capital-market-bars|capital-closing-board/)
  assert.doesNotMatch(capitalHtml, /<section class="slide long-table-cover">|<div class="ledger-grid">/)

  assert.match(homeHtml, /home-hero-spread|home-tile-grid|home-curation-strip|home-closing-card/)
  assert.doesNotMatch(homeHtml, /<div class="broadside-top-chrome">|<div class="poster-columns">/)

  assert.match(heritageHtml, /heritage-masthead|heritage-index-columns|heritage-story-board|heritage-closing-card/)
  assert.doesNotMatch(heritageHtml, /<div class="broadside-top-chrome">|<div class="poster-columns">/)

  assert.match(capitalHtml, /Step 3\.7 Flash 的叙事架构/)
  assert.match(homeHtml, /速度不是唯一优势|为什么预览值得优先交付/)
  assert.match(heritageHtml, /HTML 预览 vs 可编辑 PPTX|9 页结构带来的信息密度/)
})

test("frontend slides runtime covers the remaining imported templates with dedicated html structures", async () => {
  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(importedTemplateDeckBatchFour)
  const htmlByKey = new Map(
    deck.variants.map((variant) => [variant.key, variant.preview?.htmlDocument?.html ?? ""]),
  )

  assert.match(htmlByKey.get("ppt169_building_effective_agents") ?? "", /agents-ruler|agents-module-grid|agents-graph-stack|agents-closing-card/)
  assert.match(htmlByKey.get("ppt169_cangzhuo") ?? "", /memo-header|memo-list-board|memo-chart-list|memo-closing-card/)
  assert.match(htmlByKey.get("ppt169_general_dark_tech_claude_code_auto_mode") ?? "", /darktech-topbar|darktech-node-grid|darktech-scan-list|darktech-close-card/)
  assert.match(htmlByKey.get("ppt169_high_rise_renewal") ?? "", /renewal-topbar|renewal-plan-grid|renewal-ledger-rows|renewal-closing-card/)
  assert.match(htmlByKey.get("ppt169_kimsoong_loyalty_programme") ?? "", /loyalty-header|loyalty-member-grid|loyalty-chart-list|loyalty-closing-card/)
  assert.match(htmlByKey.get("ppt169_lin_huiyin_architect_revised") ?? "", /heritage-revised-masthead|heritage-revised-index-columns|heritage-revised-ledger-lines|heritage-revised-closing-card/)
  assert.match(htmlByKey.get("ppt169_liziqi_plant_dye_colors") ?? "", /dye-masthead|dye-card-grid|dye-trend-list|dye-closing-card/)
  assert.match(htmlByKey.get("ppt169_lora_hu_2021") ?? "", /creator-masthead|creator-sheet-grid|creator-ledger-list|creator-closing-card/)

  assert.doesNotMatch(htmlByKey.get("ppt169_building_effective_agents") ?? "", /<div class="neo-grid-ruler">/)
  assert.doesNotMatch(htmlByKey.get("ppt169_cangzhuo") ?? "", /<section class="slide long-table-cover">/)
  assert.doesNotMatch(htmlByKey.get("ppt169_general_dark_tech_claude_code_auto_mode") ?? "", /<div class="neo-grid-ruler">/)
  assert.doesNotMatch(htmlByKey.get("ppt169_high_rise_renewal") ?? "", /<div class="broadside-top-chrome">/)
  assert.doesNotMatch(htmlByKey.get("ppt169_kimsoong_loyalty_programme") ?? "", /<div class="playful-orbit">/)
  assert.doesNotMatch(htmlByKey.get("ppt169_lin_huiyin_architect_revised") ?? "", /<div class="broadside-top-chrome">/)
  assert.doesNotMatch(htmlByKey.get("ppt169_liziqi_plant_dye_colors") ?? "", /<div class="playful-orbit">/)
  assert.doesNotMatch(htmlByKey.get("ppt169_lora_hu_2021") ?? "", /<div class="playful-orbit">/)
})

test("frontend slides runtime renders workflow input images as structured slide media", async () => {
  const deckWithImages = {
    ...sampleDeck,
    variants: sampleDeck.variants.map((variant) => ({
      ...variant,
      slides: variant.slides.map((slide) => {
        if (slide.layout === "cover") {
          return {
            ...slide,
            image: {
              url: "https://example.com/cover.png",
              title: "封面图",
              sourceNodeKey: "image-1",
              role: "cover" as const,
            },
          }
        }

        if (slide.layout === "insight") {
          return {
            ...slide,
            image: {
              url: "https://example.com/insight.png",
              title: "洞察图",
              sourceNodeKey: "image-2",
              role: "content" as const,
            },
          }
        }

        return slide
      }),
    })),
  }

  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(deckWithImages)
  const html = deck.variants[0]?.preview?.htmlDocument?.html ?? ""

  assert.match(html, /workflow-image-figure/)
  assert.match(html, /https:\/\/example\.com\/cover\.png/)
  assert.match(html, /https:\/\/example\.com\/insight\.png/)
  assert.match(html, /image-1/)
  assert.match(html, /image-2/)
})

test("neo-grid fallback derives chart and process copy from neighboring structured slides", async () => {
  const deck = {
    ...sampleDeck,
    variants: sampleDeck.variants.map((variant) =>
      variant.key === "ppt169_swiss_grid_systems"
        ? {
            ...variant,
            slides: variant.slides.map((slide) =>
              slide.layout === "chart"
                ? { ...slide, chartItems: undefined, bullets: ["主轴关系", "外溢路径", "最终影响"] }
                : slide.layout === "process"
                  ? { ...slide, processItems: undefined, bullets: ["识别", "切换", "执行", "跟踪"] }
                  : slide,
            ),
          }
        : variant,
    ),
  }

  const result = await frontendSlidesPreviewRuntime.materializeStoryDeck(deck)
  const html = result.variants.find((variant) => variant.key === "ppt169_swiss_grid_systems")?.preview?.htmlDocument?.html ?? ""
  const repairedVariant = result.variants.find((variant) => variant.key === "ppt169_swiss_grid_systems")
  const repairedChart = repairedVariant?.slides.find((slide) => slide.layout === "chart")
  const repairedProcess = repairedVariant?.slides.find((slide) => slide.layout === "process")

  assert.match(html, /快预览|后完成交付|锁定最强的叙事方向/)
  assert.doesNotMatch(html, /主轴关系|外溢路径|最终影响/)
  assert.doesNotMatch(html, />\s*Step [1-4]\s*</)
  assert.deepEqual(
    repairedChart?.chartItems?.map((item) => item.detail),
    ["快预览 · 先判断方向", "可编辑导出 · 后完成交付"],
  )
  assert.deepEqual(
    repairedProcess?.processItems?.map((item) => item.title),
    ["CHOOSE", "OPEN", "EXPORT"],
  )
})

test("broadside process and closing pages derive structured fallback blocks from registry", async () => {
  const deck = {
    ...sampleDeck,
    variants: sampleDeck.variants.map((variant) =>
      variant.key === "ppt169_pritzker_2026"
        ? {
            ...variant,
            slides: variant.slides.map((slide) =>
              slide.layout === "process"
                ? { ...slide, processItems: undefined, bullets: ["识别高风险段", "切换替代路线", "启动对冲机制", "持续监测外溢"] }
                : slide.layout === "timeline"
                  ? {
                      ...slide,
                      closingItems: [
                        { label: "立即", detail: "启动风险监测与预案演练" },
                        { label: "短期", detail: "建立备用航线与保险对冲机制" },
                        { label: "长期", detail: "推动能源多元化与区域合作" },
                      ],
                    }
                  : slide,
            ),
          }
        : variant,
    ),
  }

  const result = await frontendSlidesPreviewRuntime.materializeStoryDeck(deck)
  const html = result.variants.find((variant) => variant.key === "ppt169_pritzker_2026")?.preview?.htmlDocument?.html ?? ""
  const repairedVariant = result.variants.find((variant) => variant.key === "ppt169_pritzker_2026")
  const repairedProcess = repairedVariant?.slides.find((slide) => slide.layout === "process")

  assert.match(html, /立即|短期|长期/)
  assert.match(html, /closing-card|closing-copy/)
  assert.doesNotMatch(html, />\s*Step [1-4]\s*</)
  assert.deepEqual(
    repairedProcess?.processItems,
    [
      { step: "01", title: "立即", detail: "启动风险监测与预案演练" },
      { step: "02", title: "短期", detail: "建立备用航线与保险对冲机制" },
      { step: "03", title: "长期", detail: "推动能源多元化与区域合作" },
    ],
  )
})

test("long-table agenda density policy keeps later agenda items visible without overflowing the card grid", async () => {
  const deck = {
    ...sampleDeck,
    variants: sampleDeck.variants.map((variant) =>
      variant.key === "ppt169_brutalist_ai_newspaper_2026"
        ? {
            ...variant,
            slides: variant.slides.map((slide) =>
              slide.layout === "agenda"
                ? {
                    ...slide,
                    contentsItems: [
                      { index: "01", title: "机会窗口", detail: "先看当下窗口。" },
                      { index: "02", title: "受众判断", detail: "锁定核心受众。" },
                      { index: "03", title: "策略主轴", detail: "拉直主要判断。" },
                      { index: "04", title: "竞争对照", detail: "摆出替代方案。" },
                      { index: "05", title: "证据锚点", detail: "固化支撑事实。" },
                      { index: "06", title: "关键数据", detail: "压缩核心指标。" },
                      { index: "07", title: "扩散图谱", detail: "展示外溢路径。" },
                      { index: "08", title: "执行路径", detail: "给出执行顺序。" },
                      { index: "09", title: "转化动作", detail: "收束到行动。" },
                    ],
                  }
                : slide,
            ),
          }
        : variant,
    ),
  }

  const result = await frontendSlidesPreviewRuntime.materializeStoryDeck(deck)
  const html = result.variants.find((variant) => variant.key === "ppt169_brutalist_ai_newspaper_2026")?.preview?.htmlDocument?.html ?? ""

  assert.match(html, /<div class="agenda-ledger">[\s\S]*?<span class="card-index">06<\/span>/)
  assert.doesNotMatch(html, /<div class="agenda-ledger">[\s\S]*?<span class="card-index">07<\/span>/)
  assert.match(html, /<div class="agenda-signal-line">[\s\S]*?<span>07<\/span>[\s\S]*?<span>08<\/span>[\s\S]*?<span>09<\/span>/)
})

test("frontend slides runtime resolves template pages by intent rather than input order", async () => {
  const broadsideSlides = [
    {
      ...baseSlides[0],
      title: "Cover Front",
      intent: "cover" as const,
    },
    {
      ...baseSlides[7],
      title: "Process Track",
      intent: "process" as const,
    },
    {
      ...baseSlides[5],
      title: "Stats Board",
      intent: "stats" as const,
    },
    {
      ...baseSlides[2],
      title: "Statement Core",
      intent: "statement" as const,
    },
    {
      ...baseSlides[6],
      title: "Chart Spill",
      intent: "chart" as const,
    },
    {
      ...baseSlides[1],
      title: "Contents Rail",
      intent: "contents" as const,
    },
    {
      ...baseSlides[3],
      title: "Compare Ledger",
      intent: "comparison" as const,
    },
    {
      ...baseSlides[4],
      title: "Proof Poster",
      intent: "spotlight" as const,
    },
    {
      ...baseSlides[8],
      title: "Closing Notice",
      intent: "closing" as const,
    },
  ]

  const neoGridSlides = [
    {
      ...baseSlides[0],
      title: "Grid Cover",
      intent: "cover" as const,
    },
    {
      ...baseSlides[6],
      title: "Chart Board Panel",
      intent: "chart" as const,
    },
    {
      ...baseSlides[5],
      title: "Signal Count Deck",
      intent: "stats" as const,
    },
    {
      ...baseSlides[4],
      title: "Evidence Beacon Panel",
      intent: "spotlight" as const,
    },
    {
      ...baseSlides[3],
      title: "Contrast Shell Panel",
      intent: "comparison" as const,
    },
    {
      ...baseSlides[1],
      title: "Module Rail",
      intent: "contents" as const,
    },
    {
      ...baseSlides[7],
      title: "Execution Runway Panel",
      intent: "process" as const,
    },
    {
      ...baseSlides[2],
      title: "Signal Thesis",
      intent: "statement" as const,
    },
    {
      ...baseSlides[8],
      title: "Close Sequence",
      intent: "closing" as const,
    },
  ]

  const reorderedDeck = {
    ...sampleDeck,
    variants: sampleDeck.variants.map((variant) => {
      if (variant.key === "ppt169_pritzker_2026") {
        return { ...variant, slides: broadsideSlides }
      }

      if (variant.key === "ppt169_swiss_grid_systems") {
        return { ...variant, slides: neoGridSlides }
      }

      return variant
    }),
  }

  const deck = await frontendSlidesPreviewRuntime.materializeStoryDeck(reorderedDeck)
  const broadsideHtml = deck.variants.find((variant) => variant.key === "ppt169_pritzker_2026")?.preview?.htmlDocument?.html ?? ""
  const neoGridHtml = deck.variants.find((variant) => variant.key === "ppt169_swiss_grid_systems")?.preview?.htmlDocument?.html ?? ""

  assert.match(broadsideHtml, /Cover Front/)
  assert.match(broadsideHtml, /Contents Rail/)
  assert.match(broadsideHtml, /Statement Core/)
  assert.match(broadsideHtml, /Compare Ledger/)
  assert.match(broadsideHtml, /Proof Poster/)
  assert.match(broadsideHtml, /Stats Board/)
  assert.match(broadsideHtml, /Chart Spill/)
  assert.match(broadsideHtml, /Process Track/)
  assert.match(broadsideHtml, /Closing Notice/)
  assert.ok(broadsideHtml.indexOf("Cover Front") < broadsideHtml.indexOf("Contents Rail"))
  assert.ok(broadsideHtml.indexOf("Contents Rail") < broadsideHtml.indexOf("Statement Core"))
  assert.ok(broadsideHtml.indexOf("Statement Core") < broadsideHtml.indexOf("Compare Ledger"))
  assert.ok(broadsideHtml.indexOf("Compare Ledger") < broadsideHtml.indexOf("Proof Poster"))
  assert.ok(broadsideHtml.indexOf("Proof Poster") < broadsideHtml.indexOf("Stats Board"))
  assert.ok(broadsideHtml.indexOf("Stats Board") < broadsideHtml.indexOf("Chart Spill"))
  assert.ok(broadsideHtml.indexOf("Chart Spill") < broadsideHtml.indexOf("Process Track"))
  assert.ok(broadsideHtml.indexOf("Process Track") < broadsideHtml.indexOf("Closing Notice"))

  assert.match(neoGridHtml, /Grid Cover/)
  assert.match(neoGridHtml, /Module Rail/)
  assert.match(neoGridHtml, /Signal Thesis/)
  assert.match(neoGridHtml, /Contrast Shell Panel/)
  assert.match(neoGridHtml, /Evidence Beacon Panel/)
  assert.match(neoGridHtml, /Signal Count Deck/)
  assert.match(neoGridHtml, /Chart Board Panel/)
  assert.match(neoGridHtml, /Execution Runway Panel/)
  assert.match(neoGridHtml, /Close Sequence/)
  assert.ok(neoGridHtml.indexOf("Grid Cover") < neoGridHtml.indexOf("Module Rail"))
  assert.ok(neoGridHtml.indexOf("Module Rail") < neoGridHtml.indexOf("Signal Thesis"))
  assert.ok(neoGridHtml.indexOf("Signal Thesis") < neoGridHtml.indexOf("Contrast Shell Panel"))
  assert.ok(neoGridHtml.indexOf("Contrast Shell Panel") < neoGridHtml.indexOf("Evidence Beacon Panel"))
  assert.ok(neoGridHtml.indexOf("Evidence Beacon Panel") < neoGridHtml.indexOf("Signal Count Deck"))
  assert.ok(neoGridHtml.indexOf("Signal Count Deck") < neoGridHtml.indexOf("Chart Board Panel"))
  assert.ok(neoGridHtml.indexOf("Chart Board Panel") < neoGridHtml.indexOf("Execution Runway Panel"))
  assert.ok(neoGridHtml.indexOf("Execution Runway Panel") < neoGridHtml.indexOf("Close Sequence"))
})
