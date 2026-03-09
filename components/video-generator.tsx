"use client"

import { Video } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface VideoGeneratorProps {
  initialPrompt?: string
}

export function VideoGenerator({ initialPrompt = "" }: VideoGeneratorProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Video className="h-5 w-5" />旧版视频生成器已下线</CardTitle>
          <CardDescription>当前正式入口为视频生成 Agent，旧组件仅保留占位，避免误接入。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>请使用 `/dashboard/video` 进入正式视频生成流程。</p>
          {initialPrompt && <p>最近一次传入的初始需求：{initialPrompt}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
