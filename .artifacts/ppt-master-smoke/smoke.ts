import fs from "node:fs/promises"
import path from "node:path"

import { exportPptMasterSessionVariant, materializePptMasterPreviewDeck } from "../../lib/lead-tools/ppt-master-runtime"

const deck = {
  title: "Railway Smoke Deck",
  scenario: "sales-deck",
  language: "en-US",
  generatedAt: "2026-06-24T00:00:00.000Z",
  outline: ["Cover", "Agenda", "Insight", "Close"],
  source: "live",
  templateMode: "auto-4",
  pageCount: 4,
  resolvedPageCount: 4,
  variants: [
    {
      key: "smoke_variant_a",
      styleKey: "ppt169_swiss_grid_systems",
      name: "Smoke Variant A",
      summary: "Static smoke-test variant",
      stylePrompt: "Swiss grid smoke test",
      palette: {
        background: "#f7f2e8",
        foreground: "#111111",
        accent: "#c1121f",
        panel: "#f7f2e8",
        border: "#d3c4af",
      },
      strengths: ["smoke"],
      slides: [
        {
          id: "s1",
          layout: "cover",
          intent: "cover",
          kicker: "Smoke",
          title: "Railway worker smoke",
          body: "Real ppt-master export from static SVG slides.",
          bullets: ["Preview session", "Variant export"],
          accent: "#c1121f",
        },
        {
          id: "s2",
          layout: "agenda",
          intent: "contents",
          kicker: "Flow",
          title: "What this validates",
          body: "Materialize project files and export PPTX through svg_to_pptx.py.",
          bullets: ["Session manifest", "SVG final assets", "PPTX export"],
          accent: "#c1121f",
        },
        {
          id: "s3",
          layout: "insight",
          intent: "statement",
          kicker: "Focus",
          title: "Linux runtime path",
          body: "This bypasses model generation but exercises the worker-critical PPT runtime.",
          bullets: ["No mock artifact", "Real python export"],
          accent: "#c1121f",
        },
        {
          id: "s4",
          layout: "timeline",
          intent: "closing",
          kicker: "Close",
          title: "Next step",
          body: "Use the same path inside Railway with mounted fonts and worker transport.",
          bullets: ["Fonts check", "Worker auth", "Artifact download"],
          accent: "#c1121f",
        },
      ],
    },
  ],
} as const

async function main() {
  const materialized = await materializePptMasterPreviewDeck(deck as any, {
    generateSlideSvg: async ({ slide, slideIndex, variant }) => ({
      provider: "smoke-test",
      model: "static-svg",
      svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="${variant.palette.background}" />
  <rect x="72" y="72" width="1136" height="576" rx="28" fill="#ffffff" stroke="${variant.palette.border}" stroke-width="4" />
  <text x="96" y="164" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="${variant.palette.accent}">SMOKE ${slideIndex + 1}</text>
  <text x="96" y="252" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="${variant.palette.foreground}">${slide.title.replace(/[<&>]/g, "")}</text>
  <text x="96" y="332" font-family="Arial, sans-serif" font-size="24" fill="${variant.palette.foreground}">${slide.body.replace(/[<&>]/g, "")}</text>
</svg>`,
    }),
  })

  const variant = materialized.variants[0]
  if (!variant || !materialized.previewSessionId) {
    throw new Error("smoke_materialize_missing_variant")
  }

  const artifact = await exportPptMasterSessionVariant(materialized.previewSessionId, variant.key)
  const outputDir = path.join(process.cwd(), ".artifacts", "ppt-master-smoke")
  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, artifact.fileName)
  await fs.writeFile(outputPath, artifact.buffer)
  const stats = await fs.stat(outputPath)

  console.log(
    JSON.stringify(
      {
        previewSessionId: materialized.previewSessionId,
        variantKey: variant.key,
        fileName: artifact.fileName,
        contentType: artifact.contentType,
        slideCount: artifact.slideCount,
        sizeBytes: stats.size,
        outputPath,
      },
      null,
      2,
    ),
  )
}

void main()
