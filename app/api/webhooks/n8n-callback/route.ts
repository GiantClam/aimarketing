import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { userFiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// n8n 工作流完成后的回调接口
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storageKey, status, error } = body

    // 验证 webhook 签名（生产环境必需）
    const signature = request.headers.get("x-n8n-signature")
    if (!signature || !verifyWebhookSignature(signature, body)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // 更新文件处理状态
    await db
      .update(userFiles)
      .set({
        status: status === "success" ? "ready" : "failed",
        // 可以添加错误信息字段
      })
      .where(eq(userFiles.storageKey, storageKey))

    console.log(`[v0] File processing completed: ${storageKey}, status: ${status}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] n8n callback error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function verifyWebhookSignature(signature: string, body: any): boolean {
  // 实现 webhook 签名验证逻辑
  const secret = process.env.N8N_WEBHOOK_SECRET || ""
  // 这里应该实现实际的签名验证
  return true // 简化示例
}
