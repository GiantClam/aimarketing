import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

const sampleDeck = {
  title: "Step 3.7 Flash",
  scenario: "marketing-campaign",
  language: "zh-CN",
  generatedAt: "2026-06-02T00:00:00.000Z",
  outline: ["机会窗口", "受众判断", "策略主轴", "执行组合", "转化动作"],
  previewEngine: "ppt-master-project" as const,
  previewSessionId: "preview-session-1",
  provider: "pptoken",
  previewModel: "gpt-5.4",
  variants: [
    {
      key: "ppt169_brutalist_ai_newspaper_2026",
      name: "Long Table",
      summary: "summary",
      stylePrompt: "style prompt",
      palette: {
        background: "#111111",
        foreground: "#ffffff",
        accent: "#ff0000",
        panel: "#222222",
        border: "#333333",
      },
      strengths: ["头版冲击"],
      slides: [
        {
          id: "cover-1",
          layout: "cover",
          kicker: "头版头条",
          title: "Step 3.7 Flash",
          body: "body",
          bullets: ["a", "b"],
          accent: "#ff0000",
        },
        {
          id: "agenda-1",
          layout: "agenda",
          kicker: "版面结构",
          title: "Agenda",
          body: "body",
          bullets: ["a", "b"],
          accent: "#ff0000",
        },
        {
          id: "insight-1",
          layout: "insight",
          kicker: "核心主张",
          title: "Insight",
          body: "body",
          bullets: ["a", "b"],
          accent: "#ff0000",
        },
        {
          id: "comparison-1",
          layout: "comparison",
          kicker: "双栏对照",
          title: "Comparison",
          body: "body",
          bullets: ["a", "b"],
          accent: "#ff0000",
        },
        {
          id: "timeline-1",
          layout: "timeline",
          kicker: "观察节点",
          title: "Timeline",
          body: "body",
          bullets: ["a", "b"],
          accent: "#ff0000",
        },
      ],
      preview: {
        format: "svg" as const,
        themeId: "ppt169_brutalist_ai_newspaper_2026",
        cover: {
          mimeType: "image/svg+xml" as const,
          width: 1280,
          height: 720,
          dataUrl: "data:image/svg+xml;base64,cover",
        },
        slides: [
          {
            mimeType: "image/svg+xml" as const,
            width: 1280,
            height: 720,
            dataUrl: "data:image/svg+xml;base64,slide-1",
          },
        ],
      },
    },
  ],
}

let previewCalls: Array<unknown[]> = []
let finalizeCalls: Array<unknown[]> = []
let downloadCalls: Array<unknown[]> = []
let seoCalls: Array<unknown[]> = []
let previewFailureMessage: string | null = null

