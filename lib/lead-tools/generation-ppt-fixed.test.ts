import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  buildPreviewProviderMessages,
  buildStyleAwarePrompt,
  generateLeadToolPptStoryDeck,
  getLeadToolPreviewProviderTimeoutMs,
  isLowInformationPptPlan,
  normalizeLeadToolPptPlan,
  normalizePptMasterRuntimeProviderError,
  resolveRuntimeSlideExecutionConfig,
  resolveLeadToolPreviewProviderPreference,
  setLeadToolPptGenerationDepsForTests,
} from "./generation-ppt-fixed"
import {
  buildMockPptPreview,
  buildPptPreviewTemplateCapabilityLabel,
  buildPptPreviewVariantDescriptors,
  getPptPreviewStyleSlots,
  pptPreviewStyles,
} from "./ppt-preview-data-fixed"
import { PPT_MASTER_TEMPLATE_MANIFEST } from "./ppt-master-template-manifest"
import { loadPptMasterTemplateReference } from "./ppt-master-runtime"

const yusuanAttachmentMarkdown = readFileSync(
  new URL("../../tests/fixtures/ppt/yusuan-intelligence-ppt-info.md", import.meta.url),
  "utf8",
)

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function fromYusuanAttachment(snippet: string) {
  assert.match(yusuanAttachmentMarkdown, new RegExp(escapeRegExp(snippet), "u"))
  return snippet
}

function fromYusuanAttachmentPattern(pattern: RegExp, normalizedValue: string) {
  assert.match(yusuanAttachmentMarkdown, pattern)
  return normalizedValue
}

function buildYusuanResearchBrief() {
  return {
    topic: "屿算智能企业 AI 业务工具介绍",
    keyFacts: [
      fromYusuanAttachment("实用 AI 大于 AI 概念"),
      fromYusuanAttachment("让 AI 进入企业的岗位、流程和结果"),
      fromYusuanAttachment("企业需要的不是更多工具，而是一套能把问题变成流程的系统"),
      fromYusuanAttachment("企业真正买到的是一套可执行、可管理、可沉淀的 AI 工作方式"),
    ],
    numericEvidence: [
      fromYusuanAttachment("配置 17 个 AI 智能体员工，覆盖策划、销售、客服、法务、财务、技术、运营等角色"),
      fromYusuanAttachmentPattern(/\*\*40\+\*\*\s*国内外大模型与工具接入/u, "40+ 国内外大模型与工具接入"),
      fromYusuanAttachmentPattern(/\*\*10\+\*\*\s*主流内容发布与客户承接触点/u, "10+ 主流内容发布与客户承接触点"),
    ],
    risks: [
      fromYusuanAttachment("知道 AI 能写文案、做图片和视频，但接不进真实工作流程"),
      fromYusuanAttachment("员工零散使用工具，结果留不进企业知识、项目和资产体系"),
      fromYusuanAttachment("内容复刻、搬运、改写、数字人使用和客户互动过程中守住风险"),
    ],
    implications: [
      fromYusuanAttachment("先帮企业问清楚，再进入立项和执行"),
      fromYusuanAttachment("把想法变成方案、计划和每日执行"),
      fromYusuanAttachment("让内容、获客和成交形成闭环"),
      fromYusuanAttachment("把内容、方案、知识、流程、任务记录等沉淀到企业资产体系"),
    ],
    sourceNotes: ["Fixture - tests/fixtures/ppt/yusuan-intelligence-ppt-info.md"],
    rawSummary: fromYusuanAttachment(
      "屿算智脑是一套面向传统企业的 AI 业务工作台，通过 17 个 AI 智能体员工、40+ 模型工具接入和完整业务流程，把 AI 从单点工具升级为可执行、可管理、可沉淀的企业增长系统。",
    ),
  }
}

