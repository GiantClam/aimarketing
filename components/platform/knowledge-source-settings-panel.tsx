"use client"

import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { CheckCircle2, RefreshCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AppLocale } from "@/lib/i18n/config"
import type { KnowledgeSourceClientState, KnowledgeSourceStatus, KnowledgeSourceTestResult } from "@/lib/knowledge/types"

type KnowledgeSourceApiResponse = {
  data?: KnowledgeSourceClientState | null
  error?: string
}

type KnowledgeSourceTestApiResponse = {
  data?: {
    test?: KnowledgeSourceTestResult
    source?: KnowledgeSourceClientState | null
  }
  error?: string
}

function getSourceBadgeLabel(params: {
  locale: AppLocale
  pending: boolean
  source: KnowledgeSourceClientState | null
}) {
  if (params.pending) {
    return params.locale === "zh" ? "RAGFlow 检测中" : "Checking RAGFlow"
  }

  if (!params.source?.enabled || !params.source.baseUrl) {
    return params.locale === "zh" ? "RAGFlow 未连接" : "RAGFlow disconnected"
  }

  if (params.source.status === "healthy") {
    return params.locale === "zh" ? "RAGFlow 已连接" : "RAGFlow connected"
  }

  if (params.source.status === "degraded") {
    return params.locale === "zh" ? "RAGFlow 连接异常" : "RAGFlow degraded"
  }

  return params.locale === "zh" ? "RAGFlow 不可用" : "RAGFlow unavailable"
}

function getSourceBadgeTone(status: KnowledgeSourceStatus | null, pending: boolean) {
  if (pending) {
    return "rounded-[6px] border border-amber-300 bg-amber-50 text-amber-700"
  }
  if (status === "healthy") {
    return "rounded-[6px] border border-primary/30 bg-primary text-primary-foreground"
  }
  if (status === "degraded") {
    return "rounded-[6px] border border-amber-300 bg-amber-50 text-amber-700"
  }
  return "rounded-[6px] border border-red-200 bg-red-50 text-red-700"
}

export function KnowledgeSourceSettingsPanel({
  locale,
  initialSource,
  canManage,
}: {
  locale: AppLocale
  initialSource: KnowledgeSourceClientState | null
  canManage: boolean
}) {
  const copy = useMemo(
    () =>
      locale === "zh"
        ? {
            eyebrow: "Knowledge connection",
            title: "RAGFlow 连接设置",
            description: "统一在企业设置里维护知识检索引擎连接，知识库页面只保留文档与知识库操作。",
            sourceName: "连接名称",
            sourceBaseUrl: "RAGFlow 地址",
            sourceApiKey: "API Key",
            saveSource: "保存连接",
            testConnection: "测试连接",
            sourceSaved: "连接设置已保存",
            uploadError: "当前仅管理员可管理知识连接。",
            configuredPlaceholder: "已配置，留空则保留",
            baseUrlRequired: "请填写 RAGFlow 地址",
            testSuccess: "连接检测成功",
            lastChecked: "最近检测",
            notChecked: "尚未检测",
          }
        : {
            eyebrow: "Knowledge connection",
            title: "RAGFlow connection settings",
            description: "Manage the shared knowledge-retrieval engine in platform settings while the knowledge hub stays focused on document and dataset operations.",
            sourceName: "Connection name",
            sourceBaseUrl: "RAGFlow base URL",
            sourceApiKey: "API key",
            saveSource: "Save connection",
            testConnection: "Test connection",
            sourceSaved: "Connection settings saved",
            uploadError: "Only admins can manage the knowledge connection.",
            configuredPlaceholder: "Already configured, leave blank to keep",
            baseUrlRequired: "Base URL is required",
            testSuccess: "Connection verified successfully",
            lastChecked: "Last checked",
            notChecked: "Not checked yet",
          },
    [locale],
  )

  const [busy, setBusy] = useState<"save" | "test" | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sourceState, setSourceState] = useState<KnowledgeSourceClientState | null>(initialSource)
  const [sourceName, setSourceName] = useState(initialSource?.name || "RAGFlow Enterprise Knowledge")
  const [sourceBaseUrl, setSourceBaseUrl] = useState(initialSource?.baseUrl || "")
  const [sourceApiKey, setSourceApiKey] = useState("")
  const [sourceCheckPending, setSourceCheckPending] = useState(false)

  async function handleConnectionTest() {
    setBusy("test")
    setSourceCheckPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/knowledge/source/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      })
      const payload = (await response.json().catch(() => null)) as KnowledgeSourceTestApiResponse | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_source_test_failed")
      if (payload?.data?.source) {
        setSourceState(payload.data.source)
        setSourceName(payload.data.source.name || "RAGFlow Enterprise Knowledge")
        setSourceBaseUrl(payload.data.source.baseUrl || "")
      }
      setMessage(payload?.data?.test?.message || copy.testSuccess)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_source_test_failed")
    } finally {
      setSourceCheckPending(false)
      setBusy(null)
    }
  }

  async function handleSourceSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage) {
      setMessage(copy.uploadError)
      return
    }
    if (!sourceBaseUrl.trim()) {
      setMessage(copy.baseUrlRequired)
      return
    }

    setBusy("save")
    setMessage(null)
    try {
      const response = await fetch("/api/knowledge/source", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: sourceName.trim(),
          baseUrl: sourceBaseUrl.trim(),
          apiKey: sourceApiKey.trim(),
          enabled: true,
        }),
      })
      const payload = (await response.json().catch(() => null)) as KnowledgeSourceApiResponse | null
      if (!response.ok) throw new Error(payload?.error || "knowledge_source_save_failed")
      if (payload?.data) {
        setSourceState(payload.data)
        setSourceName(payload.data.name || "RAGFlow Enterprise Knowledge")
        setSourceBaseUrl(payload.data.baseUrl || "")
      }
      setSourceApiKey("")
      setMessage(copy.sourceSaved)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "knowledge_source_save_failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="dashboard-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
            {copy.title}
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.description}</p>
        </div>
        <Badge className={getSourceBadgeTone(sourceState?.status || null, sourceCheckPending)}>
          {getSourceBadgeLabel({ locale, pending: sourceCheckPending, source: sourceState })}
        </Badge>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="dashboard-chip rounded-[6px] px-3 py-2 text-foreground/85">
          {copy.lastChecked}: {sourceState?.lastCheckedAt || copy.notChecked}
        </div>
        {sourceState?.lastError ? (
          <div className="dashboard-chip rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-red-700">
            {sourceState.lastError}
          </div>
        ) : null}
      </div>

      <form className="mt-6 grid gap-4 md:grid-cols-3" onSubmit={handleSourceSave}>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{copy.sourceName}</label>
          <Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{copy.sourceBaseUrl}</label>
          <Input value={sourceBaseUrl} onChange={(event) => setSourceBaseUrl(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">{copy.sourceApiKey}</label>
          <Input
            type="password"
            value={sourceApiKey}
            placeholder={initialSource?.apiKeyConfigured ? copy.configuredPlaceholder : ""}
            onChange={(event) => setSourceApiKey(event.target.value)}
          />
        </div>
        <div className="md:col-span-3 flex flex-wrap gap-3">
          <Button type="submit" className="public-button-secondary h-10 px-4" disabled={busy === "save"}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {copy.saveSource}
          </Button>
          <Button
            type="button"
            className="public-button-secondary h-10 px-4"
            onClick={handleConnectionTest}
            disabled={busy === "test"}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {copy.testConnection}
          </Button>
        </div>
      </form>

      {message ? (
        <div className="mt-4 rounded-[8px] border border-border bg-background/80 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}
    </article>
  )
}
