import assert from "node:assert/strict"
import test from "node:test"

import { isLowInformationPptPlan, normalizeLeadToolPptPlan } from "./generation-ppt-fixed"
import {
  buildMockPptPreview,
  buildPptPreviewTemplateCapabilityLabel,
  getPptPreviewStyleSlots,
  pptPreviewStyles,
} from "./ppt-preview-data-fixed"

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
  })
  const broadside = deck.variants.find((variant) => variant.key === "ppt169_pritzker_2026")

  assert.ok(broadside)
  assert.equal(broadside?.slides[7]?.nativePageType, "action-broadside")
  assert.deepEqual(broadside?.slides[7]?.structuredFields, ["processItems"])

  const label = buildPptPreviewTemplateCapabilityLabel("ppt169_pritzker_2026", "zh-CN")
  assert.match(label, /process: action-broadside/)
  assert.match(label, /结构字段: processItems/)
  assert.match(label, /退化来源: closing -> spotlight -> contents/)
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