test("normalizeLeadToolPptPlan prefers intent over order and canonicalizes slots", () => {
  const style = pptPreviewStyles.find((item) => item.key === "ppt169_pritzker_2026")
  assert.ok(style)

  const request = {
    prompt: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
    scenario: "marketing-campaign" as const,
    language: "zh-CN" as const,
    model: "gpt-5.4" as const,
  }

  const rawPlan = {
    title: "霍尔木兹海峡：冲击外溢",
    outline: ["封面", "目录", "宣言", "对照", "证据", "数据", "图示", "步骤", "结束"],
    slides: [
      {
        layout: "process",
        intent: "process",
        title: "执行路径页",
        body: "这里应该落到 process 槽位。",
        bullets: ["识别", "切换", "执行", "跟踪"],
        processItems: [
          { step: "01", title: "识别", detail: "先确认来源" },
          { step: "02", title: "切换", detail: "再调整路径" },
        ],
      },
      {
        layout: "chart",
        intent: "chart",
        title: "图示页",
        body: "这里应该落到 chart 槽位。",
        bullets: ["外溢起点", "传导链路", "市场放大", "最终影响"],
        chartItems: [
          { label: "A", value: 72, detail: "外溢起点" },
          { label: "B", value: 58, detail: "传导链路" },
        ],
      },
      {
        layout: "stats",
        intent: "stats",
        title: "数据页",
        body: "这里应该落到 stats 槽位。",
        bullets: ["油运风险", "保费变化", "替代航线成本"],
        metricItems: [
          { value: "03", label: "关键指标", note: "影响决策" },
          { value: "09", label: "页面总数", note: "更能承载" },
        ],
      },
      {
        layout: "closing",
        intent: "closing",
        title: "结束判断页",
        body: "这里应该落到 timeline 槽位，但语义是结束页。",
        bullets: ["观察点", "下一步", "底线判断"],
        closingItems: [
          { label: "01", detail: "先锁定判断" },
          { label: "02", detail: "再给下一步" },
        ],
      },
      {
        layout: "spotlight",
        intent: "spotlight",
        title: "证据页",
        body: "这里应该落到 evidence 槽位。",
        bullets: ["事实锚点", "复述证据", "支持判断"],
        spotlightItems: [
          { title: "事实锚点", detail: "先摆出事实" },
          { title: "支持判断", detail: "再说明为什么成立" },
        ],
      },
      {
        layout: "cover",
        intent: "cover",
        title: "封面页",
        body: "封面判断。",
        bullets: ["现状", "冲击", "外溢"],
      },
      {
        layout: "statement",
        intent: "statement",
        title: "宣言页",
        body: "真正的结构性风险在于预期抬升而非单点停摆。",
        bullets: ["预期", "风险溢价", "全球联动"],
      },
      {
        layout: "contents",
        intent: "contents",
        title: "目录页",
        body: "目录摘要。",
        bullets: ["现状", "瓶颈", "影响", "对比", "动作"],
        contentsItems: [
          { index: "01", title: "现状", detail: "先看当下" },
          { index: "02", title: "瓶颈", detail: "再看卡点" },
        ],
      },
      {
        layout: "comparison",
        intent: "comparison",
        title: "对照页",
        body: "这里应该落到 comparison 槽位。",
        bullets: ["变量一", "变量二", "变量三", "变量四"],
        comparisonItems: [
          { label: "A", title: "变量一", detail: "先看供给" },
          { label: "B", title: "变量二", detail: "再看成本" },
        ],
      },
    ],
  }

  const normalized = normalizeLeadToolPptPlan(rawPlan, request, style)

  assert.deepEqual(
    normalized.slides.map((slide) => ({ layout: slide.layout, intent: slide.intent, title: slide.title })),
    [
      { layout: "cover", intent: "cover", title: "封面页" },
      { layout: "agenda", intent: "contents", title: "目录页" },
      { layout: "insight", intent: "statement", title: "宣言页" },
      { layout: "comparison", intent: "comparison", title: "对照页" },
      { layout: "evidence", intent: "spotlight", title: "证据页" },
      { layout: "stats", intent: "stats", title: "数据页" },
      { layout: "chart", intent: "chart", title: "图示页" },
      { layout: "process", intent: "process", title: "执行路径页" },
      { layout: "timeline", intent: "closing", title: "结束判断页" },
    ],
  )
  assert.deepEqual(normalized.slides[3]?.comparisonItems?.[0], { label: "A", title: "变量一", detail: "先看供给" })
  assert.deepEqual(normalized.slides[1]?.contentsItems?.[0], { index: "01", title: "现状", detail: "先看当下" })
  assert.deepEqual(normalized.slides[4]?.spotlightItems?.[0], { title: "事实锚点", detail: "先摆出事实" })
  assert.deepEqual(normalized.slides[5]?.metricItems?.[0], { value: "03", label: "关键指标", note: "影响决策" })
  assert.deepEqual(normalized.slides[6]?.chartItems?.[0], { label: "A", value: 72, detail: "外溢起点" })
  assert.deepEqual(normalized.slides[7]?.processItems?.[0], { step: "01", title: "识别", detail: "先确认来源" })
  assert.deepEqual(normalized.slides[8]?.closingItems?.[0], { label: "01", detail: "先锁定判断" })
  assert.equal(normalized.slides[7]?.nativePageType, "action-broadside")
  assert.deepEqual(normalized.slides[7]?.structuredFields, ["processItems"])
  assert.equal(normalized.slides[8]?.nativePageType, "closing-broadside")
  assert.deepEqual(normalized.slides[8]?.structuredFields, ["closingItems"])
})

