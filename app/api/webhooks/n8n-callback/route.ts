import { type NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { db } from "@/lib/db"
import { userFiles, tasks } from "@/lib/db/schema"
import { updateTaskStatus } from "@/lib/services/tasks"
import { eq } from "drizzle-orm"

// n8n 工作流完成后的回调接口
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storageKey, status, error, taskId, executionId } = body

    // 验证 webhook 签名（生产环境必需）
    const signature = request.headers.get("x-n8n-signature") || ""
    if (!verifyWebhookSignature(signature, body)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // 如包含任务 ID，优先更新通用任务表
    if (taskId) {
      await updateTaskStatus(Number(taskId), { status, result: body, executionId })
    }

    // 兼容：若包含文件 storageKey，同时更新文件状态
    if (storageKey) {
      await db
        .update(userFiles)
        .set({ status: status === "success" ? "ready" : "failed" })
        .where(eq(userFiles.storageKey, storageKey))
    }

    console.log(`[n8n-callback] done storageKey=${storageKey} status=${status} taskId=${taskId || "-"} exec=${executionId || "-"}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[n8n-callback] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function verifyWebhookSignature(signature: string, body: any): boolean {
  try {
    const secret = (process.env.N8N_WEBHOOK_SECRET || "").trim()
    if (!secret) return false
    const payload = typeof body === "string" ? body : JSON.stringify(body)
    const mac = createHmac("sha256", secret).update(payload).digest("hex")
    const sig = signature.replace(/^sha256=/, "")
    const a = Buffer.from(mac)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
