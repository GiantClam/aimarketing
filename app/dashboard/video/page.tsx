"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth-provider"
import { DashboardLayout } from "@/components/dashboard-layout"
import { VideoChat } from "@/components/video-chat"

export default function VideoPage() {
  const router = useRouter()
  const { hasFeature, user } = useAuth()

  useEffect(() => {
    if (!user) return
    if (!hasFeature("video_generation")) {
      router.replace("/dashboard")
    }
  }, [hasFeature, router, user])

  if (!user || !hasFeature("video_generation")) {
    return null
  }

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-6 py-4">
          <div className="mb-2">
            <h1 className="font-sans text-2xl font-bold text-foreground">视频生成 Agent</h1>
            <p className="mt-1 font-manrope text-muted-foreground">通过多轮对话收集信息，生成分镜、素材和最终视频结果。</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <VideoChat />
        </div>
      </div>
    </DashboardLayout>
  )
}
