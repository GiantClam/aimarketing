"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Layout, Send, Sparkles } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
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
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: "你好，我是网站生成 Agent。请描述你的企业、产品、目标客户和希望的网站风格，我会一边生成内容，一边实时预览。" }])
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentHtml, setCurrentHtml] = useState("<html><body style='display:flex;justify-content:center;align-items:center;height:100vh;background:#f3f4f6;font-family:sans-serif;color:#6b7280;'>网站预览区</body></html>")
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
    "为跨境电商品牌生成一个高转化落地页，强调产品优势、用户评价和限时优惠。",
    "生成一个企业官网首页，突出品牌定位、核心服务、案例展示和联系入口。",
    "为 AI SaaS 产品生成营销站点，风格要专业、现代，并突出试用转化。",
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
            ? "网站生成服务暂时不可用，请联系管理员检查 Webgen 服务配置。"
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
              setMessages((prev) => [...prev, { role: "assistant", content: data.deployment_url ? `网站已生成。\n部署地址：${data.deployment_url}` : "网站已生成，你可以在右侧继续预览。" }])
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
      setMessages((prev) => [...prev, { role: "assistant", content: error?.message || "网站生成失败，请稍后重试。" }])
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
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">Prompt lane</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                从企业、产品、目标客户、页面结构和视觉风格开始描述，系统会按节点流式生成。
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-0">
                {messages.length === 1 ? (
                  <div className="p-3">
                    <WorkspacePromptGrid
                      eyebrow="Quick start"
                      prompts={starterPrompts}
                      onSelect={(prompt) => setInput(prompt)}
                    />
                  </div>
                ) : null}

                {messages.map((message, index) => (
                  <WorkspaceMessageFrame
                    key={`${message.role}-${index}`}
                    role={message.role}
                    label={message.role === "user" ? "You" : "Website Agent"}
                    icon={message.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                    bodyClassName="text-sm leading-7 whitespace-pre-wrap"
                  >
                    {message.content}
                  </WorkspaceMessageFrame>
                ))}

                {logs.length > 0 && (
                  <div className="p-3 pt-0">
                    <WorkspaceSectionCard
                      title="执行日志"
                      description="生成器会按节点流式返回状态，用于追踪页面结构、内容和预览同步。"
                    >
                      <div className="space-y-2">
                        {logs.map((log, index) => (
                          <div key={`${log}-${index}`} className="text-xs leading-6 text-muted-foreground">
                            {log}
                          </div>
                        ))}
                        {isGenerating ? <div className="text-xs font-medium text-primary">{status || "生成中..."}</div> : null}
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
                      支持连续迭代页面结构、文案方向、版块排序与风格要求
                    </p>
                    <Button onClick={handleSend} disabled={isGenerating || !input.trim()} size="sm" className="h-8 rounded-full px-3 text-[11px]">
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      发送
                    </Button>
                  </>
                }
              >
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSend()}
                  placeholder="描述你想要的网站需求..."
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
                  网站预览
                </Badge>
                <span className="rounded-full border-2 border-border bg-background px-2.5 py-1 text-[10px] text-muted-foreground">
                  Preview shell
                </span>
              </div>
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[10px]">
                Live iframe
              </Badge>
            </div>

            <div className="min-h-0 flex-1 p-4 lg:p-6">
              <div className="h-full w-full overflow-hidden rounded-[26px] border-2 border-border bg-white">
                <iframe ref={iframeRef} className="h-full w-full" title="Website Preview" sandbox="allow-scripts allow-forms" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
