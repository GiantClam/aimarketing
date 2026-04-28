"use client"

import type React from "react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setMessage(t("请输入邮箱地址。", "Please enter your email address."))
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "forgot_password_failed")
      }

      setMessage(
        t(
          "如果该邮箱对应账号存在，重置链接已发送，请检查收件箱。",
          "If an account exists for this email address, a reset link has been sent. Check your inbox.",
        ),
      )
      toast.success(t("如果账号存在，重置邮件已发送。", "If the account exists, the reset email has been sent."))
    } catch {
      setMessage(t("发送失败，请稍后再试。", "Failed to send the reset email. Please try again later."))
      toast.error(t("发送重置邮件失败，请稍后再试。", "Failed to send the reset email. Please try again later."))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          {t("返回登录", "Back to login")}
        </Link>

        <div className="rounded-[32px] border-2 border-border bg-card p-8 shadow-sm">
          <div className="inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground">
            {t("忘记密码", "Forgot password")}
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-foreground">
            {t("输入邮箱，发送密码重置链接", "Enter your email to receive a password reset link")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t(
              "我们会向你的注册邮箱发送重置邮件。为保护隐私，不会提示该邮箱是否存在。",
              "We will send a reset email to your registered address. To protect privacy, we won't reveal whether the email exists.",
            )}
          </p>

          {message ? (
            <div className="mt-6 rounded-[20px] border-2 border-border bg-background p-4">
              <p className="text-sm text-foreground">{message}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-[24px] border-2 border-border bg-background p-5">
            <div className="space-y-2">
              <Label htmlFor="email">{t("邮箱地址", "Email address")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder={t("输入注册邮箱", "Enter the email you used to register")}
                className="h-14 rounded-[20px] border-2 border-border bg-card"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className="rounded-full" disabled={isSubmitting}>
                {isSubmitting ? t("发送中...", "Sending...") : t("发送重置邮件", "Send reset email")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("如果你想修改当前密码，请登录后到设置页操作。", "If you want to change your current password, sign in and use Settings.")}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
