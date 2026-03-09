"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, Clock3, LogOut, Save, Shield, User, X } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FEATURE_KEYS, FEATURE_LABELS, buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"

type PendingRequest = {
  requestId: number
  userId: number
  userName: string
  userEmail: string
  createdAt: string
  note?: string | null
}

type Member = {
  id: number
  name: string
  email: string
  enterpriseRole: string | null
  enterpriseStatus: string | null
  isDemo: boolean
  permissions: PermissionMap
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, isDemoMode, isEnterpriseAdmin, updateProfile, refreshProfile, logout } = useAuth()

  const [name, setName] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingAdminData, setLoadingAdminData] = useState(false)
  const [permissionDrafts, setPermissionDrafts] = useState<Record<number, PermissionMap>>({})

  useEffect(() => {
    setName(user?.name || "")
  }, [user?.name])

  const userId = Number(user?.id)

  const loadAdminData = async () => {
    if (!isEnterpriseAdmin || !Number.isFinite(userId) || userId <= 0) return

    setLoadingAdminData(true)
    try {
      const [requestRes, memberRes] = await Promise.all([
        fetch("/api/enterprise/requests", { cache: "no-store" }),
        fetch("/api/enterprise/members", { cache: "no-store" }),
      ])

      if (requestRes.ok) {
        const json = await requestRes.json()
        setRequests(json.data || [])
      }

      if (memberRes.ok) {
        const json = await memberRes.json()
        const list: Member[] = json.data || []
        setMembers(list)

        const nextDrafts: Record<number, PermissionMap> = {}
        for (const member of list) {
          nextDrafts[member.id] = { ...buildPermissionMap(false), ...(member.permissions || {}) }
        }
        setPermissionDrafts(nextDrafts)
      }
    } finally {
      setLoadingAdminData(false)
    }
  }

  useEffect(() => {
    void loadAdminData()
  }, [isEnterpriseAdmin, userId])

  const handleSaveProfile = async () => {
    const nextName = name.trim()
    if (!nextName) {
      setSaveMessage("显示名称不能为空")
      return
    }

    setIsSaving(true)
    try {
      await updateProfile({ name: nextName })
      await refreshProfile()
      setSaveMessage("保存成功")
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "保存失败")
    } finally {
      setIsSaving(false)
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

  const reviewRequest = async (requestId: number, action: "approve" | "reject") => {
    const res = await fetch(`/api/enterprise/requests/${requestId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })

    const json = await res.json()
    if (!res.ok) {
      window.alert(json.error || "审核失败")
      return
    }

    await loadAdminData()
    await refreshProfile()
  }

  const saveMemberPermissions = async (targetUserId: number) => {
    const permissions = permissionDrafts[targetUserId]
    const res = await fetch("/api/enterprise/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, permissions }),
    })

    const json = await res.json()
    if (!res.ok) {
      window.alert(json.error || "权限保存失败")
      return
    }

    await loadAdminData()
    if (targetUserId === userId) {
      await refreshProfile()
    }
  }

  const statusText = useMemo(() => {
    if (!user?.enterpriseStatus) return "未知"
    if (user.enterpriseStatus === "pending") return "待审核"
    if (user.enterpriseStatus === "active") return "已激活"
    if (user.enterpriseStatus === "rejected") return "已拒绝"
    return user.enterpriseStatus
  }, [user?.enterpriseStatus])

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-muted/10 p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="font-sans text-2xl font-bold text-foreground">用户设置</h1>
            <p className="mt-1 text-sm font-manrope text-muted-foreground">管理账号资料、企业归属和成员权限。</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-4 w-4" />账号信息</CardTitle>
              <CardDescription>可修改显示名称。企业信息由企业管理员维护。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="display-name">显示名称</Label>
                  <Input id="display-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入显示名称" />
                </div>
                <div className="grid gap-2">
                  <Label>邮箱</Label>
                  <Input value={user?.email || ""} disabled />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="grid gap-2"><Label>企业 ID</Label><Input value={user?.enterpriseCode || "未绑定"} disabled /></div>
                <div className="grid gap-2"><Label>企业名称</Label><Input value={user?.enterpriseName || "未绑定"} disabled /></div>
                <div className="grid gap-2"><Label>企业角色</Label><Input value={user?.enterpriseRole || "未知"} disabled /></div>
                <div className="grid gap-2"><Label>账号状态</Label><Input value={statusText} disabled /></div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveProfile} disabled={isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? "保存中..." : "保存设置"}</Button>
                {saveMessage && <span className="text-sm text-muted-foreground">{saveMessage}</span>}
              </div>
            </CardContent>
          </Card>

          {user?.enterpriseStatus === "pending" && (
            <Card className="border-amber-300 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700"><Clock3 className="h-4 w-4" />加入企业待审核</CardTitle>
                <CardDescription>企业管理员审核通过后，企业功能权限才会生效。</CardDescription>
              </CardHeader>
            </Card>
          )}

          {isEnterpriseAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />企业成员申请审核</CardTitle>
                <CardDescription>审核待加入企业的成员申请。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingAdminData && <p className="text-sm text-muted-foreground">加载中...</p>}
                {!loadingAdminData && requests.length === 0 && <p className="text-sm text-muted-foreground">暂无待审核申请。</p>}
                {requests.map((request) => (
                  <div key={request.requestId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{request.userName}（{request.userEmail}）</p>
                      <p className="text-xs text-muted-foreground">申请时间：{new Date(request.createdAt).toLocaleString()}</p>
                      {request.note && <p className="text-xs text-muted-foreground">说明：{request.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => reviewRequest(request.requestId, "reject")}><X className="mr-1 h-4 w-4" />拒绝</Button>
                      <Button size="sm" onClick={() => reviewRequest(request.requestId, "approve")}><Check className="mr-1 h-4 w-4" />通过</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isEnterpriseAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4" />成员功能权限</CardTitle>
                <CardDescription>配置成员可访问的功能模块。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {members.map((member) => {
                  const draft = permissionDrafts[member.id] || buildPermissionMap(false)
                  return (
                    <div key={member.id} className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{member.name}（{member.email}）</p>
                          <p className="text-xs text-muted-foreground">角色：{member.enterpriseRole || "member"} / 状态：{member.enterpriseStatus || "unknown"}</p>
                        </div>
                        <Button size="sm" onClick={() => saveMemberPermissions(member.id)} disabled={member.enterpriseStatus !== "active"}>保存权限</Button>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        {FEATURE_KEYS.map((feature) => (
                          <label key={feature} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={Boolean(draft[feature])}
                              disabled={member.enterpriseRole === "admin" && member.id !== userId}
                              onChange={(event) => {
                                setPermissionDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: {
                                    ...draft,
                                    [feature]: event.target.checked,
                                  },
                                }))
                              }}
                            />
                            <span>{FEATURE_LABELS[feature]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive"><Shield className="h-4 w-4" />会话管理</CardTitle>
              <CardDescription>退出登录会清除当前服务端会话，并返回登录页。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut}><LogOut className="mr-2 h-4 w-4" />{isLoggingOut ? "退出中..." : "退出登录"}</Button>
              {isDemoMode && <p className="mt-2 text-xs text-muted-foreground">当前为体验账号。</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
