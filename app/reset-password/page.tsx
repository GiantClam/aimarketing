"use client"

import type React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const initialToken = searchParams.get("token") || ""
  const [token, setToken] = useState(initialToken)
  const [currentToken, setCurrentToken] = useState(initialToken)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setToken(initialToken)
    setCurrentToken(initialToken)
  }, [initialToken])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedToken = currentToken.trim()
    if (!normalizedToken) {
      const invalidMessage = t("重置链接无效，请重新发送邮件。", "The reset link is invalid. Please request a new email.")
      setMessage(invalidMessage)
      toast.error(invalidMessage)
      return
    }
    if (newPassword.length < 8) {
      const invalidMessage = t("新密码至少需要 8 位。", "New password must be at least 8 characters.")
      setMessage(invalidMessage)
      toast.error(invalidMessage)
      return
    }
    if (newPassword !== confirmPassword) {
      const mismatchMessage = t("两次输入的新密码不一致。", "The new passwords do not match.")
      setMessage(mismatchMessage)
      toast.error(mismatchMessage)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          token: normalizedToken,
          newPassword,
          confirmPassword,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "password_reset_failed")
      }

      const successMessage = t("密码已重置，正在进入工作区...", "Password reset. Redirecting to your workspace...")
      setMessage(successMessage)
      toast.success(t("密码已重置，欢迎回来。", "Password reset. Welcome back."))
      router.replace("/dashboard")
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message === "reset_token_invalid_or_expired"
          ? t("重置链接已过期或无效，请重新发送邮件。", "The reset link is expired or invalid. Please request a new email.")
          : t("重置失败，请重新发送邮件后再试。", "Reset failed. Please request a new email and try again.")
      setMessage(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/forgot-password" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          {t("重新发送重置邮件", "Request a new reset email")}
        </Link>

        <div className="rounded-[32px] border-2 border-border bg-card p-8 shadow-sm">
          <div className="inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground">
            {t("重置密码", "Reset password")}
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-foreground">
            {t("设置新的登录密码", "Set a new login password")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t(
              "请输入新密码完成重置。完成后，旧会话会失效，并用新会话重新登录。",
              "Enter a new password to complete the reset. Old sessions will be invalidated and replaced with a new one.",
            )}
          </p>

          {message ? (
            <div className="mt-6 rounded-[20px] border-2 border-border bg-background p-4">
              <p className="text-sm text-foreground">{message}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-[24px] border-2 border-border bg-background p-5">
            <div className="space-y-2">
              <Label htmlFor="token">{t("重置令牌", "Reset token")}</Label>
              <Input
                id="token"
                name="token"
                type="text"
                value={token}
                onChange={(event) => {
                  setToken(event.currentTarget.value)
                  setCurrentToken(event.currentTarget.value)
                }}
                placeholder={t("从邮件链接中自动填充", "Auto-filled from your email link")}
                className="h-14 rounded-[20px] border-2 border-border bg-card font-mono text-sm"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t("新密码", "New password")}</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.currentTarget.value)}
                  placeholder={t("至少 8 位", "At least 8 characters")}
                  className="h-14 rounded-[20px] border-2 border-border bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("确认新密码", "Confirm new password")}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                  placeholder={t("再次输入新密码", "Enter the new password again")}
                  className="h-14 rounded-[20px] border-2 border-border bg-card"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className="rounded-full" disabled={isSubmitting}>
                {isSubmitting ? t("提交中...", "Submitting...") : t("确认重置密码", "Confirm password reset")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("如果链接失效，请重新申请重置邮件。", "If the link expired, request a new reset email.")}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
