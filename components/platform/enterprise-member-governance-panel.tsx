"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Check, KeyRound, PauseCircle, PlayCircle, Shield, UserX, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FEATURE_KEYS, buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"
import type { AppLocale } from "@/lib/i18n/config"
import { isFeatureRuntimeEnabled } from "@/lib/runtime-features"

type PendingRequest = {
  requestId: number
  userId: number
  userName: string
  userEmail: string
  createdAt: string
  note?: string | null
}

type Member = {
  id: number
  name: string
  email: string
  enterpriseRole: string | null
  enterpriseStatus: string | null
  isDemo: boolean
  permissions: PermissionMap
}

function formatEnterpriseReviewMessage(
  payload: { error?: string; activeMemberCount?: number; seatLimit?: number; planCode?: string } | null | undefined,
  fallback: string,
  locale: AppLocale,
) {
  const isZh = locale === "zh"
  const message = typeof payload?.error === "string" ? payload.error : ""
  if (message === "billing_member_limit_reached") {
    const activeMemberCount = Number(payload?.activeMemberCount || 0)
    const seatLimit = Number(payload?.seatLimit || 0)
    const planCode = String(payload?.planCode || "").toLowerCase()
    return isZh
      ? `当前 ${planCode || "workspace"} 套餐最多支持 ${seatLimit} 位活跃成员，现有 ${activeMemberCount} 位。请先升级套餐后再通过申请。`
      : `The current ${planCode || "workspace"} plan supports up to ${seatLimit} active members and already has ${activeMemberCount}. Upgrade the plan before approving this request.`
  }
  return message || fallback
}

function formatMemberActionMessage(error: unknown, fallback: string, locale: AppLocale) {
  const isZh = locale === "zh"
  const message = error instanceof Error ? error.message : ""
  if (message === "cannot_modify_self") return isZh ? "当前账号不支持停用或移出，请改由其他企业管理员处理。" : "The current account cannot be suspended or removed here. Ask another company admin to handle it."
  if (message === "cannot_remove_last_admin") return isZh ? "至少需要保留一位活跃企业管理员，当前成员暂时不能移出。" : "At least one active company admin must remain, so this member cannot be removed right now."
  if (message === "target user must belong to same enterprise") return isZh ? "只能管理当前企业下的成员。" : "You can only manage members in the current company."
  if (message === "temporary_password_invalid") return isZh ? "临时密码至少需要 8 位，且不能超过 128 位。" : "Temporary passwords must be 8-128 characters long."
  if (message === "unsupported_member_action") return isZh ? "暂不支持该成员操作。" : "This member action is not supported."
  return message || fallback
}

const panelClassName = "dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85"
const shellClassName = "dashboard-panel rounded-[8px] border border-border bg-background/80 shadow-none"
const toggleClassName =
  "dashboard-chip flex items-center gap-2 rounded-[6px] border border-border/80 bg-card px-3 py-2 text-sm text-foreground"
const tagClassName =
  "dashboard-chip inline-flex items-center rounded-[6px] border border-border/80 bg-background px-3 py-2 text-[11px] tracking-[0.14em] text-foreground"

