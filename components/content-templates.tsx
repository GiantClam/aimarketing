"use client"

import { FileText } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function ContentTemplates() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            内容模板已下线
          </CardTitle>
          <CardDescription>该功能和相关管理接口已移除，不再对外提供。</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">如需生成营销内容，请使用左侧顾问 Agent 或文案写作专家。</CardContent>
      </Card>
    </div>
  )
}
