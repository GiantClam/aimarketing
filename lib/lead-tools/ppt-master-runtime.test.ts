import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { __testables__, materializePptMasterPreviewDeck } from "./ppt-master-runtime"

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

test("runtime repo candidates skip project cache on production and vercel builds", () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const previousNodeEnv = mutableEnv.NODE_ENV
  const previousVercel = mutableEnv.VERCEL

  try {
    delete mutableEnv.VERCEL
    mutableEnv.NODE_ENV = "development"
    assert.match(__testables__.getProjectCachePptMasterCandidate() ?? "", /\.cache\/ppt-master$/u)

    mutableEnv.NODE_ENV = "production"
    assert.equal(__testables__.getProjectCachePptMasterCandidate(), null)

    mutableEnv.NODE_ENV = "development"
    mutableEnv.VERCEL = "1"
    assert.equal(__testables__.getProjectCachePptMasterCandidate(), null)
  } finally {
    if (previousNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV
    } else {
      mutableEnv.NODE_ENV = previousNodeEnv
    }

    if (previousVercel === undefined) {
      delete mutableEnv.VERCEL
    } else {
      mutableEnv.VERCEL = previousVercel
    }
  }
})

test("runtime repo candidates also expose upstream cache in development", () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const previousNodeEnv = mutableEnv.NODE_ENV
  const previousVercel = mutableEnv.VERCEL

  try {
    delete mutableEnv.VERCEL
    mutableEnv.NODE_ENV = "development"
    assert.match(__testables__.getProjectCachePptMasterUpstreamCandidate() ?? "", /\.cache\/ppt-master-upstream$/u)

    mutableEnv.NODE_ENV = "production"
    assert.equal(__testables__.getProjectCachePptMasterUpstreamCandidate(), null)
  } finally {
    if (previousNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV
    } else {
      mutableEnv.NODE_ENV = previousNodeEnv
    }

    if (previousVercel === undefined) {
      delete mutableEnv.VERCEL
    } else {
      mutableEnv.VERCEL = previousVercel
    }
  }
})

test("runtime resolves official template sources across layout deck and example libraries", async () => {
  const repoDir = path.resolve(process.cwd(), ".cache", "ppt-master-upstream")

  const layoutSource = await __testables__.resolveOfficialTemplateSource(repoDir, "academic_defense")
  const deckSource = await __testables__.resolveOfficialTemplateSource(repoDir, "招商银行")
  const exampleSource = await __testables__.resolveOfficialTemplateSource(
    repoDir,
    "ppt169_building_effective_agents",
  )

  assert.equal(layoutSource?.kind, "layout")
  assert.match(layoutSource?.sourcePathLabel ?? "", /layouts\/academic_defense\/$/u)
  assert.equal(deckSource?.kind, "deck")
  assert.match(deckSource?.sourcePathLabel ?? "", /decks\/招商银行\/$/u)
  assert.equal(exampleSource?.kind, "example")
  assert.match(exampleSource?.sourcePathLabel ?? "", /examples\/ppt169_building_effective_agents\/$/u)
})

test("runtime materializes official deck templates into project templates and images", async () => {
  const repoDir = path.resolve(process.cwd(), ".cache", "ppt-master-upstream")
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-master-runtime-deck-"))

  try {
    await fs.mkdir(path.join(projectDir, "templates"), { recursive: true })
    await fs.mkdir(path.join(projectDir, "images"), { recursive: true })

    const reference = await __testables__.materializeOfficialTemplateAssets(repoDir, projectDir, "招商银行")

    assert.equal(reference?.kind, "deck")
    assert.equal(reference?.templateId, "招商银行")
    assert.equal(reference?.designSpecTitle, "China Merchants Bank Transaction Banking - Design Specification")
    assert.equal(await fs.readFile(path.join(projectDir, "templates", "01_cover.svg"), "utf8").then(Boolean), true)
    assert.equal(await fs.readFile(path.join(projectDir, "images", "cover_bg.png")).then(Boolean), true)
    assert.equal(reference?.referenceSvgFiles.includes("01_cover.svg"), true)
    assert.equal(reference?.imageFiles.includes("cover_bg.png"), true)
  } finally {
    await fs.rm(projectDir, { recursive: true, force: true })
  }
})

