"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowRight, Building2, Clock3, KeyRound, LogOut, Save, Sparkles, User, type LucideIcon } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { WriterMemorySettingsSection } from "@/components/settings/writer-memory-settings-section"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import type { AppLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

function formatEnterpriseSwitchMessage(error: unknown, fallback: string, locale: AppLocale) {
  const isZh = locale === "zh"
  const message = error instanceof Error ? error.message : ""
  if (message === "enterprise_admin_cannot_switch") return isZh ? "企业管理员不支持在此处更换绑定企业。" : "Company admins cannot switch bound enterprise here."
  if (message === "enterprise_not_bound") return isZh ? "当前账号尚未绑定企业，无法执行更换。" : "This account is not bound to an enterprise yet."
  if (message === "enterprise_code_required") return isZh ? "请输入目标企业 ID。" : "Please enter target company ID."
  if (message === "enterprise_not_found") return isZh ? "未找到该企业 ID，请检查后重试。" : "Target company ID was not found. Please check and retry."
  if (message === "enterprise_already_bound") return isZh ? "当前账号已绑定该企业，无需重复提交。" : "This account is already bound to the target company."
  return message || fallback
}

function formatPasswordChangeMessage(error: unknown, fallback: string, locale: AppLocale) {
  const isZh = locale === "zh"
  const message = error instanceof Error ? error.message : ""
  if (message === "current_password_required") return isZh ? "请输入当前密码。" : "Please enter your current password."
  if (message === "current_password_invalid") return isZh ? "当前密码不正确。" : "The current password is incorrect."
  if (message === "new_password_invalid") return isZh ? "新密码至少需要 8 位。" : "New password must be at least 8 characters."
  if (message === "passwords_do_not_match") return isZh ? "两次输入的新密码不一致。" : "The new passwords do not match."
  if (message === "demo_account_password_locked") return isZh ? "体验账号不支持修改密码。" : "Demo accounts cannot change password."
  return message || fallback
}

type OverviewMetricProps = {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone?: "warm" | "teal" | "ink"
}

function OverviewMetric({ icon: Icon, label, value, hint, tone = "warm" }: OverviewMetricProps) {
  const toneClassName =
    tone === "teal"
      ? "border-teal-200/70 bg-teal-50/85"
      : tone === "ink"
        ? "border-slate-300/80 bg-slate-900 text-white"
        : "border-orange-200/70 bg-orange-50/90"

  return (
    <div className={cn("dashboard-panel rounded-[8px] border p-4 shadow-none", toneClassName)}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-[6px] border", tone === "ink" ? "border-white/15 bg-white/10" : "border-black/5 bg-white/70")}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", tone === "ink" ? "text-white/70" : "text-muted-foreground")}>{label}</p>
          <p className="mt-1 font-sans text-2xl font-semibold">{value}</p>
        </div>
      </div>
      <p className={cn("mt-4 text-sm leading-6", tone === "ink" ? "text-white/78" : "text-muted-foreground")}>{hint}</p>
    </div>
  )
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="dashboard-kicker inline-flex rounded-[4px] border border-primary/30 bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground">
      {children}
    </p>
  )
}

const settingsSharpCardClass = "dashboard-panel rounded-[4px] border-border/80 bg-card/90 shadow-none"
const settingsSharpShellClass = "dashboard-panel rounded-[4px] border border-border/80 bg-background/78 shadow-none"
const settingsSharpInsetClass = "dashboard-panel rounded-[4px] border border-border/80 bg-card/88 shadow-none"
const settingsSharpInfoClass = "dashboard-panel rounded-[4px] border border-border/80 bg-background px-4 py-2 text-sm font-medium text-foreground shadow-none"
const settingsSharpInputClass =
  "dashboard-chip h-11 rounded-[4px] border-border/80 bg-background px-3 font-mono text-xs tracking-[0.03em] text-foreground disabled:opacity-100"
const settingsSharpSummaryCardClass = "dashboard-panel rounded-[4px] border border-border/80 bg-card/90 p-5 shadow-none"

