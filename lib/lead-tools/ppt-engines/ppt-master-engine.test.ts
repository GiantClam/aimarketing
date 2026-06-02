import assert from "node:assert/strict"
import test from "node:test"

import { getPptMasterEngines } from "./ppt-master-engine"

const htmlDocument = {
  fileName: "long-table.html",
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
  assert.equal(result.artifact.fileName, "long-table.html")
  const html = new TextDecoder().decode(result.artifact.buffer)
  assert.match(html, /<!doctype html>/i)
})
