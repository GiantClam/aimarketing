"use client"

import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Building2, KeyRound, Lock, Mail, Sparkles, User } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
  const router = useRouter()
  const { register, loading } = useAuth()
  const { messages } = useI18n()

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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 font-manrope text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {messages.shared.backToHome}
        </Link>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="font-sans text-2xl font-bold">{messages.register.title}</CardTitle>
            <CardDescription className="font-manrope">{messages.register.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-manrope text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-manrope">{messages.register.name}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="name" name="name" type="text" placeholder={messages.register.namePlaceholder} className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="font-manrope">{messages.register.email}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" name="email" type="email" placeholder={messages.register.emailPlaceholder} className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-manrope">{messages.register.password}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="password" name="password" type="password" placeholder={messages.register.passwordPlaceholder} className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="font-manrope">{messages.register.confirmPassword}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="confirmPassword" name="confirmPassword" type="password" placeholder={messages.register.confirmPasswordPlaceholder} className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-manrope">{messages.register.enterpriseAction}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={enterpriseAction === "create" ? "default" : "outline"} onClick={() => { setEnterpriseAction("create"); setEnterpriseLookup(null) }}>
                    {messages.register.createEnterprise}
                  </Button>
                  <Button type="button" variant={enterpriseAction === "join" ? "default" : "outline"} onClick={() => { setEnterpriseAction("join"); setEnterpriseLookup(null) }}>
                    {messages.register.joinEnterprise}
                  </Button>
                </div>
              </div>

              {enterpriseAction === "create" ? (
                <div className="space-y-2">
                  <Label htmlFor="enterpriseName" className="font-manrope">{messages.register.enterpriseName}</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="enterpriseName" name="enterpriseName" type="text" placeholder={messages.register.enterpriseNamePlaceholder} className="pl-10 font-manrope" required />
                  </div>
                  <p className="text-xs font-manrope text-muted-foreground">{messages.register.enterpriseNameHint}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="enterpriseCode" className="font-manrope">{messages.register.enterpriseCode}</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="enterpriseCode" name="enterpriseCode" type="text" placeholder={messages.register.enterpriseCodePlaceholder} className="pl-10 font-manrope" required />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => handleLookup((document.getElementById("enterpriseCode") as HTMLInputElement)?.value || "")}>
                      {messages.register.verifyEnterprise}
                    </Button>
                    {enterpriseLookup?.found && <span className="text-xs text-green-600">{messages.register.foundEnterprisePrefix}{enterpriseLookup.name}</span>}
                    {enterpriseLookup && !enterpriseLookup.found && <span className="text-xs text-red-600">{messages.register.enterpriseNotFound}</span>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="joinNote" className="font-manrope">{messages.register.joinNote}</Label>
                    <Input id="joinNote" name="joinNote" placeholder={messages.register.joinNotePlaceholder} />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full font-manrope" disabled={loading}>
                {loading ? messages.register.submitting : enterpriseAction === "create" ? messages.register.submitCreate : messages.register.submitJoin}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