test("template capability registry exposes native page types and fallback sources", () => {
  const slots = getPptPreviewStyleSlots("ppt169_sugar_rush_memphis")
  const chartSlot = slots.find((slot) => slot.layout === "chart")
  const processSlot = slots.find((slot) => slot.layout === "process")

  assert.deepEqual(chartSlot, {
    layout: "chart",
    intent: "chart",
    nativePageType: "brand-chart-board",
    structuredFields: ["chartItems"],
    visualPriority: "data",
    fallbackIntents: ["comparison", "stats", "spotlight"],
  })
  assert.deepEqual(processSlot, {
    layout: "process",
    intent: "process",
    nativePageType: "brand-flow-track",
    structuredFields: ["processItems"],
    visualPriority: "flow",
    fallbackIntents: ["closing", "contents", "spotlight"],
  })
})

test("mock preview slides carry template schema metadata and capability labels", () => {
  const deck = buildMockPptPreview({
    prompt: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
    scenario: "marketing-campaign",
    language: "zh-CN",
    model: "gpt-5.4",
    templateMode: "single-template",
    templateId: "long-table",
  })
  const longTable = deck.variants.find((variant) => variant.styleKey === "ppt169_brutalist_ai_newspaper_2026")

  assert.ok(longTable)
  assert.equal(longTable?.slides[7]?.nativePageType, "schedule-ledger")
  assert.deepEqual(longTable?.slides[7]?.structuredFields, ["processItems"])

  const label = buildPptPreviewTemplateCapabilityLabel("ppt169_brutalist_ai_newspaper_2026", "zh-CN")
  assert.match(label, /process: schedule-ledger/)
  assert.match(label, /结构字段: processItems/)
  assert.match(label, /退化来源: closing -> contents -> spotlight/)
})

test("isLowInformationPptPlan rejects prompt clones and hollow template labels", () => {
  const request = {
    prompt: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
  }

  const lowInfoPlan = {
    title: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
    outline: [
      "介绍霍尔木兹海峡现状及对全球能源运输的影响 1",
      "介绍霍尔木兹海峡现状及对全球能源运输的影响 2",
      "介绍霍尔木兹海峡现状及对全球能源运输的影响 3",
    ],
    slides: [
      {
        title: "介绍霍尔木兹海峡现状及对全球能源运输的影响 3",
        body: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
        bullets: ["介绍霍尔木兹海峡现状及对全球能源运输的影响", "介绍霍尔木兹海峡现状及对全球能源运输的影响"],
      },
      {
        title: "Step 1",
        body: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
        bullets: ["Step 1", "Section 2", "Signal 3"],
        processItems: [{ step: "01", title: "Step 1", detail: "介绍霍尔木兹海峡现状及对全球能源运输的影响" }],
      },
      {
        title: "介绍霍尔木兹海峡现状及对全球能源运输的影响 4 1",
        body: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
        bullets: ["介绍霍尔木兹海峡现状及对全球能源运输的影响"],
      },
    ],
  }

  assert.equal(isLowInformationPptPlan(lowInfoPlan, request), true)
})

