import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let previewShouldFail = false
let exportShouldFail = false
let storedDeck: Record<string, unknown> | null = null
let previewInputs: Array<Record<string, unknown>> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }

  if (request === "ai") {
    return {
      tool: (definition: Record<string, unknown>) => definition,
    }
  }

  if (request === "@/lib/lead-tools/runtime") {
    return {
      buildLeadToolPreview: async (_slug: string, input: Record<string, unknown>) => {
        previewInputs.push(input)
        if (previewShouldFail) {
          throw new Error("ppt_master_repo_missing")
        }
        return {
          previewSessionId: "preview-session-1",
          generatedAt: "2026-06-24T00:00:00.000Z",
          deck: {
            title: "AI Marketing Workbench",
            scenario: "marketing-campaign",
            language: "zh-CN",
            generatedAt: "2026-06-24T00:00:00.000Z",
            outline: ["one", "two"],
            variants: [
              {
                key: "variant-a",
                name: "Variant A",
                summary: "Summary",
                styleKey: "ppt169_brutalist_ai_newspaper_2026",
                slides: [{ title: "Cover" }],
              },
            ],
          },
          meta: {
            platformRunId: 101,
            platformArtifactId: 201,
          },
        }
      },
      buildLeadToolDownload: async () => {
        if (exportShouldFail) {
          throw new Error("ppt_master_repo_missing")
        }
        return {
          artifact: {
            buffer: Buffer.from("pptx"),
            contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            fileName: "ai-marketing-workbench.pptx",
          },
          deck: {
            title: "AI Marketing Workbench",
            pageCount: 5,
            resolvedPageCount: 5,
            previewEngine: "ppt-master-project",
          },
          variant: {
            key: "variant-a",
            name: "Variant A",
            slides: [{}, {}, {}, {}, {}],
          },
          meta: {
            platformRunId: 301,
            platformArtifactId: 401,
            platformWorkItemId: 501,
          },
        }
      },
    }
  }

  if (request === "@/lib/lead-tools/ppt-preview-session-store") {
    return {
      getPptPreviewSessionDeck: async (previewSessionId: string) => {
        if (!storedDeck) {
          throw new Error(`missing_preview_session:${previewSessionId}`)
        }
        return storedDeck
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let buildAiEntryPptTools: typeof import("./ppt-tools").buildAiEntryPptTools
const yusuanAttachmentMarkdown = readFileSync(
  new URL("../../tests/fixtures/ppt/yusuan-intelligence-ppt-info.md", import.meta.url),
  "utf8",
)

type TestToolSet = Record<
  string,
  {
    execute: (input: Record<string, unknown>, options?: unknown) => Promise<Record<string, any>>
  }
>

test.before(async () => {
  const mod = await import("./ppt-tools")
  buildAiEntryPptTools = mod.buildAiEntryPptTools
})

test.beforeEach(() => {
  previewShouldFail = false
  exportShouldFail = false
  previewInputs = []
  storedDeck = {
    title: "AI Marketing Workbench",
    pageCount: 5,
    resolvedPageCount: 5,
    previewEngine: "ppt-master-project",
    variants: [
      {
        key: "variant-a",
        name: "Variant A",
        summary: "Summary",
        styleKey: "ppt169_brutalist_ai_newspaper_2026",
        slides: [{ title: "Cover" }, {}, {}, {}, {}],
      },
    ],
  }
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("ppt tools return preview metadata and export a downloadable PPTX artifact", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份 AI Marketing Workbench 的汇报 PPT",
  })
  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  assert.equal(preview.ok, true)
  assert.equal(preview.previewSessionId, "preview-session-1")
  assert.equal(Array.isArray(preview.variants), true)
  assert.equal(typeof preview.nextStep, "string")
  assert.match(
    preview.nextStep,
    /export_ppt_deck/u,
  )
  assert.equal("artifact" in preview, false)
  assert.deepEqual(previewInputs[0], {
    prompt: "做一份 AI Marketing Workbench 的汇报 PPT",
    researchBrief: undefined,
    scenario: "marketing-campaign",
    language: "zh-CN",
    templateMode: "auto-4",
    templateId: undefined,
    narrativeAngle: undefined,
    pageCount: undefined,
  })
  assert.equal(exported.ok, true)
  assert.equal(exported.fileName, "ai-marketing-workbench.pptx")
  assert.equal(
    exported.contentType,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  )
  assert.equal(exported.artifactId, 401)
  assert.equal(exported.toolRunId, 301)
  assert.equal(exported.downloadUrl, "/api/platform/artifacts/401/download?download=1")
})

test("ppt tools forward researchBrief into preview generation", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状汇报 PPT",
    researchBrief:
      "主题：霍尔木兹海峡现状。关键事实：保险成本上升，航运风险溢价扩大，买方库存前移。结论：运输成本和交付周期同步受压。",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
  assert.equal(
    previewInputs[0]?.researchBrief,
    "主题：霍尔木兹海峡现状。关键事实：保险成本上升，航运风险溢价扩大，买方库存前移。结论：运输成本和交付周期同步受压。",
  )
})

test("ppt tools pin a single narrative angle for single-template preview generation", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会摘要 PPT",
    templateMode: "single-template",
    templateId: "broadside",
  })

  assert.equal(preview.ok, true)
  assert.deepEqual(previewInputs[0], {
    prompt: "做一份董事会摘要 PPT",
    researchBrief: undefined,
    scenario: "marketing-campaign",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "broadside",
    narrativeAngle: "executive-brief",
    pageCount: undefined,
  })
})

