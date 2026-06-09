"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { PlatformRegistryControlEntry, PlatformRegistryItemType } from "@/lib/platform/control-plane"
import type { PlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"

type DraftEntry = PlatformRegistryControlEntry["config"]

function cloneDraft(config: PlatformRegistryControlEntry["config"]): DraftEntry {
  return {
    enabled: config.enabled,
    publicVisible: config.publicVisible,
    workspaceVisible: config.workspaceVisible,
    bindingTarget: config.bindingTarget,
    bindingMode: config.bindingMode,
    notes: config.notes,
  }
}

export function WorkspacePlatformRegistryAdmin({
  locale,
  itemType,
  title,
  description,
  canManage: initialCanManage,
  entries: initialEntries,
  executions: initialExecutions = [],
}: {
  locale: "zh" | "en"
  itemType: PlatformRegistryItemType
  title: string
  description: string
  canManage: boolean
  entries: PlatformRegistryControlEntry[]
  executions?: PlatformRegistryEntryExecutionState[]
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [canManage, setCanManage] = useState(initialCanManage)
  const [executions, setExecutions] = useState<Record<string, PlatformRegistryEntryExecutionState>>(
    Object.fromEntries(initialExecutions.map((execution) => [execution.slug, execution])),
  )
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>(
    Object.fromEntries(initialEntries.map((entry) => [entry.slug, cloneDraft(entry.config)])),
  )
  const [savingSlug, setSavingSlug] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Registry First Control Plane",
          readOnly: "当前账号可以查看当前企业的平台注册表状态，但只有企业管理员可以修改。",
          manage: "企业管理员可以在这里设置启用状态、公开/工作台可见性，以及当前绑定位。",
          enabled: "启用",
          publicVisible: "公开前台可见",
          workspaceVisible: "企业工作台可见",
          bindingMode: "绑定模式",
          bindingTarget: "绑定目标",
          notes: "运营说明",
          save: "保存配置",
          reset: "恢复默认",
          saved: "已保存",
          saveFailed: "保存失败",
          currentExecution: "当前执行状态",
          mappedCapability: "映射目标",
          access: "访问门槛",
          launchPublic: "打开公共入口",
          launchWorkspace: "打开工作台入口",
          existing_runtime: "现有运行时",
          deferred: "后续实现",
          external_runtime: "外部运行时",
        }
      : {
          eyebrow: "Registry First Control Plane",
          readOnly: "You can inspect the enterprise registry state here, but only company admins can change it.",
          manage: "Company admins can control enabled state, public/workspace visibility, and the current binding target here.",
          enabled: "Enabled",
          publicVisible: "Visible on public site",
          workspaceVisible: "Visible in workspace",
          bindingMode: "Binding mode",
          bindingTarget: "Binding target",
          notes: "Operating notes",
          save: "Save",
          reset: "Use defaults",
          saved: "Saved",
          saveFailed: "Save failed",
          currentExecution: "Current execution state",
          mappedCapability: "Mapped target",
          access: "Access",
          launchPublic: "Open public launch",
          launchWorkspace: "Open workspace launch",
          existing_runtime: "Existing runtime",
          deferred: "Deferred",
          external_runtime: "External runtime",
        }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/platform/admin/registry?type=${encodeURIComponent(itemType)}&locale=${locale}`, {
          credentials: "same-origin",
          cache: "no-store",
        })
        if (!response.ok) return

        const payload = await response.json().catch(() => null)
        if (cancelled || !payload?.data?.entries) return

        const nextEntries = payload.data.entries as PlatformRegistryControlEntry[]
        const nextExecutions = (payload.data.executions || []) as PlatformRegistryEntryExecutionState[]
        setEntries(nextEntries)
        setCanManage(Boolean(payload.data.canManage))
        setExecutions(Object.fromEntries(nextExecutions.map((execution) => [execution.slug, execution])))
        setDrafts(Object.fromEntries(nextEntries.map((entry) => [entry.slug, cloneDraft(entry.config)])))
      } catch (error) {
        console.error("platform.registry.admin.load-failed", error)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [itemType, locale])

  const setDraft = (slug: string, partial: Partial<DraftEntry>) => {
    setDrafts((current) => ({
      ...current,
      [slug]: {
        ...current[slug],
        ...partial,
      },
    }))
  }

  const handleReset = (entry: PlatformRegistryControlEntry) => {
    setDrafts((current) => ({
      ...current,
      [entry.slug]: cloneDraft(entry.defaultConfig),
    }))
    setMessages((current) => ({
      ...current,
      [entry.slug]: "",
    }))
  }

  const handleSave = async (entry: PlatformRegistryControlEntry) => {
    setSavingSlug(entry.slug)
    setMessages((current) => ({
      ...current,
      [entry.slug]: "",
    }))

    try {
      const draft = drafts[entry.slug]
      const response = await fetch("/api/platform/admin/registry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          itemType,
          slug: entry.slug,
          ...draft,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "save_failed")
      }

      const reload = await fetch(`/api/platform/admin/registry?type=${encodeURIComponent(itemType)}&locale=${locale}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
      const reloaded = await reload.json().catch(() => null)
      const reloadedEntries = (reloaded?.data?.entries || []) as PlatformRegistryControlEntry[]
      const reloadedExecutions = (reloaded?.data?.executions || []) as PlatformRegistryEntryExecutionState[]

      setMessages((current) => ({
        ...current,
        [entry.slug]: copy.saved,
      }))
      if (reloadedEntries.length > 0) {
        setEntries(reloadedEntries)
        setDrafts(Object.fromEntries(reloadedEntries.map((item) => [item.slug, cloneDraft(item.config)])))
      } else {
        setEntries((current) =>
          current.map((item) =>
            item.slug === entry.slug
              ? {
                  ...item,
                  config: { ...draft },
                }
              : item,
          ),
        )
      }
      setExecutions(Object.fromEntries(reloadedExecutions.map((execution) => [execution.slug, execution])))
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [entry.slug]: `${copy.saveFailed}: ${error instanceof Error ? error.message : "unknown"}`,
      }))
    } finally {
      setSavingSlug(null)
    }
  }

  return (
    <section className="public-grid-bg mx-auto max-w-7xl px-6 pb-10">
      <div className="space-y-8">
        <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
          <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
            {title}
          </h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{description}</p>
          <div className="mt-4 dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
            {canManage ? copy.manage : copy.readOnly}
          </div>
        </div>

        <div className="grid gap-4">
          {entries.map((entry) => {
            const draft = drafts[entry.slug]
            const execution = executions[entry.slug]
            const bindingOptions =
              entry.bindingOptions.length > 0
                ? entry.bindingOptions
                : [{ value: draft.bindingTarget, label: draft.bindingTarget }]
            return (
              <article key={entry.slug} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="dashboard-kicker text-muted-foreground">{entry.surfaceLabel}</div>
                    <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {entry.title}
                    </h3>
                    <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{entry.summary}</p>
                  </div>
                  <div className="dashboard-chip rounded-[4px] px-3 py-2 text-xs uppercase tracking-[0.12em] text-foreground/80">
                    {entry.status}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                    <span>{copy.enabled}</span>
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      disabled={!canManage}
                      onChange={(event) => setDraft(entry.slug, { enabled: event.target.checked })}
                    />
                  </label>

                  <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                    <span>{copy.publicVisible}</span>
                    <input
                      type="checkbox"
                      checked={draft.publicVisible}
                      disabled={!canManage}
                      onChange={(event) => setDraft(entry.slug, { publicVisible: event.target.checked })}
                    />
                  </label>

                  <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                    <span>{copy.workspaceVisible}</span>
                    <input
                      type="checkbox"
                      checked={draft.workspaceVisible}
                      disabled={!canManage}
                      onChange={(event) => setDraft(entry.slug, { workspaceVisible: event.target.checked })}
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.bindingMode}</span>
                    <select
                      className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
                      value={draft.bindingMode}
                      disabled={!canManage}
                      onChange={(event) =>
                        setDraft(entry.slug, {
                          bindingMode: event.target.value as DraftEntry["bindingMode"],
                        })
                      }
                    >
                      <option value="existing_runtime">{copy.existing_runtime}</option>
                      <option value="deferred">{copy.deferred}</option>
                      <option value="external_runtime">{copy.external_runtime}</option>
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.bindingTarget}</span>
                    <select
                      className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm"
                      value={draft.bindingTarget}
                      disabled={!canManage}
                      onChange={(event) => setDraft(entry.slug, { bindingTarget: event.target.value })}
                    >
                      {bindingOptions.map((option) => (
                        <option key={`${entry.slug}-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                    <span className="dashboard-kicker text-muted-foreground">{copy.notes}</span>
                    <textarea
                      className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm"
                      value={draft.notes}
                      disabled={!canManage}
                      onChange={(event) => setDraft(entry.slug, { notes: event.target.value })}
                    />
                  </label>
                </div>

                <div className="mt-4 space-y-2">
                  {execution ? (
                    <>
                      <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                        <span className="font-medium text-foreground">{copy.currentExecution}:</span> {execution.label}
                      </div>
                      <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                        <span className="font-medium text-foreground">{copy.mappedCapability}:</span> {execution.mappedCapabilitySlug || "—"}
                      </div>
                      <div className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                        <span className="font-medium text-foreground">{copy.access}:</span> {execution.accessState || "—"}
                      </div>
                    </>
                  ) : null}
                  {entry.proofPoints.map((point) => (
                    <div key={point} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                      {point}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button
                    className="public-button-primary h-10 px-4"
                    disabled={!canManage || savingSlug === entry.slug}
                    onClick={() => void handleSave(entry)}
                  >
                    {savingSlug === entry.slug ? "..." : copy.save}
                  </Button>
                  <Button
                    className="public-button-secondary h-10 px-4"
                    disabled={!canManage || savingSlug === entry.slug}
                    onClick={() => handleReset(entry)}
                  >
                    {copy.reset}
                  </Button>
                  {execution ? (
                    <>
                      <Button className="public-button-secondary h-10 px-4" asChild>
                        <Link href={execution.publicLaunchPath}>{copy.launchPublic}</Link>
                      </Button>
                      <Button className="public-button-secondary h-10 px-4" asChild>
                        <Link href={execution.workspaceLaunchPath}>{copy.launchWorkspace}</Link>
                      </Button>
                    </>
                  ) : null}
                  {messages[entry.slug] ? (
                    <span className="text-sm text-muted-foreground">{messages[entry.slug]}</span>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
