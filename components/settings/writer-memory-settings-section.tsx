"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Brain, RefreshCw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/components/locale-provider"
import {
  createWriterMemoryItem,
  deleteWriterMemoryItem,
  getWriterSoulProfile,
  listWriterMemoryItems,
} from "@/lib/writer/memory/client"
import type { WriterAgentType, WriterMemoryItem, WriterSoulProfile } from "@/lib/writer/memory/types"

type Props = {
  agentType?: WriterAgentType
}

const MAX_VISIBLE_ITEMS = 10

export function WriterMemorySettingsSection({ agentType = "writer" }: Props) {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memoryItems, setMemoryItems] = useState<WriterMemoryItem[]>([])
  const [soulProfile, setSoulProfile] = useState<WriterSoulProfile | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [message, setMessage] = useState("")

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage("")
    try {
      const [itemsResult, profileResult] = await Promise.all([
        listWriterMemoryItems({
          agentType,
          type: "feedback",
          limit: MAX_VISIBLE_ITEMS,
        }),
        getWriterSoulProfile(agentType),
      ])
      setMemoryItems(itemsResult.data || [])
      setSoulProfile(profileResult.data || null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("读取记忆失败", "Failed to load memory data"))
    } finally {
      setLoading(false)
    }
  }, [agentType, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const scopeLabel = useMemo(() => `${agentType}`, [agentType])

  const handleSavePreference = async () => {
    const nextTitle = title.trim()
    const nextContent = content.trim()
    if (!nextTitle || !nextContent) {
      setMessage(t("请填写偏好标题和内容。", "Please provide both title and preference content."))
      return
    }

    setSaving(true)
    setMessage("")
    try {
      await createWriterMemoryItem({
        agentType,
        type: "feedback",
        source: "explicit_user",
        title: nextTitle,
        content: nextContent,
      })
      setTitle("")
      setContent("")
      setMessage(t("已记住该偏好。", "Preference saved."))
      await loadData()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("保存偏好失败", "Failed to save preference"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (memoryId: number) => {
    try {
      await deleteWriterMemoryItem(memoryId, agentType)
      setMemoryItems((prev) => prev.filter((item) => item.id !== memoryId))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("删除失败", "Failed to delete memory"))
    }
  }

  return (
    <Card className="rounded-[1.75rem] border-border/70 bg-card/85 shadow-[0_24px_60px_-48px_rgba(31,41,55,0.45)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-sans text-xl">
          <Brain className="h-5 w-5 text-primary" />
          {t("写作记忆与风格（Memory & Soul）", "Writer Memory & Soul")}
        </CardTitle>
        <CardDescription>
          {t(
            "该区域按 agentType 跨会话共享记忆。不同 agentType 完全隔离。",
            "This section is cross-session shared by agentType. Different agentType scopes are isolated.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border/70 bg-background px-3 py-1 font-medium text-foreground">
            {t("当前作用域", "Current scope")}: {scopeLabel}
          </span>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            {t("刷新", "Refresh")}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>{t("偏好标题", "Preference title")}</Label>
            <Input
              placeholder={t("例如：语气偏好", "e.g. Tone preference")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("偏好内容", "Preference content")}</Label>
            <Input
              placeholder={t("例如：保持克制，先给结论", "e.g. Keep restrained tone and lead with conclusion")}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <Button onClick={handleSavePreference} disabled={saving} className="rounded-full">
          {saving ? t("保存中...", "Saving...") : t("记住这个偏好", "Remember this preference")}
        </Button>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
          <p className="text-sm font-medium text-foreground">{t("Soul 摘要（只读）", "Soul summary (read-only)")}</p>
          {soulProfile ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{t("语气", "Tone")}: {soulProfile.tone || t("未设置", "Not set")}</p>
              <p>{t("句式", "Sentence style")}: {soulProfile.sentenceStyle || t("未设置", "Not set")}</p>
              <p>{t("置信度", "Confidence")}: {Number(soulProfile.confidence || 0).toFixed(2)}</p>
              <p>{t("版本", "Version")}: {soulProfile.version || "v1"}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("暂无 soul profile。", "No soul profile yet.")}</p>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
          <p className="text-sm font-medium text-foreground">{t("最近反馈记忆", "Recent feedback memories")}</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("加载中...", "Loading...")}</p>
          ) : memoryItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("暂无记忆。", "No memory items yet.")}</p>
          ) : (
            <div className="space-y-2">
              {memoryItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card/80 p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.content}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full"
                    onClick={() => void handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  )
}

