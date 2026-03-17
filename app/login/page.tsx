"use client"

import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Lock, Mail, Sparkles, Zap } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

export default function LoginPage() {
  const { login, devLogin, loading } = useAuth()
  const { messages } = useI18n()
  const router = useRouter()
  const [error, setError] = useState("")

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

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") || "")
    const password = String(formData.get("password") || "")

    try {
      await login(email, password)
      router.push(getNextPath())
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.login.loginFailed)
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
            <CardTitle className="font-sans text-2xl font-bold">{messages.login.title}</CardTitle>
            <CardDescription className="font-manrope">{messages.login.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {allowDemoLogin && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-amber-800">
                  <Zap className="h-4 w-4" />
                  <span className="text-sm font-medium font-manrope">{messages.login.demoTitle}</span>
                </div>
                <p className="mb-3 text-xs font-manrope text-amber-700">{messages.login.demoDescription}</p>
                <Button onClick={handleDemoLogin} disabled={loading} variant="outline" className="w-full border-amber-300 bg-amber-100 font-manrope text-amber-900 hover:bg-amber-200">
                  {loading ? messages.login.loggingIn : messages.login.demoLogin}
                </Button>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-manrope text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-manrope">{messages.login.email}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" name="email" type="email" placeholder={messages.login.emailPlaceholder} className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-manrope">{messages.login.password}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="password" name="password" type="password" placeholder={messages.login.passwordPlaceholder} className="pl-10 font-manrope" required />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full font-manrope">{loading ? messages.login.loggingIn : messages.login.submit}</Button>
            </form>

            <div className="relative">
              <Separator />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-card px-2 text-xs font-manrope text-muted-foreground">{messages.login.or}</span>
              </div>
            </div>

            <div className="text-center">
              <span className="text-sm font-manrope text-muted-foreground">
                {messages.login.noAccount}{" "}
                <Link href="/register" className="font-medium text-primary hover:text-primary/80">{messages.login.registerNow}</Link>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
