import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"

export const runtime = 'nodejs'
export const maxDuration = 60

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const formData = await request.formData()
    const messageId = formData.get("message_id") as string
    const sceneIdx = parseInt(formData.get("scene_idx") as string)
    const script = formData.get("script") as string | null
    const imageFile = formData.get("image") as File | null

    // 如果有图片文件，先上传
    let imageUrl: string | null = null
    if (imageFile) {
      const uploadFormData = new FormData()
      uploadFormData.append("file", imageFile)
      
      const uploadRes = await fetch(`${AGENT_URL}/workflow/upload-image`, {
        method: "POST",
        body: uploadFormData,
      })
      
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json()
        // 假设上传返回的是 fileName，需要转换为完整 URL
        // 这里可能需要根据实际的后端实现调整
        imageUrl = uploadData.fileName || uploadData.url || null
      }
    }

    // 调用后端更新 scene
    const updateRes = await fetch(`${AGENT_URL}/crewai/scene/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message_id: messageId,
        scene_idx: sceneIdx,
        script,
        image_url: imageUrl,
        user_id: auth.user.id,
        user_email: auth.user.email,
      }),
    })

    if (!updateRes.ok) {
      return new Response(JSON.stringify({ error: "更新失败" }), {
        status: updateRes.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await updateRes.json()
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    console.error("Scene update error:", error)
    return new Response(JSON.stringify({ error: error.message || "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