export function EnterpriseMemberGovernancePanel({
  locale,
  currentUserId,
  canManage,
}: {
  locale: AppLocale
  currentUserId: number
  canManage: boolean
}) {
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])

  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingAdminData, setLoadingAdminData] = useState(false)
  const [memberActionMessage, setMemberActionMessage] = useState("")
  const [actingMemberId, setActingMemberId] = useState<number | null>(null)
  const [permissionDrafts, setPermissionDrafts] = useState<Record<number, PermissionMap>>({})

  const featureLabels = useMemo(
    () => ({
      expert_advisor: t("专家顾问", "Expert advisor"),
      customer_profile_entry: t("客户画像入口", "Customer profile entry"),
      website_generation: t("网站生成", "Website generation"),
      video_generation: t("视频生成", "Video generation"),
      copywriting_generation: t("文案生成", "Copywriting generation"),
      image_design_generation: t("图片设计", "Image design"),
    }),
    [t],
  )

  const configurableFeatureKeys = useMemo(
    () => FEATURE_KEYS.filter((feature) => isFeatureRuntimeEnabled(feature)),
    [],
  )

  const loadAdminData = useCallback(async () => {
    if (!canManage || !Number.isFinite(currentUserId) || currentUserId <= 0) return

    setLoadingAdminData(true)
    try {
      const [requestRes, memberRes] = await Promise.all([
        fetch("/api/enterprise/requests", { cache: "no-store" }),
        fetch("/api/enterprise/members", { cache: "no-store" }),
      ])

      if (requestRes.ok) {
        const json = await requestRes.json()
        setRequests(json.data || [])
      }

      if (memberRes.ok) {
        const json = await memberRes.json()
        const list: Member[] = json.data || []
        setMembers(list)

        const nextDrafts: Record<number, PermissionMap> = {}
        for (const member of list) {
          nextDrafts[member.id] = { ...buildPermissionMap(false), ...(member.permissions || {}) }
        }
        setPermissionDrafts(nextDrafts)
      }
    } finally {
      setLoadingAdminData(false)
    }
  }, [canManage, currentUserId])

  useEffect(() => {
    void loadAdminData()
  }, [loadAdminData])

  const reviewRequest = async (requestId: number, action: "approve" | "reject") => {
    const res = await fetch(`/api/enterprise/requests/${requestId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      window.alert(formatEnterpriseReviewMessage(json, t("审核失败", "Review failed."), locale))
      return
    }

    await loadAdminData()
  }

  const saveMemberPermissions = async (targetUserId: number) => {
    const permissions = permissionDrafts[targetUserId]
    const res = await fetch("/api/enterprise/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, permissions }),
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      window.alert(json?.error || t("权限保存失败", "Permission save failed."))
      return
    }

    await loadAdminData()
  }

  const updateMemberAccount = async (
    targetUserId: number,
    action: "suspend" | "reactivate" | "remove" | "reset_password",
    temporaryPassword?: string,
  ) => {
    setActingMemberId(targetUserId)
    setMemberActionMessage("")
    try {
      const res = await fetch(`/api/enterprise/members/${targetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, temporaryPassword }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "member_update_failed")
      }
      await loadAdminData()
      setMemberActionMessage(
        action === "reset_password"
          ? t("密码已重置，该成员需要使用新密码重新登录。", "Password reset. The member must sign in again with the new password.")
          : t("成员状态已更新。", "Member status updated."),
      )
    } catch (error) {
      setMemberActionMessage(formatMemberActionMessage(error, t("成员操作失败。", "Member action failed."), locale))
    } finally {
      setActingMemberId(null)
    }
  }

  const requestSuspendMember = (member: Member) => {
    const confirmed = window.confirm(t(`确认停用 ${member.name || member.email}？该成员会被退出登录。`, `Suspend ${member.name || member.email}? The member will be signed out.`))
    if (confirmed) void updateMemberAccount(member.id, "suspend")
  }

  const requestReactivateMember = (member: Member) => {
    void updateMemberAccount(member.id, "reactivate")
  }

  const requestRemoveMember = (member: Member) => {
    const confirmed = window.confirm(t(`确认移出 ${member.name || member.email}？该账号将不再绑定当前企业。`, `Remove ${member.name || member.email}? The account will no longer be bound to this company.`))
    if (confirmed) void updateMemberAccount(member.id, "remove")
  }

  const requestResetPassword = (member: Member) => {
    const password = window.prompt(t(`请输入 ${member.name || member.email} 的临时新密码（至少 8 位）。`, `Enter a temporary new password for ${member.name || member.email} (at least 8 characters).`))
    if (password == null) return
    const normalized = password.trim()
    if (normalized.length < 8) {
      window.alert(t("临时密码至少需要 8 位。", "Temporary password must be at least 8 characters."))
      return
    }
    void updateMemberAccount(member.id, "reset_password", normalized)
  }

  if (!canManage) {
    return (
      <article className={panelClassName}>
        <div className="dashboard-kicker text-muted-foreground">{t("Enterprise governance", "Enterprise governance")}</div>
        <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
          {t("成员与权限", "Members and permissions")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          {t("当前页面属于企业管理员配置面。只有活跃企业管理员可以处理成员审核、权限分配和成员账号操作。", "This surface is reserved for active company admins. Only they can review member requests, assign permissions, and manage member accounts.")}
        </p>
      </article>
    )
  }

  return (
    <div className="space-y-6">
      <article className={panelClassName}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="dashboard-kicker text-muted-foreground">{t("Enterprise access", "Enterprise access")}</div>
            <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
              {t("成员申请审核", "Member request review")}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {t("先处理成员准入，再落权限，避免成员进入系统后看得到入口却拿不到能力。", "Handle admission before permissions so members do not land in the workspace with mismatched access.")}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {loadingAdminData ? <p className="text-sm text-muted-foreground">{t("加载中...", "Loading...")}</p> : null}
          {!loadingAdminData && requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("暂无待审核申请。", "No pending requests.")}</p>
          ) : null}
          {requests.map((request) => (
            <div key={request.requestId} className={`${shellClassName} flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between`}>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {request.userName}（{request.userEmail}）
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("申请时间：", "Requested at: ")}
                  {new Date(request.createdAt).toLocaleString()}
                </p>
                {request.note ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("说明：", "Note: ")}
                    {request.note}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => reviewRequest(request.requestId, "reject")} className="dashboard-button-secondary">
                  <X className="mr-1 h-4 w-4" />
                  {t("拒绝", "Reject")}
                </Button>
                <Button size="sm" onClick={() => reviewRequest(request.requestId, "approve")} className="dashboard-button-primary">
                  <Check className="mr-1 h-4 w-4" />
                  {t("通过", "Approve")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className={panelClassName}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="dashboard-kicker text-muted-foreground">{t("Permissions", "Permissions")}</div>
            <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
              {t("成员功能权限", "Member feature permissions")}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {t("在同一个面板里管理功能权限、停用、恢复、移出和密码重置。", "Manage feature access, suspension, reactivation, removal, and password reset in one place.")}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {memberActionMessage ? <p className="text-sm text-muted-foreground">{memberActionMessage}</p> : null}
          {members.length === 0 && !loadingAdminData ? (
            <p className="text-sm text-muted-foreground">{t("当前没有可配置权限的企业成员。", "No enterprise members available for permission configuration.")}</p>
          ) : null}
          {members.map((member) => {
            const draft = permissionDrafts[member.id] || buildPermissionMap(false)
            const isCurrentUser = member.id === currentUserId
            const isSuspended = member.enterpriseStatus === "suspended"
            const isRemoved = member.enterpriseStatus === "removed"
            const isActiveMember = member.enterpriseStatus === "active"
            const actionDisabled = actingMemberId === member.id

            return (
              <div key={member.id} className={`${shellClassName} space-y-4 p-4`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {member.name}（{member.email}）
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("角色：", "Role: ")}
                      {member.enterpriseRole || "member"} / {t("状态：", "Status: ")}
                      {member.enterpriseStatus || "unknown"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => saveMemberPermissions(member.id)} disabled={actionDisabled || !isActiveMember} className="dashboard-button-primary">
                      {t("保存权限", "Save permissions")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => requestResetPassword(member)} disabled={actionDisabled || isRemoved} className="dashboard-button-secondary">
                      <KeyRound className="mr-1 h-4 w-4" />
                      {t("重置密码", "Reset password")}
                    </Button>
                    {isSuspended ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => requestReactivateMember(member)} disabled={actionDisabled} className="dashboard-button-secondary">
                        <PlayCircle className="mr-1 h-4 w-4" />
                        {t("恢复", "Reactivate")}
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => requestSuspendMember(member)} disabled={actionDisabled || isCurrentUser || !isActiveMember} className="dashboard-button-secondary">
                        <PauseCircle className="mr-1 h-4 w-4" />
                        {t("停用", "Suspend")}
                      </Button>
                    )}
                    {!isCurrentUser ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => requestRemoveMember(member)}
                        disabled={actionDisabled || isRemoved}
                        className="dashboard-button-secondary border-destructive/50 px-3 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <UserX className="mr-1 h-4 w-4" />
                        {t("移出", "Remove")}
                      </Button>
                    ) : (
                      <span className={tagClassName}>{t("当前账号不可移出", "Current account can't be removed")}</span>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {configurableFeatureKeys.map((feature) => (
                    <label key={feature} className={toggleClassName}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-none border-border bg-background accent-primary"
                        checked={Boolean(draft[feature])}
                        disabled={!isActiveMember}
                        onChange={(event) => {
                          setPermissionDrafts((prev) => ({
                            ...prev,
                            [member.id]: {
                              ...draft,
                              [feature]: event.target.checked,
                            },
                          }))
                        }}
                      />
                      <span>{featureLabels[feature]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </article>
    </div>
  )
}
