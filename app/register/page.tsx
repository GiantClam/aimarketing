"use client"

import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Building2, KeyRound, Lock, Mail, User } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
  const router = useRouter()
  const { register, loading } = useAuth()
  const { messages, locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const [error, setError] = useState("")
  const [enterpriseAction, setEnterpriseAction] = useState<"create" | "join">("create")
  const [enterpriseLookup, setEnterpriseLookup] = useState<{ found: boolean; name?: string } | null>(null)

  const handleLookup = async (code: string) => {
    const normalized = code.trim()
    if (!normalized) return

    setEnterpriseLookup(null)
    const res = await fetch(`/api/enterprise/lookup?code=${encodeURIComponent(normalized)}`)
    const data = await res.json()
    if (!res.ok) {
      setEnterpriseLookup({ found: false })
      return
    }

    setEnterpriseLookup(data.found ? { found: true, name: data.enterprise?.name } : { found: false })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") || "").trim()
    const email = String(formData.get("email") || "").trim()
    const password = String(formData.get("password") || "")
    const confirmPassword = String(formData.get("confirmPassword") || "")
    const enterpriseName = String(formData.get("enterpriseName") || "").trim()
    const enterpriseCode = String(formData.get("enterpriseCode") || "").trim()
    const joinNote = String(formData.get("joinNote") || "").trim()

    if (!name || !email || !password) {
      setError(messages.register.incompleteError)
      return
    }

    if (password !== confirmPassword) {
      setError(messages.register.passwordMismatch)
      return
    }

    if (enterpriseAction === "create" && !enterpriseName) {
      setError(messages.register.enterpriseNameRequired)
      return
    }

    if (enterpriseAction === "join" && !enterpriseCode) {
      setError(messages.register.enterpriseCodeRequired)
      return
    }

    try {
      const result = await register({
        name,
        email,
        password,
        enterpriseAction,
        enterpriseName: enterpriseAction === "create" ? enterpriseName : undefined,
        enterpriseCode: enterpriseAction === "join" ? enterpriseCode : undefined,
        joinNote: enterpriseAction === "join" ? joinNote : undefined,
      })

      if (result.requiresEmailVerification) {
        router.push(`/verify-email?email=${encodeURIComponent(result.email || email)}&sent=1`)
        return
      }

      if (result.requiresApproval) {
        router.push("/dashboard/settings")
        return
      }

      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.register.failed)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {messages.shared.backToHome}
        </Link>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[32px] border-2 border-border bg-card p-8 lg:p-10">
            <div className="inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground">
              {t("注册", "register")}
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-tight text-foreground">{messages.register.title}</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">{messages.register.description}</p>

            <div className="mt-8 space-y-4">
              <div className="rounded-[24px] border-2 border-border bg-background p-5">
                <div className="text-sm font-medium text-foreground">{messages.register.createEnterprise}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(
                    "创建新的企业空间，自动获得管理员身份并接管知识资源、成员权限和 AI 配置。",
                    "Create a new enterprise workspace and automatically become admin for knowledge, members, and AI configuration.",
                  )}
                </p>
              </div>
              <div className="rounded-[24px] border-2 border-border bg-background p-5">
                <div className="text-sm font-medium text-foreground">{messages.register.joinEnterprise}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(
                    "使用企业邀请码提交加入请求，等待管理员审核后继承对应工作台能力。",
                    "Use an enterprise invite code, then wait for admin approval to unlock workspace capabilities.",
                  )}
                </p>
              </div>
              <div className="rounded-[24px] bg-accent px-5 py-5 text-accent-foreground">
                <div className="text-sm font-medium text-primary">{t("访问模型", "Access model")}</div>
                <p className="mt-2 text-sm leading-6 text-accent-foreground/80">
                  {t(
                    "账号、企业和权限在同一套系统里运作，注册完成后即可直接进入统一 AI 工作台。",
                    "Account, enterprise, and permissions run in one system so users can enter the unified AI workspace right after signup.",
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

            {error ? (
              <div className="mb-6 rounded-[20px] border-2 border-destructive bg-red-50 p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{messages.register.name}</Label>
                <div className="relative">
                  <User className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder={messages.register.namePlaceholder}
                    className="h-14 rounded-[20px] border-2 border-border bg-background pl-11"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{messages.register.email}</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={messages.register.emailPlaceholder}
                    className="h-14 rounded-[20px] border-2 border-border bg-background pl-11"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">{messages.register.password}</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder={messages.register.passwordPlaceholder}
                      className="h-14 rounded-[20px] border-2 border-border bg-background pl-11"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{messages.register.confirmPassword}</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder={messages.register.confirmPasswordPlaceholder}
                      className="h-14 rounded-[20px] border-2 border-border bg-background pl-11"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>{messages.register.enterpriseAction}</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={enterpriseAction === "create" ? "default" : "outline"}
                    className="h-12 rounded-[18px]"
                    onClick={() => {
                      setEnterpriseAction("create")
                      setEnterpriseLookup(null)
                    }}
                  >
                    {messages.register.createEnterprise}
                  </Button>
                  <Button
                    type="button"
                    variant={enterpriseAction === "join" ? "default" : "outline"}
                    className="h-12 rounded-[18px]"
                    onClick={() => {
                      setEnterpriseAction("join")
                      setEnterpriseLookup(null)
                    }}
                  >
                    {messages.register.joinEnterprise}
                  </Button>
                </div>
              </div>

              {enterpriseAction === "create" ? (
                <div className="space-y-2">
                  <Label htmlFor="enterpriseName">{messages.register.enterpriseName}</Label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="enterpriseName"
                      name="enterpriseName"
                      type="text"
                      placeholder={messages.register.enterpriseNamePlaceholder}
                      className="h-14 rounded-[20px] border-2 border-border bg-background pl-11"
                      required
                    />
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">{messages.register.enterpriseNameHint}</p>
                </div>
              ) : (
                <div className="space-y-4 rounded-[24px] border-2 border-border bg-background p-4">
                  <div className="space-y-2">
                    <Label htmlFor="enterpriseCode">{messages.register.enterpriseCode}</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="enterpriseCode"
                        name="enterpriseCode"
                        type="text"
                        placeholder={messages.register.enterpriseCodePlaceholder}
                        className="h-14 rounded-[20px] border-2 border-border bg-card pl-11"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-2 border-border bg-card"
                      onClick={() =>
                        handleLookup((document.getElementById("enterpriseCode") as HTMLInputElement)?.value || "")
                      }
                    >
                      {messages.register.verifyEnterprise}
                    </Button>
                    {enterpriseLookup?.found ? (
                      <span className="text-xs text-secondary">
                        {messages.register.foundEnterprisePrefix}
                        {enterpriseLookup.name}
                      </span>
                    ) : null}
                    {enterpriseLookup && !enterpriseLookup.found ? (
                      <span className="text-xs text-destructive">{messages.register.enterpriseNotFound}</span>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="joinNote">{messages.register.joinNote}</Label>
                    <Input
                      id="joinNote"
                      name="joinNote"
                      placeholder={messages.register.joinNotePlaceholder}
                      className="h-12 rounded-[18px] border-2 border-border bg-card"
                    />
                  </div>
                </div>
              )}

              <Button type="submit" className="h-14 w-full rounded-full text-base" disabled={loading}>
                {loading
                  ? messages.register.submitting
                  : enterpriseAction === "create"
                    ? messages.register.submitCreate
                    : messages.register.submitJoin}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
