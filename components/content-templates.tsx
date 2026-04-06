"use client"

import { FileText } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function ContentTemplates() {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("内容模板已下线", "Content templates are retired")}
          </CardTitle>
          <CardDescription>{t("该功能和相关管理接口已移除，不再对外提供。", "This feature and its related management APIs were removed.")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t(
            "如需生成营销内容，请使用左侧顾问 Agent 或新的文章写作工作台。",
            "For marketing content generation, use the advisor agent on the left or the new writer workspace.",
          )}
        </CardContent>
      </Card>
    </div>
  )
}
