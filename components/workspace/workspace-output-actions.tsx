"use client"

import { useState } from "react"
import { Download, LibraryBig, Share2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type WorkspaceOutputActionsProps = {
  locale: "zh" | "en"
  artifactLabel?: string
  className?: string
  title?: string
  description?: string
  artifactId?: number
  shareUrl?: string
  downloadFilename?: string
  downloadMimeType?: string
  downloadPayload?: unknown
}

type ActionKey = "download" | "share" | "asset" | "knowledge"

function getCopy(locale: "zh" | "en", artifactLabel: string) {
  if (locale === "zh") {
    return {
      title: "输出动作",
      description: "统一的企业输出动作先以安全占位形式表达，不调用不存在的素材库、知识库或分享后端。",
      actions: {
        download: {
          label: "下载",
          note: `${artifactLabel} 的下载动作当前为安全占位，后续再接真实导出能力。`,
        },
        share: {
          label: "分享",
          note: `${artifactLabel} 的分享动作当前为安全占位，后续再接真实分享链路。`,
        },
        asset: {
          label: "保存到素材库",
          note: `${artifactLabel} 的素材库保存当前只做前端占位，不会写入不存在的后端。`,
        },
        knowledge: {
          label: "加入知识库",
          note: `${artifactLabel} 的知识沉淀当前只做前端占位，不会调用知识写入后端。`,
        },
      },
    }
  }

  return {
    title: "Output actions",
    description:
      "This unified enterprise action bar is intentionally a safe placeholder. It does not call a missing asset library, sharing, or knowledge backend yet.",
    actions: {
      download: {
        label: "Download",
        note: `Download for ${artifactLabel} is a safe placeholder until a real export runtime is connected.`,
      },
      share: {
        label: "Share",
        note: `Share for ${artifactLabel} is a safe placeholder until a real sharing flow is connected.`,
      },
      asset: {
        label: "Save to asset library",
        note: `Saving ${artifactLabel} to the asset library is a front-end placeholder only and does not write to a missing backend.`,
      },
      knowledge: {
        label: "Add to knowledge base",
        note: `Adding ${artifactLabel} to the knowledge base is a front-end placeholder only and does not call a missing write API.`,
      },
    },
  }
}

export function WorkspaceOutputActions({
  locale,
  artifactLabel,
  className,
  title,
  description,
  artifactId,
  shareUrl,
  downloadFilename,
  downloadMimeType,
  downloadPayload,
}: WorkspaceOutputActionsProps) {
  const resolvedArtifactLabel =
    artifactLabel || (locale === "zh" ? "当前输出" : "the current output")
  const copy = getCopy(locale, resolvedArtifactLabel)
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null)

  const actions: Array<{
    key: ActionKey
    icon: typeof Download
  }> = [
    { key: "download", icon: Download },
    { key: "share", icon: Share2 },
    { key: "asset", icon: Sparkles },
    { key: "knowledge", icon: LibraryBig },
  ]

  const triggerPlaceholder = (action: ActionKey) => {
    const actionCopy = copy.actions[action]
    toast.message(actionCopy.label, { description: actionCopy.note })
  }

  const runArtifactAction = async (action: ActionKey) => {
    if (!artifactId) {
      triggerPlaceholder(action)
      return
    }

    setActiveAction(action)

    try {
      if (action === "download") {
        if (downloadPayload === undefined) {
          triggerPlaceholder(action)
          return
        }

        const blob = new Blob([JSON.stringify(downloadPayload, null, 2)], {
          type: downloadMimeType || "application/json",
        })
        const href = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = href
        anchor.download = downloadFilename || `artifact-${artifactId}.json`
        anchor.click()
        URL.revokeObjectURL(href)
        toast.success(copy.actions.download.label)
        return
      }

      if (action === "share") {
        if (!shareUrl) {
          triggerPlaceholder(action)
          return
        }

        await navigator.clipboard.writeText(shareUrl)
        toast.success(copy.actions.share.label, {
          description: locale === "zh" ? "链接已复制到剪贴板。" : "Link copied to clipboard.",
        })
        return
      }

      const endpoint =
        action === "asset"
          ? `/api/platform/artifacts/${artifactId}/save-to-library`
          : `/api/platform/artifacts/${artifactId}/knowledge`
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ targetType: "knowledge_base" }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "request_failed")
      }

      toast.success(copy.actions[action].label, {
        description:
          action === "asset"
            ? locale === "zh"
              ? "已记录到共享素材库目录。"
              : "Saved into the shared asset library."
            : locale === "zh"
              ? "已进入知识入库队列。"
              : "Queued for knowledge-base ingestion.",
      })
    } catch (error) {
      toast.error(copy.actions[action].label, {
        description: error instanceof Error ? error.message : "unknown_error",
      })
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <section className={cn("dashboard-panel rounded-[12px] border border-border bg-card/85 p-5", className)}>
      <div className="space-y-2">
        <div className="dashboard-kicker text-muted-foreground">{title || copy.title}</div>
        <p className="text-sm leading-7 text-muted-foreground">{description || copy.description}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          const actionCopy = copy.actions[action.key]

          return (
            <Button
              key={action.key}
              type="button"
              variant="outline"
              className="h-10 rounded-[6px] border-border bg-background px-4"
              disabled={activeAction === action.key}
              onClick={() => {
                void runArtifactAction(action.key)
              }}
            >
              <Icon className="mr-2 h-4 w-4" />
              {actionCopy.label}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