test("isLowInformationPptPlan accepts a deck with style-specific concrete content", () => {
  const request = {
    prompt: "介绍霍尔木兹海峡现状及对全球能源运输的影响",
  }

  const richPlan = {
    title: "霍尔木兹海峡风险如何改写全球油运成本",
    outline: [
      "卡口现状",
      "保费外溢",
      "替代航线",
      "买方暴露",
      "行动顺序",
    ],
    slides: [
      {
        title: "霍尔木兹海峡已从单点通道变成全球油运风险定价器",
        body: "真正抬升成本的不是一次性停航，而是保险、备航和库存预期被同步改写。",
        bullets: ["保费前置抬升", "备航时间拉长", "库存策略前移"],
        comparisonItems: [
          { label: "A", title: "现货油轮", detail: "先暴露在保费跳涨和排队延长" },
          { label: "B", title: "长期合同买家", detail: "更容易通过合同与库存对冲短期波动" },
        ],
      },
      {
        title: "应急动作必须先锁油运、再看炼厂与下游库存",
        body: "处置顺序错误会让运输问题迅速转化成采购和现金流问题。",
        bullets: ["先看船期", "再看库存", "最后调采购"],
        processItems: [
          { step: "01", title: "锁定船期", detail: "先确认受影响船次与替代窗口" },
          { step: "02", title: "重排库存", detail: "把安全库存优先分配给高暴露地区" },
        ],
      },
    ],
  }

  assert.equal(isLowInformationPptPlan(richPlan, request), false)
})

test("normalizeLeadToolPptPlan maps structured researchBrief into fallback slides", () => {
  const style = pptPreviewStyles.find((item) => item.key === "ppt169_pritzker_2026")
  assert.ok(style)

  const request = {
    prompt: "做一份霍尔木兹海峡现状汇报 PPT",
    scenario: "marketing-campaign" as const,
    language: "zh-CN" as const,
    model: "gpt-5.4" as const,
    pageCount: 9,
    researchBrief: {
      topic: "霍尔木兹海峡现状",
      keyFacts: ["保险成本上升", "航运风险溢价扩大", "绕航与备航预期同步抬升"],
      numericEvidence: ["战争险保费升至船体价值的0.3%-0.5%", "部分船期延长7-10天"],
      risks: ["运输成本抬升", "油运报价波动扩大"],
      implications: ["买方库存前移", "先锁船期再调采购"],
      sourceNotes: ["Source A - https://example.com/a"],
      rawSummary: "保险和船期预期同步抬升，正在外溢到油运成本。",
    },
  }

  const rawPlan = {
    title: request.prompt,
    slides: Array.from({ length: 9 }, (_, index) => ({
      title: `${request.prompt} ${index + 1}`,
      body: request.prompt,
      bullets: index % 2 === 0 ? ["Step 1", "Section 2"] : [request.prompt],
    })),
  }

  const normalized = normalizeLeadToolPptPlan(rawPlan, request, style)
  assert.equal(normalized.title, "霍尔木兹海峡现状")
  assert.equal(normalized.slides[0]?.title, "霍尔木兹海峡现状")
  assert.equal(normalized.slides.length, 9)
  assert.equal((normalized.slides[1]?.contentsItems?.length ?? 0) >= 3, true)
})

