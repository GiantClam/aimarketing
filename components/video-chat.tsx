"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, Sparkles, Loader2, CheckCircle2, RefreshCw, Upload } from "lucide-react"
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

type VideoClip = {
  task_idx: number
  video_url: string
  status: "succeeded" | "failed" | "pending" | "submitted"
  error?: string
}

type AgentOutput = {
  agent: string
  type: string
  delta: string
  timestamp: number
  progress?: {
    current: number
    total: number
  }
}

type Message = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  options?: string[] // 选项按钮
  selectedOption?: string // 用户选择的选项
  questionType?: string // 问题类型，例如 product_image
  storyboard?: {
    scenes: StoryboardScene[]
    requiresConfirmation?: boolean
    runId?: string
  } // 故事板数据
  agentOutputs?: AgentOutput[] // 智能体输出
  videoClips?: {
    clips: VideoClip[]
    requiresConfirmation?: boolean
  } // 视频片段数据
  finalVideo?: {
    video_url: string
    run_id?: string
  } // 最终视频数据
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
  const productFileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  
  // 右侧菜单栏状态
  const [editingScene, setEditingScene] = useState<EditingScene | null>(null)
  const [editedScript, setEditedScript] = useState("")
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [productImageFile, setProductImageFile] = useState<File | null>(null)
  const [productImageUrl, setProductImageUrl] = useState<string>("")
  const [productUploading, setProductUploading] = useState(false)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 防止重复初始化的 ref
  const hasInitialized = useRef(false)

  const addMessage = useCallback((role: "user" | "assistant" | "system", content: string, options?: string[], storyboard?: { scenes: StoryboardScene[]; requiresConfirmation?: boolean; runId?: string }, videoClips?: { clips: VideoClip[]; requiresConfirmation?: boolean }, finalVideo?: { video_url: string; run_id?: string }, questionType?: string) => {
    const message: Message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      role,
      content,
      timestamp: Date.now(),
      options,
      questionType,
      storyboard,
      videoClips,
      finalVideo,
    }
    setMessages((prev) => [...prev, message])
  }, [])

  const startCrewStatusPolling = useCallback((runId: string) => {
    if (pollingRef.current) return
    const base = process.env.NEXT_PUBLIC_AGENT_URL || ""
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${base}/workflow/crew-status/${encodeURIComponent(runId)}`)
        if (!res.ok) return
        const data = await res.json()
        if (data && data.status === "completed" && data.result) {
          clearInterval(pollingRef.current as NodeJS.Timeout)
          pollingRef.current = null
          setConversationState((prev) => ({ ...prev, status: "completed" }))
          addMessage(
            "assistant",
            "恭喜！您的多智能体营销视频已成功生成。现在可以播放、下载或分享了。",
            undefined,
            undefined,
            undefined,
            {
              video_url: data.result,
              run_id: runId,
            }
          )
        }
      } catch {
        // Ignore polling errors and retry on the next interval tick.
      }
    }, 5000)
  }, [addMessage])

  const handleEvent = useCallback((event: any) => {
    if (event.type === "message") {
      const options = event.payload?.options || []
      addMessage("assistant", event.delta || event.content || "", options)
      setLoading(false)
    } else if (event.type === "info") {
      addMessage("system", event.delta || "")
  } else if (event.type === "question") {
      const options = event.payload?.options || []
      addMessage("assistant", event.delta || event.content || "", options, undefined, undefined, undefined, event.payload?.question_type)
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
    } else if (event.type === "thought" || event.type === "tool_result" || event.type === "progress" || event.type === "video_clip_completed" || event.type === "heartbeat") {
      // 智能体输出事件，追加到最后一个消息或创建新消息
      // 心跳事件只更新最后一条消息，不创建新消息
      const agentOutput: AgentOutput = {
        agent: event.agent || "System",
        type: event.type,
        delta: event.delta || "",
        timestamp: event.ts || Date.now(),
        progress: event.progress,
      }
      
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]
        if (lastMessage && lastMessage.role !== "user" && lastMessage.role !== "assistant") {
          // 如果是心跳事件，更新最后一条消息的最后一个输出，而不是追加
          if (event.type === "heartbeat") {
            const existingOutputs = lastMessage.agentOutputs || []
            const lastOutput = existingOutputs[existingOutputs.length - 1]
            if (lastOutput && lastOutput.type === "heartbeat") {
              // 更新最后一条心跳消息
              return prev.map((msg, idx) => 
                idx === prev.length - 1 
                  ? { 
                      ...msg, 
                      agentOutputs: [
                        ...existingOutputs.slice(0, -1),
                        agentOutput
                      ] 
                    }
                  : msg
              )
            }
          }
          // 追加到最后一个系统消息
          return prev.map((msg, idx) => 
            idx === prev.length - 1 
              ? { ...msg, agentOutputs: [...(msg.agentOutputs || []), agentOutput] }
              : msg
          )
        } else {
          // 创建新的系统消息
          const newMessage: Message = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: "system",
            content: "",
            timestamp: Date.now(),
            agentOutputs: [agentOutput],
          }
          return [...prev, newMessage]
        }
      })
    } else if (event.type === "video_clips_pending") {
      // 收到需要确认的视频片段数据
      const clips = event.payload?.clips || []
      if (clips.length > 0) {
        addMessage("system", event.delta || "所有视频片段已生成，请审核并确认", undefined, undefined, {
          clips: clips,
          requiresConfirmation: true,
        })
        setLoading(false)
      }
    } else if (event.type === "completed") {
      setConversationState((prev) => ({ ...prev, status: "completed" }))
      addMessage("system", "视频生成完成！")
    } else if (event.type === "run_finished") {
      const code = event.payload?.code
      const status = event.payload?.status
      const runId = event.payload?.run_id || event.run_id || conversationState.runId
      if (code === "confirmation_required") {
        addMessage("system", event.delta || "等待您的确认…")
      } else if (status === "processing") {
        addMessage("system", event.delta || "任务已提交，后台处理中…")
        if (runId) {
          startCrewStatusPolling(runId)
        }
      }
    } else if (event.type === "error") {
      setLoading(false)
      addMessage("assistant", `错误：${event.delta || event.content || "未知错误"}`)
    }
  }, [addMessage, conversationState.runId, startCrewStatusPolling])

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
            console.log("[SSE/crewai-chat]", event)
            handleEvent(event)
          } catch (e) {
            console.error("解析事件失败:", e)
          }
        }
      }
    } catch (error) {
      console.warn("视频 Agent 当前不可用:", error)
      setLoading(false)
      addMessage("assistant", "当前视频 Agent 暂时不可用，请稍后重试或联系管理员检查服务配置。")
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
            console.log("[SSE/crewai-chat]", event)
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
  }, [addMessage, conversationState, handleEvent, input, loading])

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
              console.log("[SSE/crewai-chat]", event)
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

  // 处理场景重新生成
  const handleRegenerateScene = useCallback(async () => {
    if (!editingScene || isRegenerating) return

    setIsRegenerating(true)
    try {
      const res = await fetch("/api/crewai/scene/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: editingScene.messageId,
          scene_idx: editingScene.scene.scene_idx,
        }),
      })

      if (!res.ok) {
        throw new Error("重新生成失败")
      }

      const data = await res.json()
      if (data.scene) {
        // 更新场景数据
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === editingScene.messageId && msg.storyboard) {
              const updatedScenes = msg.storyboard.scenes.map((s) =>
                s.scene_idx === data.scene.scene_idx ? data.scene : s
              )
              return {
                ...msg,
                storyboard: { ...msg.storyboard, scenes: updatedScenes },
              }
            }
            return msg
          })
        )

        // 更新编辑状态
        setEditingScene({
          ...editingScene,
          scene: data.scene,
          originalScene: data.scene,
        })
        setEditedScript(data.scene.clips?.map((clip: any) => clip.desc).join("；") || "")
        setUploadedImageUrl(data.scene.image_url || null)
      }
    } catch (error) {
      console.error("重新生成场景失败:", error)
      addMessage("assistant", "重新生成失败，请重试。")
    } finally {
      setIsRegenerating(false)
    }
  }, [editingScene, isRegenerating, addMessage])

  // 处理图片上传
  const handleUploadImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      addMessage("assistant", "请上传图片文件")
      return
    }

    setUploadedImage(file)
    const url = URL.createObjectURL(file)
    setUploadedImageUrl(url)
  }, [addMessage])

  const handleProductImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      addMessage("assistant", "请上传图片文件")
      return
    }
    setProductImageFile(file)
  }, [addMessage])

  const submitProductImage = useCallback(async (_messageId: string) => {
    if (!productImageFile || !conversationState.runId || productUploading) return
    setProductUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", productImageFile)
      const base = process.env.NEXT_PUBLIC_AGENT_URL || "/api"
      const res = await fetch(`${base}/workflow/upload-image`, { method: "POST", body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const fileName = data.fileName || data.filename || data.key || ""
      if (!fileName) throw new Error("上传失败")
      addMessage("user", fileName)
      setProductImageFile(null)
      setProductImageUrl("")
      setLoading(true)
      const resp = await fetch("/api/crewai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          thread_id: conversationState.threadId,
          run_id: conversationState.runId,
          message: fileName,
        }),
      })
      if (!resp.ok || !resp.body) throw new Error("请求失败")
      const reader = resp.body.getReader()
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
            console.log("[SSE/crewai-chat]", event)
            handleEvent(event)
          } catch (e) {
            console.error("解析事件失败:", e)
          }
        }
      }
    } catch (err) {
      console.error("产品图片上传失败:", err)
      addMessage("assistant", "上传失败，请重试或粘贴图片URL")
    } finally {
      setProductUploading(false)
      setLoading(false)
    }
  }, [productImageFile, conversationState.threadId, conversationState.runId, productUploading, addMessage, handleEvent])

  const submitProductImageUrl = useCallback(async (_messageId: string) => {
    const url = productImageUrl.trim()
    if (!url || !conversationState.runId) return
    addMessage("user", url)
    setProductImageUrl("")
    setLoading(true)
    try {
      const resp = await fetch("/api/crewai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          thread_id: conversationState.threadId,
          run_id: conversationState.runId,
          message: url,
        }),
      })
      if (!resp.ok || !resp.body) throw new Error("请求失败")
      const reader = resp.body.getReader()
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
            console.log("[SSE/crewai-chat]", event)
            handleEvent(event)
          } catch (e) {
            console.error("解析事件失败:", e)
          }
        }
      }
    } catch (err) {
      console.error("提交图片URL失败:", err)
      addMessage("assistant", "提交失败，请重试")
    } finally {
      setLoading(false)
    }
  }, [productImageUrl, conversationState.threadId, conversationState.runId, addMessage, handleEvent])

  // 保存场景修改
  const handleSaveScene = useCallback(async () => {
    if (!editingScene) return

    try {
      const formData = new FormData()
      formData.append("message_id", editingScene.messageId)
      formData.append("scene_idx", editingScene.scene.scene_idx.toString())
      formData.append("script", editedScript)

      if (uploadedImage) {
        formData.append("image", uploadedImage)
      }

      const res = await fetch("/api/crewai/scene/update", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        throw new Error("保存失败")
      }

      const data = await res.json()
      if (data.scene) {
        // 更新消息中的场景数据
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === editingScene.messageId && msg.storyboard) {
              const updatedScenes = msg.storyboard.scenes.map((s) =>
                s.scene_idx === data.scene.scene_idx ? data.scene : s
              )
              return {
                ...msg,
                storyboard: { ...msg.storyboard, scenes: updatedScenes },
              }
            }
            return msg
          })
        )
      }

      // 关闭编辑面板
      setEditingScene(null)
      setEditedScript("")
      setUploadedImage(null)
      setUploadedImageUrl(null)
    } catch (error) {
      console.error("保存场景失败:", error)
      addMessage("assistant", "保存失败，请重试。")
    }
  }, [editingScene, editedScript, uploadedImage, addMessage])

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setEditingScene(null)
    setEditedScript("")
    setUploadedImage(null)
    setUploadedImageUrl(null)
  }, [])

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
      <div 
        ref={scrollAreaRef}
        className="flex-1 px-6 py-4 overflow-y-auto"
        style={{
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
        }}
      >
        <style jsx global>{`
          div[class*="overflow-y-auto"]::-webkit-scrollbar {
            display: none; /* Chrome, Safari and Opera */
          }
        `}</style>
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
                    {/* 最终视频展示 - 优先显示 */}
                    {message.finalVideo && message.finalVideo.video_url && (
                      <div className="mt-4 space-y-4">
                        <Card className="bg-gradient-to-br from-muted/50 to-muted/30 border-2 border-green-500/20">
                          <CardContent className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6 text-white" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-lg font-bold">最终视频合成完成</h3>
                                  <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                    完成
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-6">
                              {message.content || "恭喜！您的多智能体营销视频已成功生成。现在可以播放、下载或分享了。"}
                            </p>
                            <div className="aspect-video bg-black rounded-lg overflow-hidden relative group mb-4">
                              <video
                                src={message.finalVideo.video_url}
                                controls
                                className="w-full h-full object-contain"
                                preload="metadata"
                                playsInline
                              >
                                您的浏览器不支持视频播放。
                              </video>
                            </div>
                            <div className="flex gap-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  const link = document.createElement("a")
                                  link.href = message.finalVideo?.video_url || ""
                                  link.download = `video_${message.finalVideo?.run_id || "final"}.mp4`
                                  link.click()
                                }}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                下载视频
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  navigator.clipboard.writeText(message.finalVideo?.video_url || "")
                                  addMessage("system", "视频链接已复制到剪贴板")
                                }}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                分享链接
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                    
                    {message.content && !message.finalVideo && (
                      <p
                        className={cn(
                          "text-sm whitespace-pre-wrap mb-3",
                          message.role === "user" ? "text-primary-foreground" : "text-foreground"
                        )}
                      >
                        {message.content}
                      </p>
                    )}
                    
                    {/* 智能体输出展示 */}
                    {message.agentOutputs && message.agentOutputs.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">智能体执行过程</div>
                        <div className="bg-muted/50 rounded-lg p-3 space-y-2 max-h-[300px] overflow-y-auto">
                          {message.agentOutputs.map((output, idx) => (
                            <div key={idx} className="text-xs space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {output.agent}
                                </Badge>
                                <span className="text-muted-foreground">{output.type}</span>
                                {output.progress && (
                                  <span className="text-muted-foreground">
                                    ({output.progress.current}/{output.progress.total})
                                  </span>
                                )}
                              </div>
                              <div className="text-foreground ml-2">{output.delta}</div>
                              {output.progress && (
                                <div className="w-full bg-background rounded-full h-1.5 mt-1">
                                  <div
                                    className="bg-primary h-1.5 rounded-full transition-all"
                                    style={{ width: `${(output.progress.current / output.progress.total) * 100}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* 最终视频展示 */}
                    {message.finalVideo && message.finalVideo.video_url && (
                      <div className="mt-4 space-y-4">
                        <Card className="bg-gradient-to-br from-muted/50 to-muted/30 border-2 border-green-500/20">
                          <CardContent className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6 text-white" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-lg font-bold">最终视频合成完成</h3>
                                  <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                    完成
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-6">
                              {message.content || "恭喜！您的多智能体营销视频已成功生成。现在可以播放、下载或分享了。"}
                            </p>
                            <div className="aspect-video bg-black rounded-lg overflow-hidden relative group mb-4">
                              <video
                                src={message.finalVideo?.video_url || ""}
                                controls
                                className="w-full h-full object-contain"
                                preload="metadata"
                                playsInline
                              >
                                您的浏览器不支持视频播放。
                              </video>
                            </div>
                            <div className="flex gap-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  const link = document.createElement("a")
                                  link.href = message.finalVideo?.video_url || ""
                                  link.download = `video_${message.finalVideo?.run_id || "final"}.mp4`
                                  link.click()
                                }}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                下载视频
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  navigator.clipboard.writeText(message.finalVideo?.video_url || "")
                                  addMessage("system", "视频链接已复制到剪贴板")
                                }}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                分享链接
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                    
                    {/* 视频片段展示 */}
                    {message.videoClips && message.videoClips.clips && message.videoClips.clips.length > 0 && (
                      <div className="mt-4 space-y-4">
                        <div className="text-sm font-semibold">生成的视频片段</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {message.videoClips.clips.map((clip) => (
                            <Card key={clip.task_idx} className="overflow-hidden">
                              <div className="aspect-video bg-muted relative">
                                {clip.status === "succeeded" && clip.video_url ? (
                                  <video
                                    src={clip.video_url}
                                    controls
                                    className="w-full h-full object-cover"
                                  />
                                ) : clip.status === "failed" ? (
                                  <div className="w-full h-full flex items-center justify-center text-destructive">
                                    <div className="text-center">
                                      <p className="text-sm font-semibold">生成失败</p>
                                      {clip.error && <p className="text-xs mt-1">{clip.error}</p>}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                  </div>
                                )}
                              </div>
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline">场景 {clip.task_idx}</Badge>
                                  <Badge variant={clip.status === "succeeded" ? "default" : clip.status === "failed" ? "destructive" : "secondary"}>
                                    {clip.status === "succeeded" ? "已完成" : clip.status === "failed" ? "失败" : "处理中"}
                                  </Badge>
                                </div>
                                <div className="flex gap-2 mt-2">
                                  {clip.status === "succeeded" && clip.video_url && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => {
                                          const video = document.createElement("video")
                                          video.src = clip.video_url
                                          video.controls = true
                                          video.play()
                                          const newWindow = window.open("", "_blank")
                                          if (newWindow) {
                                            newWindow.document.write(`
                                              <html>
                                                <head><title>场景 ${clip.task_idx} 视频</title></head>
                                                <body style="margin:0;padding:20px;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;">
                                                  <video src="${clip.video_url}" controls autoplay style="max-width:100%;max-height:100vh;"></video>
                                                </body>
                                              </html>
                                            `)
                                          }
                                        }}
                                      >
                                        <Send className="w-4 h-4 mr-1" />
                                        播放
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          // 重新生成视频片段
                                          setLoading(true)
                                          try {
                                            const res = await fetch("/api/crewai/scene/regenerate", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({
                                                run_id: conversationState.runId,
                                                task_idx: clip.task_idx,
                                              }),
                                            })
                                            if (res.ok) {
                                              addMessage("system", `正在重新生成场景 ${clip.task_idx} 的视频片段...`)
                                            }
                                          } catch (error) {
                                            console.error("重新生成失败:", error)
                                            addMessage("assistant", "重新生成失败，请重试。")
                                          } finally {
                                            setLoading(false)
                                          }
                                        }}
                                        disabled={loading}
                                      >
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        重新生成
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        {message.videoClips.requiresConfirmation && (
                          <div className="flex gap-2 mt-4">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={async () => {
                                // 确认所有视频片段，继续拼接
                                setLoading(true)
                                try {
                                  const runId = conversationState.runId
                                  if (!runId) {
                                    addMessage("system", "错误：缺少 run_id")
                                    return
                                  }
                                  
                                  addMessage("system", "已确认所有视频片段，开始拼接最终视频...")
                                  
                                  const res = await fetch("/api/crewai/video-clips/confirm", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      run_id: runId,
                                      confirmed: true,
                                    }),
                                  })
                                  
                                  const data = await res.json()
                                  console.log("[Video Clips Confirm] Response data:", data)
                                  
                                  if (res.ok && data.final_url) {
                                    console.log("[Video Clips Confirm] Adding final video message with URL:", data.final_url)
                                    // 添加最终视频消息，包含视频播放器
                                    addMessage(
                                      "assistant", 
                                      "恭喜！您的多智能体营销视频已成功生成。现在可以播放、下载或分享了。", 
                                      undefined, // options
                                      undefined, // storyboard
                                      undefined, // videoClips
                                      { // finalVideo
                                        video_url: data.final_url,
                                        run_id: runId
                                      }
                                    )
                                  } else {
                                    console.error("[Video Clips Confirm] Error:", data.error || "未知错误")
                                    addMessage("system", `拼接失败：${data.error || "未知错误"}`)
                                  }
                                } catch (error) {
                                  console.error("拼接失败:", error)
                                  addMessage("system", `拼接失败：${error instanceof Error ? error.message : "未知错误"}`)
                                } finally {
                                  setLoading(false)
                                }
                              }}
                              disabled={loading}
                            >
                              接受并继续拼接
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                addMessage("system", "已标记需要修改，请选择要重新生成的片段")
                              }}
                              disabled={loading}
                            >
                              需要修改
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    
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
                                    addMessage("system", "已确认故事板，后台继续生成视频...")
                                    const rid = runId
                                    if (rid) startCrewStatusPolling(rid)
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

                {message.questionType === "product_image" && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-muted-foreground">您可以上传图片文件或粘贴图片URL</div>
                    <div className="flex items-center gap-2">
                      <Input ref={productFileInputRef} id={`product-image-${message.id}`} type="file" accept="image/*" onChange={handleProductImageSelect} className="hidden" />
                      <Button variant="outline" type="button" onClick={() => productFileInputRef.current?.click()}>
                        <Upload className="w-4 h-4 mr-2" /> 选择文件
                      </Button>
                      <Button onClick={() => submitProductImage(message.id)} disabled={productUploading || !productImageFile}>
                        {productUploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 上传中...</>) : "上传并回答"}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input placeholder="https://..." value={productImageUrl} onChange={(e) => setProductImageUrl(e.target.value)} />
                      <Button variant="outline" onClick={() => submitProductImageUrl(message.id)} disabled={!productImageUrl.trim()}>使用URL回答</Button>
                    </div>
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
      </div>

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

      {/* 右侧编辑面板 */}
      <Sheet open={!!editingScene} onOpenChange={(open) => !open && handleCancelEdit()}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {editingScene && (
            <>
              <SheetHeader>
                <SheetTitle>编辑场景 {editingScene.scene.scene_idx}</SheetTitle>
                <SheetDescription>
                  修改场景脚本或上传新图片。修改后点击"确认"保存更改。
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* 场景预览图片 */}
                <div className="space-y-2">
                  <Label>场景预览</Label>
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
                    {uploadedImageUrl ? (
                      <img
                        src={uploadedImageUrl}
                        alt={`场景 ${editingScene.scene.scene_idx}`}
                        className="w-full h-full object-cover"
                      />
                    ) : editingScene.scene.image_url ? (
                      <img
                        src={editingScene.scene.image_url}
                        alt={`场景 ${editingScene.scene.scene_idx}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <span>暂无图片</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 场景脚本编辑 */}
                <div className="space-y-2">
                  <Label>场景脚本</Label>
                  <Textarea
                    value={editedScript}
                    onChange={(e) => setEditedScript(e.target.value)}
                    placeholder="输入场景描述，多个镜头用分号（；）分隔"
                    className="min-h-[120px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    提示：每个镜头描述用分号（；）分隔
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleRegenerateScene}
                      disabled={isRegenerating}
                      className="flex-1"
                    >
                      {isRegenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          重新生成中...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          AI 重新生成
                        </>
                      )}
                    </Button>
                    <Label htmlFor="image-upload" className="flex-1">
                      <Button
                        variant="outline"
                        asChild
                        className="w-full"
                      >
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          上传图片
                        </span>
                      </Button>
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImage}
                        className="hidden"
                      />
                    </Label>
                  </div>
                </div>

                {/* 场景信息 */}
                <div className="space-y-2 pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">场景时长</span>
                    <span className="font-medium">
                      {editingScene.scene.begin_s}s - {editingScene.scene.end_s}s
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">镜头数量</span>
                    <span className="font-medium">
                      {editingScene.scene.clips?.length || 0} 个
                    </span>
                  </div>
                </div>
              </div>

              <SheetFooter className="mt-6">
                <Button variant="outline" onClick={handleCancelEdit}>
                  取消
                </Button>
                <Button onClick={handleSaveScene} disabled={!editedScript.trim()}>
                  确认
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