export default function SettingsPage() {
  const router = useRouter()
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])
  const { user, isDemoMode, isEnterpriseAdmin, updateProfile, refreshProfile, logout } = useAuth()

  const [name, setName] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordMessage, setPasswordMessage] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [switchEnterpriseCode, setSwitchEnterpriseCode] = useState("")
  const [switchEnterpriseMessage, setSwitchEnterpriseMessage] = useState("")
  const [isSwitchingEnterprise, setIsSwitchingEnterprise] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    setName(user?.name || "")
  }, [user?.name])

  const statusText = useMemo(() => {
    if (!user?.enterpriseStatus) return t("未知", "Unknown")
    if (user.enterpriseStatus === "pending") return t("待审核", "Pending")
    if (user.enterpriseStatus === "active") return t("已激活", "Active")
    if (user.enterpriseStatus === "rejected") return t("已拒绝", "Rejected")
    if (user.enterpriseStatus === "suspended") return t("已停用", "Suspended")
    if (user.enterpriseStatus === "removed") return t("已移出", "Removed")
    return user.enterpriseStatus
  }, [t, user?.enterpriseStatus])

  const canUseEnterpriseSettings = Boolean(user?.enterpriseId)
  const enterpriseSettingsHref = isEnterpriseAdmin ? "/dashboard/platform-settings" : "/dashboard/platform-settings/knowledge"

  const overviewMetrics = useMemo(
    () => [
      {
        icon: User,
        label: t("账号状态", "Account status"),
        value: statusText,
        hint: user?.email || t("当前账号尚未绑定邮箱。", "No email is currently bound."),
        tone: "warm" as const,
      },
      {
        icon: Building2,
        label: t("企业绑定", "Company binding"),
        value: user?.enterpriseName || t("未绑定", "Unbound"),
        hint: user?.enterpriseCode ? `${t("企业 ID", "Company ID")}: ${user.enterpriseCode}` : t("当前账号尚未加入企业。", "This account has not joined a company yet."),
        tone: "teal" as const,
      },
      {
        icon: Sparkles,
        label: t("管理入口", "Admin surface"),
        value: isEnterpriseAdmin ? t("企业设置", "Platform settings") : t("个人设置", "Personal settings"),
        hint: isEnterpriseAdmin ? t("成员权限、知识连接和顾问工作流已迁到企业设置。", "Member permissions, knowledge connection, and advisor workflows now live in platform settings.") : t("企业级配置由管理员统一在企业设置维护。", "Company-level configuration is maintained by admins in platform settings."),
        tone: "ink" as const,
      },
    ],
    [isEnterpriseAdmin, statusText, t, user?.email, user?.enterpriseCode, user?.enterpriseName],
  )

  const handleSaveProfile = async () => {
    const nextName = name.trim()
    if (!nextName) {
      setSaveMessage(t("显示名称不能为空", "Display name cannot be empty."))
      return
    }

    setIsSaving(true)
    try {
      await updateProfile({ name: nextName })
      await refreshProfile()
      setSaveMessage(t("保存成功", "Saved successfully."))
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : t("保存失败", "Save failed."))
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordMessage("")

    if (!currentPassword) {
      setPasswordMessage(t("请输入当前密码。", "Please enter your current password."))
      return
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordMessage(t("新密码至少需要 8 位。", "New password must be at least 8 characters."))
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage(t("两次输入的新密码不一致。", "The new passwords do not match."))
      return
    }

    setIsChangingPassword(true)
    try {
      const response = await fetch("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "password_change_failed")
      }

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      await refreshProfile()
      setPasswordMessage(t("密码已更新，旧会话已失效。", "Password updated. Old sessions have been invalidated."))
      toast.success(t("密码已更新，系统已重新登录。", "Password updated. You have been signed in again."))
    } catch (error) {
      setPasswordMessage(formatPasswordChangeMessage(error, t("修改密码失败", "Failed to change password."), locale))
      toast.error(t("修改密码失败，请检查当前密码后重试。", "Failed to change password. Check your current password and try again."))
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleSwitchEnterprise = async () => {
    const nextCode = switchEnterpriseCode.trim().toLowerCase()
    if (!nextCode) {
      setSwitchEnterpriseMessage(t("请输入目标企业 ID。", "Please enter target company ID."))
      return
    }

    setIsSwitchingEnterprise(true)
    setSwitchEnterpriseMessage("")
    try {
      const response = await fetch("/api/enterprise/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterpriseCode: nextCode }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "enterprise_switch_failed")
      }

      await refreshProfile()
      setSwitchEnterpriseCode("")
      setSwitchEnterpriseMessage(t("已提交更换企业申请。审核通过后才会切换企业绑定。", "Switch request submitted. Binding will change after approval."))
    } catch (error) {
      setSwitchEnterpriseMessage(formatEnterpriseSwitchMessage(error, t("提交更换企业申请失败", "Failed to submit switch request."), locale))
    } finally {
      setIsSwitchingEnterprise(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      router.replace("/login")
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto workspace-page-shell">
      <div className="mx-auto max-w-6xl workspace-stack">
        <section className="dashboard-panel rounded-[10px] border border-border bg-card">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-5">
            <div className="space-y-6">
              <div className="dashboard-kicker inline-flex items-center gap-2 rounded-[4px] border border-primary/30 bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {t("设置控制台", "Settings Console")}
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">{t("个人设置", "Personal settings")}</h1>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground lg:text-lg">
                  {t("这里只保留账号资料、密码、个人记忆和退出操作。企业管理员配置已经统一迁到企业设置。", "This page now focuses on profile, password, personal memory, and logout. Admin-only company configuration has moved into platform settings.")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className={settingsSharpInfoClass}>
                  {t("企业状态", "Enterprise status")}: {statusText}
                </div>
                <div className={settingsSharpInfoClass}>
                  {t("成员角色", "Member role")}: {user?.enterpriseRole || t("未绑定", "Unbound")}
                </div>
              </div>
            </div>

            <div className={`${settingsSharpShellClass} p-5`}>
              <SectionEyebrow>{t("身份摘要", "Identity Brief")}</SectionEyebrow>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{user?.name || t("未命名成员", "Unnamed member")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{user?.email || t("未绑定邮箱", "No email bound")}</p>

              <div className="mt-5 space-y-3">
                <div className={`${settingsSharpInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("企业信息", "Enterprise")}</p>
                  <p className="mt-2 text-sm text-foreground">{user?.enterpriseName || t("尚未绑定企业", "No enterprise bound")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{user?.enterpriseCode || t("无企业 ID", "No enterprise code")}</p>
                </div>
                <div className={`${settingsSharpInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("治理入口", "Governance")}</p>
                  <p className="mt-2 text-sm text-foreground">
                    {isEnterpriseAdmin ? t("企业管理员配置已迁到企业设置", "Admin configuration has moved to platform settings") : t("企业级配置由管理员统一维护", "Company-level configuration is maintained by admins")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {canUseEnterpriseSettings ? t("成员权限、知识连接与顾问工作流不再在个人设置中维护。", "Member permissions, knowledge connection, and advisor workflows are no longer maintained inside personal settings.") : t("加入企业后才会出现企业设置相关能力。", "Enterprise-setting capabilities appear after your account joins a company.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {user?.enterpriseStatus === "pending" ? (
          <div className="dashboard-panel rounded-[4px] border border-amber-400 bg-[#fff3bf] p-5 shadow-none">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-sans text-lg font-semibold text-amber-900">{t("加入企业待审核", "Enterprise join request pending")}</p>
                <p className="mt-1 text-sm leading-6 text-amber-800/85">{t("企业管理员审核通过后，企业功能权限与知识资源才会对当前账号生效。", "Enterprise permissions and shared knowledge will be enabled after admin approval.")}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="workspace-stack">
            <section className="space-y-4">
              <div className="space-y-2">
                <SectionEyebrow>{t("个人设置", "Personal settings")}</SectionEyebrow>
                <h2 className="font-sans text-2xl font-semibold text-foreground">{t("账号与企业身份", "Account and enterprise identity")}</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("优先保证账号基础资料、企业归属和身份状态清晰，避免后续工作台入口与权限判断出现偏差。", "Keep account basics, enterprise ownership, and identity state clear so later access checks stay predictable.")}</p>
              </div>

              <Card className={settingsSharpCardClass}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-xl">
                    <User className="h-5 w-5 text-primary" />
                    {t("账号信息", "Account profile")}
                  </CardTitle>
                  <CardDescription>{t("可修改显示名称。企业基础信息在这里仅做查看，不再承载企业治理操作。", "You can edit your display name here. Enterprise information remains view-only on this page.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="display-name">{t("显示名称", "Display name")}</Label>
                      <Input id="display-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("请输入显示名称", "Enter display name")} className={settingsSharpInputClass} />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("邮箱", "Email")}</Label>
                      <Input value={user?.email || ""} disabled className={settingsSharpInputClass} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-2">
                      <Label>{t("企业 ID", "Company ID")}</Label>
                      <Input value={user?.enterpriseCode || t("未绑定", "Unbound")} disabled className={settingsSharpInputClass} />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("企业名称", "Company name")}</Label>
                      <Input value={user?.enterpriseName || t("未绑定", "Unbound")} disabled className={settingsSharpInputClass} />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("企业角色", "Company role")}</Label>
                      <Input value={user?.enterpriseRole || t("未知", "Unknown")} disabled className={settingsSharpInputClass} />
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("账号状态", "Account status")}</Label>
                      <Input value={statusText} disabled className={settingsSharpInputClass} />
                    </div>
                  </div>

                  {Boolean(user?.enterpriseId) && !isEnterpriseAdmin ? (
                    <div className={`${settingsSharpShellClass} p-4`}>
                      <p className="text-sm font-medium text-foreground">{t("更换企业绑定", "Switch company binding")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("输入目标企业 ID 后将发起换绑申请。审核通过前，当前企业绑定保持不变。", "Submit target company ID to request binding switch. Current binding remains unchanged until approval.")}
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="grid min-w-[220px] flex-1 gap-2">
                          <Label htmlFor="switch-enterprise-code">{t("目标企业 ID", "Target company ID")}</Label>
                          <Input
                            id="switch-enterprise-code"
                            value={switchEnterpriseCode}
                            onChange={(event) => setSwitchEnterpriseCode(event.target.value)}
                            placeholder={t("请输入企业 ID", "Enter company ID")}
                            className={settingsSharpInputClass}
                          />
                        </div>
                        <Button type="button" onClick={handleSwitchEnterprise} disabled={isSwitchingEnterprise || !switchEnterpriseCode.trim()} className="dashboard-button-primary px-5">
                          {isSwitchingEnterprise ? t("提交中...", "Submitting...") : t("提交更换申请", "Submit switch request")}
                        </Button>
                      </div>
                      {switchEnterpriseMessage ? <p className="mt-3 text-xs text-muted-foreground">{switchEnterpriseMessage}</p> : null}
                    </div>
                  ) : null}

                  <div className={`${settingsSharpShellClass} flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between`}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("企业管理员配置已迁移", "Admin configuration moved")}</p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        {t("成员审核、权限分配、知识连接、共享知识绑定和顾问工作流现在统一在企业设置中维护。", "Member review, permission assignment, knowledge connection, shared knowledge bindings, and advisor workflows are now maintained in platform settings.")}
                      </p>
                    </div>
                    {canUseEnterpriseSettings ? (
                      <Button type="button" variant="outline" className="dashboard-button-secondary" asChild>
                        <Link href={enterpriseSettingsHref}>
                          {t("打开企业设置", "Open platform settings")}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={handleSaveProfile} disabled={isSaving} className="dashboard-button-primary px-5">
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? t("保存中...", "Saving...") : t("保存设置", "Save settings")}
                    </Button>
                    {saveMessage ? <span className="text-sm text-muted-foreground">{saveMessage}</span> : null}
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-4">
              <div className="space-y-2">
                <SectionEyebrow>{t("安全设置", "Security settings")}</SectionEyebrow>
                <h2 className="font-sans text-2xl font-semibold text-foreground">{t("密码与登录凭证", "Password and sign-in credentials")}</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("修改密码仍然属于个人账号操作，继续保留在当前页面。", "Password changes remain a personal-account action and stay on this page.")}</p>
              </div>

              <Card className={settingsSharpCardClass}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-xl">
                    <KeyRound className="h-5 w-5 text-primary" />
                    {t("修改密码", "Change password")}
                  </CardTitle>
                  <CardDescription>{t("输入当前密码后设置新密码。完成后旧会话会全部失效。", "Enter your current password and set a new one. Old sessions will be invalidated.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="current-password">{t("当前密码", "Current password")}</Label>
                      <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder={t("请输入当前密码", "Enter current password")} className={settingsSharpInputClass} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-password">{t("新密码", "New password")}</Label>
                      <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={t("至少 8 位", "At least 8 characters")} className={settingsSharpInputClass} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="confirm-password">{t("确认新密码", "Confirm new password")}</Label>
                      <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t("再次输入新密码", "Enter the new password again")} className={settingsSharpInputClass} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={handleChangePassword} disabled={isChangingPassword} className="dashboard-button-primary px-5">
                      <KeyRound className="mr-2 h-4 w-4" />
                      {isChangingPassword ? t("更新中...", "Updating...") : t("确认修改密码", "Change password")}
                    </Button>
                    {passwordMessage ? <span className="text-sm text-muted-foreground">{passwordMessage}</span> : null}
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-4">
              <div className="space-y-2">
                <SectionEyebrow>{t("个性化记忆", "Personalization memory")}</SectionEyebrow>
                <h2 className="font-sans text-2xl font-semibold text-foreground">{t("写作记忆与风格", "Writer memory and style")}</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("这里只保留个人写作记忆，不与企业治理配置混放。", "Writer memory stays here as a personal setting and is no longer mixed with company governance controls.")}</p>
              </div>
              <WriterMemorySettingsSection agentType="writer" />
            </section>

            <section className="space-y-4">
              <div className="space-y-2">
                <SectionEyebrow>{t("危险操作", "Danger zone")}</SectionEyebrow>
                <h2 className="font-sans text-2xl font-semibold text-foreground">{t("会话与退出", "Session and logout")}</h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("单独放出退出操作，避免与普通配置动作并排出现导致误触。", "Keep logout separate from normal configuration actions to avoid accidental clicks.")}</p>
              </div>

              <Card className="dashboard-panel rounded-[4px] border-destructive/40 bg-card/90 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-xl text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    {t("会话管理", "Session management")}
                  </CardTitle>
                  <CardDescription>{t("退出登录会清除当前服务端会话，并返回登录页。", "Logging out clears current server session and returns to login page.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut} className="rounded-[4px] px-5">
                    <LogOut className="mr-2 h-4 w-4" />
                    {isLoggingOut ? t("退出中...", "Logging out...") : t("退出登录", "Log out")}
                  </Button>
                  {isDemoMode ? <p className="text-xs text-muted-foreground">{t("当前为体验账号。", "Current account is in demo mode.")}</p> : null}
                </CardContent>
              </Card>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            <div className={settingsSharpSummaryCardClass}>
              <SectionEyebrow>{t("管理摘要", "Management brief")}</SectionEyebrow>
              <h2 className="mt-2 font-sans text-xl font-semibold text-foreground">{t("当前配置摘要", "Current configuration summary")}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{t("右侧摘要不承载操作，只帮助你快速确认当前身份、企业绑定和配置入口分层。", "The side summary stays read-only and helps you quickly confirm identity, company binding, and where configuration now lives.")}</p>
            </div>

            {overviewMetrics.map((metric) => (
              <OverviewMetric key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} hint={metric.hint} tone={metric.tone} />
            ))}

            <div className={settingsSharpSummaryCardClass}>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Building2 className="h-4 w-4 text-primary" />
                {t("页面分层原则", "Page boundary rules")}
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <p>{t("个人设置只负责当前账号，不再承载企业管理员面板。", "Personal settings now belong to the current account only and no longer host enterprise-admin panels.")}</p>
                <p>{t("企业设置负责成员、知识连接和工作流等共享治理面。", "Platform settings own shared governance for members, knowledge connections, and workflows.")}</p>
                <p>{t("危险操作单独成段，和保存类动作分离，避免误触。", "Dangerous actions stay isolated from save actions to reduce accidental clicks.")}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