test("runtime materializes official example projects without copying exported pptx artifacts", async () => {
  const repoDir = path.resolve(process.cwd(), ".cache", "ppt-master-upstream")
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-master-runtime-example-"))

  try {
    await fs.mkdir(path.join(projectDir, "templates"), { recursive: true })
    await fs.mkdir(path.join(projectDir, "images"), { recursive: true })

    const reference = await __testables__.materializeOfficialTemplateAssets(
      repoDir,
      projectDir,
      "ppt169_building_effective_agents",
    )

    assert.equal(reference?.kind, "example")
    assert.equal(reference?.templateId, "ppt169_building_effective_agents")
    assert.match(reference?.designSpecTitle ?? "", /Building Effective Agents/u)
    assert.equal(await fs.readFile(path.join(projectDir, "templates", "notes", "01_cover.md"), "utf8").then(Boolean), true)
    assert.equal(
      await fs.readFile(path.join(projectDir, "templates", "svg_output", "01_cover.svg"), "utf8").then(Boolean),
      true,
    )
    assert.equal(await fs.readFile(path.join(projectDir, "images", "image.png")).then(Boolean), true)
    await assert.rejects(fs.access(path.join(projectDir, "templates", "exports", "building_effective_agents.pptx")))
  } finally {
    await fs.rm(projectDir, { recursive: true, force: true })
  }
})

test("runtime deck normalization preserves agenda copy for slide generation", () => {
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
        templateId: "broadside",
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
  assert.equal(slide?.title, "先看卡口现状，再看保费外溢、替代航线、买方暴露与行动顺序")
  assert.equal(
    slide?.body,
    "这不是单纯的地缘事件复述，而是围绕运输成本、交付节奏与采购响应的结构化拆解，需要在一页内保持可读。",
  )
  assert.equal(slide?.bullets[4], "行动顺序与处置节奏")
})

