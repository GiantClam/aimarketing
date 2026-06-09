"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

type McpStatus = "live" | "beta" | "planned"
type BindingMode = "existing_runtime" | "deferred" | "external_runtime"

type McpRecord = {
  id: number
  slug: string
  title: string
  summary: string
  serviceType: string
  status: McpStatus
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: BindingMode
  notes: string
  bindingOptions: Array<{ value: string; label: string }>
}

type Draft = Omit<McpRecord, "id" | "slug" | "bindingOptions">

function cloneDraft(item: McpRecord): Draft {
  return {
    title: item.title,
    summary: item.summary,
    serviceType: item.serviceType,
    status: item.status,
    publicVisible: item.publicVisible,
    workspaceVisible: item.workspaceVisible,
    bindingTarget: item.bindingTarget,
    bindingMode: item.bindingMode,
    notes: item.notes,
  }
}

export function WorkspaceMcpServiceProfileStudio({ locale }: { locale: "zh" | "en" }) {
  const [profiles, setProfiles] = useState<McpRecord[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [canManage, setCanManage] = useState(false)
  const [message, setMessage] = useState("")
  const [savingId, setSavingId] = useState<number | "new" | null>(null)
  const [createDraft, setCreateDraft] = useState<Draft>({
    title: "",
    summary: "",
    serviceType: "",
    status: "beta",
    publicVisible: false,
    workspaceVisible: true,
    bindingTarget: "agent-platform",
    bindingMode: "existing_runtime",
    notes: "",
  })

  const copy =
    locale === "zh"
      ? {
          eyebrow: "MCP Service Studio",
          title: "企业自定义 MCP 服务",
          description: "在默认 MCP 目录之外，为企业补一层自定义 service profile 的创建与编辑壳，先满足配置与绑定位治理，再逐步连接更深执行平台。",
          readOnly: "当前账号可以查看企业自定义 MCP 服务，但只有企业管理员可以创建或修改。",
          manage: "企业管理员可以在这里创建企业专属 MCP 服务，并控制展示面、状态和当前绑定目标。",
          titleLabel: "标题",
          summaryLabel: "摘要",
          serviceTypeLabel: "服务类型",
          statusLabel: "状态",
          publicVisibleLabel: "公开前台可见",
          workspaceVisibleLabel: "企业工作台可见",
          bindingTargetLabel: "绑定目标",
          bindingModeLabel: "绑定模式",
          notesLabel: "运营说明",
          create: "创建服务",
          save: "保存修改",
          noItems: "当前企业还没有自定义 MCP 服务。",
          saved: "已保存",
          created: "已创建",
          failed: "保存失败",
        }
      : {
          eyebrow: "MCP Service Studio",
          title: "Enterprise custom MCP services",
          description: "Add a minimum create/edit layer for enterprise MCP service profiles on top of the default registry.",
          readOnly: "You can inspect enterprise MCP services here, but only company admins can create or edit them.",
          manage: "Company admins can create enterprise-specific MCP service profiles here and control visibility, status, and bindings.",
          titleLabel: "Title",
          summaryLabel: "Summary",
          serviceTypeLabel: "Service type",
          statusLabel: "Status",
          publicVisibleLabel: "Visible on public site",
          workspaceVisibleLabel: "Visible in workspace",
          bindingTargetLabel: "Binding target",
          bindingModeLabel: "Binding mode",
          notesLabel: "Operating notes",
          create: "Create service",
          save: "Save changes",
          noItems: "No custom MCP services exist for this enterprise yet.",
          saved: "Saved",
          created: "Created",
          failed: "Save failed",
        }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/platform/admin/mcp-service-profiles?locale=${locale}`, {
          credentials: "same-origin",
          cache: "no-store",
        })
        if (!response.ok) return
        const payload = await response.json().catch(() => null)
        if (cancelled || !payload?.data) return
        const nextProfiles = (payload.data.profiles ?? []) as McpRecord[]
        setProfiles(nextProfiles)
        setCanManage(Boolean(payload.data.canManage))
        setDrafts(Object.fromEntries(nextProfiles.map((item) => [item.id, cloneDraft(item)])))
      } catch (error) {
        console.error("platform.mcp-service-profile-studio.load-failed", error)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [locale])

  const setDraft = (id: number, partial: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...partial,
      },
    }))
  }

  const saveItem = async (item: McpRecord) => {
    setSavingId(item.id)
    setMessage("")
    try {
      const response = await fetch("/api/platform/admin/mcp-service-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: item.id, ...drafts[item.id] }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "save_failed")
      setProfiles((current) => current.map((profile) => (profile.id === item.id ? { ...profile, ...drafts[item.id] } : profile)))
      setMessage(copy.saved)
    } catch (error) {
      setMessage(`${copy.failed}: ${error instanceof Error ? error.message : "unknown"}`)
    } finally {
      setSavingId(null)
    }
  }

  const createItem = async () => {
    setSavingId("new")
    setMessage("")
    try {
      const response = await fetch("/api/platform/admin/mcp-service-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(createDraft),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data) throw new Error(typeof payload?.error === "string" ? payload.error : "create_failed")
      const reload = await fetch(`/api/platform/admin/mcp-service-profiles?locale=${locale}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
      const reloadPayload = await reload.json().catch(() => null)
      const nextProfiles = (reloadPayload?.data?.profiles ?? []) as McpRecord[]
      setProfiles(nextProfiles)
      setDrafts(Object.fromEntries(nextProfiles.map((item) => [item.id, cloneDraft(item)])))
      setCreateDraft({
        title: "",
        summary: "",
        serviceType: "",
        status: "beta",
        publicVisible: false,
        workspaceVisible: true,
        bindingTarget: "agent-platform",
        bindingMode: "existing_runtime",
        notes: "",
      })
      setMessage(copy.created)
    } catch (error) {
      setMessage(`${copy.failed}: ${error instanceof Error ? error.message : "unknown"}`)
    } finally {
      setSavingId(null)
    }
  }

  const statusOptions: McpStatus[] = ["live", "beta", "planned"]

  return (
    <section className="public-grid-bg mx-auto max-w-7xl px-6 pb-10">
      <div className="space-y-8">
        <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
          <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
          <div className="mt-4 dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
            {canManage ? copy.manage : copy.readOnly}
          </div>
          {message ? <div className="mt-4 text-sm text-muted-foreground">{message}</div> : null}
        </div>

        {canManage ? (
          <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
            <div className="grid gap-4 xl:grid-cols-2">
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.titleLabel}</span>
                <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.title} onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.serviceTypeLabel}</span>
                <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.serviceType} onChange={(event) => setCreateDraft((current) => ({ ...current, serviceType: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                <span className="dashboard-kicker text-muted-foreground">{copy.summaryLabel}</span>
                <textarea className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={createDraft.summary} onChange={(event) => setCreateDraft((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.statusLabel}</span>
                <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.status} onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value as McpStatus }))}>
                  {statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.bindingTargetLabel}</span>
                <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.bindingTarget} onChange={(event) => setCreateDraft((current) => ({ ...current, bindingTarget: event.target.value }))}>
                  {profiles[0]?.bindingOptions?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) ?? <option value="agent-platform">agent-platform</option>}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.bindingModeLabel}</span>
                <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.bindingMode} onChange={(event) => setCreateDraft((current) => ({ ...current, bindingMode: event.target.value as BindingMode }))}>
                  <option value="existing_runtime">existing_runtime</option>
                  <option value="deferred">deferred</option>
                  <option value="external_runtime">external_runtime</option>
                </select>
              </label>
              <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                <span>{copy.publicVisibleLabel}</span>
                <input type="checkbox" checked={createDraft.publicVisible} onChange={(event) => setCreateDraft((current) => ({ ...current, publicVisible: event.target.checked }))} />
              </label>
              <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                <span>{copy.workspaceVisibleLabel}</span>
                <input type="checkbox" checked={createDraft.workspaceVisible} onChange={(event) => setCreateDraft((current) => ({ ...current, workspaceVisible: event.target.checked }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                <span className="dashboard-kicker text-muted-foreground">{copy.notesLabel}</span>
                <textarea className="dashboard-chip min-h-20 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={createDraft.notes} onChange={(event) => setCreateDraft((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <div className="mt-4"><Button onClick={createItem} disabled={savingId === "new"}>{copy.create}</Button></div>
          </article>
        ) : null}

        <div className="grid gap-4">
          {profiles.length === 0 ? <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5 text-sm text-muted-foreground">{copy.noItems}</div> : null}
          {profiles.map((item) => {
            const draft = drafts[item.id] ?? cloneDraft(item)
            return (
              <article key={item.id} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="grid gap-4 xl:grid-cols-2">
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.titleLabel}</span>
                    <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.title} disabled={!canManage} onChange={(event) => setDraft(item.id, { title: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.serviceTypeLabel}</span>
                    <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.serviceType} disabled={!canManage} onChange={(event) => setDraft(item.id, { serviceType: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                    <span className="dashboard-kicker text-muted-foreground">{copy.summaryLabel}</span>
                    <textarea className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={draft.summary} disabled={!canManage} onChange={(event) => setDraft(item.id, { summary: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.statusLabel}</span>
                    <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.status} disabled={!canManage} onChange={(event) => setDraft(item.id, { status: event.target.value as McpStatus })}>
                      {statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.bindingTargetLabel}</span>
                    <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.bindingTarget} disabled={!canManage} onChange={(event) => setDraft(item.id, { bindingTarget: event.target.value })}>
                      {item.bindingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.bindingModeLabel}</span>
                    <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.bindingMode} disabled={!canManage} onChange={(event) => setDraft(item.id, { bindingMode: event.target.value as BindingMode })}>
                      <option value="existing_runtime">existing_runtime</option>
                      <option value="deferred">deferred</option>
                      <option value="external_runtime">external_runtime</option>
                    </select>
                  </label>
                  <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                    <span>{copy.publicVisibleLabel}</span>
                    <input type="checkbox" checked={draft.publicVisible} disabled={!canManage} onChange={(event) => setDraft(item.id, { publicVisible: event.target.checked })} />
                  </label>
                  <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                    <span>{copy.workspaceVisibleLabel}</span>
                    <input type="checkbox" checked={draft.workspaceVisible} disabled={!canManage} onChange={(event) => setDraft(item.id, { workspaceVisible: event.target.checked })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                    <span className="dashboard-kicker text-muted-foreground">{copy.notesLabel}</span>
                    <textarea className="dashboard-chip min-h-20 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={draft.notes} disabled={!canManage} onChange={(event) => setDraft(item.id, { notes: event.target.value })} />
                  </label>
                </div>
                {canManage ? <div className="mt-4"><Button onClick={() => saveItem(item)} disabled={savingId === item.id}>{copy.save}</Button></div> : null}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
