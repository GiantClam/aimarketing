import { type NextRequest, NextResponse } from "next/server"
import { n8nClient } from "@/lib/integrations/n8n-client"
import { db } from "@/lib/db"
import { userFiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(request: NextRequest) {
  try {
    const { fileId, userId } = await request.json()

    const [fileRecord] = await db.select().from(userFiles).where(eq(userFiles.id, fileId))

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    await db.update(userFiles).set({ status: "indexing" }).where(eq(userFiles.id, fileId))

    const workflowResult = await n8nClient.triggerPersonalFileProcessing({
      userId,
      fileName: fileRecord.fileName,
      storageKey: fileRecord.storageKey,
      fileType: fileRecord.fileType,
    })

    console.log(`[v0] Triggered file processing workflow: ${fileRecord.fileName}`)

    return NextResponse.json({
      success: true,
      executionId: workflowResult.executionId,
    })
  } catch (error) {
    console.error("[v0] File processing trigger error:", error)
    return NextResponse.json({ error: "Failed to process file" }, { status: 500 })
  }
}
