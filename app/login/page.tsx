"use client"

import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Lock, Mail } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

export default function LoginPage() {
  const { login, devLogin, loading } = useAuth()
  const { messages, locale } = useI18n()
  const router = useRouter()
  const [error, setError] = useState("")
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("")
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false)
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const allowDemoLogin =
    process.env.NEXT_PUBLIC_ALLOW_DEMO_LOGIN === "true" ||
    (process.env.NODE_ENV === "development" && typeof window !== "undefined" && window.location.hostname === "localhost")

  const getNextPath = () => {
    if (typeof window === "undefined") return "/dashboard"
    return new URLSearchParams(window.location.search).get("next") || "/dashboard"
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setNeedsEmailVerification(false)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") || "")
    const password = String(formData.get("password") || "")
    setPendingVerificationEmail(email.trim())

    try {
      await login(email, password)
      router.push(getNextPath())
    } catch (err) {
      const message = err instanceof Error ? err.message : messages.login.loginFailed
      if (message === "email_not_verified") {
        setNeedsEmailVerification(true)
        setError(t("邮箱尚未验证，请先查收验证邮件。", "Your email address is not verified yet. Please check your inbox."))
        return
      }
      setError(message)
    }
  }

  const handleDemoLogin = async () => {
    setError("")
    try {
      await devLogin()
      router.push(getNextPath())
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.login.demoLoginFailed)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {messages.shared.backToHome}
        </Link>

        <div className="grid gap-8 lg:grid-cols-[0.95fr_0.85fr]">
          <section className="rounded-[32px] border-2 border-border bg-card p-8 lg:p-10">
            <div className="inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground">
              {t("登录", "login")}
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-tight text-foreground">{messages.login.title}</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">{messages.login.description}</p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[22px] border-2 border-border bg-background p-4">
                <div className="text-sm font-medium text-foreground">{t("工作台", "Workspace")}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(
                    "进入统一 AI 工作台，继续顾问、内容和设计任务。",
                    "Enter one unified AI workspace for advisor, content, and design tasks.",
                  )}
                </p>
              </div>
              <div className="rounded-[22px] border-2 border-border bg-background p-4">
                <div className="text-sm font-medium text-foreground">{t("会话", "Sessions")}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(
                    "保留历史会话与线程状态，不需要从头开始。",
                    "Keep historical conversations and thread states without restarting from scratch.",
                  )}
                </p>
              </div>
              <div className="rounded-[22px] border-2 border-border bg-background p-4">
                <div className="text-sm font-medium text-foreground">{t("治理", "Governance")}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(
                    "企业权限、知识资源与顾问配置集中管理。",
                    "Manage enterprise permissions, knowledge assets, and advisor setup in one place.",
                  )}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border-2 border-border bg-card p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-accent">
                <span className="text-xl font-bold lowercase text-primary">ai</span>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">stb.</div>
                <div className="-mt-1 text-base font-semibold text-foreground">{messages.shared.appName}</div>
              </div>
            </div>

            {allowDemoLogin ? (
              <div className="mb-6 rounded-[24px] border-2 border-border bg-background p-4">
                <div className="text-sm font-medium text-foreground">{messages.login.demoTitle}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{messages.login.demoDescription}</p>
                <Button
                  onClick={handleDemoLogin}
                  disabled={loading}
                  variant="outline"
                  className="mt-4 w-full rounded-full border-2 border-border bg-card"
                >
                  {loading ? messages.login.loggingIn : messages.login.demoLogin}
                </Button>
              </div>
            ) : null}

            {error ? (
              <div className="mb-6 rounded-[20px] border-2 border-destructive bg-red-50 p-3">
                <p className="text-sm text-red-600">{error}</p>
                {needsEmailVerification && pendingVerificationEmail ? (
                  <div className="mt-3 text-sm text-red-700">
                    <Link
                      href={`/verify-email?email=${encodeURIComponent(pendingVerificationEmail)}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {t("前往验证邮箱", "Go to email verification")}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{messages.login.email}</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={messages.login.emailPlaceholder}
                    className="h-14 rounded-[20px] border-2 border-border bg-background pl-11"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{messages.login.password}</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={messages.login.passwordPlaceholder}
                    className="h-14 rounded-[20px] border-2 border-border bg-background pl-11"
                    required
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="h-14 w-full rounded-full text-base">
                {loading ? messages.login.loggingIn : messages.login.submit}
              </Button>
            </form>

            <div className="relative my-6">
              <Separator />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-card px-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  {messages.login.or}
                </span>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {messages.login.noAccount}{" "}
              <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
                {messages.login.registerNow}
              </Link>
            </div>

            <div className="text-sm text-muted-foreground">
              <Link href="/forgot-password" className="font-medium text-foreground underline underline-offset-4">
                {t("忘记密码？", "Forgot password?")}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
