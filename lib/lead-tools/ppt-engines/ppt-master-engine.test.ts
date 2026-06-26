import assert from "node:assert/strict"
import test from "node:test"

import {
  getPptMasterEngines,
  setPptMasterEngineLocalDepsForTests,
  setPptWorkerTransportForTests,
} from "./ppt-master-engine"

const htmlDocument = {
  fileName: "ai-growth-deck-5p-long-table.html",
  html: "<!doctype html><html><body><main>long table</main></body></html>",
}

const htmlDeck = {
  title: "AI Growth Deck",
  scenario: "sales-deck" as const,
  language: "zh-CN" as const,
  generatedAt: "2026-06-02T00:00:00.000Z",
  outline: ["A", "B", "C", "D", "E"],
  previewEngine: "frontend-slides-html" as const,
  previewSessionId: "session-html-1",
  provider: "pptoken",
  previewModel: "gpt-5.4",
  source: "live" as const,
  variants: [
    {
      key: "ppt169_brutalist_ai_newspaper_2026" as const,
      styleKey: "ppt169_brutalist_ai_newspaper_2026" as const,
      name: "Long Table",
      summary: "summary",
      stylePrompt: "style",
      outline: ["Signal", "Frame", "Proof", "Risk", "Move"],
      palette: {
        background: "#151312",
        foreground: "#f5f0e8",
        accent: "#ff6f3c",
        panel: "#241d19",
        border: "#40332c",
      },
      strengths: ["impact"],
      slides: [
        { id: "cover", layout: "cover" as const, kicker: "k", title: "t1", body: "b1", bullets: ["1", "2"], accent: "#ff6f3c" },
        { id: "agenda", layout: "agenda" as const, kicker: "k", title: "t2", body: "b2", bullets: ["1", "2"], accent: "#ff6f3c" },
        { id: "insight", layout: "insight" as const, kicker: "k", title: "t3", body: "b3", bullets: ["1", "2"], accent: "#ff6f3c" },
        { id: "comparison", layout: "comparison" as const, kicker: "k", title: "t4", body: "b4", bullets: ["1", "2"], accent: "#ff6f3c" },
        { id: "timeline", layout: "timeline" as const, kicker: "k", title: "t5", body: "b5", bullets: ["1", "2"], accent: "#ff6f3c" },
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
        htmlDocument,
      },
    },
  ],
}

test.afterEach(() => {
  setPptWorkerTransportForTests(null)
  setPptMasterEngineLocalDepsForTests(null)
  delete process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
  delete process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME
  delete process.env.PPT_WORKER_BASE_URL
})

test("frontend-slides finalize returns html export plan", async () => {
  const engines = getPptMasterEngines()
  const variant = htmlDeck.variants[0]
  assert.ok(variant)

  const result = await engines.export.buildFinalize(
    {
      deck: htmlDeck,
      selectedVariant: variant,
      previewSessionId: htmlDeck.previewSessionId,
    },
    {
      user: null,
      resolvedModels: {
        previewModel: "gpt-5.4",
        finalModel: "gpt-5.4",
      },
    },
  )

  assert.equal(result.status, "ready")
  assert.equal(result.exportPlan.output, "html-file")
  assert.equal(result.exportPlan.selectedVariant, "Long Table")
  assert.match(result.message, /HTML/u)
})

test("frontend-slides download returns html artifact", async () => {
  const engines = getPptMasterEngines()
  const variant = htmlDeck.variants[0]
  assert.ok(variant)

  const result = await engines.export.buildDownload(
    {
      deck: htmlDeck,
      selectedVariant: variant,
      previewSessionId: htmlDeck.previewSessionId,
    },
    {
      user: null,
    },
  )

  assert.ok(result.artifact)
  assert.equal(result.artifact.contentType, "text/html; charset=utf-8")
  assert.equal(result.artifact.fileName, "ai-growth-deck-5p-long-table.html")
  const html = new TextDecoder().decode(result.artifact.buffer)
  assert.match(html, /<!doctype html>/i)
})

test("ppt-master engine uses remote worker for preview when configured", async () => {
  process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = "remote-worker"
  process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME = "ppt-master-agent"
  let seenAllowMockFallback: boolean | null = null
  let seenResearchBrief: unknown = null
  let seenImages: unknown = null
  let seenModel: unknown = null

  const remoteDeck = {
    ...htmlDeck,
    previewEngine: "ppt-master-project" as const,
    previewSessionId: "session-remote-1",
  }

  setPptWorkerTransportForTests({
    preview: async (request) => {
      seenAllowMockFallback = request.allowMockFallback
      seenResearchBrief = request.researchBrief
      seenImages = request.images
      seenModel = request.model
      return {
        previewSessionId: "session-remote-1",
        generatedAt: "2026-06-24T00:00:00.000Z",
        deck: remoteDeck,
      }
    },
  })

  const engines = getPptMasterEngines()
  const result = await engines.preview.buildPreview(
    {
      prompt: "Build remote worker deck",
      researchBrief: {
        topic: "Hormuz Strait shipping risk 2026",
        keyFacts: ["War-risk premiums rose"],
      },
      scenario: "sales-deck",
      language: "zh-CN",
      model: "gpt-5.4",
      templateMode: "auto-4",
      images: [{ url: "https://example.com/cover.png", role: "cover" }],
    } as any,
    {
      allowMockFallback: false,
      resolvedModels: {
        previewModel: "gpt-5.4",
        finalModel: "gpt-5.4",
      },
    },
  )

  assert.equal(result.previewSessionId, "session-remote-1")
  assert.equal(result.meta.previewEngine, "ppt-master")
  assert.equal(result.meta.mode, "ppt-master-project-preview")
  assert.equal(seenAllowMockFallback, false)
  assert.deepEqual(seenResearchBrief, {
    topic: "Hormuz Strait shipping risk 2026",
    keyFacts: ["War-risk premiums rose"],
  })
  assert.deepEqual(seenImages, [{ url: "https://example.com/cover.png", role: "cover" }])
  assert.equal(seenModel, "gpt-5.4")
})