test("normalizeLeadToolPptPlan maps the yusuan attachment markdown string into business-workbench ppt structure", () => {
  const style = pptPreviewStyles.find((item) => item.key === "ppt169_pritzker_2026")
  assert.ok(style)

  const request = {
    prompt: "基于附件文档生成一份屿算智能企业 AI 业务工具介绍 PPT",
    scenario: "marketing-campaign" as const,
    language: "zh-CN" as const,
    model: "gpt-5.4" as const,
    pageCount: 9,
    researchBrief: yusuanAttachmentMarkdown,
  }

  const rawPlan = {
    title: request.prompt,
    slides: Array.from({ length: 9 }, (_, index) => ({
      title: `${request.prompt} ${index + 1}`,
      body: request.prompt,
      bullets: [request.prompt],
    })),
  }

  const normalized = normalizeLeadToolPptPlan(rawPlan, request, style)

  assert.equal(normalized.title, "屿算智能企业 AI 业务工具介绍")
  assert.equal(normalized.slides[0]?.title, "屿算智能企业 AI 业务工具介绍")
  assert.deepEqual(
    normalized.slides[1]?.contentsItems?.slice(0, 3).map((item) => item.detail),
    [
      "实用 AI 大于 AI 概念",
      "让 AI 进入企业的岗位、流程和结果",
      "企业需要的不是更多工具，而是一套能把问题变成流程的系统",
    ],
  )
  assert.ok(
    [
      "问题越来越多，工具越来越多，但真正能落到业务里的答案越来越少",
      "知道 AI 能写文案、做图片和视频，但接不进真实工作流程",
    ].includes(normalized.slides[3]?.comparisonItems?.[0]?.detail ?? ""),
  )
  assert.equal(
    normalized.slides[4]?.spotlightItems?.[0]?.detail,
    "实用 AI 大于 AI 概念",
  )
  assert.equal(normalized.slides[5]?.metricItems?.[0]?.value, "17")
  assert.match(normalized.slides[5]?.metricItems?.[1]?.note ?? "", /40\+\s*模型与工具接入/u)
  assert.ok(
    [
      {
        step: "01",
        title: "企业真正买到的是一套可执行",
        detail: "企业真正买到的是一套可执行、可管理、可沉淀的 AI 工作方式。",
      },
      {
        step: "01",
        title: "先帮企业问清楚",
        detail: "先帮企业问清楚，再进入立项和执行",
      },
    ].some((candidate) => JSON.stringify(candidate) === JSON.stringify(normalized.slides[7]?.processItems?.[0])),
  )
  assert.ok(
    [
      "企业真正买到的是一套可执行、可管理、可沉淀的 AI 工作方式。",
      "先帮企业问清楚，再进入立项和执行",
    ].includes(normalized.slides[8]?.closingItems?.[0]?.detail ?? ""),
  )
})

test("normalizeLeadToolPptPlan maps the yusuan attachment into business-workbench ppt structure", () => {
  const style = pptPreviewStyles.find((item) => item.key === "ppt169_pritzker_2026")
  assert.ok(style)

  const request = {
    prompt: "基于附件文档生成一份屿算智能企业 AI 业务工具介绍 PPT",
    scenario: "marketing-campaign" as const,
    language: "zh-CN" as const,
    model: "gpt-5.4" as const,
    pageCount: 9,
    researchBrief: buildYusuanResearchBrief(),
  }

  const rawPlan = {
    title: request.prompt,
    slides: Array.from({ length: 9 }, (_, index) => ({
      title: `${request.prompt} ${index + 1}`,
      body: request.prompt,
      bullets: [request.prompt],
    })),
  }

  const normalized = normalizeLeadToolPptPlan(rawPlan, request, style)

  assert.equal(normalized.title, "屿算智能企业 AI 业务工具介绍")
  assert.equal(normalized.slides[0]?.title, "屿算智能企业 AI 业务工具介绍")
  assert.deepEqual(
    normalized.slides[1]?.contentsItems?.slice(0, 3).map((item) => item.detail),
    [
      "实用 AI 大于 AI 概念",
      "让 AI 进入企业的岗位、流程和结果",
      "企业需要的不是更多工具，而是一套能把问题变成流程的系统",
    ],
  )
  assert.equal(
    normalized.slides[3]?.comparisonItems?.[0]?.detail,
    "知道 AI 能写文案、做图片和视频，但接不进真实工作流程",
  )
  assert.equal(
    normalized.slides[4]?.spotlightItems?.[0]?.detail,
    "实用 AI 大于 AI 概念",
  )
  assert.equal(normalized.slides[5]?.metricItems?.[0]?.value, "17")
  assert.equal(
    normalized.slides[5]?.metricItems?.[0]?.note,
    "配置 17 个 AI 智能体员工，覆盖策划、销售、客服、法务、财务、技术、运营等角色",
  )
  assert.deepEqual(
    normalized.slides[7]?.processItems?.[0],
    {
      step: "01",
      title: "先帮企业问清楚",
      detail: "先帮企业问清楚，再进入立项和执行",
    },
  )
  assert.deepEqual(normalized.slides[8]?.closingItems?.[0], {
    label: "01",
    detail: "先帮企业问清楚，再进入立项和执行",
  })
})

