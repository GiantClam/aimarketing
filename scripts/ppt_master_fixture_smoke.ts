import fs from "node:fs/promises"
import path from "node:path"

import { exportPptMasterSessionVariant } from "@/lib/lead-tools/ppt-master-runtime"
import { generateLeadToolPptStoryDeck, materializeLeadToolPptDeckWithPptMasterRuntime } from "@/lib/lead-tools/generation-ppt-fixed"
import { toUint8Array } from "@/lib/utils/binary"

type SmokeOptions = {
  fixturePath: string
  outputDir: string
  pageCount: number
  slideCount: number
  prompt: string
}

function readArg(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return null
  return process.argv[index + 1] ?? null
}

function readIntArg(flag: string, fallback: number) {
  const raw = readArg(flag)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getOptions(): SmokeOptions {
  return {
    fixturePath: path.resolve(
      readArg("--fixture") ?? "tests/fixtures/ppt/yusuan-intelligence-ppt-info.md",
    ),
    outputDir: path.resolve(
      readArg("--output-dir") ?? "/Users/beihuang/Downloads/ppt-master-artifacts",
    ),
    pageCount: readIntArg("--page-count", 4),
    slideCount: readIntArg("--slide-count", 1),
    prompt:
      readArg("--prompt") ??
      "基于附件内容，生成一份介绍屿算智能企业 AI 业务工作台的中文销售提案 PPT，突出产品定位、客户痛点、能力结构与落地价值。",
  }
}

async function main() {
  const startedAt = Date.now()
  const options = getOptions()
  const researchBrief = await fs.readFile(options.fixturePath, "utf8")

  console.log(JSON.stringify({ stage: "start", fixturePath: options.fixturePath }))

  const storyDeck = await generateLeadToolPptStoryDeck({
    prompt: options.prompt,
    researchBrief,
    scenario: "sales-deck",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "broadside",
    narrativeAngle: "executive-brief",
    pageCount: options.pageCount,
  })

  const trimmedDeck = {
    ...storyDeck,
    outline: storyDeck.outline.slice(0, options.slideCount),
    variants: storyDeck.variants.map((variant) => ({
      ...variant,
      outline: variant.outline?.slice(0, options.slideCount),
      slides: variant.slides.slice(0, options.slideCount),
    })),
  }

  console.log(
    JSON.stringify({
      stage: "storyDeck",
      elapsedMs: Date.now() - startedAt,
      title: trimmedDeck.title,
      previewModel: trimmedDeck.previewModel,
      variants: trimmedDeck.variants.length,
      slideCount: trimmedDeck.variants[0]?.slides.length ?? 0,
    }),
  )

  const materializedDeck = await materializeLeadToolPptDeckWithPptMasterRuntime(trimmedDeck)
  const variant = materializedDeck.variants[0]

  if (!materializedDeck.previewSessionId || !variant) {
    throw new Error("ppt_master_fixture_smoke_missing_preview_result")
  }

  console.log(
    JSON.stringify({
      stage: "materialized",
      elapsedMs: Date.now() - startedAt,
      previewSessionId: materializedDeck.previewSessionId,
      provider: materializedDeck.provider,
      previewModel: materializedDeck.previewModel,
    }),
  )

  const artifact = await exportPptMasterSessionVariant(materializedDeck.previewSessionId, variant.key)
  await fs.mkdir(options.outputDir, { recursive: true })

  const fileName = `smoke-${artifact.fileName}`
  const outputPath = path.join(options.outputDir, fileName)
  await fs.writeFile(outputPath, toUint8Array(artifact.buffer))

  console.log(
    JSON.stringify({
      stage: "saved",
      elapsedMs: Date.now() - startedAt,
      outputPath,
      fileName,
      bytes: artifact.buffer.length,
      contentType: artifact.contentType,
      slideCount: artifact.slideCount,
      variantName: artifact.variantName,
      previewSessionId: materializedDeck.previewSessionId,
    }),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
