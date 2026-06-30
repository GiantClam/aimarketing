import fs from "node:fs/promises"
import path from "node:path"

import sharp from "sharp"

import {
  generateLeadToolPptStoryDeck,
  materializeLeadToolPptDeckWithPptMasterRuntime,
} from "../../lib/lead-tools/generation-ppt-fixed"
import {
  exportPptMasterSessionVariant,
  getPptMasterSessionVariant,
} from "../../lib/lead-tools/ppt-master-runtime"

async function main() {
  const prompt = "介绍霍尔木兹海峡现状及对全球能源运输的影响"
  const storyDeck = await generateLeadToolPptStoryDeck({
    prompt,
    scenario: "marketing-campaign",
    language: "zh-CN",
    templateMode: "auto-4",
    pageCount: 5,
    model: "gpt-5.4",
  })

  const targetVariant =
    storyDeck.variants.find((variant) => variant.styleKey === "ppt169_pritzker_2026") ??
    storyDeck.variants[0]
  if (!targetVariant) {
    throw new Error("hormuz_live_story_variant_missing")
  }

  const narrowedDeck = {
    ...storyDeck,
    variants: [targetVariant],
  }

  const materialized = await materializeLeadToolPptDeckWithPptMasterRuntime(narrowedDeck)
  const materializedVariant = materialized.variants[0]
  if (!materializedVariant || !materialized.previewSessionId) {
    throw new Error("hormuz_live_materialized_variant_missing")
  }

  const artifact = await exportPptMasterSessionVariant(materialized.previewSessionId, materializedVariant.key)
  const { variant: sessionVariant } = await getPptMasterSessionVariant(materialized.previewSessionId, materializedVariant.key)

  const outputDir = path.join(process.cwd(), ".artifacts", "ppt-master-smoke")
  await fs.mkdir(outputDir, { recursive: true })
  const pptxPath = path.join(outputDir, artifact.fileName)
  await fs.writeFile(pptxPath, artifact.buffer)

  const slideSvgPath = path.join(sessionVariant.projectDir, "svg_final", "01_cover.svg")
  const slidePngPath = path.join(outputDir, "hormuz-live-single-variant-cover.png")
  const slideSvg = await fs.readFile(slideSvgPath)
  await sharp(slideSvg).png().toFile(slidePngPath)

  const pptxStats = await fs.stat(pptxPath)
  const pngStats = await fs.stat(slidePngPath)

  console.log(
    JSON.stringify(
      {
        prompt,
        previewSessionId: materialized.previewSessionId,
        variantKey: materializedVariant.key,
        variantName: materializedVariant.name,
        generatedAt: materialized.generatedAt,
        fileName: artifact.fileName,
        contentType: artifact.contentType,
        slideCount: artifact.slideCount,
        pptxSizeBytes: pptxStats.size,
        pptxPath,
        coverSvgPath: slideSvgPath,
        coverPngPath: slidePngPath,
        coverPngSizeBytes: pngStats.size,
      },
      null,
      2,
    ),
  )
}

void main()
