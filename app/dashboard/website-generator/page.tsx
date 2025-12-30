"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Send, Globe, Layout, Code, Search, CheckCircle, Rocket } from "lucide-react"

export default function WebsiteGeneratorPage() {
    const [messages, setMessages] = useState<any[]>([
        { role: "assistant", content: "你好！我是你的传统行业门户站生成智能体。请描述你的企业或产品，我将为你策划并生成一个完整的网站。" }
    ])
    const [input, setInput] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [currentHtml, setCurrentHtml] = useState("<html><body style='display:flex;justify-content:center;align-items:center;height:100vh;background:#f3f4f6;font-family:sans-serif;color:#6b7280;'>预览区</body></html>")
    const [status, setStatus] = useState<string>("")
    const [cOT, setCOT] = useState<string[]>([])

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    useEffect(() => {
        if (iframeRef.current && currentHtml) {
            const doc = iframeRef.current.contentDocument
            if (doc) {
                doc.open()
                doc.write(currentHtml)
                doc.close()
            }
        }
    }, [currentHtml])

    const handleSend = async () => {
        if (!input.trim()) return

        const userMessage = { role: "user", content: input }
        setMessages(prev => [...prev, userMessage])
        setInput("")
        setIsGenerating(true)
        setCOT([])

        try {
            const response = await fetch("http://localhost:8001/api/webgen/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: input })
            })

            const reader = response.body?.getReader()
            if (!reader) return

            const decoder = new TextDecoder()
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split("\n")

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = JSON.parse(line.substring(6))
                        if (data.type === "final") {
                            setCurrentHtml(data.html)
                            const msg = `网站已生成！\n\n预览地址: [${data.deployment_url || 'N/A'}](${data.deployment_url || '#'})`
                            setMessages(prev => [...prev, { role: "assistant", content: msg }])
                        } else if (data.node) {
                            setCOT(prev => [...prev, `正在执行 ${data.node}: ${data.status}`])
                            setStatus(`当前状态: ${data.status}`)
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error generating website:", error)
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <div className="flex h-full overflow-hidden bg-background">
            {/* Left Pane: Chat & COT */}
            <div className="w-1/3 flex flex-col border-r border-border min-w-[400px]">
                <div className="p-4 border-b border-border bg-muted/50">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        门户站生成智能体
                    </h2>
                    <p className="text-xs text-muted-foreground">由 Gemini 3 Flash & Claude 4.5 驱动</p>
                </div>

                <ScrollArea className="flex-1 p-4 space-y-4">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
                            <Card className={`max-w-[85%] ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                                <CardContent className="p-3 text-sm font-manrope whitespace-pre-wrap">
                                    {m.content}
                                </CardContent>
                            </Card>
                        </div>
                    ))}

                    {cOT.length > 0 && (
                        <div className="space-y-3 mt-6 border-l-2 border-primary/20 pl-4 py-2">
                            <h3 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">执行链路 (Chain of Thought)</h3>
                            {cOT.map((step, idx) => (
                                <div key={idx} className="flex items-start gap-3 text-xs text-muted-foreground animate-in fade-in slide-in-from-left-2 duration-500">
                                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                    <span className="font-manrope leading-relaxed">{step}</span>
                                </div>
                            ))}
                            {isGenerating && (
                                <div className="flex items-start gap-3 text-xs text-primary animate-pulse">
                                    <Sparkles className="w-4 h-4" />
                                    <span className="font-bold underline underline-offset-4 decoration-primary/30">
                                        {status || "智能体协作中..."}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </ScrollArea>

                <div className="p-4 border-t border-border bg-card">
                    <div className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="描述你的网站需求..."
                            className="flex-1 font-manrope"
                            disabled={isGenerating}
                        />
                        <Button onClick={handleSend} disabled={isGenerating || !input.trim()}>
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Right Pane: Iframe Preview */}
            <div className="flex-1 flex flex-col bg-muted/30">
                <div className="p-2 border-b border-border bg-background flex items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <Badge variant="outline" className="flex items-center gap-1">
                            <Layout className="w-3 h-3" />
                            响应式预览
                        </Badge>
                        <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <div className="w-2 h-2 rounded-full bg-yellow-400" />
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                        </div>
                    </div>
                    <Button size="sm" className="gap-2">
                        <Rocket className="w-4 h-4" />
                        一键部署
                    </Button>
                </div>
                <div className="flex-1 p-8 overflow-hidden">
                    <div className="w-full h-full bg-white rounded-xl shadow-2xl border border-border overflow-hidden ring-8 ring-black/5">
                        <iframe
                            ref={iframeRef}
                            className="w-full h-full"
                            title="Website Preview"
                            sandbox="allow-scripts allow-forms"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
