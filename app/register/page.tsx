"use client"

import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Building2, KeyRound, Lock, Mail, Sparkles, User } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
  const router = useRouter()
  const { register, loading } = useAuth()

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
      setError("请填写完整注册信息")
      return
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }

    if (enterpriseAction === "create" && !enterpriseName) {
      setError("请输入企业名称")
      return
    }

    if (enterpriseAction === "join" && !enterpriseCode) {
      setError("请输入企业 ID")
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
      setError(err instanceof Error ? err.message : "注册失败")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 font-manrope text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="font-sans text-2xl font-bold">创建账号</CardTitle>
            <CardDescription className="font-manrope">新用户必须绑定企业。你可以创建企业，或申请加入已有企业。</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-manrope text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-manrope">姓名</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="name" name="name" type="text" placeholder="请输入姓名" className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="font-manrope">邮箱地址</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" name="email" type="email" placeholder="请输入邮箱" className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-manrope">密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="password" name="password" type="password" placeholder="创建登录密码" className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="font-manrope">确认密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="再次输入密码" className="pl-10 font-manrope" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-manrope">企业绑定方式</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={enterpriseAction === "create" ? "default" : "outline"} onClick={() => { setEnterpriseAction("create"); setEnterpriseLookup(null) }}>创建企业</Button>
                  <Button type="button" variant={enterpriseAction === "join" ? "default" : "outline"} onClick={() => { setEnterpriseAction("join"); setEnterpriseLookup(null) }}>加入企业</Button>
                </div>
              </div>

              {enterpriseAction === "create" ? (
                <div className="space-y-2">
                  <Label htmlFor="enterpriseName" className="font-manrope">企业名称</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="enterpriseName" name="enterpriseName" type="text" placeholder="例如：上海星河科技有限公司" className="pl-10 font-manrope" required />
                  </div>
                  <p className="text-xs font-manrope text-muted-foreground">创建企业的用户将默认成为企业管理员。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="enterpriseCode" className="font-manrope">企业 ID</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="enterpriseCode" name="enterpriseCode" type="text" placeholder="请输入企业 ID" className="pl-10 font-manrope" required />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => handleLookup((document.getElementById("enterpriseCode") as HTMLInputElement)?.value || "")}>验证企业</Button>
                    {enterpriseLookup?.found && <span className="text-xs text-green-600">已找到企业：{enterpriseLookup.name}</span>}
                    {enterpriseLookup && !enterpriseLookup.found && <span className="text-xs text-red-600">企业 ID 不存在</span>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="joinNote" className="font-manrope">加入说明</Label>
                    <Input id="joinNote" name="joinNote" placeholder="例如：市场部 / 内容运营" />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full font-manrope" disabled={loading}>
                {loading ? "提交中..." : enterpriseAction === "create" ? "创建账号并创建企业" : "提交加入申请"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
