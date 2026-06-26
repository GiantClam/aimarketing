import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { extractChatAttachmentText } from "@/lib/chat-attachments/extract"
import { ChatAttachmentError } from "@/lib/chat-attachments/types"
import { normalizeFileName } from "@/lib/chat-attachments/validation"
import { toUint8Array } from "@/lib/utils/binary"

export const runtime = "nodejs"
export const maxDuration = 30

function createAttachmentId() {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) {
      return auth.response
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    const bytes = toUint8Array(Buffer.from(await file.arrayBuffer()))
    const extracted = extractChatAttachmentText({
      fileName: file.name,
      mediaType: file.type,
      bytes,
    })

    return NextResponse.json({
      data: {
        id: createAttachmentId(),
        name: normalizeFileName(file.name),
        kind: "document",
        mediaType: extracted.mediaType,
        originalMediaType: extracted.originalMediaType,
        size: extracted.size,
        text: extracted.text,
        textCharCount: extracted.textCharCount,
        truncated: extracted.truncated,
      },
    })
  } catch (error) {
    if (error instanceof ChatAttachmentError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    console.error("chat-attachments.extract.error", {
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: "attachment_extract_failed" }, { status: 500 })
  }
}