let buildLeadToolPreview: typeof import("./runtime").buildLeadToolPreview
let buildLeadToolFinalize: typeof import("./runtime").buildLeadToolFinalize
let buildLeadToolDownload: typeof import("./runtime").buildLeadToolDownload
let LeadToolRuntimeError: typeof import("./runtime").LeadToolRuntimeError

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/lead-tools/catalog") {
    return {
      getLeadToolBySlug: (slug: string) => {
        if (slug === "ai-ppt-preview") {
          return {
            slug,
            status: "live",
            previewEnabled: true,
            downloadRequiresLogin: true,
            finalizeRequiresLogin: true,
          }
        }

        if (slug === "ai-seo-meta-generator") {
          return {
            slug,
            status: "live",
            previewEnabled: true,
            downloadRequiresLogin: false,
            finalizeRequiresLogin: false,
          }
        }

        return null
      },
    }
  }

  if (request === "@/lib/lead-tools/ppt-engines") {
    return {
      getLeadToolPptEngines: () => ({
        preview: {
          buildPreview: async (...args: unknown[]) => {
            previewCalls.push(args)
            const options = (args[1] as { allowMockFallback?: boolean } | undefined) ?? {}
            if (previewFailureMessage && !options.allowMockFallback) {
              throw new Error(previewFailureMessage)
            }
            return {
              previewSessionId: "preview-session-1",
              generatedAt: "2026-06-02T00:00:00.000Z",
              deck: sampleDeck,
              meta: {
                previewEngine: "ppt-master",
                exportEngine: "ppt-master",
                previewRuntime: "ppt-master-agent",
                exportRuntime: "ppt-master-agent",
                mode: "ppt-master-project-preview",
                mockFallback: Boolean(options.allowMockFallback),
              },
            }
          },
        },
        export: {
          buildFinalize: async (...args: unknown[]) => {
            finalizeCalls.push(args)
            return {
              jobId: "job-1",
              status: "ready",
              message: "真实 ppt-master 项目已生成，可直接导出为 PPTX。",
              requestedBy: "user@example.com",
              exportPlan: {
                title: sampleDeck.title,
                selectedVariant: sampleDeck.variants[0]?.name ?? "",
                slideCount: 9,
                output: "editable-pptx",
                finalModel: "gpt-5.4",
              },
            }
          },
          buildDownload: async (...args: unknown[]) => {
            downloadCalls.push(args)
            return {
              artifact: {
                buffer: Buffer.from("pptx"),
                contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                fileName: "step-3.7-flash.pptx",
              },
              deck: sampleDeck,
              variant: sampleDeck.variants[0],
            }
          },
        },
      }),
    }
  }

  if (request === "@/lib/lead-tools/generation") {
    return {
      getLeadToolResolvedModels: () => ({
        previewModel: "preview-model",
        finalModel: "final-model",
      }),
      generateLeadToolSeoPreviewWithFallback: async (...args: unknown[]) => {
        seoCalls.push(args)
        return {
          generatedAt: "2026-06-02T00:00:00.000Z",
          summary: "Generated 3 SEO meta directions",
          directions: [],
        }
      },
    }
  }

  if (request === "@/lib/lead-tools/config") {
    return {
      allowLeadToolMockFallback: () => true,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

test.before(async () => {
  const runtime = await import("./runtime")
  buildLeadToolPreview = runtime.buildLeadToolPreview
  buildLeadToolFinalize = runtime.buildLeadToolFinalize
  buildLeadToolDownload = runtime.buildLeadToolDownload
  LeadToolRuntimeError = runtime.LeadToolRuntimeError
})

test.beforeEach(() => {
  previewCalls = []
  finalizeCalls = []
  downloadCalls = []
  seoCalls = []
  previewFailureMessage = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("ppt preview delegates to the configured preview engine and preserves response shape", async () => {
  const result = await buildLeadToolPreview("ai-ppt-preview", {
    prompt: "做一份介绍 Step 3.7 Flash 的产品",
    scenario: "marketing-campaign",
    language: "zh-CN",
  })

  assert.equal(previewCalls.length, 1)
  assert.deepEqual(previewCalls[0]?.[0], {
    prompt: "做一份介绍 Step 3.7 Flash 的产品",
    scenario: "marketing-campaign",
    language: "zh-CN",
  })
  assert.deepEqual(previewCalls[0]?.[1], {
    allowMockFallback: false,
    resolvedModels: {
      previewModel: "preview-model",
      finalModel: "final-model",
    },
  })
  assert.equal(result.previewSessionId, "preview-session-1")
  assert.equal(result.meta.tool, "ai-ppt-preview")
  assert.ok("previewEngine" in result.meta)
  assert.ok("exportEngine" in result.meta)
  assert.equal(result.meta.previewEngine, "ppt-master")
  assert.equal(result.meta.exportEngine, "ppt-master")
  assert.equal(result.meta.previewRuntime, "ppt-master-agent")
  assert.equal(result.meta.exportRuntime, "ppt-master-agent")
})

test("ppt preview accepts stepfun model values and forwards them to the preview engine", async () => {
  await buildLeadToolPreview("ai-ppt-preview", {
    prompt: "测试阶跃星辰 provider",
    scenario: "marketing-campaign",
    language: "zh-CN",
    model: "step-3.7-flash",
  })

  assert.equal(previewCalls.length, 1)
  assert.deepEqual(previewCalls[0]?.[0], {
    prompt: "测试阶跃星辰 provider",
    scenario: "marketing-campaign",
    language: "zh-CN",
    model: "step-3.7-flash",
  })
})

test("ppt preview falls back to mock rendering when the preferred provider is missing", async () => {
  previewFailureMessage = "lead_tool_provider_missing:minimax:MiniMax-M2.7-highspeed"

  const result = await buildLeadToolPreview("ai-ppt-preview", {
    prompt: "Provider fallback preview",
    scenario: "marketing-campaign",
    language: "en-US",
  })

  assert.equal(previewCalls.length, 2)
  assert.deepEqual(previewCalls[0]?.[1], {
    allowMockFallback: false,
    resolvedModels: {
      previewModel: "preview-model",
      finalModel: "final-model",
    },
  })
  assert.deepEqual(previewCalls[1]?.[1], {
    allowMockFallback: true,
    resolvedModels: {
      previewModel: "preview-model",
      finalModel: "final-model",
    },
  })
  assert.equal(result.meta.tool, "ai-ppt-preview")
  assert.equal(result.meta.mockFallback, true)
  assert.equal(result.meta.providerFallback, "lead_tool_provider_missing:minimax:MiniMax-M2.7-highspeed")
})

test("ppt finalize validates the selected variant before delegating to the export engine", async () => {
  const user = { email: "user@example.com" } as { email: string }

  const result = await buildLeadToolFinalize(
    "ai-ppt-preview",
    {
      deck: sampleDeck,
      selectedVariantKey: "ppt169_brutalist_ai_newspaper_2026",
      previewSessionId: "preview-session-1",
    },
    user as Parameters<typeof buildLeadToolFinalize>[2],
  )

  assert.equal(finalizeCalls.length, 1)
  assert.equal((finalizeCalls[0]?.[0] as { previewSessionId?: string }).previewSessionId, "preview-session-1")
  assert.equal(
    (finalizeCalls[0]?.[0] as { selectedVariant: { key: string } }).selectedVariant.key,
    "ppt169_brutalist_ai_newspaper_2026",
  )
  assert.deepEqual(finalizeCalls[0]?.[1], {
    user,
    resolvedModels: {
      previewModel: "preview-model",
      finalModel: "final-model",
    },
  })
  assert.equal(result.jobId, "job-1")
  assert.equal(result.exportPlan.finalModel, "gpt-5.4")
})

test("ppt download delegates to the export engine after auth and variant validation", async () => {
  const user = { email: "user@example.com" } as { email: string }

  const result = await buildLeadToolDownload(
    "ai-ppt-preview",
    {
      deck: sampleDeck,
      selectedVariantKey: "ppt169_brutalist_ai_newspaper_2026",
      previewSessionId: "preview-session-1",
    },
    user as Parameters<typeof buildLeadToolDownload>[2],
  )

  assert.equal(downloadCalls.length, 1)
  assert.equal(
    (downloadCalls[0]?.[0] as { selectedVariant: { key: string } }).selectedVariant.key,
    "ppt169_brutalist_ai_newspaper_2026",
  )
  assert.equal(result.artifact?.fileName, "step-3.7-flash.pptx")
})

test("ppt download still rejects unauthenticated protected actions before engine execution", async () => {
  await assert.rejects(
    () =>
      buildLeadToolDownload(
        "ai-ppt-preview",
        {
          deck: sampleDeck,
          selectedVariantKey: "ppt169_brutalist_ai_newspaper_2026",
        },
        null,
      ),
    (error: unknown) => {
      assert.ok(error instanceof LeadToolRuntimeError)
      assert.equal(error.status, 401)
      return true
    },
  )

  assert.equal(downloadCalls.length, 0)
})

test("seo preview path remains on the legacy generation branch", async () => {
  const result = await buildLeadToolPreview("ai-seo-meta-generator", {
    topic: "AI PPT generator",
    pageType: "landing-page",
    audience: "marketers",
    language: "zh-CN",
  })

  assert.equal(seoCalls.length, 1)
  assert.deepEqual(seoCalls[0]?.[0], {
    topic: "AI PPT generator",
    pageType: "landing-page",
    audience: "marketers",
    language: "zh-CN",
  })
  assert.equal(seoCalls[0]?.[1], true)
  assert.equal(result.meta.tool, "ai-seo-meta-generator")
  assert.equal(result.meta.previewModel, "preview-model")
})

test("ppt finalize still rejects an unknown variant key before engine execution", async () => {
  const user = { email: "user@example.com" } as { email: string }

  await assert.rejects(
    () =>
      buildLeadToolFinalize(
        "ai-ppt-preview",
        {
          deck: sampleDeck,
          selectedVariantKey: "missing-variant",
        },
        user as Parameters<typeof buildLeadToolFinalize>[2],
      ),
    (error: unknown) => {
      assert.ok(error instanceof LeadToolRuntimeError)
      assert.equal(error.status, 400)
      return true
    },
  )

  assert.equal(finalizeCalls.length, 0)
})
