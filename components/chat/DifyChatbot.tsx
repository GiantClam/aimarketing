"use client"

import { MessageSquareOff } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function DifyChatbot() {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareOff className="h-5 w-5" />
            {t("旧版 Dify Chatbot 已弃用", "Legacy Dify chatbot is deprecated")}
          </CardTitle>
          <CardDescription>
            {t(
              "当前顾问聊天能力统一由 `DifyChatArea` 承载，此组件不再对外使用。",
              "Advisor chat is now fully handled by `DifyChatArea`; this component is no longer used externally.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t(
            "如需查看或维护顾问会话，请访问 `/dashboard/advisor/...` 路径。",
            "To view or maintain advisor conversations, visit `/dashboard/advisor/...`.",
          )}
        </CardContent>
      </Card>
    </div>
  )
}
