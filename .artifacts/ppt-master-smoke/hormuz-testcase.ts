import fs from "node:fs/promises"
import path from "node:path"

import { exportPptMasterSessionVariant, materializePptMasterPreviewDeck } from "../../lib/lead-tools/ppt-master-runtime"

const deck = {
  title: "霍尔木兹海峡风险如何改写全球油运成本",
  scenario: "marketing-campaign",
  language: "zh-CN",
  generatedAt: "2026-06-24T00:00:00.000Z",
  outline: ["卡口现状", "保费外溢", "替代航线", "买方暴露", "行动顺序"],
  source: "live",
  templateMode: "auto-4",
  pageCount: 5,
  resolvedPageCount: 5,
  variants: [
    {
      key: "hormuz_testcase_variant_a",
      styleKey: "ppt169_pritzker_2026",
      name: "Pritzker Editorial",
      summary: "测试用例：霍尔木兹海峡现状及其对全球能源运输的影响",
      stylePrompt: "Editorial poster",
      palette: {
        background: "#f6efe8",
        foreground: "#171312",
        accent: "#ff6436",
        panel: "#f1e5d8",
        border: "#5f4b40",
      },
      strengths: ["editorial", "clarity"],
      slides: [
        {
          id: "s1",
          layout: "cover",
          intent: "cover",
          kicker: "卡口现状",
          title: "霍尔木兹海峡已从单点通道变成全球油运风险定价器",
          body: "真正抬升成本的不是一次性停航，而是保险、备航和库存预期被同步改写。",
          bullets: ["保费前置抬升", "备航时间拉长", "库存策略前移"],
          accent: "#ff6436",
        },
        {
          id: "s2",
          layout: "agenda",
          intent: "contents",
          kicker: "结构总览",
          title: "先看卡口现状，再看保费外溢、替代航线、买方暴露与行动顺序",
          body: "这不是单纯的地缘事件复述，而是围绕运输成本、交付节奏与采购响应的结构化拆解。",
          bullets: ["卡口现状", "保费外溢", "替代航线", "买方暴露", "行动顺序"],
          accent: "#ff6436",
        },
        {
          id: "s3",
          layout: "comparison",
          intent: "comparison",
          kicker: "保费外溢",
          title: "现货油轮与长期合同买家面对的不是同一种暴露结构",
          body: "风险上升后，最先抬升的是现货油轮的保费和等待时间，而长期合同买家更依赖库存与合同条款来缓冲冲击。",
          bullets: ["现货油轮先暴露", "长期合同靠库存对冲", "采购节奏被迫前移", "现金流压力分化"],
          accent: "#ff6436",
        },
        {
          id: "s4",
          layout: "insight",
          intent: "statement",
          kicker: "替代航线",
          title: "替代航线不是免费选项，时间成本和保险成本会一起重定价",
          body: "一旦绕航成为现实选项，企业面对的不只是更长里程，而是更复杂的船期、保险和库存联动压力。",
          bullets: ["绕航拉长交付周期", "保险与燃油同步上升", "下游安全库存被迫提高"],
          accent: "#ff6436",
        },
        {
          id: "s5",
          layout: "process",
          intent: "process",
          kicker: "行动顺序",
          title: "应急动作必须先锁油运，再看炼厂与下游库存",
          body: "处置顺序错误会让运输问题迅速转化成采购和现金流问题，因此应急决策必须围绕船期、库存和采购窗口联动。",
          bullets: ["先锁定船期", "再重排库存", "最后调整采购"],
          accent: "#ff6436",
        },
      ],
    },
  ],
} as const

async function main() {
  const materialized = await materializePptMasterPreviewDeck(deck as any, {
    generateSlideSvg: async ({ slide, slideIndex, variant }) => ({
      provider: "testcase",
      model: "static-svg",
      svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="${variant.palette.background}" />
  <rect x="58" y="58" width="1164" height="604" rx="24" fill="${variant.palette.panel}" stroke="${variant.palette.border}" stroke-width="3" />
  <text x="92" y="120" font-family="Arial, 'Noto Sans CJK SC', sans-serif" font-size="22" font-weight="700" fill="${variant.palette.accent}">测试用例 ${slideIndex + 1}</text>
  <text x="92" y="214" font-family="Arial, 'Noto Sans CJK SC', sans-serif" font-size="42" font-weight="700" fill="${variant.palette.foreground}">${slide.title.replace(/[<&>]/g, "")}</text>
  <text x="92" y="292" font-family="Arial, 'Noto Sans CJK SC', sans-serif" font-size="22" fill="${variant.palette.foreground}">${slide.body.replace(/[<&>]/g, "")}</text>
  <text x="92" y="392" font-family="Arial, 'Noto Sans CJK SC', sans-serif" font-size="20" fill="${variant.palette.foreground}">• ${(slide.bullets || []).join("  • ").replace(/[<&>]/g, "")}</text>
</svg>`,
    }),
  })

  const variant = materialized.variants[0]
  if (!variant || !materialized.previewSessionId) {
    throw new Error("hormuz_testcase_missing_variant")
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
        variantName: variant.name,
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
