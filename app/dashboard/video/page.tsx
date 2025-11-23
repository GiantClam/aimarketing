"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { VideoChat } from "@/components/video-chat"

export default function VideoPage() {
  return (
    <DashboardLayout>
      <div className="h-full flex flex-col">
        <div className="border-b border-border px-6 py-4">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-foreground font-sans">视频生成</h1>
            <p className="text-muted-foreground font-manrope mt-1">
              通过对话式交互，与 AI 制片人协作收集信息并生成专业的营销视频
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <VideoChat />
        </div>
      </div>
    </DashboardLayout>
  )
}