test("ppt tools forward structured researchBrief objects into preview generation", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状汇报 PPT",
    researchBrief: {
      topic: "霍尔木兹海峡现状",
      keyFacts: ["保险成本上升", "航运风险溢价扩大"],
      risks: ["运输成本抬升"],
      implications: ["买方库存前移"],
      sourceNotes: ["Source A - https://example.com/a"],
      rawSummary: "关键事实：保险成本上升，航运风险溢价扩大。",
    },
  })

  assert.equal(preview.ok, true)
  assert.deepEqual(previewInputs[0]?.researchBrief, {
    topic: "霍尔木兹海峡现状",
    keyFacts: ["保险成本上升", "航运风险溢价扩大"],
    risks: ["运输成本抬升"],
    implications: ["买方库存前移"],
    sourceNotes: ["Source A - https://example.com/a"],
    rawSummary: "关键事实：保险成本上升，航运风险溢价扩大。",
  })
})

test("ppt tools can preview and export a deck from the yusuan attachment markdown", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "基于附件文档生成一份屿算智能企业 AI 业务工具介绍 PPT",
    researchBrief: yusuanAttachmentMarkdown,
    templateMode: "single-template",
    templateId: "broadside",
  })
  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  const forwardedInput = previewInputs.at(-1)

  assert.match(yusuanAttachmentMarkdown, /企业专属 AI 业务工具/u)
  assert.match(yusuanAttachmentMarkdown, /17 个 AI 智能体员工/u)
  assert.equal(preview.ok, true)
  assert.equal(exported.ok, true)
  assert.deepEqual(forwardedInput, {
    prompt: "基于附件文档生成一份屿算智能企业 AI 业务工具介绍 PPT",
    researchBrief: yusuanAttachmentMarkdown,
    scenario: "marketing-campaign",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "broadside",
    narrativeAngle: "executive-brief",
    pageCount: undefined,
  })
  assert.equal(exported.fileName, "ai-marketing-workbench.pptx")
  assert.equal(
    exported.contentType,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  )
  assert.equal(exported.artifactId, 401)
  assert.equal(exported.downloadUrl, "/api/platform/artifacts/401/download?download=1")
})

test("ppt tools return a safe runtime error when ppt-master is unavailable", async () => {
  previewShouldFail = true
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会 PPT",
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_master_runtime_unavailable")
})

test("ppt tools require a researchBrief for factual decks before preview", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状和对全球能源运输影响的 PPT",
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_research_brief_required")
  assert.equal(previewInputs.length, 0)
})

test("ppt tools allow factual decks to preview after a researchBrief is provided", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状和对全球能源运输影响的 PPT",
    researchBrief: "关键事实：霍尔木兹海峡风险抬升导致保费和运输成本上升。",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
})

test("ppt tools return an explainable error when the selected variant is missing", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-z",
  })

  assert.equal(exported.ok, false)
  assert.equal(exported.error?.code, "ppt_variant_not_found")
  assert.equal(Array.isArray(exported.availableVariants), true)
})
