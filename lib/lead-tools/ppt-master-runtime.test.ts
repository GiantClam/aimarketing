import assert from "node:assert/strict"
import test from "node:test"

import { __testables__ } from "./ppt-master-runtime"

test("ppt master runtime prefers explicit python env and falls back to python3", () => {
  const previous = process.env.PPT_MASTER_PYTHON_BIN

  try {
    process.env.PPT_MASTER_PYTHON_BIN = "/custom/python"
    assert.deepEqual(__testables__.getPptMasterPythonCandidates(), ["/custom/python", "python", "python3"])

    delete process.env.PPT_MASTER_PYTHON_BIN
    assert.deepEqual(__testables__.getPptMasterPythonCandidates(), ["python", "python3"])
  } finally {
    if (previous === undefined) {
      delete process.env.PPT_MASTER_PYTHON_BIN
    } else {
      process.env.PPT_MASTER_PYTHON_BIN = previous
    }
  }
})

test("runtime deck normalization trims long agenda copy before export", () => {
  const normalized = __testables__.normalizeRuntimeDeckCopy({
    title: "霍尔木兹海峡风险如何改写全球油运成本",
    scenario: "marketing-campaign",
    language: "zh-CN",
    generatedAt: "2026-06-24T00:00:00.000Z",
    outline: ["卡口现状", "保费外溢", "替代航线", "买方暴露", "行动顺序"],
    source: "live",
    variants: [
      {
        key: "variant-a",
        styleKey: "ppt169_pritzker_2026",
        name: "Pritzker Editorial",
        summary: "summary",
        stylePrompt: "editorial poster",
        palette: {
          background: "#f6efe8",
          foreground: "#171312",
          accent: "#ff6436",
          panel: "#f1e5d8",
          border: "#5f4b40",
        },
        strengths: ["editorial"],
        slides: [
          {
            id: "s1",
            layout: "agenda",
            intent: "contents",
            kicker: "结构总览",
            title: "先看卡口现状，再看保费外溢、替代航线、买方暴露与行动顺序",
            body: "这不是单纯的地缘事件复述，而是围绕运输成本、交付节奏与采购响应的结构化拆解，需要在一页内保持可读。",
            bullets: ["卡口现状", "保费外溢", "替代航线", "买方暴露", "行动顺序与处置节奏"],
            accent: "#ff6436",
          },
        ],
      },
    ],
  } as any)

  const slide = normalized.variants[0]?.slides[0]
  assert.ok(slide)
  assert.equal(slide?.title, "先看卡口现状，再看保费外溢、替代航线、买方…")
  assert.equal(slide?.body.endsWith("…"), true)
  assert.equal(slide?.bullets[4], "行动顺序与处置节奏")
})

test("emergency runtime svg renders agenda slide and marks timeout as recoverable", () => {
  assert.equal(__testables__.isRecoverableRuntimeSlideFailure("ppt_master_runtime_slide_timeout"), true)
  assert.equal(__testables__.isRecoverableRuntimeSlideFailure("provider_quota_exceeded"), false)

  const svg = __testables__.buildEmergencyRuntimeSvg({
    deck: {
      title: "霍尔木兹海峡风险如何改写全球油运成本",
      scenario: "marketing-campaign",
      language: "zh-CN",
      generatedAt: "2026-06-24T00:00:00.000Z",
      outline: ["卡口现状", "保费外溢", "替代航线", "买方暴露"],
      source: "live",
      variants: [],
    } as any,
    variant: {
      key: "variant-a",
      styleKey: "ppt169_pritzker_2026",
      name: "Pritzker Editorial",
      summary: "summary",
      stylePrompt: "editorial poster",
      palette: {
        background: "#f6efe8",
        foreground: "#171312",
        accent: "#ff6436",
        panel: "#f1e5d8",
        border: "#5f4b40",
      },
      strengths: ["editorial"],
      slides: [],
    } as any,
    slide: {
      id: "s1",
      layout: "agenda",
      intent: "contents",
      kicker: "结构总览",
      title: "先看卡口现状，再看保费外溢、替代航线与买方暴露",
      body: "这页需要在超时后仍然可以稳定导出。",
      bullets: ["卡口现状", "保费外溢", "替代航线", "买方暴露"],
      accent: "#ff6436",
    } as any,
    slideIndex: 1,
    projectDir: "/tmp/project",
    slideFileBaseName: "02_agenda",
    designSpecPath: "/tmp/project/design_spec.md",
    specLockPath: "/tmp/project/spec_lock.json",
    sourceBriefPath: "/tmp/project/source_brief.md",
    previousSlides: [],
  })

  assert.match(svg, /<svg/u)
  assert.match(svg, /结构总览/u)
  assert.match(svg, /agenda-row-1/u)
})