test("ppt-master engine auto-selects remote worker preview when worker base url is configured", async () => {
  process.env.PPT_WORKER_BASE_URL = "https://ppt-worker.example.com/"
  let remoteCalled = false

  const remoteDeck = {
    ...htmlDeck,
    previewEngine: "ppt-master-project" as const,
    previewSessionId: "session-remote-auto-1",
  }

  setPptWorkerTransportForTests({
    preview: async () => {
      remoteCalled = true
      return {
        previewSessionId: "session-remote-auto-1",
        generatedAt: "2026-06-25T00:00:00.000Z",
        deck: remoteDeck,
      }
    },
  })

  const engines = getPptMasterEngines()
  const result = await engines.preview.buildPreview(
    {
      prompt: "Build remote worker deck automatically",
      scenario: "sales-deck",
      language: "zh-CN",
      templateMode: "auto-4",
    } as any,
    {
      allowMockFallback: false,
      resolvedModels: {
        previewModel: "gpt-5.4",
        finalModel: "gpt-5.4",
      },
    },
  )

  assert.equal(remoteCalled, true)
  assert.equal(result.previewSessionId, "session-remote-auto-1")
  assert.equal(result.meta.previewRuntime, "ppt-master-agent")
})

test("ppt-master engine uses remote worker for download when configured", async () => {
  process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = "remote-worker"

  setPptWorkerTransportForTests({
    export: async () => ({
      fileName: "deck.pptx",
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      slideCount: 5,
      variantName: "Long Table",
      bufferBase64: Buffer.from("pptx-bytes").toString("base64"),
    }),
  })

  const engines = getPptMasterEngines()
  const variant = htmlDeck.variants[0]
  assert.ok(variant)

  const result = await engines.export.buildDownload(
    {
      deck: {
        ...htmlDeck,
        previewEngine: "ppt-master-project",
      },
      selectedVariant: variant,
      previewSessionId: "session-remote-1",
    },
    {
      user: null,
    },
  )

  assert.ok(result.artifact)
  assert.equal(result.artifact.fileName, "deck.pptx")
  assert.equal(new TextDecoder().decode(result.artifact.buffer), "pptx-bytes")
})

test("ppt-master engine keeps local preview fallback when remote transport is disabled", async () => {
  let remoteCalled = false
  process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = "local"

  setPptWorkerTransportForTests({
    preview: async () => {
      remoteCalled = true
      throw new Error("remote worker should not be called")
    },
  })

  setPptMasterEngineLocalDepsForTests({
    getPreviewRuntime: () =>
      ({
        id: "ppt-master-agent",
        materializeStoryDeck: async () => ({
          ...htmlDeck,
          previewEngine: "ppt-master-project",
          previewSessionId: "session-local-preview",
        }),
      }) as any,
    generateStoryDeck: async () => ({ title: "Story Deck" }) as any,
  })

  const engines = getPptMasterEngines()
  const result = await engines.preview.buildPreview(
    {
      prompt: "Build local fallback deck",
      scenario: "sales-deck",
      language: "zh-CN",
      templateMode: "auto-4",
    } as any,
    {
      allowMockFallback: false,
      resolvedModels: {
        previewModel: "gpt-5.4",
        finalModel: "gpt-5.4",
      },
    },
  )

  assert.equal(remoteCalled, false)
  assert.equal(result.previewSessionId, "session-local-preview")
  assert.equal(result.meta.previewEngine, "ppt-master")
})

test("ppt-master engine keeps local export fallback when remote transport is disabled", async () => {
  let remoteCalled = false
  process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = "local"

  setPptWorkerTransportForTests({
    export: async () => {
      remoteCalled = true
      throw new Error("remote worker should not be called")
    },
  })

  setPptMasterEngineLocalDepsForTests({
    exportSessionVariant: async () => ({
      buffer: Buffer.from("local-pptx"),
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileName: "local-deck.pptx",
      slideCount: 5,
      variantName: "Long Table",
    }),
  })

  const engines = getPptMasterEngines()
  const variant = htmlDeck.variants[0]
  assert.ok(variant)

  const result = await engines.export.buildDownload(
    {
      deck: {
        ...htmlDeck,
        previewEngine: "ppt-master-project",
      },
      selectedVariant: variant,
      previewSessionId: "session-local-export",
    },
    {
      user: null,
    },
  )

  assert.equal(remoteCalled, false)
  assert.ok(result.artifact)
  assert.equal(result.artifact.fileName, "local-deck.pptx")
  assert.equal(new TextDecoder().decode(result.artifact.buffer), "local-pptx")
})
