"use client"

import { useEffect, useState } from "react"
import { RefreshCcw } from "lucide-react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AppLocale } from "@/lib/i18n/config"
import type { KnowledgeDocumentSnapshot } from "@/lib/knowledge/service"
import type { KnowledgeChunk, KnowledgeChunkingConfig, KnowledgeScope } from "@/lib/knowledge/types"

const CHUNK_PREVIEW_PAGE_SIZE = 4

type KnowledgeDatasetOption = {
  id: number
  name: string
  category: KnowledgeScope
}

type KnowledgeDatasetsApiResponse = {
  data?: {
    items?: Array<{
      id?: number
      name?: string
      category?: KnowledgeScope
    }>
  }
  error?: string
}

function formatTimestamp(locale: AppLocale, value: string | null) {
  if (!value) return locale === "zh" ? "暂无" : "N/A"
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getStatusLabel(locale: AppLocale, status: KnowledgeDocumentSnapshot["document"]["status"]) {
  if (locale === "zh") {
    if (status === "ready") return "已完成"
    if (status === "failed") return "失败"
    if (status === "reparsing") return "重解析中"
    if (status === "parsing") return "解析中"
    if (status === "disabled") return "已停用"
    return "已上传"
  }
  if (status === "ready") return "Ready"
  if (status === "failed") return "Failed"
  if (status === "reparsing") return "Reparsing"
  if (status === "parsing") return "Parsing"
  if (status === "disabled") return "Disabled"
  return "Uploaded"
}

function getChunkStatusLabel(locale: AppLocale, status: KnowledgeChunk["status"]) {
  if (locale === "zh") {
    if (status === "edited") return "已改写"
    if (status === "disabled") return "已停用"
    return "已同步"
  }
  if (status === "edited") return "Edited"
  if (status === "disabled") return "Disabled"
  return "Synced"
}

export function KnowledgeDocumentDetailPanel({
  locale,
  initialDetail,
  canManage,
}: {
  locale: AppLocale
  initialDetail: KnowledgeDocumentSnapshot
  canManage: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<"save" | "reparse" | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [chunks, setChunks] = useState(initialDetail.chunks)
  const [editingChunkId, setEditingChunkId] = useState<number | null>(null)
  const [savingChunkId, setSavingChunkId] = useState<number | null>(null)
  const [chunkDrafts, setChunkDrafts] = useState<Record<number, string>>({})
  const [chunkPage, setChunkPage] = useState(1)
  const [datasets, setDatasets] = useState<KnowledgeDatasetOption[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    initialDetail.document.datasetId ? String(initialDetail.document.datasetId) : "",
  )
  const [config, setConfig] = useState<KnowledgeChunkingConfig>({
    method: initialDetail.document.chunkingOverride?.method || initialDetail.dataset?.chunkingConfig?.method || "general",
    chunkSize: initialDetail.document.chunkingOverride?.chunkSize || initialDetail.dataset?.chunkingConfig?.chunkSize || 512,
    overlap: initialDetail.document.chunkingOverride?.overlap || initialDetail.dataset?.chunkingConfig?.overlap || 0.1,
    delimiter: initialDetail.document.chunkingOverride?.delimiter || initialDetail.dataset?.chunkingConfig?.delimiter || "\\n",
    parser:
      initialDetail.document.chunkingOverride?.parser ||
      initialDetail.dataset?.chunkingConfig?.parser ||
      "general",
  })

  useEffect(() => {
    let cancelled = false

    async function loadDatasets() {
      try {
        const response = await fetch("/api/knowledge/datasets", {
          cache: "no-store",
          credentials: "same-origin",
        })
        const payload = (await response.json().catch(() => null)) as KnowledgeDatasetsApiResponse | null
        if (!response.ok) {
          throw new Error(payload?.error || "knowledge_datasets_failed")
        }

        const nextDatasets = (payload?.data?.items || [])
          .map((item) => {
            if (!item || typeof item.id !== "number" || !item.name || !item.category) return null
            return {
              id: item.id,
              name: item.name,
              category: item.category,
            } satisfies KnowledgeDatasetOption
          })
          .filter((item): item is KnowledgeDatasetOption => Boolean(item))

        if (cancelled) return
        setDatasets(nextDatasets)
      } catch {
        if (cancelled) return
        setDatasets([])
      }
    }

    void loadDatasets()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveChunking() {
    setBusy("save")
    setMessage(null)
    try {
      const response = await fetch(`/api/knowledge/documents/${initialDetail.document.id}/chunking`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(config),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_document_chunking_update_failed")
      await router.refresh()
      setMessage(locale === "zh" ? "分块配置已保存" : "Chunking config saved")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_document_chunking_update_failed")
    } finally {
      setBusy(null)
    }
  }

  async function reparse() {
    setBusy("reparse")
    setMessage(null)
    try {
      const response = await fetch(`/api/knowledge/documents/${initialDetail.document.id}/reparse`, {
        method: "POST",
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_document_reparse_failed")
      await router.refresh()
      setMessage(locale === "zh" ? "已触发重解析" : "Reparse requested")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_document_reparse_failed")
    } finally {
      setBusy(null)
    }
  }

  async function migrateDataset() {
    const nextDatasetId = Number.parseInt(selectedDatasetId, 10)
    if (!Number.isInteger(nextDatasetId) || nextDatasetId <= 0) {
      setMessage(locale === "zh" ? "请选择目标知识库" : "Select a target knowledge base first.")
      return
    }
    if (nextDatasetId === initialDetail.document.datasetId) {
      setMessage(locale === "zh" ? "当前文档已经在该知识库中。" : "This document is already linked to that knowledge base.")
      return
    }

    setBusy("save")
    setMessage(null)
    try {
      const response = await fetch(`/api/knowledge/documents/${initialDetail.document.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          datasetId: nextDatasetId,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || "knowledge_document_update_failed")
      }
      await router.refresh()
      setMessage(locale === "zh" ? "文档已迁移到新的知识库，正在重新解析。" : "Document moved to the new knowledge base and is reparsing.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_document_update_failed")
    } finally {
      setBusy(null)
    }
  }

  function beginChunkEdit(chunk: KnowledgeChunk) {
    setEditingChunkId(chunk.id)
    setChunkDrafts((current) => ({
      ...current,
      [chunk.id]: current[chunk.id] ?? chunk.content,
    }))
    setMessage(null)
  }

  function cancelChunkEdit(chunk: KnowledgeChunk) {
    setEditingChunkId((current) => (current === chunk.id ? null : current))
    setChunkDrafts((current) => ({
      ...current,
      [chunk.id]: chunk.content,
    }))
  }

  async function saveChunkEdit(chunk: KnowledgeChunk) {
    const content = chunkDrafts[chunk.id] ?? chunk.content
    setSavingChunkId(chunk.id)
    setMessage(null)
    try {
      const response = await fetch(`/api/knowledge/documents/${initialDetail.document.id}/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content,
          excerpt: content,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { data?: KnowledgeChunk; error?: string } | null
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error || "knowledge_chunk_update_failed")
      }

      setChunks((current) => current.map((item) => (item.id === chunk.id ? payload.data || item : item)))
      setChunkDrafts((current) => ({
        ...current,
        [chunk.id]: payload?.data?.content ?? current[chunk.id] ?? chunk.content,
      }))
      setEditingChunkId(null)
      await router.refresh()
      setMessage(locale === "zh" ? "Chunk 改写已保存，并开启 edited 保护。" : "Chunk rewrite saved with edit protection.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_chunk_update_failed")
    } finally {
      setSavingChunkId(null)
    }
  }

  const totalChunkPages = Math.max(1, Math.ceil(chunks.length / CHUNK_PREVIEW_PAGE_SIZE))
  const currentChunkPage = Math.min(chunkPage, totalChunkPages)
  const chunkStartIndex = (currentChunkPage - 1) * CHUNK_PREVIEW_PAGE_SIZE
  const visibleChunks = chunks.slice(chunkStartIndex, chunkStartIndex + CHUNK_PREVIEW_PAGE_SIZE)

  return (
    <div className="space-y-6">
        <article className="dashboard-panel rounded-[12px] border border-border bg-card/90 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "文档状态" : "Document status"}</div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Badge className="rounded-[6px] border border-primary/30 bg-primary text-primary-foreground">
                  {getStatusLabel(locale, initialDetail.document.status)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {locale === "zh" ? "更新时间" : "Updated"} {formatTimestamp(locale, initialDetail.document.updatedAt)}
                </span>
              </div>
            </div>
            {canManage ? (
              <Button className="public-button-primary h-10 px-4" onClick={reparse} disabled={busy === "reparse"}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                {locale === "zh" ? "重新解析" : "Reparse"}
              </Button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-[10px] border border-border bg-background/70 p-4">
              <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "分类" : "Category"}</div>
              <div className="mt-2 text-sm text-foreground">{initialDetail.document.category}</div>
            </div>
            <div className="rounded-[10px] border border-border bg-background/70 p-4">
              <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "Chunk 数" : "Chunks"}</div>
              <div className="mt-2 text-sm text-foreground">{initialDetail.document.chunkCount}</div>
            </div>
            <div className="rounded-[10px] border border-border bg-background/70 p-4">
              <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "来源类型" : "Source type"}</div>
              <div className="mt-2 text-sm text-foreground">{initialDetail.document.sourceType}</div>
            </div>
            <div className="rounded-[10px] border border-border bg-background/70 p-4">
              <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "数据集" : "Dataset"}</div>
              <div className="mt-2 text-sm text-foreground">{initialDetail.dataset?.name || "-"}</div>
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-[8px] border border-border bg-background/80 px-3 py-2 text-xs text-muted-foreground">
              {message}
            </div>
          ) : null}
        </article>

        <article className="dashboard-panel rounded-[12px] border border-border bg-card/90 p-5">
          <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "分块设置" : "Chunking settings"}</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{locale === "zh" ? "分块方式" : "Method"}</label>
              <Input value={config.method} onChange={(event) => setConfig((current) => ({ ...current, method: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Parser</label>
              <Input value={config.parser || ""} onChange={(event) => setConfig((current) => ({ ...current, parser: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Chunk Size</label>
              <Input
                value={String(config.chunkSize)}
                onChange={(event) => setConfig((current) => ({ ...current, chunkSize: Number(event.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Overlap</label>
              <Input
                value={String(config.overlap)}
                onChange={(event) => setConfig((current) => ({ ...current, overlap: Number(event.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs text-muted-foreground">Delimiter</label>
              <Input
                value={config.delimiter}
                onChange={(event) => setConfig((current) => ({ ...current, delimiter: event.target.value }))}
              />
            </div>
          </div>
          {canManage ? (
            <div className="mt-4">
              <Button className="public-button-secondary h-10 px-4" onClick={saveChunking} disabled={busy === "save"}>
                {locale === "zh" ? "保存分块配置" : "Save chunking config"}
              </Button>
            </div>
          ) : null}
        </article>

        <article className="dashboard-panel rounded-[12px] border border-border bg-card/90 p-5">
          <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "使用绑定" : "Bindings"}</div>
          <div className="mt-4 rounded-[10px] border border-border bg-background/70 p-4">
            <div className="text-xs text-muted-foreground">{locale === "zh" ? "当前所属知识库" : "Current knowledge base"}</div>
            <div className="mt-2 text-sm font-medium text-foreground">{initialDetail.dataset?.name || "-"}</div>
            {canManage ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <Select value={selectedDatasetId || undefined} onValueChange={setSelectedDatasetId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={locale === "zh" ? "选择新的知识库" : "Choose a new knowledge base"} />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={String(dataset.id)}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="public-button-secondary h-10 px-4"
                  onClick={migrateDataset}
                  disabled={busy === "save" || datasets.length === 0 || !selectedDatasetId}
                >
                  {locale === "zh" ? "迁移到该知识库" : "Move to this knowledge base"}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="mt-4 space-y-2">
            {initialDetail.bindings.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {locale === "zh" ? "当前还没有使用绑定。" : "No bindings configured yet."}
              </div>
            ) : (
              initialDetail.bindings.map((binding) => (
                <div key={binding.id} className="rounded-[8px] border border-border bg-background/70 px-3 py-2 text-sm text-foreground">
                  {binding.targetType}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="dashboard-panel rounded-[12px] border border-border bg-card/90 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="dashboard-kicker text-muted-foreground">{locale === "zh" ? "Chunk 预览" : "Chunk preview"}</div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {locale === "zh"
                  ? "已编辑 chunk 会优先保留本地改写；如果重新分块后 chunk 结构变化，系统会按原 chunk ID 或序号尽量保护。"
                  : "Edited chunks keep local rewrites during routine sync. If rechunking changes the chunk structure, we preserve them by chunk id or order when possible."}
              </p>
            </div>
            {canManage ? (
              <Badge variant="outline" className="rounded-[6px] border-primary/30 bg-primary/10 text-primary">
                {locale === "zh" ? "支持人工改写" : "Manual rewrite enabled"}
              </Badge>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {chunks.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                {locale === "zh"
                  ? "当前还没有同步到 chunk 预览。等解析完成后，这里会展示可编辑的片段。"
                  : "Chunk previews are not available yet. Parsed chunks will appear here once document processing completes."}
              </div>
            ) : (
              visibleChunks.map((chunk) => (
                <div key={chunk.id} className="rounded-[10px] border border-border bg-background/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-foreground">Chunk {String(chunk.chunkIndex).padStart(2, "0")}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          chunk.status === "edited"
                            ? "rounded-[6px] border-primary/40 bg-primary/10 text-primary"
                            : "rounded-[6px] border-border bg-background text-muted-foreground"
                        }
                      >
                        {getChunkStatusLabel(locale, chunk.status)}
                      </Badge>
                      {canManage ? (
                        editingChunkId === chunk.id ? (
                          <>
                            <Button
                              className="public-button-primary h-8 px-3 text-xs"
                              onClick={() => saveChunkEdit(chunk)}
                              disabled={savingChunkId === chunk.id}
                            >
                              {locale === "zh" ? "保存" : "Save"}
                            </Button>
                            <Button
                              className="public-button-secondary h-8 px-3 text-xs"
                              onClick={() => cancelChunkEdit(chunk)}
                              disabled={savingChunkId === chunk.id}
                            >
                              {locale === "zh" ? "取消" : "Cancel"}
                            </Button>
                          </>
                        ) : (
                          <Button className="public-button-secondary h-8 px-3 text-xs" onClick={() => beginChunkEdit(chunk)}>
                            {locale === "zh" ? "编辑" : "Edit"}
                          </Button>
                        )
                      ) : null}
                    </div>
                  </div>
                  {editingChunkId === chunk.id ? (
                    <Textarea
                      className="mt-3 min-h-[140px] border-border bg-background text-sm leading-7"
                      value={chunkDrafts[chunk.id] ?? chunk.content}
                      onChange={(event) =>
                        setChunkDrafts((current) => ({
                          ...current,
                          [chunk.id]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{chunk.excerpt || chunk.content}</p>
                  )}
                  {chunk.status === "edited" ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      {locale === "zh"
                        ? "该 chunk 已启用 edited 保护，常规同步不会覆盖本地改写。"
                        : "This chunk is protected by the edited rule and will not be overwritten by routine sync."}
                    </div>
                  ) : null}
                  {editingChunkId !== chunk.id ? null : (
                    <div className="mt-3 text-xs text-muted-foreground">
                      {locale === "zh"
                        ? "保存后会标记为 edited，并在后续同步时优先保留当前文本。"
                        : "Saving marks this chunk as edited and preserves the current text during later sync."}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {chunks.length > CHUNK_PREVIEW_PAGE_SIZE ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <div className="text-xs text-muted-foreground">
                {locale === "zh"
                  ? `第 ${currentChunkPage} / ${totalChunkPages} 页，显示 ${chunkStartIndex + 1}-${Math.min(
                      chunkStartIndex + CHUNK_PREVIEW_PAGE_SIZE,
                      chunks.length,
                    )} / ${chunks.length} 个 chunk`
                  : `Page ${currentChunkPage} of ${totalChunkPages}, showing ${chunkStartIndex + 1}-${Math.min(
                      chunkStartIndex + CHUNK_PREVIEW_PAGE_SIZE,
                      chunks.length,
                    )} of ${chunks.length} chunks`}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="public-button-secondary h-8 px-3 text-xs"
                  onClick={() => setChunkPage((current) => Math.max(1, current - 1))}
                  disabled={currentChunkPage <= 1}
                >
                  {locale === "zh" ? "上一页" : "Prev"}
                </Button>
                <Button
                  className="public-button-secondary h-8 px-3 text-xs"
                  onClick={() => setChunkPage((current) => Math.min(totalChunkPages, current + 1))}
                  disabled={currentChunkPage >= totalChunkPages}
                >
                  {locale === "zh" ? "下一页" : "Next"}
                </Button>
              </div>
            </div>
          ) : null}
        </article>
    </div>
  )
}
