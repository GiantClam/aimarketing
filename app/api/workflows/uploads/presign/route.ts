import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getR2BucketName, getR2Client, getR2PublicUrl } from "@/lib/r2"

export const runtime = "nodejs"

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120)
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      fileName?: string
      fileType?: string
    }
    const fileName = typeof body.fileName === "string" ? sanitizeFileName(body.fileName) : ""
    const fileType = typeof body.fileType === "string" ? body.fileType.trim() : ""

    if (!fileName || !fileType) {
      return NextResponse.json({ error: "file_name_and_type_required" }, { status: 400 })
    }

    const client = getR2Client()
    if (!client) {
      return NextResponse.json({ error: "r2_config_missing" }, { status: 503 })
    }

    const storageKey = `workflow-inputs/${currentUser.id}/${Date.now()}-${fileName}`
    const command = new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      ContentType: fileType,
      CacheControl: "public, max-age=31536000, immutable",
    })
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 })

    return NextResponse.json({
      data: {
        uploadUrl,
        storageKey,
        publicUrl: getR2PublicUrl(storageKey),
        method: "PUT",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "workflow_upload_presign_failed" },
      { status: 500 },
    )
  }
}
