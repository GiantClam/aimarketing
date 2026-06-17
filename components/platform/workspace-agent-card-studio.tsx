"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

type AgentCardStatus = "live" | "beta" | "planned"
type BindingMode = "existing_runtime" | "deferred" | "external_runtime"

type AgentCardRecord = {
  id: number
  slug: string
  title: string
  summary: string
  focus: string
  status: AgentCardStatus
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: BindingMode
  notes: string
  bindingOptions: Array<{ value: string; label: string }>
}

type Draft = Omit<AgentCardRecord, "id" | "slug" | "bindingOptions">

function cloneDraft(card: AgentCardRecord): Draft {
  return {
    title: card.title,
    summary: card.summary,
    focus: card.focus,
    status: card.status,
    publicVisible: card.publicVisible,
    workspaceVisible: card.workspaceVisible,
    bindingTarget: card.bindingTarget,
    bindingMode: card.bindingMode,
    notes: card.notes,
  }
}

export function WorkspaceAgentCardStudio({ locale }: { locale: "zh" | "en" }) {
  const [cards, setCards] = useState<AgentCardRecord[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [canManage, setCanManage] = useState(false)
  const [message, setMessage] = useState("")
  const [savingId, setSavingId] = useState<number | "new" | null>(null)
  const [createDraft, setCreateDraft] = useState<Draft>({
    title: "",
    summary: "",
    focus: "",
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
          eyebrow: "Agent Card Studio",
          title: "企业自定义 Agent 卡片",
          description: "在平台注册表之外，补一层企业自定义 Agent card 的创建与编辑壳，先满足中台编排与展示，再逐步衔接更深执行能力。",
          readOnly: "当前账号可以查看企业自定义 Agent 卡片，但只有企业管理员可以创建或修改。",
          manage: "企业管理员可以在这里创建企业专属 Agent 卡片，并设置展示面、状态和当前绑定位。",
          titleLabel: "标题",
          summaryLabel: "摘要",
          focusLabel: "定位",
          statusLabel: "状态",
          publicVisibleLabel: "公开前台可见",
          workspaceVisibleLabel: "企业工作台可见",
          bindingTargetLabel: "绑定目标",
          bindingModeLabel: "绑定模式",
          notesLabel: "运营说明",
          create: "创建卡片",
          save: "保存修改",
          noCards: "当前企业还没有自定义 Agent 卡片。",
          saved: "已保存",
          created: "已创建",
          failed: "保存失败",
        }
      : {
          eyebrow: "Agent Card Studio",
          title: "Enterprise custom agent cards",
          description: "Add a minimum create/edit layer for enterprise agent cards on top of the platform registry before deeper execution lands.",
          readOnly: "You can inspect enterprise custom agent cards here, but only company admins can create or edit them.",
          manage: "Company admins can create enterprise-specific agent cards here and control visibility, status, and bindings.",
          titleLabel: "Title",
          summaryLabel: "Summary",
          focusLabel: "Focus",
          statusLabel: "Status",
          publicVisibleLabel: "Visible on public site",
          workspaceVisibleLabel: "Visible in workspace",
          bindingTargetLabel: "Binding target",
          bindingModeLabel: "Binding mode",
          notesLabel: "Operating notes",
          create: "Create card",
          save: "Save changes",
          noCards: "No custom agent cards exist for this enterprise yet.",
          saved: "Saved",
          created: "Created",
          failed: "Save failed",
        }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/platform/admin/agent-cards?locale=${locale}`, {
          credentials: "same-origin",
          cache: "no-store",
        })
        if (!response.ok) return

        const payload = await response.json().catch(() => null)
        if (cancelled || !payload?.data) return

        const nextCards = (payload.data.cards ?? []) as AgentCardRecord[]
        setCards(nextCards)
        setCanManage(Boolean(payload.data.canManage))
        setDrafts(Object.fromEntries(nextCards.map((card) => [card.id, cloneDraft(card)])))
      } catch (error) {
        console.error("platform.agent-card-studio.load-failed", error)
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

  const saveCard = async (card: AgentCardRecord) => {
    setSavingId(card.id)
    setMessage("")

    try {
      const response = await fetch("/api/platform/admin/agent-cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: card.id, ...drafts[card.id] }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "save_failed")
      }

      setCards((current) =>
        current.map((item) => (item.id === card.id ? { ...item, ...drafts[card.id] } : item)),
      )
      setMessage(copy.saved)
    } catch (error) {
      setMessage(`${copy.failed}: ${error instanceof Error ? error.message : "unknown"}`)
    } finally {
      setSavingId(null)
    }
  }

  const createCard = async () => {
    setSavingId("new")
    setMessage("")

    try {
      const response = await fetch("/api/platform/admin/agent-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(createDraft),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "create_failed")
      }

      const reload = await fetch(`/api/platform/admin/agent-cards?locale=${locale}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
      const reloadPayload = await reload.json().catch(() => null)
      const nextCards = (reloadPayload?.data?.cards ?? []) as AgentCardRecord[]
      setCards(nextCards)
      setDrafts(Object.fromEntries(nextCards.map((card) => [card.id, cloneDraft(card)])))
      setCreateDraft({
        title: "",
        summary: "",
        focus: "",
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

  const statusOptions: AgentCardStatus[] = ["live", "beta", "planned"]

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
                <span className="dashboard-kicker text-muted-foreground">{copy.focusLabel}</span>
                <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.focus} onChange={(event) => setCreateDraft((current) => ({ ...current, focus: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                <span className="dashboard-kicker text-muted-foreground">{copy.summaryLabel}</span>
                <textarea className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={createDraft.summary} onChange={(event) => setCreateDraft((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.statusLabel}</span>
                <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.status} onChange={(event) => setCreateDraft((current) => ({ ...current, status: event.target.value as AgentCardStatus }))}>
                  {statusOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-foreground">
                <span className="dashboard-kicker text-muted-foreground">{copy.bindingTargetLabel}</span>
                <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={createDraft.bindingTarget} onChange={(event) => setCreateDraft((current) => ({ ...current, bindingTarget: event.target.value }))}>
                  {cards[0]?.bindingOptions?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  )) ?? (
                    <option value="agent-platform">agent-platform</option>
                  )}
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
            <div className="mt-4">
              <Button onClick={createCard} disabled={savingId === "new"}>
                {copy.create}
              </Button>
            </div>
          </article>
        ) : null}

        <div className="grid gap-4">
          {cards.length === 0 ? (
            <div className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 text-sm text-muted-foreground">
              {copy.noCards}
            </div>
          ) : null}

          {cards.map((card) => {
            const draft = drafts[card.id] ?? cloneDraft(card)
            return (
              <article key={card.id} className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="grid gap-4 xl:grid-cols-2">
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.titleLabel}</span>
                    <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.title} disabled={!canManage} onChange={(event) => setDraft(card.id, { title: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.focusLabel}</span>
                    <input className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.focus} disabled={!canManage} onChange={(event) => setDraft(card.id, { focus: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                    <span className="dashboard-kicker text-muted-foreground">{copy.summaryLabel}</span>
                    <textarea className="dashboard-chip min-h-24 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={draft.summary} disabled={!canManage} onChange={(event) => setDraft(card.id, { summary: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.statusLabel}</span>
                    <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.status} disabled={!canManage} onChange={(event) => setDraft(card.id, { status: event.target.value as AgentCardStatus })}>
                      {statusOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.bindingTargetLabel}</span>
                    <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.bindingTarget} disabled={!canManage} onChange={(event) => setDraft(card.id, { bindingTarget: event.target.value })}>
                      {card.bindingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-foreground">
                    <span className="dashboard-kicker text-muted-foreground">{copy.bindingModeLabel}</span>
                    <select className="dashboard-chip h-11 rounded-[4px] border border-border bg-background px-3 text-sm" value={draft.bindingMode} disabled={!canManage} onChange={(event) => setDraft(card.id, { bindingMode: event.target.value as BindingMode })}>
                      <option value="existing_runtime">existing_runtime</option>
                      <option value="deferred">deferred</option>
                      <option value="external_runtime">external_runtime</option>
                    </select>
                  </label>
                  <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                    <span>{copy.publicVisibleLabel}</span>
                    <input type="checkbox" checked={draft.publicVisible} disabled={!canManage} onChange={(event) => setDraft(card.id, { publicVisible: event.target.checked })} />
                  </label>
                  <label className="dashboard-chip flex items-center justify-between rounded-[4px] px-3 py-3 text-sm text-foreground">
                    <span>{copy.workspaceVisibleLabel}</span>
                    <input type="checkbox" checked={draft.workspaceVisible} disabled={!canManage} onChange={(event) => setDraft(card.id, { workspaceVisible: event.target.checked })} />
                  </label>
                  <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
                    <span className="dashboard-kicker text-muted-foreground">{copy.notesLabel}</span>
                    <textarea className="dashboard-chip min-h-20 rounded-[4px] border border-border bg-background px-3 py-3 text-sm" value={draft.notes} disabled={!canManage} onChange={(event) => setDraft(card.id, { notes: event.target.value })} />
                  </label>
                </div>

                {canManage ? (
                  <div className="mt-4">
                    <Button onClick={() => saveCard(card)} disabled={savingId === card.id}>
                      {copy.save}
                    </Button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
