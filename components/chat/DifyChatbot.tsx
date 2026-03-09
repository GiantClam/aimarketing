"use client"

import { MessageSquareOff } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function DifyChatbot() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquareOff className="h-5 w-5" />旧版 Dify Chatbot 已弃用</CardTitle>
          <CardDescription>当前顾问聊天能力统一由 `DifyChatArea` 承载，此组件不再对外使用。</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          如需查看或维护顾问会话，请访问 `/dashboard/advisor/...` 路径。
        </CardContent>
      </Card>
    </div>
  )
}
