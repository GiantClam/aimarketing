"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Sparkles, Mail, Lock, ArrowLeft, Zap } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
  const { login, devLogin, loading } = useAuth()
  const router = useRouter()
  const [error, setError] = useState("")

  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview" ||
    (typeof window !== "undefined" && window.location.hostname.includes("vercel.app"))

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      await login(email, password)
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败")
    }
  }

  const handleDevLogin = async () => {
    try {
      await devLogin()
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "开发登录失败")
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back to home link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 font-manrope"
        >
          <ArrowLeft className="w-4 h-4" />
          返回首页
        </Link>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold font-sans">欢迎回来</CardTitle>
            <CardDescription className="font-manrope">登录您的 AI Marketing 账户</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isDevelopment && (
              <div className="p-4 bg-gradient-to-r from-red-50 to-gray-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-red-800 font-manrope">Vercel 体验模式</span>
                </div>
                <p className="text-xs text-red-700 mb-3 font-manrope">
                  在 Vercel 开发环境中快速体验 AI Marketing 平台功能
                </p>
                <Button
                  onClick={handleDevLogin}
                  disabled={loading}
                  variant="outline"
                  className="w-full bg-red-100 border-red-300 text-red-800 hover:bg-red-200 font-manrope transition-colors"
                >
                  {loading ? "登录中..." : "🚀 一键体验登录"}
                </Button>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600 font-manrope">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-manrope">
                  邮箱地址
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="输入您的邮箱"
                    className="pl-10 font-manrope"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-manrope">
                  密码
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="输入您的密码"
                    className="pl-10 font-manrope"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-border" />
                  <span className="text-sm text-muted-foreground font-manrope">记住我</span>
                </label>
                <Link href="/forgot-password" className="text-sm text-primary hover:text-primary/80 font-manrope">
                  忘记密码？
                </Link>
              </div>

              <Button type="submit" disabled={loading} className="w-full font-manrope">
                {loading ? "登录中..." : "登录"}
              </Button>
            </form>

            <div className="relative">
              <Separator />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-card px-2 text-xs text-muted-foreground font-manrope">或</span>
              </div>
            </div>

            <Button variant="outline" className="w-full font-manrope bg-transparent">
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              使用 Google 登录
            </Button>

            <div className="text-center">
              <span className="text-sm text-muted-foreground font-manrope">
                还没有账户？{" "}
                <Link href="/register" className="text-primary hover:text-primary/80 font-medium">
                  立即注册
                </Link>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
