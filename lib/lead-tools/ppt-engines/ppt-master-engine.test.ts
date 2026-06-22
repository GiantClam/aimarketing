import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

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

let exportCalls: Array<unknown[]> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/lead-tools/pptx-export") {
    return {
      exportPptVariantToPptx: async (...args: unknown[]) => {
        exportCalls.push(args)
        return {
          buffer: Buffer.from("pptx-binary"),
          contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          fileName: "ai-growth-deck-5p-long-table.pptx",
        }
      },
    }
  }

  return originalLoad(request, parent, isMain)
}

const { getPptMasterEngines } = require("./ppt-master-engine.ts") as typeof import("./ppt-master-engine")

test.after(() => {
  nodeModule._load = originalLoad
})

test.beforeEach(() => {
  exportCalls = []
})

test("frontend-slides finalize returns pptx export plan", async () => {
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
  assert.equal(result.exportPlan.output, "editable-pptx")
  assert.equal(result.exportPlan.selectedVariant, "Long Table")
  assert.match(result.message, /PPTX/u)
})

test("frontend-slides download exports pptx artifact", async () => {
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

  assert.equal(exportCalls.length, 1)
  assert.ok(result.artifact)
  assert.equal(
    result.artifact.contentType,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  )
  assert.equal(result.artifact.fileName, "ai-growth-deck-5p-long-table.pptx")
  assert.equal(Buffer.from(result.artifact.buffer).toString("utf8"), "pptx-binary")
})
