import fs from "node:fs/promises"
import { toUint8Array } from "../../lib/utils/binary"

const WORKER_URL = "https://ppt-master-worker-production.up.railway.app"
const TOKEN = "y6ZiaP_q_J0y1tpmn75rdQNUu2ZcIBzv"
const FIXTURE = "tests/fixtures/ppt/yusuan-intelligence-ppt-info.md"

async function main() {
  const researchBrief = await fs.readFile(FIXTURE, "utf8")
  const requestId = crypto.randomUUID()

  const body = {
    requestId,
    prompt:
      "基于附件内容，生成一份介绍屿算智能企业 AI 业务工作台的中文销售提案 PPT，突出产品定位、客户痛点、能力结构与落地价值。",
    researchBrief,
    scenario: "sales-deck",
    language: "zh-CN",
    // model deliberately omitted → worker should use its LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL env
    templateMode: "single-template",
    templateId: "broadside",
    narrativeAngle: "executive-brief",
    pageCount: 4,
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  }

  console.log(JSON.stringify({ stage: "submit", requestId }))
  const submitRes = await fetch(`${WORKER_URL}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const submit = (await submitRes.json().catch(() => null)) as { jobId?: string; message?: string } | null
  if (!submitRes.ok || !submit?.jobId) {
    throw new Error(`submit failed: ${submitRes.status} ${JSON.stringify(submit)}`)
  }
  const jobId = submit.jobId
  console.log(JSON.stringify({ stage: "submitted", jobId, status: (submit as { status?: string }).status ?? "?" }))

  const deadline = Date.now() + 90 * 60 * 1000
  let pollCount = 0
  while (Date.now() < deadline) {
    pollCount += 1
    await new Promise((r) => setTimeout(r, pollCount < 4 ? 5000 : 15000))
    const sres = await fetch(`${WORKER_URL}/preview-jobs/${jobId}`, {
      method: "GET",
      headers: { authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    })
    const st = (await sres.json().catch(() => null)) as
      | { status: string; message?: string; previewSessionId?: string; deck?: any }
      | null
    if (!sres.ok || !st) {
      console.log(JSON.stringify({ stage: "poll_error", pollCount, status: sres.status }))
      continue
    }
    if (st.status === "completed") {
      const deck = st.deck || {}
      const variantKey = deck.variants?.[0]?.key
      console.log(
        JSON.stringify({
          stage: "completed",
          pollCount,
          previewSessionId: st.previewSessionId,
          provider: deck.provider,
          previewModel: deck.previewModel,
          previewEngine: deck.previewEngine,
          variantProvider: deck.variants?.[0]?.runtimeProvider,
          variantModel: deck.variants?.[0]?.runtimeModel,
          variantKey,
          slideCount: deck.variants?.[0]?.slides?.length,
          title: deck.title,
        }),
      )
      if (!variantKey || !st.previewSessionId) {
        throw new Error("missing variant key or session id for export")
      }

      // Export pptx from worker
      const exportRes = await fetch(`${WORKER_URL}/export`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          previewSessionId: st.previewSessionId,
          selectedVariantKey: variantKey,
        }),
        cache: "no-store",
      })
      const exportPayload = (await exportRes.json().catch(() => null)) as
        | { fileName?: string; contentType?: string; slideCount?: number; bufferBase64?: string; message?: string }
        | null
      if (!exportRes.ok || !exportPayload?.bufferBase64) {
        throw new Error(`export failed: ${exportRes.status} ${JSON.stringify(exportPayload)}`)
      }
      const outDir = "output/ppt-smoke"
      const { writeFile, mkdir } = await import("node:fs/promises")
      await mkdir(outDir, { recursive: true })
      const fileName = `worker-minimax-${exportPayload.fileName || "deck.pptx"}`
      const outPath = `${outDir}/${fileName}`
      await writeFile(outPath, toUint8Array(Buffer.from(exportPayload.bufferBase64, "base64")))
      console.log(
        JSON.stringify({
          stage: "exported",
          outPath,
          fileName,
          bytes: Buffer.from(exportPayload.bufferBase64, "base64").length,
          contentType: exportPayload.contentType,
          slideCount: exportPayload.slideCount,
        }),
      )
      return
    }
    if (st.status === "failed") {
      throw new Error(`job failed: ${st.message}`)
    }
    console.log(JSON.stringify({ stage: "polling", pollCount, status: st.status }))
  }
  throw new Error("timeout")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e))
  process.exit(1)
})