test("emergency runtime svg renders agenda slide without treating provider timeout as recoverable", () => {
  assert.equal(__testables__.isRecoverableRuntimeSlideFailure("ppt_master_runtime_slide_timeout"), false)
  assert.equal(
    __testables__.isRecoverableRuntimeSlideFailure(
      "ppt_master_runtime_provider_timeout:minimax:MiniMax-M2.7-highspeed",
    ),
    false,
  )
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

test("runtime records provider timeouts and continues later slides without fallback or retry", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const previousRepoDir = mutableEnv.PPT_MASTER_REPO_DIR
  const previousStore = mutableEnv.PPT_MASTER_SESSION_STORE
  const previousFallback = mutableEnv.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK

  mutableEnv.PPT_MASTER_REPO_DIR = path.resolve(process.cwd(), ".cache", "ppt-master-upstream")
  mutableEnv.PPT_MASTER_SESSION_STORE = "filesystem"
  mutableEnv.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK = "false"

  try {
    const calls: number[] = []
    const deck = await materializePptMasterPreviewDeck(
      {
        title: "Provider timeout deck",
        scenario: "training",
        language: "zh-CN",
        generatedAt: "2026-07-10T00:00:00.000Z",
        outline: ["one", "two", "three"],
        source: "live",
        provider: "minimax",
        previewModel: "MiniMax-M2.7-highspeed",
        variants: [
          {
            key: "timeout-variant",
            templateId: "ppt169_glassmorphism_demo",
            styleKey: "ppt169_glassmorphism_demo",
            name: "Glass",
            summary: "summary",
            stylePrompt: "glass",
            palette: {
              background: "#ffffff",
              foreground: "#111111",
              accent: "#2563eb",
              panel: "#f8fafc",
              border: "#cbd5e1",
            },
            strengths: ["clear"],
            slides: [
              {
                id: "s1",
                layout: "cover",
                intent: "open",
                kicker: "Intro",
                title: "Slide One",
                body: "First slide",
                bullets: ["Alpha"],
                accent: "#2563eb",
              },
              {
                id: "s2",
                layout: "comparison",
                intent: "compare",
                kicker: "Compare",
                title: "Slide Two",
                body: "Timeout slide",
                bullets: ["Beta"],
                accent: "#2563eb",
              },
              {
                id: "s3",
                layout: "closing",
                intent: "close",
                kicker: "Close",
                title: "Slide Three",
                body: "Third slide",
                bullets: ["Gamma"],
                accent: "#2563eb",
              },
            ],
          },
        ],
      } as any,
      {
        async generateSlideSvg(context) {
          calls.push(context.slideIndex)
          if (context.slideIndex === 1) {
            throw new Error("ppt_master_runtime_provider_timeout:minimax:MiniMax-M2.7-highspeed")
          }

          return {
            provider: "minimax",
            model: "MiniMax-M2.7-highspeed",
            svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect x="0" y="0" width="1280" height="720" fill="#ffffff"/>
  <text x="80" y="120" font-size="40" fill="#111111">${context.slide.title}</text>
</svg>`,
          }
        },
      },
    )

    assert.deepEqual(calls, [0, 1, 2])
    assert.equal(deck.variants[0]?.preview?.slides.length, 2)

    const sessionId = deck.previewSessionId
    assert.ok(sessionId)
    const manifest = await __testables__.readManifest(sessionId)
    const runs = manifest.variants[0]?.runtimeDiagnostics?.slideRuns ?? []
    assert.equal(runs.length, 3)
    assert.equal(runs[1]?.status, "failed")
    assert.equal(runs[1]?.fallbackReason, null)
    assert.equal(runs[1]?.error, "ppt_master_runtime_provider_timeout:minimax:MiniMax-M2.7-highspeed")
    assert.equal(runs[2]?.status, "success")
  } finally {
    if (previousRepoDir === undefined) {
      delete mutableEnv.PPT_MASTER_REPO_DIR
    } else {
      mutableEnv.PPT_MASTER_REPO_DIR = previousRepoDir
    }

    if (previousStore === undefined) {
      delete mutableEnv.PPT_MASTER_SESSION_STORE
    } else {
      mutableEnv.PPT_MASTER_SESSION_STORE = previousStore
    }

    if (previousFallback === undefined) {
      delete mutableEnv.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK
    } else {
      mutableEnv.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK = previousFallback
    }
  }
})

test("runtime svg preparation keeps the richest svg when the model returns multiple candidates", () => {
  const normalized = __testables__.prepareGeneratedSvg(`
<svg xmlns="http://www.w3.org/2000/svg"><g id="draft"></g></svg>

For the Broadside style with agenda layout:
- try a stronger second composition

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#111111"/>
  <text x="60" y="80">栏目排版</text>
</svg>
  `)

  assert.match(normalized, /viewBox="0 0 1280 720"/u)
  assert.match(normalized, /栏目排版/u)
  assert.doesNotMatch(normalized, /For the Broadside style/u)
  assert.equal(normalized.match(/<svg/gu)?.length, 1)
})

test("runtime svg preparation removes placeholder ellipses from the svg opening tag", () => {
  const normalized = __testables__.prepareGeneratedSvg(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" ... width="1280" height="720">
  <rect width="1280" height="720" fill="#ffffff"/>
</svg>
  `)

  assert.match(normalized, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1280 720" width="1280" height="720">/u)
  assert.doesNotMatch(normalized, /<svg[^>]*\.\.\./u)
})

test("runtime svg preparation removes bare prose leaked inside svg documents", () => {
  const normalized = __testables__.prepareGeneratedSvg(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">. It is recommended but not required.

Now final answer: Provide SVG as described.

But check constraints: "不要使用 <style>、class、mask、foreignObject、textPath、symbol、script、animate、iframe，也不要使用 <g opacity>。"
  <rect width="1280" height="720" fill="#ffffff"/>
  <text x="60" y="80">可编辑 PPT 回归</text>
</svg>
  `)

  assert.match(normalized, /<rect width="1280" height="720"/u)
  assert.match(normalized, /可编辑 PPT 回归/u)
  assert.doesNotMatch(normalized, /It is recommended|Now final answer|不要使用 <style>|<g opacity>/u)
})

test("runtime svg preparation removes orphan think tags leaked before the svg root", () => {
  const normalized = __testables__.prepareGeneratedSvg(`
</think>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#ffffff"/>
  <text x="60" y="80">课堂结论</text>
</svg>
  `)

  assert.match(normalized, /<svg/u)
  assert.match(normalized, /课堂结论/u)
  assert.doesNotMatch(normalized, /<\/?think>/u)
})

test("runtime deck normalization preserves insight and timeline copy for slide generation", () => {
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
        templateId: "broadside",
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
  assert.equal(
    insightSlide?.title,
    "航道在动，风险没有退；恢复通行，只是把焦虑从停摆改成高价与不确定",
  )
  assert.equal(
    insightSlide?.body,
    "恢复节奏并不线性，通行回升仍被安全预期、费用与等待时间反复拉扯，管理层不能把恢复误判为常态。",
  )
  assert.equal(insightSlide?.bullets[0], "约162艘油轮曾滞留，牵动约1.2亿桶原油")
  assert.equal(
    timelineSlide?.title,
    "现在就要定案，先排顺序，再赌恢复；晚一天，成本与被动都会放大",
  )
  assert.equal(
    timelineSlide?.body,
    "把霍尔木兹风险当作常态情景，而不是一次性冲击，决策顺序必须前移。",
  )
  assert.equal(timelineSlide?.bullets[0], "锁定关键船期、保险额度与高优先货盘")
})

test("runtime svg validator does not replace generated slides for soft duplicate-title heuristics", () => {
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

  assert.equal(reason, null)
})

test("runtime svg validator rejects multiple svg roots and inline shape prose", () => {
  const context = {
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
      layout: "insight",
      intent: "statement",
      kicker: "判断",
      title: "title",
      body: "body",
      bullets: ["a", "b"],
      accent: "#ff6436",
    } as any,
    slideIndex: 0,
    projectDir: "/tmp/project",
    slideFileBaseName: "01_insight",
    designSpecPath: "/tmp/project/design_spec.md",
    specLockPath: "/tmp/project/spec_lock.json",
    sourceBriefPath: "/tmp/project/source_brief.md",
    previousSlides: [],
  } as any

  assert.equal(
    __testables__.shouldFallbackForGeneratedSvg(
      context,
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/> stray copy<svg xmlns="http://www.w3.org/2000/svg"></svg></svg>',
    ),
    "svg_multiple_roots",
  )
  assert.equal(
    __testables__.shouldFallbackForGeneratedSvg(
      context,
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/> stray copy</svg>',
    ),
    "svg_inline_prose_after_shape",
  )
})

test("runtime keeps original generated svg instead of deterministic replacement", () => {
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

  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("insight", "zh-CN")), false)
  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("timeline", "zh-CN")), false)
  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("agenda", "zh-CN")), false)
  assert.equal(__testables__.shouldUseDeterministicRuntimeSvg(makeContext("insight", "en-US")), false)
})

test("svg postprocess keeps generated svg unchanged", () => {
  const context = {
    deck: {
      title: "deck",
      scenario: "marketing-campaign",
      language: "zh-CN",
      generatedAt: "2026-06-24T00:00:00.000Z",
      outline: [],
      variants: [],
    },
    variant: {
      key: "variant-a",
      templateId: "broadside",
      styleKey: "ppt169_pritzker_2026",
      name: "Broadside",
      summary: "summary",
      stylePrompt: "poster",
      palette: {
        background: "#111111",
        foreground: "#F0ECE5",
        accent: "#E85D26",
        panel: "#1A1A18",
        border: "#282826",
      },
      strengths: ["poster"],
      slides: [],
    },
    slide: {
      id: "s1",
      layout: "agenda",
      intent: "contents",
      kicker: "栏目排版",
      title: "管理层先看这五件事",
      body: "body",
      bullets: [],
      accent: "#E85D26",
    },
  } as any

  const svg =
    '<svg><text x="206" y="586" font-size="29" fill="#F0ECE5">海峡仍是全球能源物流最敏感的关键瓶颈</text><text x="1098" y="112" fill="#F0ECE5">霍尔木兹海峡现状与全球能源运输影响</text><text x="1112" y="638" fill="#F0ECE5">截至2026年6月24日</text></svg>'

  assert.equal(__testables__.postprocessGeneratedSvg(context, svg), svg)
})
