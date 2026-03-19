"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth-provider"
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
    <div className="flex h-full min-h-0 flex-col bg-muted/10">
      <div className="min-h-0 flex-1 overflow-hidden">
        <VideoChat />
      </div>
    </div>
  )
}
