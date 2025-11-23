"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, Sparkles, Loader2, CheckCircle2, RefreshCw, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type StoryboardScene = {
  scene_idx: number
  begin_s: number
  end_s: number
  image_url?: string
  clips: Array<{
    idx: number
    desc: string
    begin_s: number
    end_s: number
  }>
}

type Message = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  options?: string[] // 选项按钮
  selectedOption?: string // 用户选择的选项
  storyboard?: {
    scenes: StoryboardScene[]
  } // 故事板数据
}

type ConversationState = {
  runId?: string
  threadId?: string
  status: "idle" | "collecting" | "generating" | "completed" | "error"
  collectedInfo?: {
    videoType?: string
    duration?: number
    style?: string[]
    theme?: string
    keywords?: string[]
    keyElements?: string[]
    consistencyElements?: string[]
  }
}

type EditingScene = {
  messageId: string
  scene: StoryboardScene
  originalScene: StoryboardScene
}

export function VideoChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [conversationState, setConversationState] = useState<ConversationState>({
    status: "idle",
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  
  // 右侧菜单栏状态
  const [editingScene, setEditingScene] = useState<EditingScene | null>(null)
  const [editedScript, setEditedScript] = useState("")
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 防止重复初始化的 ref
  const hasInitialized = useRef(false)

  const addMessage = useCallback((role: "user" | "assistant" | "system", content: string, options?: string[], storyboard?: { scenes: StoryboardScene[] }) => {
    const message: Message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      role,
      content,
      timestamp: Date.now(),
      options,
      storyboard,
    }
    setMessages((prev) => [...prev, message])
  }, [])

  const handleEvent = useCallback((event: any) => {
    if (event.type === "message") {
      const options = event.payload?.options || []
      addMessage("assistant", event.delta || event.content || "", options)
      setLoading(false)
    } else if (event.type === "info") {
      addMessage("system", event.delta || "")
    } else if (event.type === "question") {
      const options = event.payload?.options || []
      addMessage("assistant", event.delta || event.content || "", options)
      setLoading(false)
    } else if (event.type === "collected") {
      setConversationState((prev) => ({
        ...prev,
        collectedInfo: event.payload,
      }))
    } else if (event.type === "generating") {
      setConversationState((prev) => ({ ...prev, status: "generating" }))
      addMessage("system", "信息收集完成，开始生成视频...")
    } else if (event.type === "storyboard") {
      // 收到故事板数据（旧格式，兼容）
      const storyboard = event.payload?.storyboard
      if (storyboard) {
        addMessage("system", event.delta || "故事板已生成", undefined, storyboard)
        setLoading(false)
      }
    } else if (event.type === "storyboard_pending") {
      // 收到需要确认的故事板数据
      const storyboard = event.payload?.storyboard
      const runId = event.payload?.run_id || event.run_id || conversationState.runId
      if (storyboard) {
        addMessage("system", event.delta || "故事板已生成，请审核并确认", undefined, {
          scenes: storyboard.scenes || storyboard,
          requiresConfirmation: true,
          runId: runId,
        })
        setLoading(false)
      }
    } else if (event.type === "completed") {
      setConversationState((prev) => ({ ...prev, status: "completed" }))
      addMessage("system", "视频生成完成！")
    } else if (event.type === "error") {
      setLoading(false)
      addMessage("assistant", `错误：${event.delta || event.content || "未知错误"}`)
    }
  }, [addMessage])

  const startConversation = useCallback(async () => {
    // 防止重复调用
    if (conversationState.runId || loading) {
      return
    }
    
    const threadId = `t_${Date.now()}`
    const runId = `r_${Date.now()}`
    
    setConversationState({
      runId,
      threadId,
      status: "collecting",
    })
    setLoading(true)

    try {
      const res = await fetch("/api/crewai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          thread_id: threadId,
          run_id: runId,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error("请求失败")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""

        for (const part of parts) {
          const line = part.split("data:").pop()?.trim()
          if (!line) continue

          try {
            const event = JSON.parse(line)
            handleEvent(event)
          } catch (e) {
            console.error("解析事件失败:", e)
          }
        }
      }
    } catch (error) {
      console.error("对话失败:", error)
      setLoading(false)
      addMessage("assistant", "抱歉，发生了错误。请刷新页面重试。")
    }
  }, [conversationState.runId, loading, handleEvent, addMessage])

  // 初始化对话
  useEffect(() => {
    if (hasInitialized.current) return // 防止重复初始化
    if (messages.length === 0 && conversationState.status === "idle") {
      hasInitialized.current = true
      const welcomeMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: "欢迎！我是您的视频制作助手。我将通过几个问题帮您收集视频制作所需的信息。让我们开始吧！",
        timestamp: Date.now(),
      }
      setMessages([welcomeMessage])
      // 自动开始收集信息
      setTimeout(() => {
        startConversation()
      }, 500)
    }
  }, [messages.length, conversationState.status, startConversation])

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || !conversationState.runId) return

    const userMessage = input.trim()
    setInput("")
    
    // 添加用户消息
    addMessage("user", userMessage)
    setLoading(true)

    try {
      const res = await fetch("/api/crewai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          thread_id: conversationState.threadId,
          run_id: conversationState.runId,
          message: userMessage,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error("请求失败")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""

        for (const part of parts) {
          const line = part.split("data:").pop()?.trim()
          if (!line) continue

          try {
            const event = JSON.parse(line)
            handleEvent(event)
          } catch (e) {
            console.error("解析事件失败:", e)
          }
        }
      }
    } catch (error) {
      console.error("发送消息失败:", error)
      setLoading(false)
      addMessage("assistant", "抱歉，发生了错误。请重试。")
    }
  }, [input, loading, conversationState])

  const handleOptionClick = useCallback(
    async (option: string, messageId: string) => {
      if (loading || !conversationState.runId) return

      // 更新消息，标记选中的选项
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, selectedOption: option }
            : msg
        )
      )

      // 立即添加用户消息
      addMessage("user", option)
      setLoading(true)

      try {
        const res = await fetch("/api/crewai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "message",
            thread_id: conversationState.threadId,
            run_id: conversationState.runId,
            message: option,
          }),
        })

        if (!res.ok || !res.body) {
          throw new Error("请求失败")
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder("utf-8")
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split("\n\n")
          buffer = parts.pop() || ""

          for (const part of parts) {
            const line = part.split("data:").pop()?.trim()
            if (!line) continue

            try {
              const event = JSON.parse(line)
              handleEvent(event)
            } catch (e) {
              console.error("解析事件失败:", e)
            }
          }
        }
      } catch (error) {
        console.error("发送消息失败:", error)
        setLoading(false)
        addMessage("assistant", "抱歉，发生了错误。请重试。")
      }
    },
    [loading, conversationState, addMessage, handleEvent]
  )

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 头部 */}
      <div className="border-b border-border px-6 py-4 bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground font-sans">视频制作助手</h2>
            <p className="text-sm text-muted-foreground font-manrope">
              {conversationState.status === "idle" && "准备开始"}
              {conversationState.status === "collecting" && "正在收集信息..."}
              {conversationState.status === "generating" && "正在生成视频..."}
              {conversationState.status === "completed" && "已完成"}
            </p>
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role !== "user" && (
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {message.role === "assistant" ? "AI" : "系统"}
                  </AvatarFallback>
                </Avatar>
              )}

              <div
                className={cn(
                  "flex flex-col gap-2 max-w-[80%]",
                  message.role === "user" ? "items-end" : "items-start"
                )}
              >
                <Card
                  className={cn(
                    "px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : message.role === "system"
                      ? "bg-muted"
                      : "bg-card border"
                  )}
                >
                  <CardContent className="p-0">
                    <p
                      className={cn(
                        "text-sm whitespace-pre-wrap mb-3",
                        message.role === "user" ? "text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {message.content}
                    </p>
                    
                    {/* 故事板展示 */}
                    {message.storyboard && message.storyboard.scenes && message.storyboard.scenes.length > 0 && (
                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {message.storyboard.scenes.map((scene) => (
                            <Card key={scene.scene_idx} className="overflow-hidden relative group">
                              <div className="aspect-video bg-muted relative">
                                {scene.image_url ? (
                                  <img
                                    src={scene.image_url}
                                    alt={`场景 ${scene.scene_idx}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                  </div>
                                )}
                                {/* 操作按钮 - 悬停时显示 */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      setEditingScene({
                                        messageId: message.id,
                                        scene: { ...scene },
                                        originalScene: { ...scene },
                                      })
                                      setEditedScript(scene.clips?.map((clip) => clip.desc).join("；") || "")
                                      setUploadedImage(null)
                                      setUploadedImageUrl(null)
                                    }}
                                    disabled={loading}
                                  >
                                    <RefreshCw className="w-4 h-4 mr-1" />
                                    重新生成
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      setEditingScene({
                                        messageId: message.id,
                                        scene: { ...scene },
                                        originalScene: { ...scene },
                                      })
                                      setEditedScript(scene.clips?.map((clip) => clip.desc).join("；") || "")
                                      setUploadedImage(null)
                                      setUploadedImageUrl(scene.image_url || null)
                                    }}
                                    disabled={loading}
                                  >
                                    <Upload className="w-4 h-4 mr-1" />
                                    上传图片
                                  </Button>
                                </div>
                              </div>
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline">场景 {scene.scene_idx}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {scene.begin_s}s - {scene.end_s}s
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {scene.clips && scene.clips.length > 0 && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {scene.clips.map((clip) => clip.desc).join("；")}
                                    </p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        {message.storyboard?.requiresConfirmation && (
                          <div className="flex gap-2 mt-4">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={async () => {
                                const runId = message.storyboard?.runId || conversationState.runId
                                if (!runId) return
                                
                                setLoading(true)
                                try {
                                  const res = await fetch("/api/crewai/storyboard/confirm", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      run_id: runId,
                                      confirmed: true,
                                    }),
                                  })
                                  
                                  if (res.ok) {
                                    addMessage("system", "已确认故事板，继续生成视频...")
                                    // 继续监听后续事件
                                    setLoading(false)
                                  }
                                } catch (error) {
                                  console.error("确认失败:", error)
                                  setLoading(false)
                                }
                              }}
                              disabled={loading}
                            >
                              接受并继续
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const runId = message.storyboard?.runId || conversationState.runId
                                if (!runId) return
                                
                                setLoading(true)
                                try {
                                  const res = await fetch("/api/crewai/storyboard/confirm", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      run_id: runId,
                                      confirmed: false,
                                      feedback: "用户要求重新生成",
                                    }),
                                  })
                                  
                                  if (res.ok) {
                                    addMessage("system", "已标记为拒绝，正在重新生成故事板...")
                                    setLoading(false)
                                  }
                                } catch (error) {
                                  console.error("拒绝失败:", error)
                                  setLoading(false)
                                }
                              }}
                              disabled={loading}
                            >
                              重新生成
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 选项按钮 */}
                {message.options && message.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.options.map((option, idx) => (
                      <Button
                        key={idx}
                        variant={message.selectedOption === option ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleOptionClick(option, message.id)}
                        disabled={loading || !!message.selectedOption}
                        className="text-xs font-manrope"
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                )}

                {/* 时间戳 */}
                <span className="text-xs text-muted-foreground">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>

              {message.role === "user" && (
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    您
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  AI
                </AvatarFallback>
              </Avatar>
              <Card className="px-4 py-3 bg-card border">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">正在思考...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* 输入区域 */}
      <div className="border-t border-border px-6 py-4 bg-card">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="输入您的回答或选择上面的选项..."
              className="min-h-[60px] resize-none font-manrope"
              disabled={loading || conversationState.status === "generating" || conversationState.status === "completed"}
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim() || conversationState.status === "generating" || conversationState.status === "completed"}
              size="icon"
              className="h-[60px] w-[60px]"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
          {conversationState.status === "completed" && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>视频生成完成，您可以在生成历史中查看</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

