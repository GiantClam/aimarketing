import fs from "node:fs/promises"
import path from "node:path"

import { generateLeadToolPptPreviewWithFallback } from "../../lib/lead-tools/generation-ppt-fixed"
import { exportPptMasterSessionVariant } from "../../lib/lead-tools/ppt-master-runtime"

async function main() {
  const prompt = "介绍霍尔木兹海峡现状及对全球能源运输的影响"
  const deck = await generateLeadToolPptPreviewWithFallback(
    {
      prompt,
      scenario: "marketing-campaign",
      language: "zh-CN",
      templateMode: "auto-4",
      pageCount: 9,
      model: "gpt-5.4",
    },
    false,
  )

  const variant = deck.variants[0]
  if (!variant || !deck.previewSessionId) {
    throw new Error("hormuz_live_preview_missing_variant")
  }

  const artifact = await exportPptMasterSessionVariant(deck.previewSessionId, variant.key)
  const outputDir = path.join(process.cwd(), ".artifacts", "ppt-master-smoke")
  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, artifact.fileName)
  await fs.writeFile(outputPath, artifact.buffer)
  const stats = await fs.stat(outputPath)

  console.log(
    JSON.stringify(
      {
        prompt,
        previewSessionId: deck.previewSessionId,
        variantKey: variant.key,
        variantName: variant.name,
        generatedAt: deck.generatedAt,
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
