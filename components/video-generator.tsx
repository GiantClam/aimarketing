"use client"

import { Video } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface VideoGeneratorProps {
  initialPrompt?: string
}

export function VideoGenerator({ initialPrompt = "" }: VideoGeneratorProps) {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {t("旧版视频生成器已下线", "Legacy video generator is retired")}
          </CardTitle>
          <CardDescription>
            {t(
              "当前正式入口为视频生成 Agent，旧组件仅保留占位，避免误接入。",
              "The official entry is now Video Agent. This legacy component remains only as a placeholder.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t("请使用 `/dashboard/video` 进入正式视频生成流程。", "Use `/dashboard/video` to start the official video generation workflow.")}</p>
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