test("runtime deck normalization uses tighter limits for insight and timeline slides", () => {
  const normalized = __testables__.normalizeRuntimeDeckCopy({
    title: "霍尔木兹海峡风险如何改写全球油运成本",
    scenario: "marketing-campaign",
    language: "zh-CN",
    generatedAt: "2026-06-24T00:00:00.000Z",
    outline: ["判断", "行动"],
    source: "live",
    variants: [
      {
        key: "variant-a",
        styleKey: "ppt169_pritzker_2026",
        name: "Pritzker Editorial",
        summary: "summary",
        stylePrompt: "editorial poster",
        palette: {
          background: "#f6efe8",
          foreground: "#171312",
          accent: "#ff6436",
          panel: "#f1e5d8",
          border: "#5f4b40",
        },
        strengths: ["editorial"],
        slides: [
          {
            id: "s1",
            layout: "insight",
            intent: "statement",
            kicker: "核心宣言",
            title: "航道在动，风险没有退；恢复通行，只是把焦虑从停摆改成高价与不确定",
            body: "恢复节奏并不线性，通行回升仍被安全预期、费用与等待时间反复拉扯，管理层不能把恢复误判为常态。",
            bullets: ["约162艘油轮曾滞留，牵动约1.2亿桶原油", "部分油轮日租金逼近28万美元/天"],
            accent: "#ff6436",
          },
          {
            id: "s2",
            layout: "timeline",
            intent: "closing",
            kicker: "下一张告示",
            title: "现在就要定案，先排顺序，再赌恢复；晚一天，成本与被动都会放大",
            body: "把霍尔木兹风险当作常态情景，而不是一次性冲击，决策顺序必须前移。",
            bullets: ["锁定关键船期、保险额度与高优先货盘", "调整采购批次与到港节奏，前移准备", "建立绕行航线、替代货源与库存缓冲"],
            accent: "#ff6436",
          },
        ],
      },
    ],
  } as any)

  const insightSlide = normalized.variants[0]?.slides[0]
  const timelineSlide = normalized.variants[0]?.slides[1]
  assert.equal(insightSlide?.title.endsWith("…"), true)
  assert.equal(insightSlide?.body.endsWith("…"), true)
  assert.equal(insightSlide?.bullets[0]?.endsWith("…"), true)
  assert.equal(timelineSlide?.title.endsWith("…"), true)
  assert.equal(timelineSlide?.body.endsWith("…"), true)
  assert.equal(timelineSlide?.bullets[0]?.endsWith("…"), true)
})

test("runtime svg validator falls back when timeline title is duplicated", () => {
  const reason = __testables__.shouldFallbackForGeneratedSvg(
    {
      deck: {
        title: "deck",
        scenario: "marketing-campaign",
        language: "zh-CN",
        generatedAt: "2026-06-24T00:00:00.000Z",
        outline: [],
        variants: [],
      } as any,
      variant: {
        key: "variant-a",
        styleKey: "ppt169_pritzker_2026",
        name: "Pritzker Editorial",
        summary: "summary",
        stylePrompt: "editorial poster",
        palette: {
          background: "#f6efe8",
          foreground: "#171312",
          accent: "#ff6436",
          panel: "#f1e5d8",
          border: "#5f4b40",
        },
        strengths: ["editorial"],
        slides: [],
      } as any,
      slide: {
        id: "s1",
        layout: "timeline",
        intent: "closing",
        kicker: "下一张告示",
        title: "现在就要定案",
        body: "body",
        bullets: ["a", "b", "c"],
        accent: "#ff6436",
      } as any,
      slideIndex: 3,
      projectDir: "/tmp/project",
      slideFileBaseName: "04_timeline",
      designSpecPath: "/tmp/project/design_spec.md",
      specLockPath: "/tmp/project/spec_lock.json",
      sourceBriefPath: "/tmp/project/source_brief.md",
      previousSlides: [],
    },
    "<svg><text>现在就要定案</text><text>现在就要定案</text></svg>",
  )

  assert.equal(reason, "ppt_master_runtime_svg_duplicate_title")
})

test("runtime prefers deterministic svg for zh insight and timeline slides", () => {
  const makeContext = (layout: "insight" | "timeline" | "agenda", language: "zh-CN" | "en-US") =>
    ({
      deck: {
        title: "deck",
        scenario: "marketing-campaign",
        language,
        generatedAt: "2026-06-24T00:00:00.000Z",
        outline: [],
        variants: [],
      } as any,
      variant: {
        key: "variant-a",
        styleKey: "ppt169_pritzker_2026",
        name: "Pritzker Editorial",
        summary: "summary",
        stylePrompt: "editorial poster",
        palette: {
          background: "#f6efe8",
          foreground: "#171312",
          accent: "#ff6436",
          panel: "#f1e5d8",
          border: "#5f4b40",
        },
        strengths: ["editorial"],
        slides: [],
      } as any,
      slide: {
        id: "s1",
        layout,
        intent: layout === "agenda" ? "contents" : layout === "timeline" ? "closing" : "statement",
        kicker: "kicker",
        title: "title",
        body: "body",
        bullets: ["a", "b", "c"],
        accent: "#ff6436",
      } as any,
      slideIndex: 0,
      projectDir: "/tmp/project",
      slideFileBaseName: "01",
      designSpecPath: "/tmp/project/design_spec.md",
      specLockPath: "/tmp/project/spec_lock.json",
      sourceBriefPath: "/tmp/project/source_brief.md",
      previousSlides: [],
    }) as any

  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("insight", "zh-CN")), true)
  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("timeline", "zh-CN")), true)
  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("agenda", "zh-CN")), false)
  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("insight", "en-US")), false)
})
