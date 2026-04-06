"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Layout, Send, Sparkles } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WorkspaceComposerPanel, WorkspacePromptGrid } from "@/components/workspace/workspace-primitives"
import { WorkspaceMessageFrame, WorkspaceSectionCard } from "@/components/workspace/workspace-message-primitives"

type ChatMessage = {
  role: "assistant" | "user"
  content: string
}

export default function WebsiteGeneratorPage() {
  const router = useRouter()
  const { hasFeature, user } = useAuth()
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = (zh: string, en: string) => (isZh ? zh : en)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: t(
        "你好，我是网站生成 Agent。请描述你的企业、产品、目标客户和希望的网站风格，我会一边生成内容，一边实时预览。",
        "Hi, I am the website generation agent. Describe your company, product, target audience, and desired style. I will generate content and preview in real time.",
      ),
    },
  ])
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentHtml, setCurrentHtml] = useState(
    `<html><body style='display:flex;justify-content:center;align-items:center;height:100vh;background:#f3f4f6;font-family:sans-serif;color:#6b7280;'>${t("网站预览区", "Website preview area")}</body></html>`,
  )
  const [status, setStatus] = useState("")
  const [logs, setLogs] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!user) return
    if (!hasFeature("website_generation")) router.replace("/dashboard")
  }, [hasFeature, router, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, logs])

  useEffect(() => {
    if (!iframeRef.current || !currentHtml) return
    const doc = iframeRef.current.contentDocument
    if (!doc) return
    doc.open()
    doc.write(currentHtml)
    doc.close()
  }, [currentHtml])

  const starterPrompts = [
    t(
      "为跨境电商品牌生成一个高转化落地页，强调产品优势、用户评价和限时优惠。",
      "Create a high-conversion landing page for a cross-border ecommerce brand, highlighting product strengths, user reviews, and limited-time offers.",
    ),
    t(
      "生成一个企业官网首页，突出品牌定位、核心服务、案例展示和联系入口。",
      "Generate a corporate homepage with brand positioning, core services, case studies, and a clear contact entry.",
    ),
    t(
      "为 AI SaaS 产品生成营销站点，风格要专业、现代，并突出试用转化。",
      "Create a marketing site for an AI SaaS product with a professional modern style and strong trial conversion focus.",
    ),
  ]

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return

    const prompt = input.trim()
    setMessages((prev) => [...prev, { role: "user", content: prompt }])
    setInput("")
    setIsGenerating(true)
    setStatus("")
    setLogs([])

    try {
      const response = await fetch("/api/webgen/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) })
      if (!response.ok || !response.body) {
        const errorPayload = await response.json().catch(async () => ({ error: await response.text().catch(() => "") }))
        const rawMessage = String(errorPayload?.error || "").trim()
        const normalizedMessage =
          !rawMessage || rawMessage === "fetch failed"
            ? t(
                "网站生成服务暂时不可用，请联系管理员检查 Webgen 服务配置。",
                "Website generation service is temporarily unavailable. Please ask your admin to check Webgen configuration.",
              )
            : rawMessage
        throw new Error(normalizedMessage)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (!payload) continue
          try {
            const data = JSON.parse(payload)
            if (data.type === "final") {
              setCurrentHtml(data.html)
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: data.deployment_url
                    ? t(`网站已生成。\n部署地址：${data.deployment_url}`, `Website generated.\nDeployment URL: ${data.deployment_url}`)
                    : t("网站已生成，你可以在右侧继续预览。", "Website generated. You can continue previewing on the right."),
                },
              ])
            } else if (data.node) {
              const text = `${data.node}: ${data.status || "running"}`
              setStatus(text)
              setLogs((prev) => [...prev, text])
            }
          } catch {
            // Ignore malformed SSE payloads from the generator.
          }
        }
      }
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error?.message || t("网站生成失败，请稍后重试。", "Website generation failed. Please try again."),
        },
      ])
    } finally {
      setIsGenerating(false)
    }
  }

  if (!user || !hasFeature("website_generation")) return null

  return (
    <div className="flex h-full overflow-hidden bg-muted/30">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-2 px-2 py-2 lg:px-4 lg:py-3">
        <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border-2 border-border bg-card">
            <div className="border-b-2 border-border px-4 py-3.5">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("提示输入", "Prompt lane")}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t(
                  "从企业、产品、目标客户、页面结构和视觉风格开始描述，系统会按节点流式生成。",
                  "Start with company, product, audience, structure, and visual style. The system will stream generation by workflow nodes.",
                )}
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-0">
                {messages.length === 1 ? (
                  <div className="p-3">
                    <WorkspacePromptGrid
                      eyebrow={t("快速开始", "Quick start")}
                      prompts={starterPrompts}
                      onSelect={(prompt) => setInput(prompt)}
                    />
                  </div>
                ) : null}

                {messages.map((message, index) => (
                  <WorkspaceMessageFrame
                    key={`${message.role}-${index}`}
                    role={message.role}
                    label={message.role === "user" ? t("你", "You") : t("网站生成 Agent", "Website Agent")}
                    icon={message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                    bodyClassName="text-sm leading-7 whitespace-pre-wrap"
                  >
                    {message.content}
                  </WorkspaceMessageFrame>
                ))}

                {logs.length > 0 && (
                  <div className="p-3 pt-0">
                    <WorkspaceSectionCard
                      title={t("执行日志", "Execution log")}
                      description={t(
                        "生成器会按节点流式返回状态，用于追踪页面结构、内容和预览同步。",
                        "The generator streams node-level status to track structure, content, and preview sync.",
                      )}
                    >
                      <div className="space-y-2">
                        {logs.map((log, index) => (
                          <div key={`${log}-${index}`} className="text-xs leading-6 text-muted-foreground">
                            {log}
                          </div>
                        ))}
                        {isGenerating ? (
                          <div className="text-xs font-medium text-primary">{status || t("生成中...", "Generating...")}</div>
                        ) : null}
                      </div>
                    </WorkspaceSectionCard>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t-2 border-border bg-muted/20 p-2.5">
              <WorkspaceComposerPanel
                className="border-none bg-transparent p-0"
                footer={
                  <>
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      {t(
                        "支持连续迭代页面结构、文案方向、版块排序与风格要求",
                        "Supports iterative updates on structure, copy direction, section order, and visual style.",
                      )}
                    </p>
                    <Button onClick={handleSend} disabled={isGenerating || !input.trim()} size="sm" className="h-8 rounded-full px-3 text-[11px]">
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      {t("发送", "Send")}
                    </Button>
                  </>
                }
              >
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSend()}
                  placeholder={t("描述你想要的网站需求...", "Describe your website requirements...")}
                  className="h-12 border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
                  disabled={isGenerating}
                />
              </WorkspaceComposerPanel>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border-2 border-border bg-card">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]">
                  <Layout className="h-3 w-3" />
                  {t("网站预览", "Website preview")}
                </Badge>
                <span className="rounded-full border-2 border-border bg-background px-2.5 py-1 text-[10px] text-muted-foreground">
                  {t("预览容器", "Preview shell")}
                </span>
              </div>
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[10px]">
                {t("实时 iframe", "Live iframe")}
              </Badge>
            </div>

            <div className="min-h-0 flex-1 p-4 lg:p-6">
              <div className="h-full w-full overflow-hidden rounded-[26px] border-2 border-border bg-white">
                <iframe
                  ref={iframeRef}
                  className="h-full w-full"
                  title={t("网站预览", "Website preview")}
                  sandbox="allow-scripts allow-forms"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
