import { type NextRequest, NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { userFiles } from "@/lib/db/schema"
import { getR2BucketName, getR2Client } from "@/lib/r2"

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { fileName, fileType } = await request.json()
    if (!fileName || !fileType) {
      return NextResponse.json({ error: "fileName and fileType are required" }, { status: 400 })
    }

    const storageKey = `users/${currentUser.id}/${Date.now()}-${fileName}`
    const s3Client = getR2Client()
    if (!s3Client) {
      return NextResponse.json({ error: "r2_config_missing" }, { status: 503 })
    }

    const command = new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      ContentType: fileType,
    })

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

    const [fileRecord] = await db
      .insert(userFiles)
      .values({
        userId: currentUser.id,
        fileName,
        fileType,
        fileSize: 0, // 将在上传完成后更新
        storageKey,
        status: "pending",
      })
      .returning()

    console.log(`[v0] Generated upload URL for file: ${fileName}`)

    return NextResponse.json({
      uploadUrl,
      storageKey,
      fileId: fileRecord.id,
    })
  } catch (error) {
    console.error("[v0] Upload URL generation error:", error)
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 })
  }
}
