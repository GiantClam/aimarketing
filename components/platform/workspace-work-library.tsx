"use client"

import { useMemo, useState } from "react"
import {
  ArrowRight,
  Download,
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Search,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { EnterpriseWorkLibraryCandidate, EnterpriseWorkLibraryGroupKey } from "@/lib/platform/work-library-shared"
import { filterWorkLibraryCandidates, groupWorkLibraryCandidates } from "@/lib/platform/work-library-shared"

type WorkspaceWorkLibraryItem = EnterpriseWorkLibraryCandidate

type PendingAction =
  | { kind: "move"; item: WorkspaceWorkLibraryItem }
  | { kind: "remove"; item: WorkspaceWorkLibraryItem }
  | { kind: "delete"; item: WorkspaceWorkLibraryItem }
  | null

const GROUP_ORDER: EnterpriseWorkLibraryGroupKey[] = ["image", "video", "audio", "document", "other"]

function formatWorkTimestamp(value: string | null, locale: "zh" | "en") {
  if (!value) return locale === "zh" ? "未记录" : "Not recorded"
  try {
    return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
  } catch {
    return value
  }
}

function getGroupCopy(key: EnterpriseWorkLibraryGroupKey, locale: "zh" | "en") {
  if (locale === "zh") {
    if (key === "image") return "图片"
    if (key === "video") return "视频"
    if (key === "audio") return "音频"
    if (key === "document") return "文档"
    return "其他"
  }
  if (key === "image") return "Images"
  if (key === "video") return "Videos"
  if (key === "audio") return "Audio"
  if (key === "document") return "Documents"
  return "Other"
}

function getPreviewIcon(item: WorkspaceWorkLibraryItem) {
  if (item.previewKind === "image") return <FileImage className="size-5" />
  if (item.previewKind === "video") return <FileVideo className="size-5" />
  if (item.previewKind === "audio") return <FileAudio className="size-5" />
  return <FileText className="size-5" />
}

function WorkPreviewTile({
  item,
  copy,
  onOpenPreview,
}: {
  item: WorkspaceWorkLibraryItem
  copy: Record<string, string>
  onOpenPreview: (item: WorkspaceWorkLibraryItem) => void
}) {
  if (item.previewKind === "image") {
    return (
      <button
        type="button"
        onClick={() => onOpenPreview(item)}
        className="relative block h-44 w-full overflow-hidden rounded-[10px] bg-muted"
      >
        <img src={item.previewUrl} alt={item.title} className="h-full w-full object-cover" />
      </button>
    )
  }

  if (item.previewKind === "video") {
    return (
      <button
        type="button"
        onClick={() => onOpenPreview(item)}
        className="flex h-44 w-full items-center justify-center rounded-[10px] border border-border/70 bg-black/85 text-white"
      >
        <div className="flex flex-col items-center gap-2 text-sm">
          <FileVideo className="size-8" />
          <span>{copy.playVideo}</span>
        </div>
      </button>
    )
  }

  if (item.previewKind === "audio") {
    return (
      <div className="rounded-[10px] border border-border/70 bg-background/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <FileAudio className="size-4" />
          <span>{copy.audioPreview}</span>
        </div>
        <audio src={item.previewUrl} controls className="w-full" />
      </div>
    )
  }

  if (item.previewKind === "pdf") {
    return (
      <button
        type="button"
        onClick={() => onOpenPreview(item)}
        className="flex h-44 w-full items-center justify-center rounded-[10px] border border-border/70 bg-background/60"
      >
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <FileText className="size-8" />
          <span>{copy.previewPdf}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="flex h-44 w-full items-center justify-center rounded-[10px] border border-border/70 bg-background/60">
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        {getPreviewIcon(item)}
        <span>{copy.filePreview}</span>
      </div>
    </div>
  )
}

export function WorkspaceWorkLibrary({
  locale,
  works,
}: {
  locale: "zh" | "en"
  works: WorkspaceWorkLibraryItem[]
}) {
  const copy =
    locale === "zh"
      ? {
          eyebrow: "Work Library",
          title: "作品库",
          description: "按格式查看企业内已生成作品，支持搜索、预览、播放、下载和清理。",
          searchPlaceholder: "搜索标题、格式、来源、ID",
          total: "文件总数",
          empty: "当前企业还没有共享作品记录。",
          noResults: "没有匹配的作品。",
          open: "查看",
          download: "下载",
          move: "移到素材库",
          moveConfirm: "确认移动",
          remove: "移出作品库",
          removeConfirm: "确认移出",
          delete: "彻底删除",
          deleteConfirm: "确认删除",
          created: "创建时间",
          source: "来源",
          type: "类型",
          artifactId: "文件 ID",
          workId: "作品 ID",
          referenceCount: "关联记录",
          playVideo: "播放视频",
          audioPreview: "音频预览",
          previewPdf: "预览 PDF",
          filePreview: "文件预览",
          missingSource: "当前文件没有可访问源地址。",
          busy: "处理中...",
          moveTitle: "移动到素材库",
          moveDescription: "会移除该文件的全部作品库记录，并将底层文件保留到素材库中。",
          removeTitle: "移出作品库",
          removeDescription: "仅删除作品库记录，保留底层文件。",
          deleteTitle: "彻底删除文件",
          deleteDescription: "会删除底层文件及其关联作品记录，操作不可撤销。",
          cancel: "取消",
          actionFailed: "操作失败，请重试。",
        }
      : {
          eyebrow: "Work Library",
          title: "Work library",
          description: "Browse generated works by format with search, preview, playback, download, and cleanup.",
          searchPlaceholder: "Search title, format, source, or ID",
          total: "Files",
          empty: "No shared work items exist for this enterprise yet.",
          noResults: "No matching works.",
          open: "Open",
          download: "Download",
          move: "Move to assets",
          moveConfirm: "Confirm move",
          remove: "Remove",
          removeConfirm: "Confirm remove",
          delete: "Delete",
          deleteConfirm: "Confirm delete",
          created: "Created",
          source: "Source",
          type: "Type",
          artifactId: "Artifact ID",
          workId: "Work ID",
          referenceCount: "References",
          playVideo: "Play video",
          audioPreview: "Audio preview",
          previewPdf: "Preview PDF",
          filePreview: "File preview",
          missingSource: "This file does not currently expose a source URL.",
          busy: "Working...",
          moveTitle: "Move to asset library",
          moveDescription: "This removes all work-library records for the file and keeps the underlying file in the asset library.",
          removeTitle: "Remove from work library",
          removeDescription: "This removes only the work-library record and keeps the underlying file.",
          deleteTitle: "Permanently delete file",
          deleteDescription: "This deletes the file and all related work-library records. This cannot be undone.",
          cancel: "Cancel",
          actionFailed: "Action failed. Please retry.",
        }

  const [query, setQuery] = useState("")
  const [items, setItems] = useState(works)
  const [activePreviewItem, setActivePreviewItem] = useState<WorkspaceWorkLibraryItem | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const filteredItems = useMemo(() => filterWorkLibraryCandidates(items, query), [items, query])
  const groups = useMemo(() => groupWorkLibraryCandidates(filteredItems), [filteredItems])

  async function handleConfirmAction() {
    if (!pendingAction) return
    setSubmitting(true)
    setErrorMessage(null)

    try {
      if (pendingAction.kind === "move") {
        const response = await fetch(`/api/platform/artifacts/${pendingAction.item.artifactId}/move-to-assets`, {
          method: "POST",
        })
        if (!response.ok) throw new Error("move_failed")
        setItems((current) => current.filter((item) => item.artifactId !== pendingAction.item.artifactId))
      } else if (pendingAction.kind === "remove") {
        const response = await fetch(`/api/platform/work-items/${pendingAction.item.workId}`, {
          method: "DELETE",
        })
        if (!response.ok) throw new Error("remove_failed")
        setItems((current) => current.filter((item) => item.workId !== pendingAction.item.workId))
      } else {
        const response = await fetch(`/api/platform/artifacts/${pendingAction.item.artifactId}`, {
          method: "DELETE",
        })
        if (!response.ok) throw new Error("delete_failed")
        setItems((current) => current.filter((item) => item.artifactId !== pendingAction.item.artifactId))
      }
      setPendingAction(null)
    } catch {
      setErrorMessage(copy.actionFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg workspace-page-shell mx-auto max-w-7xl">
        <div className="workspace-stack">
          <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
                  {copy.title}
                </h1>
                <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
              </div>
              <div className="w-full max-w-md space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    className="pl-9"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {copy.total}: <span className="font-medium text-foreground">{filteredItems.length}</span>
                </div>
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 px-5 py-6 text-sm text-muted-foreground">
              {copy.empty}
            </div>
          ) : null}

          {items.length > 0 && groups.length === 0 ? (
            <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 px-5 py-6 text-sm text-muted-foreground">
              {copy.noResults}
            </div>
          ) : null}

          <div className="space-y-8">
            {GROUP_ORDER.map((key) => {
              const group = groups.find((candidate) => candidate.key === key)
              if (!group) return null

              return (
                <section key={group.key} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold text-foreground">{getGroupCopy(group.key, locale)}</h2>
                      <Badge variant="outline">{group.items.length}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((item) => (
                      <article
                        key={item.workId}
                        className="rounded-[10px] border border-border bg-card/85 p-4 shadow-sm"
                      >
                        <WorkPreviewTile item={item} copy={copy} onOpenPreview={setActivePreviewItem} />

                        <div className="mt-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-6 text-foreground" title={item.title}>
                                  {item.title}
                                </h3>
                                <div className="shrink-0 text-xs text-muted-foreground">
                                  {formatWorkTimestamp(item.createdAt, locale)}
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge variant="secondary">{item.mimeType || item.type}</Badge>
                                {item.source ? <Badge variant="outline">{item.source}</Badge> : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => setActivePreviewItem(item)}>
                              <ExternalLink className="size-4" />
                              {copy.open}
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href={item.downloadUrl}>
                                <Download className="size-4" />
                                {copy.download}
                              </a>
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setPendingAction({ kind: "move", item })}>
                              <ArrowRight className="size-4" />
                              {copy.move}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setPendingAction({ kind: "remove", item })}>
                              <Trash2 className="size-4" />
                              {copy.remove}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setPendingAction({ kind: "delete", item })}>
                              <Trash2 className="size-4" />
                              {copy.delete}
                            </Button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </section>

      <Dialog open={Boolean(activePreviewItem)} onOpenChange={(open) => (!open ? setActivePreviewItem(null) : null)}>
        <DialogContent className="max-w-5xl border-border bg-background/95 p-4 sm:p-5">
          <DialogTitle className="sr-only">{activePreviewItem?.title ?? copy.open}</DialogTitle>
          {activePreviewItem?.previewKind === "image" ? (
            <img
              src={activePreviewItem.previewUrl}
              alt={activePreviewItem.title}
              className="max-h-[80vh] w-full rounded-[10px] object-contain"
            />
          ) : null}
          {activePreviewItem?.previewKind === "video" ? (
            <video src={activePreviewItem.previewUrl} controls className="max-h-[80vh] w-full rounded-[10px] bg-black" />
          ) : null}
          {activePreviewItem?.previewKind === "pdf" ? (
            <iframe title={activePreviewItem.title} src={activePreviewItem.previewUrl} className="h-[80vh] w-full rounded-[10px] border border-border" />
          ) : null}
          {activePreviewItem && (activePreviewItem.previewKind === "file" || activePreviewItem.previewKind === "audio") ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                {getPreviewIcon(activePreviewItem)}
                <span>{activePreviewItem.title}</span>
              </div>
              {activePreviewItem.previewKind === "audio" ? (
                <audio src={activePreviewItem.previewUrl} controls className="w-full" />
              ) : (
                <a
                  href={activePreviewItem.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm"
                >
                  <ExternalLink className="mr-2 size-4" />
                  {copy.open}
                </a>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => (!open ? setPendingAction(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.kind === "delete"
                ? copy.deleteTitle
                : pendingAction?.kind === "move"
                  ? copy.moveTitle
                  : copy.removeTitle}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.kind === "delete"
                ? copy.deleteDescription
                : pendingAction?.kind === "move"
                  ? copy.moveDescription
                  : copy.removeDescription}
            </DialogDescription>
          </DialogHeader>
          {pendingAction ? (
            <div className="rounded-[10px] border border-border/70 bg-background/70 p-4 text-sm">
              <div className="font-medium text-foreground">{pendingAction.item.title}</div>
              <div className="mt-2 text-muted-foreground">
                {copy.artifactId}: {pendingAction.item.artifactId} · {copy.workId}: {pendingAction.item.workId}
              </div>
            </div>
          ) : null}
          {errorMessage ? <div className="text-sm text-destructive">{errorMessage}</div> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={submitting}>
              {copy.cancel}
            </Button>
            <Button
              variant={pendingAction?.kind === "delete" ? "destructive" : "default"}
              onClick={handleConfirmAction}
              disabled={submitting}
            >
              {submitting
                ? copy.busy
                : pendingAction?.kind === "delete"
                  ? copy.deleteConfirm
                  : pendingAction?.kind === "move"
                    ? copy.moveConfirm
                  : copy.removeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
