"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { ContentGenerator } from "@/components/content-generator"
import { VideoGenerator } from "@/components/video-generator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Video, Sparkles } from "lucide-react"

export default function GeneratePage() {
  return (
    <DashboardLayout>
      <div className="h-full flex flex-col">
        <div className="border-b border-border px-6 py-4">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-foreground font-sans">内容生成</h1>
            <p className="text-muted-foreground font-manrope mt-1">
              使用 AI 生成图文内容和营销视频，支持多智能体协作
            </p>
          </div>
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="text" className="font-manrope">
                <FileText className="w-4 h-4 mr-2" />
                图文生成
              </TabsTrigger>
              <TabsTrigger value="video" className="font-manrope">
                <Video className="w-4 h-4 mr-2" />
                视频生成
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="mt-0 h-[calc(100vh-200px)]">
              <ContentGenerator />
            </TabsContent>
            <TabsContent value="video" className="mt-0 h-[calc(100vh-200px)]">
              <VideoGenerator />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  )
}
