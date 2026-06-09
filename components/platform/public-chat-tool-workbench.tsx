"use client"

import { useState } from "react"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { AppLocale } from "@/lib/i18n/config"

type PublicChatToolWorkbenchProps = {
  locale: AppLocale
  currentUser: boolean
  loginHref: string
  workspaceHref: string
  runtimeStatus: "ready" | "deferred" | "runtime_disabled"
  accessState: "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required"
}

type ChatExecutionResponse = {
  message: string
  conversationId?: string
  provider?: string | null
  providerModel?: string | null
}

export function PublicChatToolWorkbench({
  locale,
  currentUser,
  loginHref,
  workspaceHref,
  runtimeStatus,
  accessState,
}: PublicChatToolWorkbenchProps) {
  const isZh = locale === "zh"
  const copy = isZh
    ? {
        title: "公开 AI 对话工作台",
        body: "先在 public toolsite 里验证顾问式对话入口，再进入正式 workspace。当前先走非流式 platform execute，避免额外重写聊天 runtime。",
        placeholder: "例如：请帮我为 AI Marketing 设计一个面向 B2B 团队的首页信息架构。",
        submit: "提交对话",
        login: "登录后继续",
        workspace: "打开对话工作台",
        response: "当前回答",
        runtime: "运行时",
        access: "访问门槛",
        promptRequired: "先输入一个问题。",
        authRequired: "这个对话工作台当前需要登录后执行。",
        deferred: "当前 runtime 还处于 deferred 状态，暂时不能执行真实对话。",
        disabled: "当前 text runtime 还没准备好，暂时不能执行真实对话。",
      }
    : {
        title: "Public AI chat workbench",
        body: "Validate the advisor-style chat entry directly from the public toolsite before moving into the full workspace. This first pass uses non-streaming platform execute instead of rewriting the chat runtime.",
        placeholder: "Example: Help me design a homepage information architecture for AI Marketing aimed at B2B teams.",
        submit: "Send message",
        login: "Log in to continue",
        workspace: "Open AI workspace",
        response: "Current response",
        runtime: "Runtime",
        access: "Access",
        promptRequired: "Enter a question first.",
        authRequired: "This chat workbench currently requires login before execution.",
        deferred: "This runtime is still deferred, so real chat execution is not available yet.",
        disabled: "This text runtime is not ready yet, so real chat execution is not available.",
      }

  const [prompt, setPrompt] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ChatExecutionResponse | null>(null)

  async function submitPrompt() {
    if (!prompt.trim()) {
      setError(copy.promptRequired)
      return
    }

    if (!currentUser) {
      setError(copy.authRequired)
      return
    }

    if (runtimeStatus === "deferred") {
      setError(copy.deferred)
      return
    }

    if (runtimeStatus !== "ready") {
      setError(copy.disabled)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/platform/capabilities/ai-chat/execute?action=chat&locale=${encodeURIComponent(locale)}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          stream: false,
        }),
      })

      const data = (await response.json().catch(() => null)) as { error?: string } & ChatExecutionResponse
      if (!response.ok || !data?.message) {
        throw new Error(data?.error || "chat_execution_failed")
      }

      setResult({
        message: data.message,
        conversationId: data.conversationId,
        provider: data.provider,
        providerModel: data.providerModel,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "chat_execution_failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-border/70 bg-card/85 p-6">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{copy.body}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{copy.submit}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={copy.placeholder}
              className="min-h-32 border-border/70 bg-card text-foreground"
            />

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                {copy.runtime}: {runtimeStatus}
              </Badge>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                {copy.access}: {accessState}
              </Badge>
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void submitPrompt()}
                disabled={isSubmitting || !currentUser || runtimeStatus !== "ready"}
              >
                {isSubmitting ? "..." : copy.submit}
              </Button>
              {!currentUser ? (
                <Button variant="outline" asChild>
                  <Link href={loginHref}>{copy.login}</Link>
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href={workspaceHref}>{copy.workspace}</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/75">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{copy.response}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {result.provider ? (
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                      {result.provider}
                    </Badge>
                  ) : null}
                  {result.providerModel ? (
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                      {result.providerModel}
                    </Badge>
                  ) : null}
                  {result.conversationId ? (
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                      {result.conversationId}
                    </Badge>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm leading-6 text-foreground">
                  {result.message}
                </div>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                {isZh
                  ? "回答会显示在这里。当前阶段先走平台统一 execute，再继续保持和正式 AI workspace 的一致性。"
                  : "The response will appear here. This first pass runs through unified platform execute while staying aligned with the full AI workspace."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
