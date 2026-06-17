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
  downloadUrl?: string
  downloadFilename?: string
  downloadMimeType?: string
  downloadPayload?: unknown
}

type ActionKey = "download" | "share" | "asset" | "knowledge"

function getCopy(locale: "zh" | "en", artifactLabel: string) {
  if (locale === "zh") {
    return {
      title: "输出动作",
      description: "统一处理下载、链接分享、作品库留存和知识入库，不再把已接通的动作继续写成占位语义。",
      actions: {
        download: {
          label: "下载",
          note: `${artifactLabel} 当前没有可直接下载的产物。`,
        },
        share: {
          label: "分享",
          note: `${artifactLabel} 当前还没有可复制的分享链接。`,
        },
        asset: {
          label: "保存到作品库",
          note: `${artifactLabel} 当前还不能写入作品库。`,
        },
        knowledge: {
          label: "加入知识库",
          note: `${artifactLabel} 当前还不能进入知识入库队列。`,
        },
      },
    }
  }

  return {
    title: "Output actions",
    description:
      "Handle download, link sharing, work-library retention, and knowledge ingestion from one bar without describing already-wired actions as placeholders.",
    actions: {
      download: {
        label: "Download",
        note: `No downloadable artifact is currently available for ${artifactLabel}.`,
      },
      share: {
        label: "Share",
        note: `No shareable link is currently available for ${artifactLabel}.`,
      },
      asset: {
        label: "Save to work library",
        note: `${artifactLabel} cannot be written into the work library yet.`,
      },
      knowledge: {
        label: "Add to knowledge base",
        note: `${artifactLabel} cannot be queued for knowledge ingestion yet.`,
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
  downloadUrl,
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
        if (downloadUrl) {
          const anchor = document.createElement("a")
          anchor.href = downloadUrl
          anchor.target = "_blank"
          anchor.rel = "noreferrer"
          if (downloadFilename) {
            anchor.download = downloadFilename
          }
          anchor.click()
          toast.success(copy.actions.download.label)
          return
        }

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

        const resolvedShareUrl =
          typeof window === "undefined"
            ? shareUrl
            : new URL(shareUrl, window.location.origin).toString()

        await navigator.clipboard.writeText(resolvedShareUrl)
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
              ? "已保存到共享作品库。"
              : "Saved into the shared work library."
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
    <section className={cn("dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85", className)}>
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
