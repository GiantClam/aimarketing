"use client"

import type React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type VerificationStatus = "idle" | "verifying" | "verified" | "error"

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])

  const initialEmail = searchParams.get("email") || ""
  const token = searchParams.get("token") || ""
  const sent = searchParams.get("sent") === "1"

  const [email, setEmail] = useState(initialEmail)
  const [status, setStatus] = useState<VerificationStatus>(token ? "verifying" : "idle")
  const [message, setMessage] = useState(sent ? t("验证邮件已发送，请检查收件箱。", "A verification email has been sent. Check your inbox.") : "")
  const [isResending, setIsResending] = useState(false)

  useEffect(() => {
    setEmail(initialEmail)
  }, [initialEmail])

  useEffect(() => {
    if (!token) return

    let active = true

    const verify = async () => {
      setStatus("verifying")
      setMessage(t("正在验证邮箱...", "Verifying your email..."))

      try {
        const res = await fetch("/api/auth/email-verification/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(json?.error || "verification_failed")
        }

        if (!active) return
        setStatus("verified")
        setMessage(t("邮箱已验证，正在进入工作区...", "Email verified. Redirecting to your workspace..."))
        router.replace("/dashboard")
      } catch {
        if (!active) return
        setStatus("error")
        setMessage(t("验证链接无效或已过期，请重新发送验证邮件。", "This verification link is invalid or expired. Please resend the verification email."))
      }
    }

    void verify()
    return () => {
      active = false
    }
  }, [router, t, token])

  const handleResend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setStatus("error")
      setMessage(t("请输入邮箱地址。", "Please enter your email address."))
      return
    }

    setIsResending(true)
    setStatus("idle")
    try {
      const res = await fetch("/api/auth/email-verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || "resend_failed")
      }

      setMessage(t("验证邮件已重新发送，请检查收件箱。", "A new verification email has been sent. Check your inbox."))
      setStatus("idle")
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : t("重新发送失败，请稍后再试。", "Failed to resend the verification email. Please try again later."))
    } finally {
      setIsResending(false)
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
            {t("邮箱验证", "Email verification")}
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-foreground">
            {t("先验证邮箱，再继续使用账号", "Verify your email before continuing")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t(
              "新注册的账号必须先通过邮箱验证，验证后会自动进入工作区。",
              "New accounts must verify their email before entering the workspace.",
            )}
          </p>

          {message ? (
            <div className="mt-6 rounded-[20px] border-2 border-border bg-background p-4">
              <p className={status === "error" ? "text-sm text-red-600" : "text-sm text-foreground"}>{message}</p>
            </div>
          ) : null}

          <form onSubmit={handleResend} className="mt-8 space-y-4 rounded-[24px] border-2 border-border bg-background p-5">
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
              <Button type="submit" className="rounded-full" disabled={isResending || status === "verifying"}>
                {isResending ? t("发送中...", "Sending...") : t("重新发送验证邮件", "Resend verification email")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("如果链接已过期或未收到邮件，可在这里重发。", "Use this form if the link expired or the email never arrived.")}
              </span>
            </div>
          </form>

          <div className="mt-8 text-sm text-muted-foreground">
            {t("已经验证过？", "Already verified?")}{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
              {t("返回登录", "Go back to login")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