test("buildStyleAwarePrompt explicitly instructs researchBrief field mapping", () => {
  const style = pptPreviewStyles.find((item) => item.key === "ppt169_pritzker_2026")
  assert.ok(style)

  const prompt = buildStyleAwarePrompt(
    {
      prompt: "做一份霍尔木兹海峡现状汇报 PPT",
      scenario: "marketing-campaign",
      language: "zh-CN",
      model: "gpt-5.4",
      pageCount: 9,
      researchBrief: {
        topic: "霍尔木兹海峡现状",
        keyFacts: ["保险成本上升"],
        numericEvidence: ["战争险保费升至船体价值的0.3%-0.5%"],
        risks: ["运输成本抬升"],
        implications: ["买方库存前移"],
      },
    },
    {
      key: "ppt169_pritzker_2026",
      slotLabel: "A",
      style,
      templateId: "broadside",
      narrativeAngle: "executive-brief",
    },
  )

  assert.match(prompt, /研究结构映射：keyFacts=1，numericEvidence=1，risks=1，implications=1/)
  assert.match(prompt, /numericEvidence 必须优先进入 stats 或 chart 页/)
  assert.match(prompt, /implications 必须进入 process 或 timeline 页/)
})

test("editable ppt-master planning uses the official template contract instead of local preset guidance", async () => {
  const style = pptPreviewStyles.find((item) => item.key === "ppt169_building_effective_agents")
  assert.ok(style)
  const descriptor = {
    key: "ppt169_building_effective_agents-executive-brief",
    slotLabel: "A" as const,
    style,
    templateId: "ppt169_building_effective_agents",
    narrativeAngle: "executive-brief" as const,
  }
  const reference = await loadPptMasterTemplateReference("ppt169_building_effective_agents")
  const prompt = buildStyleAwarePrompt(
    {
      prompt: "企业 AI 营销工作台",
      scenario: "sales-deck",
      language: "zh-CN",
      previewRuntime: "ppt-master-agent",
      templateMode: "single-template",
      templateId: "ppt169_building_effective_agents",
      pageCount: 8,
    },
    descriptor,
    reference,
  )

  assert.match(prompt, /官方 ppt-master spec_lock\.md/u)
  assert.match(prompt, /- bg: #0F1117/u)
  assert.match(prompt, /- accent: #5B9BD5/u)
  assert.doesNotMatch(prompt, /Neo-Grid Bold/u)
})

test("every imported ppt-master example plans from its official visual contract", async () => {
  const examples = PPT_MASTER_TEMPLATE_MANIFEST.filter((template) => template.id.startsWith("ppt169_"))

  assert.equal(examples.length, 21)

  for (const template of examples) {
    const request = {
      prompt: `生成 ${template.label} 模板的可编辑 PPT`,
      scenario: "sales-deck" as const,
      language: "zh-CN" as const,
      previewRuntime: "ppt-master-agent" as const,
      templateMode: "single-template" as const,
      templateId: template.id,
      pageCount: 9,
    }
    const descriptor = buildPptPreviewVariantDescriptors(request)[0]
    assert.ok(descriptor, `missing variant descriptor for ${template.id}`)

    const reference = await loadPptMasterTemplateReference(template.id)
    const prompt = buildStyleAwarePrompt(request, descriptor, reference)

    assert.equal(prompt.includes(`Use only the official ppt-master template ${template.id}.`), true)
    assert.equal(prompt.includes("spec_lock.md"), true)
    assert.equal(
      ["Neo-Grid Bold", "Long Table", "Playful", "Broadside"].some((preset) => prompt.includes(preset)),
      false,
    )
  }
})

test("runtime slide provider preference honors explicit override", () => {
  assert.equal(resolveLeadToolPreviewProviderPreference("gpt-5.4", "stepfun"), "stepfun")
  assert.equal(resolveLeadToolPreviewProviderPreference("MiniMax-M3", ""), "minimax")
  assert.equal(resolveLeadToolPreviewProviderPreference("unknown-model", "writer"), "writer")
  assert.equal(
    resolveLeadToolPreviewProviderPreference("deepseek-v4-pro", "enterprise-openai-compatible"),
    "deepseek",
  )
})

test("runtime provider errors normalize headers timeout for Railway diagnostics", () => {
  assert.equal(
    normalizePptMasterRuntimeProviderError(
      new Error("Failed after 3 attempts. Last error: Cannot connect to API: Headers Timeout Error"),
      "pptoken",
      "gpt-5.4",
    ),
    "ppt_master_runtime_provider_headers_timeout:pptoken:gpt-5.4",
  )
})

test("deepseek preview messages avoid developer-role system prompts", () => {
  assert.deepEqual(
    buildPreviewProviderMessages({
      providerId: "deepseek",
      systemPrompt: "System policy",
      userPrompt: "User ask",
    }),
    {
      system: undefined,
      prompt: "System instructions:\nSystem policy\n\nUser request:\nUser ask",
    },
  )

  assert.deepEqual(
    buildPreviewProviderMessages({
      providerId: "pptoken",
      systemPrompt: "System policy",
      userPrompt: "User ask",
    }),
    {
      system: "System policy",
      prompt: "User ask",
    },
  )
})

test("deepseek preview provider timeout is longer than default runtime providers", () => {
  const previousDefaultTimeout = process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER_TIMEOUT_MS
  const previousDeepseekTimeout = process.env.LEAD_TOOLS_PPT_PREVIEW_DEEPSEEK_TIMEOUT_MS

  delete process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER_TIMEOUT_MS
  delete process.env.LEAD_TOOLS_PPT_PREVIEW_DEEPSEEK_TIMEOUT_MS

  assert.equal(getLeadToolPreviewProviderTimeoutMs("pptoken"), 45_000)
  assert.equal(getLeadToolPreviewProviderTimeoutMs("deepseek"), 120_000)

  process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER_TIMEOUT_MS = "50000"
  process.env.LEAD_TOOLS_PPT_PREVIEW_DEEPSEEK_TIMEOUT_MS = "130000"

  assert.equal(getLeadToolPreviewProviderTimeoutMs("pptoken"), 50_000)
  assert.equal(getLeadToolPreviewProviderTimeoutMs("deepseek"), 130_000)

  if (previousDefaultTimeout === undefined) {
    delete process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER_TIMEOUT_MS
  } else {
    process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER_TIMEOUT_MS = previousDefaultTimeout
  }

  if (previousDeepseekTimeout === undefined) {
    delete process.env.LEAD_TOOLS_PPT_PREVIEW_DEEPSEEK_TIMEOUT_MS
  } else {
    process.env.LEAD_TOOLS_PPT_PREVIEW_DEEPSEEK_TIMEOUT_MS = previousDeepseekTimeout
  }
})

test("deepseek preview timeout can inherit a longer slide runtime window", () => {
  assert.equal(getLeadToolPreviewProviderTimeoutMs("deepseek"), 120_000)
})

test("runtime slide execution uses dedicated runtime slide model/provider config", () => {
  const previousRuntimeSlideModel = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  const previousRuntimeSlideProvider = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER

  process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = "gpt-5.4"
  process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = "pptoken"

  assert.deepEqual(
    resolveRuntimeSlideExecutionConfig({
      previewModel: "deepseek-v4-pro",
      provider: "deepseek",
    } as any),
    {
      requestedModel: "gpt-5.4",
      preferredProviderId: "pptoken",
    },
  )

  if (previousRuntimeSlideModel === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = previousRuntimeSlideModel
  }

  if (previousRuntimeSlideProvider === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = previousRuntimeSlideProvider
  }
})

test("runtime slide execution prefers explicit deck-level config before env fallback", () => {
  const previousRuntimeSlideModel = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  const previousRuntimeSlideProvider = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER

  process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = "MiniMax-M3"
  process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = "minimax"

  assert.deepEqual(
    resolveRuntimeSlideExecutionConfig({
      previewModel: "deepseek-v4-pro",
      provider: "deepseek",
      runtimeSlideModel: "gpt-5.4",
      runtimeSlideProvider: "pptoken",
    } as any),
    {
      requestedModel: "gpt-5.4",
      preferredProviderId: "pptoken",
    },
  )

  if (previousRuntimeSlideModel === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = previousRuntimeSlideModel
  }

  if (previousRuntimeSlideProvider === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = previousRuntimeSlideProvider
  }
})

test("runtime slide execution infers provider from runtime slide model when provider override is absent", () => {
  const previousRuntimeSlideModel = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  const previousRuntimeSlideProvider = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER

  process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = "MiniMax-M2.7-highspeed"
  delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER

  assert.deepEqual(
    resolveRuntimeSlideExecutionConfig({
      previewModel: "deepseek-v4-pro",
      provider: "deepseek",
    } as any),
    {
      requestedModel: "MiniMax-M2.7-highspeed",
      preferredProviderId: "minimax",
    },
  )

  if (previousRuntimeSlideModel === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = previousRuntimeSlideModel
  }

  if (previousRuntimeSlideProvider === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = previousRuntimeSlideProvider
  }
})

test("runtime slide execution infers glm provider from runtime slide model when provider override is absent", () => {
  const previousRuntimeSlideModel = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  const previousRuntimeSlideProvider = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER

  process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = "glm-5.2"
  delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER

  assert.deepEqual(
    resolveRuntimeSlideExecutionConfig({
      previewModel: "deepseek-v4-pro",
      provider: "deepseek",
    } as any),
    {
      requestedModel: "glm-5.2",
      preferredProviderId: "glm",
    },
  )

  if (previousRuntimeSlideModel === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL = previousRuntimeSlideModel
  }

  if (previousRuntimeSlideProvider === undefined) {
    delete process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER
  } else {
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER = previousRuntimeSlideProvider
  }
})

test("resolveLeadToolPreviewProviderPreference accepts explicit glm provider and glm models", () => {
  assert.equal(resolveLeadToolPreviewProviderPreference("glm-5.2", undefined), "glm")
  assert.equal(resolveLeadToolPreviewProviderPreference("gpt-5.4", "glm"), "glm")
})

test("deepseek writer preview planning falls back to structured object generation when freeform JSON is missing", async (t) => {
  let structuredCalls = 0

  t.after(() => {
    setLeadToolPptGenerationDepsForTests(null)
  })

  setLeadToolPptGenerationDepsForTests({
    generateTextWithWriterModel: (async () => "not json at all") as any,
    generateStructuredObjectWithWriterModel: (async () => {
      structuredCalls += 1
      return {
        title: "Enterprise AI Workflow Deck",
        outline: ["Why now", "System", "Workflow", "Proof"],
        slides: [
          {
            layout: "cover",
            intent: "cover",
            title: "Enterprise AI Workflow Deck",
            body: "A concise intro to the workflow.",
            bullets: ["AI workflow", "enterprise adoption"],
          },
          {
            layout: "agenda",
            intent: "contents",
            title: "Agenda",
            body: "What we will cover.",
            bullets: ["Why now", "System", "Workflow", "Proof"],
            contentsItems: [
              { index: "01", title: "Why now", detail: "Business trigger" },
              { index: "02", title: "System", detail: "Operating model" },
            ],
          },
          {
            layout: "insight",
            intent: "statement",
            title: "AI workflows compress execution time",
            body: "Teams move from fragmented tools to a reusable system.",
            bullets: ["Shared process", "Fewer manual hops", "Reusable outputs"],
          },
          {
            layout: "comparison",
            intent: "comparison",
            title: "Before and after the workflow",
            body: "Structured process replaces fragmented tool usage.",
            bullets: ["Before", "After"],
            comparisonItems: [
              { label: "A", title: "Fragmented", detail: "Tool-by-tool execution" },
              { label: "B", title: "Systematic", detail: "Workflow-based execution" },
            ],
          },
        ],
      }
    }) as any,
  })

  const deck = await generateLeadToolPptStoryDeck({
    prompt: "Build an enterprise AI workflow deck",
    scenario: "sales-deck",
    language: "zh-CN",
    model: "deepseek-v4-pro",
    pageCount: 4,
    preferredProviderId: "aiberm",
    templateMode: "single-template",
    templateId: "ppt169_building_effective_agents",
  })

  assert.equal(structuredCalls > 0, true)
  assert.equal(deck.variants.length > 0, true)
  assert.equal(deck.title, "Enterprise AI Workflow Deck")
})
