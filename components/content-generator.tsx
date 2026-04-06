"use client"

import { FileText } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface ContentGeneratorProps {
  initialPrompt?: string
}

export function ContentGenerator({ initialPrompt = "" }: ContentGeneratorProps) {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("内容生成器已下线", "Legacy content generator is retired")}
          </CardTitle>
          <CardDescription>
            {t(
              "旧版内容生成器不再维护，避免与当前专家 Agent 体系重复。",
              "The old content generator is no longer maintained to avoid overlap with the current advisor-agent workflow.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t("如需生成营销文案，请进入文章写作工作台。", "Use the writer workspace for marketing copy generation.")}</p>
          {initialPrompt && (
            <p>
              {t("最近一次传入的初始需求：", "Most recent initial prompt:")}
              {initialPrompt}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
