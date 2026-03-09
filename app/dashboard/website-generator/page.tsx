"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Layout, Rocket, Send, Sparkles } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

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
        const errorText = await response.text().catch(() => "")
        throw new Error(errorText || "网站生成服务暂时不可用")
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
    <DashboardLayout>
      <div className="flex h-full overflow-hidden bg-background">
        <div className="flex min-w-[400px] w-1/3 flex-col border-r border-border">
          <div className="border-b border-border bg-muted/50 p-4">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-primary" />网站生成 Agent</h2>
            <p className="text-xs text-muted-foreground">流式生成，实时预览页面结果</p>
          </div>

          <ScrollArea className="flex-1 p-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`mb-4 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <Card className={`max-w-[85%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  <CardContent className="whitespace-pre-wrap p-3 text-sm font-manrope">{message.content}</CardContent>
                </Card>
              </div>
            ))}
            {logs.length > 0 && (
              <div className="mt-6 space-y-2 border-l-2 border-primary/20 py-2 pl-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">执行日志</h3>
                {logs.map((log, index) => <div key={`${log}-${index}`} className="text-xs font-manrope leading-relaxed text-muted-foreground">{log}</div>)}
                {isGenerating && <div className="text-xs text-primary">{status || "生成中..."}</div>}
              </div>
            )}
            <div ref={messagesEndRef} />
          </ScrollArea>

          <div className="border-t border-border bg-card p-4">
            <div className="flex gap-2">
              <Input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleSend()} placeholder="描述你想要的网站需求..." className="flex-1 font-manrope" disabled={isGenerating} />
              <Button onClick={handleSend} disabled={isGenerating || !input.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col bg-muted/30">
          <div className="flex items-center justify-between border-b border-border bg-background p-3 px-4">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="flex items-center gap-1"><Layout className="h-3 w-3" />网站预览</Badge>
              <div className="flex gap-1"><div className="h-2 w-2 rounded-full bg-red-400" /><div className="h-2 w-2 rounded-full bg-yellow-400" /><div className="h-2 w-2 rounded-full bg-green-400" /></div>
            </div>
            <Button size="sm" className="gap-2" disabled><Rocket className="h-4 w-4" />部署入口预留</Button>
          </div>
          <div className="flex-1 overflow-hidden p-8">
            <div className="h-full w-full overflow-hidden rounded-xl border border-border bg-white shadow-2xl ring-8 ring-black/5">
              <iframe ref={iframeRef} className="h-full w-full" title="Website Preview" sandbox="allow-scripts allow-forms" />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
