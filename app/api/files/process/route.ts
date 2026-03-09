import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { userFiles } from "@/lib/db/schema"
import { n8nClient } from "@/lib/integrations/n8n-client"

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { fileId } = await request.json()
    if (!fileId) {
      return NextResponse.json({ error: "fileId is required" }, { status: 400 })
    }

    const [fileRecord] = await db.select().from(userFiles).where(eq(userFiles.id, fileId))

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }
    if (fileRecord.userId !== currentUser.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    await db.update(userFiles).set({ status: "indexing" }).where(eq(userFiles.id, fileId))

    const workflowResult = await n8nClient.triggerPersonalFileProcessing({
      userId: currentUser.id,
      fileName: fileRecord.fileName,
      storageKey: fileRecord.storageKey,
      fileType: fileRecord.fileType,
    })

    console.log(`[v0] Triggered file processing workflow: ${fileRecord.fileName}`)

    return NextResponse.json({
      success: true,
      executionId:
        (workflowResult.data && typeof workflowResult.data === "object" ? workflowResult.data.executionId : undefined) ??
        null,
      workflowStatus: workflowResult.status,
    })
  } catch (error) {
    console.error("[v0] File processing trigger error:", error)
    return NextResponse.json({ error: "Failed to process file" }, { status: 500 })
  }
}
