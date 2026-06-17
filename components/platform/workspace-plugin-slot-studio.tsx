"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

type PluginSlotStatus = "live" | "beta" | "planned"
type BindingMode = "existing_runtime" | "deferred" | "external_runtime"

type PluginSlotRecord = {
  id: number
  slug: string
  title: string
  summary: string
  integratesWith: string
  status: PluginSlotStatus
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: BindingMode
  notes: string
  bindingOptions: Array<{ value: string; label: string }>
}

type Draft = Omit<PluginSlotRecord, "id" | "slug" | "bindingOptions">

function cloneDraft(slot: PluginSlotRecord): Draft {
  return {
    title: slot.title,
    summary: slot.summary,
    integratesWith: slot.integratesWith,
    status: slot.status,
    publicVisible: slot.publicVisible,
    workspaceVisible: slot.workspaceVisible,
    bindingTarget: slot.bindingTarget,
    bindingMode: slot.bindingMode,
    notes: slot.notes,
  }
}

export function WorkspacePluginSlotStudio({ locale }: { locale: "zh" | "en" }) {
  const [plugins, setPlugins] = useState<PluginSlotRecord[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [canManage, setCanManage] = useState(false)
  const [message, setMessage] = useState("")
  const [savingId, setSavingId] = useState<number | "new" | null>(null)
  const [createDraft, setCreateDraft] = useState<Draft>({
    title: "",
    summary: "",
    integratesWith: "",
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
          eyebrow: "Plugin Slot Studio",
          title: "企业自定义插件位",
          description: "在默认插件目录之外，为企业补一层自定义 plugin slot 的创建与编辑壳，先满足扩展位编排、显示控制与绑定管理。",
          readOnly: "当前账号可以查看企业自定义插件位，但只有企业管理员可以创建或修改。",
          manage: "企业管理员可以在这里创建企业专属插件位，并控制展示面、状态和当前绑定目标。",
          titleLabel: "标题",
          summaryLabel: "摘要",
          integratesWithLabel: "集成范围",
          statusLabel: "状态",
          publicVisibleLabel: "公开前台可见",
          workspaceVisibleLabel: "企业工作台可见",
          bindingTargetLabel: "绑定目标",
          bindingModeLabel: "绑定模式",
          notesLabel: "运营说明",
          create: "创建插件位",
          save: "保存修改",
          noItems: "当前企业还没有自定义插件位。",
          saved: "已保存",
          created: "已创建",
          failed: "保存失败",
        }
      : {
          eyebrow: "Plugin Slot Studio",
          title: "Enterprise custom plugin slots",
          description: "Add a minimum create/edit layer for enterprise plugin slots on top of the default plugin directory.",
          readOnly: "You can inspect enterprise plugin slots here, but only company admins can create or edit them.",
          manage: "Company admins can create enterprise-specific plugin slots here and control visibility, status, and bindings.",
          titleLabel: "Title",
          summaryLabel: "Summary",
          integratesWithLabel: "Integrates with",
          statusLabel: "Status",
          publicVisibleLabel: "Visible on public site",
          workspaceVisibleLabel: "Visible in workspace",
          bindingTargetLabel: "Binding target",
          bindingModeLabel: "Binding mode",
          notesLabel: "Operating notes",
          create: "Create plugin slot",
          save: "Save changes",
          noItems: "No custom plugin slots exist for this enterprise yet.",
          saved: "Saved",
          created: "Created",
          failed: "Save failed",
        }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/platform/admin/plugin-slots?locale=${locale}`, {
          credentials: "same-origin",
          cache: "no-store",
        })
        if (!response.ok) return
        const payload = await response.json().catch(() => null)
        if (cancelled || !payload?.data) return
        const nextPlugins = (payload.data.plugins ?? []) as PluginSlotRecord[]
        setPlugins(nextPlugins)
        setCanManage(Boolean(payload.data.canManage))
        setDrafts(Object.fromEntries(nextPlugins.map((item) => [item.id, cloneDraft(item)])))
      } catch (error) {
        console.error("platform.plugin-slot-studio.load-failed", error)
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

  const saveItem = async (item: PluginSlotRecord) => {
    setSavingId(item.id)
    setMessage("")
    try {
      const response = await fetch("/api/platform/admin/plugin-slots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: item.id, ...drafts[item.id] }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "save_failed")
      }
      setPlugins((current) => current.map((slot) => (slot.id === item.id ? { ...slot, ...drafts[item.id] } : slot)))
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
      const response = await fetch("/api/platform/admin/plugin-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(createDraft),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "create_failed")
      }
      const reload = await fetch(`/api/platform/admin/plugin-slots?locale=${locale}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
      const reloadPayload = await reload.json().catch(() => null)
      const nextPlugins = (reloadPayload?.data?.plugins ?? []) as PluginSlotRecord[]
      setPlugins(nextPlugins)
      setDrafts(Object.fromEntries(nextPlugins.map((item) => [item.id, cloneDraft(item)])))
      setCreateDraft({
        title: "",
        summary: "",
        integratesWith: "",
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

  const statusOptions: PluginSlotStatus[] = ["live", "beta", "planned"]

  return (
    <section className="public-grid-bg workspace-page-shell-bottom mx-auto max-w-7xl">
      <div className="workspace-stack">
        <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
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
          <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
            <div className="grid gap-4 xl:grid-cols-2">
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.titleLabel}</span>
                <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.title} onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.integratesWithLabel}</span>
                <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.integratesWith} onChange={(event) => setCreateDraft((current) => ({ ...current, integratesWith: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                <span className="dashboard-kicker text-muted-foreground">{copy.summaryLabel}</span>
                <textarea className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={createDraft.summary} onChange={(event) => setCreateDraft((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.statusLabel}</span>
                <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.status} onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value as PluginSlotStatus }))}>
                  {statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.bindingTargetLabel}</span>
                <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.bindingTarget} onChange={(event) => setCreateDraft((current) => ({ ...current, bindingTarget: event.target.value }))}>
                  {plugins[0]?.bindingOptions?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) ?? <option value="agent-platform">agent-platform</option>}
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
          {plugins.length === 0 ? <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 text-sm text-muted-foreground">{copy.noItems}</div> : null}
          {plugins.map((item) => {
            const draft = drafts[item.id] ?? cloneDraft(item)
            return (
              <article key={item.id} className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="grid gap-4 xl:grid-cols-2">
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.titleLabel}</span>
                    <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.title} disabled={!canManage} onChange={(event) => setDraft(item.id, { title: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.integratesWithLabel}</span>
                    <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.integratesWith} disabled={!canManage} onChange={(event) => setDraft(item.id, { integratesWith: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                    <span className="dashboard-kicker text-muted-foreground">{copy.summaryLabel}</span>
                    <textarea className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={draft.summary} disabled={!canManage} onChange={(event) => setDraft(item.id, { summary: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.statusLabel}</span>
                    <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.status} disabled={!canManage} onChange={(event) => setDraft(item.id, { status: event.target.value as PluginSlotStatus })}>
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
