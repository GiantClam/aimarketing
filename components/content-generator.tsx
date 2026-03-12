"use client"

import { FileText } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface ContentGeneratorProps {
  initialPrompt?: string
}

export function ContentGenerator({ initialPrompt = "" }: ContentGeneratorProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />内容生成器已下线</CardTitle>
          <CardDescription>旧版内容生成器不再维护，避免与当前专家 Agent 体系重复。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>如需生成营销文案，请进入文章写作工作台。</p>
          {initialPrompt && <p>最近一次传入的初始需求：{initialPrompt}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
