"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Send, Loader2, CheckCircle2, RefreshCw, Upload } from "lucide-react"
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
import { useI18n } from "@/components/locale-provider"
import { WorkspaceComposerPanel, WorkspacePromptChips } from "@/components/workspace/workspace-primitives"
import {
  WorkspaceActionRow,
  WorkspaceLoadingMessage,
  WorkspaceMessageFrame,
  WorkspaceResultCard,
  WorkspaceSectionCard,
} from "@/components/workspace/workspace-message-primitives"

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
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])
  const formatError = useCallback(
    (value?: string) => `${t("错误", "Error")}: ${value || t("未知错误", "Unknown error")}`,
    [t],
  )
  const agentUnavailableMessage = t(
    "当前视频 Agent 暂时不可用，请稍后重试或联系管理员检查服务配置。",
    "Video agent is temporarily unavailable. Please try again later or contact your admin.",
  )
  const finalVideoMessage = t(
    "恭喜！您的多智能体营销视频已成功生成。现在可以播放、下载或分享了。",
    "Your multi-agent marketing video is ready. You can now play, download, or share it.",
  )
  const conversationStatusLabel = {
    idle: t("待命", "Idle"),
    collecting: t("信息收集中", "Collecting"),
    generating: t("生成中", "Generating"),
    completed: t("已完成", "Completed"),
    error: t("错误", "Error"),
  } as const

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [, setAgentAvailable] = useState<boolean | null>(null)
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

  const checkVideoAgentAvailability = useCallback(async () => {
    try {
      const response = await fetch("/api/crewai/chat", {
        method: "GET",
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      const enabled = Boolean(payload?.enabled)
      setAgentAvailable(enabled)
      return {
        enabled,
        reason: typeof payload?.reason === "string" ? payload.reason : null,
      }
    } catch (error) {
      setAgentAvailable(false)
      return {
        enabled: false,
        reason: error instanceof Error ? error.message : "availability_fetch_failed",
      }
    }
  }, [])

  const initializeConversation = useCallback(async () => {
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
        throw new Error("request_failed")
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
            console.log("[SSE/crewai-chat:init]", event)
            if (event.type === "message" || event.type === "question") {
              addMessage(
                "assistant",
                event.delta || event.content || "",
                event.payload?.options || [],
                undefined,
                undefined,
                undefined,
                event.payload?.question_type,
              )
              setLoading(false)
            } else if (event.type === "info") {
              addMessage("system", event.delta || "")
            } else if (event.type === "collected") {
              setConversationState((prev) => ({
                ...prev,
                collectedInfo: event.payload,
              }))
            } else if (event.type === "generating") {
              setConversationState((prev) => ({ ...prev, status: "generating" }))
              addMessage("system", t("信息收集完成，开始生成视频...", "Information collected. Starting video generation..."))
            } else if (event.type === "error") {
              setConversationState((prev) => ({ ...prev, status: "error" }))
              setLoading(false)
              addMessage("assistant", formatError(event.delta || event.content))
            }
          } catch (parseError) {
            console.error("Failed to parse initialization event:", parseError)
          }
        }
      }
    } catch {
      setConversationState((prev) => ({ ...prev, status: "error" }))
      setAgentAvailable(false)
      setLoading(false)
      addMessage("assistant", agentUnavailableMessage)
    }
  }, [agentUnavailableMessage, conversationState.runId, formatError, loading, addMessage, t])

  useEffect(() => {
    if (hasInitialized.current) return
    if (messages.length !== 0 || conversationState.status !== "idle") return

    hasInitialized.current = true
    const welcomeMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: t(
        "欢迎！我是您的视频制作助手。我将通过几个问题帮您收集视频制作所需的信息。让我们开始吧！",
        "Welcome! I am your video creation assistant. I will ask a few questions to gather what we need. Let's begin.",
      ),
      timestamp: Date.now(),
    }
    setMessages([welcomeMessage])

    let cancelled = false
    void (async () => {
      const availability = await checkVideoAgentAvailability()
      if (cancelled) return

      if (!availability.enabled) {
        setConversationState((prev) => ({ ...prev, status: "error" }))
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: "assistant",
            content: agentUnavailableMessage,
            timestamp: Date.now(),
          },
        ])
        return
      }

      setTimeout(() => {
        if (!cancelled) {
          void initializeConversation()
        }
      }, 500)
    })()

    return () => {
      cancelled = true
    }
  }, [messages.length, conversationState.status, checkVideoAgentAvailability, initializeConversation, agentUnavailableMessage, t])

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
            finalVideoMessage,
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
  }, [addMessage, finalVideoMessage])

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
      addMessage("system", t("信息收集完成，开始生成视频...", "Information collected. Starting video generation..."))
    } else if (event.type === "storyboard") {
      // 收到故事板数据（旧格式，兼容）
      const storyboard = event.payload?.storyboard
      if (storyboard) {
        addMessage("system", event.delta || t("故事板已生成", "Storyboard generated"), undefined, storyboard)
        setLoading(false)
      }
    } else if (event.type === "storyboard_pending") {
      // 收到需要确认的故事板数据
      const storyboard = event.payload?.storyboard
      const runId = event.payload?.run_id || event.run_id || conversationState.runId
      if (storyboard) {
        addMessage("system", event.delta || t("故事板已生成，请审核并确认", "Storyboard generated. Please review and confirm."), undefined, {
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
        addMessage("system", event.delta || t("所有视频片段已生成，请审核并确认", "All clips generated. Please review and confirm."), undefined, undefined, {
          clips: clips,
          requiresConfirmation: true,
        })
        setLoading(false)
      }
    } else if (event.type === "completed") {
      setConversationState((prev) => ({ ...prev, status: "completed" }))
      addMessage("system", t("视频生成完成！", "Video generation completed."))
    } else if (event.type === "run_finished") {
      const code = event.payload?.code
      const status = event.payload?.status
      const runId = event.payload?.run_id || event.run_id || conversationState.runId
      if (code === "confirmation_required") {
        addMessage("system", event.delta || t("等待您的确认…", "Waiting for your confirmation..."))
      } else if (status === "processing") {
        addMessage("system", event.delta || t("任务已提交，后台处理中…", "Task submitted. Processing in the background..."))
        if (runId) {
          startCrewStatusPolling(runId)
        }
      }
    } else if (event.type === "error") {
      setLoading(false)
      addMessage("assistant", formatError(event.delta || event.content))
    }
  }, [addMessage, conversationState.runId, formatError, startCrewStatusPolling, t])

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
        throw new Error(t("请求失败", "Request failed"))
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
            console.error("Failed to parse event:", e)
          }
        }
      }
    } catch (error) {
      console.warn("Video agent unavailable:", error)
      setLoading(false)
      addMessage("assistant", agentUnavailableMessage)
    }
  }, [agentUnavailableMessage, conversationState.runId, handleEvent, loading, addMessage, t])

  // 初始化对话
  useEffect(() => {
    if (hasInitialized.current) return // 防止重复初始化
    if (messages.length === 0 && conversationState.status === "idle") {
      hasInitialized.current = true
      const welcomeMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: t(
          "欢迎！我是您的视频制作助手。我将通过几个问题帮您收集视频制作所需的信息。让我们开始吧！",
          "Welcome! I am your video creation assistant. I will ask a few questions to gather what we need. Let's begin.",
        ),
        timestamp: Date.now(),
      }
      setMessages([welcomeMessage])
      // 自动开始收集信息
      setTimeout(() => {
        startConversation()
      }, 500)
    }
  }, [messages.length, conversationState.status, startConversation, t])

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
        throw new Error(t("请求失败", "Request failed"))
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
            console.error("Failed to parse event:", e)
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error)
      setLoading(false)
      addMessage("assistant", t("抱歉，发生了错误。请重试。", "Sorry, an error occurred. Please try again."))
    }
  }, [addMessage, conversationState, handleEvent, input, loading, t])

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
          throw new Error(t("请求失败", "Request failed"))
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
              console.error("Failed to parse event:", e)
            }
          }
        }
      } catch (error) {
        console.error("Failed to send message:", error)
        setLoading(false)
        addMessage("assistant", t("抱歉，发生了错误。请重试。", "Sorry, an error occurred. Please try again."))
      }
    },
    [loading, conversationState, addMessage, handleEvent, t]
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
        throw new Error(t("重新生成失败", "Regeneration failed"))
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
      console.error("Failed to regenerate scene:", error)
      addMessage("assistant", t("重新生成失败，请重试。", "Regeneration failed. Please try again."))
    } finally {
      setIsRegenerating(false)
    }
  }, [editingScene, isRegenerating, addMessage, t])

  // 处理图片上传
  const handleUploadImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      addMessage("assistant", t("请上传图片文件", "Please upload an image file."))
      return
    }

    setUploadedImage(file)
    const url = URL.createObjectURL(file)
    setUploadedImageUrl(url)
  }, [addMessage, t])

  const handleProductImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      addMessage("assistant", t("请上传图片文件", "Please upload an image file."))
      return
    }
    setProductImageFile(file)
  }, [addMessage, t])

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
      if (!fileName) throw new Error(t("上传失败", "Upload failed"))
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
      if (!resp.ok || !resp.body) throw new Error(t("请求失败", "Request failed"))
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
            console.error("Failed to parse event:", e)
          }
        }
      }
    } catch (err) {
      console.error("Failed to upload product image:", err)
      addMessage("assistant", t("上传失败，请重试或粘贴图片URL", "Upload failed. Please try again or paste an image URL."))
    } finally {
      setProductUploading(false)
      setLoading(false)
    }
  }, [productImageFile, conversationState.threadId, conversationState.runId, productUploading, addMessage, handleEvent, t])

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
      if (!resp.ok || !resp.body) throw new Error(t("请求失败", "Request failed"))
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
            console.error("Failed to parse event:", e)
          }
        }
      }
    } catch (err) {
      console.error("Failed to submit image URL:", err)
      addMessage("assistant", t("提交失败，请重试", "Submission failed. Please try again."))
    } finally {
      setLoading(false)
    }
  }, [productImageUrl, conversationState.threadId, conversationState.runId, addMessage, handleEvent, t])

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
        throw new Error(t("保存失败", "Save failed"))
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
      console.error("Failed to save scene:", error)
      addMessage("assistant", t("保存失败，请重试。", "Save failed. Please try again."))
    }
  }, [editingScene, editedScript, uploadedImage, addMessage, t])

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setEditingScene(null)
    setEditedScript("")
    setUploadedImage(null)
    setUploadedImageUrl(null)
  }, [])

  const starterPrompts = [
    t(
      "做一个 30 秒品牌介绍视频，风格要专业、简洁、有产品质感。",
      "Create a 30-second brand intro video with a professional, clean, premium product look.",
    ),
    t(
      "围绕新品功能演示生成短视频脚本，突出 3 个核心卖点和结尾 CTA。",
      "Generate a short script for new feature demo, highlighting 3 key selling points and a closing CTA.",
    ),
    t(
      "做一个适合社媒投放的竖版广告视频，目标是提高点击和试用转化。",
      "Create a vertical ad video for social campaigns aimed at higher clicks and trial conversions.",
    ),
  ]

  const handleDownloadVideo = useCallback((videoUrl: string, runId?: string) => {
    const link = document.createElement("a")
    link.href = videoUrl
    link.download = `video_${runId || "final"}.mp4`
    link.click()
  }, [])

  const handleShareVideo = useCallback((videoUrl: string) => {
    navigator.clipboard.writeText(videoUrl)
    addMessage("system", t("视频链接已复制到剪贴板", "Video link copied to clipboard."))
  }, [addMessage, t])

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* 对话区域 */}
      <div 
        ref={scrollAreaRef}
        className="flex-1 px-3 py-3 overflow-y-auto lg:px-4 lg:py-4"
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
        <div className="mx-auto max-w-5xl space-y-0">
          {messages.map((message) => (
            <div
              key={message.id}
              className="flex flex-col gap-2"
            >
              <WorkspaceMessageFrame
                role={message.role}
                label={message.role === "assistant" ? "AI" : message.role === "system" ? t("系统", "System") : t("你", "You")}
                icon={message.role === "assistant" ? <Send className="h-3.5 w-3.5 text-primary" /> : undefined}
                bodyClassName="space-y-4"
              >
                {message.finalVideo && message.finalVideo.video_url ? (
                  <WorkspaceResultCard
                    tone="success"
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    title={t("最终视频合成完成", "Final video ready")}
                    badge={<Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">{t("完成", "Done")}</Badge>}
                    description={message.content || finalVideoMessage}
                    actions={
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleDownloadVideo(message.finalVideo?.video_url || "", message.finalVideo?.run_id)}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {t("下载视频", "Download video")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleShareVideo(message.finalVideo?.video_url || "")}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {t("分享链接", "Share link")}
                        </Button>
                      </>
                    }
                  >
                    <div className="aspect-video overflow-hidden rounded-[20px] bg-black">
                      <video
                        src={message.finalVideo.video_url}
                        controls
                        className="h-full w-full object-contain"
                        preload="metadata"
                        playsInline
                      >
                        {t("您的浏览器不支持视频播放。", "Your browser does not support video playback.")}
                      </video>
                    </div>
                  </WorkspaceResultCard>
                ) : message.content ? (
                  <p
                    className={cn(
                      "text-sm whitespace-pre-wrap",
                      message.role === "user" ? "text-primary-foreground" : "text-foreground"
                    )}
                  >
                    {message.content}
                  </p>
                ) : null}

                {message.agentOutputs && message.agentOutputs.length > 0 && (
                  <WorkspaceSectionCard title={t("智能体执行过程", "Agent execution trace")}>
                    <div className="max-h-[300px] space-y-2 overflow-y-auto">
                      {message.agentOutputs.map((output, idx) => (
                        <div key={idx} className="space-y-1 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {output.agent}
                            </Badge>
                            <span className="text-muted-foreground">{output.type}</span>
                            {output.progress ? (
                              <span className="text-muted-foreground">
                                ({output.progress.current}/{output.progress.total})
                              </span>
                            ) : null}
                          </div>
                          <div className="ml-2 text-foreground">{output.delta}</div>
                          {output.progress ? (
                            <div className="mt-1 h-1.5 w-full rounded-full bg-background">
                              <div
                                className="h-1.5 rounded-full bg-primary transition-all"
                                style={{ width: `${(output.progress.current / output.progress.total) * 100}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </WorkspaceSectionCard>
                )}

                    {/* 视频片段展示 */}
                {message.videoClips && message.videoClips.clips && message.videoClips.clips.length > 0 && (
                      <WorkspaceSectionCard title={t("生成的视频片段", "Generated video clips")}>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {message.videoClips.clips.map((clip) => (
                            <Card key={clip.task_idx} className="overflow-hidden rounded-[22px] border-2 border-border shadow-none">
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
                                      <p className="text-sm font-semibold">{t("生成失败", "Generation failed")}</p>
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
                                  <Badge variant="outline">{t("场景", "Scene")} {clip.task_idx}</Badge>
                                  <Badge variant={clip.status === "succeeded" ? "default" : clip.status === "failed" ? "destructive" : "secondary"}>
                                    {clip.status === "succeeded" ? t("已完成", "Done") : clip.status === "failed" ? t("失败", "Failed") : t("处理中", "Processing")}
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
                                                <head><title>${isZh ? `场景 ${clip.task_idx} 视频` : `Scene ${clip.task_idx} video`}</title></head>
                                                <body style="margin:0;padding:20px;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;">
                                                  <video src="${clip.video_url}" controls autoplay style="max-width:100%;max-height:100vh;"></video>
                                                </body>
                                              </html>
                                            `)
                                          }
                                        }}
                                      >
                                        <Send className="w-4 h-4 mr-1" />
                                        {t("播放", "Play")}
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
                                              addMessage(
                                                "system",
                                                t(`正在重新生成场景 ${clip.task_idx} 的视频片段...`, `Regenerating clip for scene ${clip.task_idx}...`),
                                              )
                                            }
                                          } catch (error) {
                                            console.error("Clip regeneration failed:", error)
                                            addMessage("assistant", t("重新生成失败，请重试。", "Regeneration failed. Please try again."))
                                          } finally {
                                            setLoading(false)
                                          }
                                        }}
                                        disabled={loading}
                                      >
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        {t("重新生成", "Regenerate")}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        {message.videoClips.requiresConfirmation && (
                          <WorkspaceActionRow className="mt-4 border-0 pt-0">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={async () => {
                                // 确认所有视频片段，继续拼接
                                setLoading(true)
                                try {
                                  const runId = conversationState.runId
                                  if (!runId) {
                                    addMessage("system", t("错误：缺少 run_id", "Error: missing run_id"))
                                    return
                                  }
                                  
                                  addMessage("system", t("已确认所有视频片段，开始拼接最终视频...", "All clips confirmed. Starting final stitching..."))
                                  
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
                                      finalVideoMessage,
                                      undefined, // options
                                      undefined, // storyboard
                                      undefined, // videoClips
                                      { // finalVideo
                                        video_url: data.final_url,
                                        run_id: runId
                                      }
                                    )
                                  } else {
                                    console.error("[Video Clips Confirm] Error:", data.error || "Unknown error")
                                    addMessage(
                                      "system",
                                      t(`拼接失败：${data.error || "未知错误"}`, `Stitching failed: ${data.error || "Unknown error"}`),
                                    )
                                  }
                                } catch (error) {
                                  console.error("Stitching failed:", error)
                                  addMessage(
                                    "system",
                                    t(
                                      `拼接失败：${error instanceof Error ? error.message : "未知错误"}`,
                                      `Stitching failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                                    ),
                                  )
                                } finally {
                                  setLoading(false)
                                }
                              }}
                              disabled={loading}
                            >
                              {t("接受并继续拼接", "Accept and continue stitching")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                addMessage("system", t("已标记需要修改，请选择要重新生成的片段", "Marked for revision. Choose clips to regenerate."))
                              }}
                              disabled={loading}
                            >
                              {t("需要修改", "Needs changes")}
                            </Button>
                          </WorkspaceActionRow>
                        )}
                      </WorkspaceSectionCard>
                )}

                    {/* 故事板展示 */}
                {message.storyboard && message.storyboard.scenes && message.storyboard.scenes.length > 0 && (
                      <WorkspaceSectionCard title={t("故事板", "Storyboard")}>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {message.storyboard.scenes.map((scene) => (
                            <Card key={scene.scene_idx} className="relative overflow-hidden rounded-[22px] border-2 border-border shadow-none group">
                              <div className="aspect-video bg-muted relative">
                                {scene.image_url ? (
                                  <img
                                    src={scene.image_url}
                                    alt={isZh ? `场景 ${scene.scene_idx}` : `Scene ${scene.scene_idx}`}
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
                                    {t("重新生成", "Regenerate")}
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
                                    {t("上传图片", "Upload image")}
                                  </Button>
                                </div>
                              </div>
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline">{t("场景", "Scene")} {scene.scene_idx}</Badge>
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
                          <WorkspaceActionRow className="mt-4 border-0 pt-0">
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
                                    addMessage("system", t("已确认故事板，后台继续生成视频...", "Storyboard confirmed. Continuing generation..."))
                                    const rid = runId
                                    if (rid) startCrewStatusPolling(rid)
                                    setLoading(false)
                                  }
                                } catch (error) {
                                  console.error("Storyboard confirmation failed:", error)
                                  setLoading(false)
                                }
                              }}
                              disabled={loading}
                            >
                              {t("接受并继续", "Accept and continue")}
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
                                      feedback: t("用户要求重新生成", "User requested regeneration"),
                                    }),
                                  })
                                  
                                  if (res.ok) {
                                    addMessage("system", t("已标记为拒绝，正在重新生成故事板...", "Marked as rejected. Regenerating storyboard..."))
                                    setLoading(false)
                                  }
                                } catch (error) {
                                  console.error("Storyboard rejection failed:", error)
                                  setLoading(false)
                                }
                              }}
                              disabled={loading}
                            >
                              {t("重新生成", "Regenerate")}
                            </Button>
                          </WorkspaceActionRow>
                        )}
                      </WorkspaceSectionCard>
                )}
              </WorkspaceMessageFrame>

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
                      className="text-xs"
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              )}

              {message.questionType === "product_image" && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground">{t("您可以上传图片文件或粘贴图片URL", "You can upload an image file or paste an image URL.")}</div>
                  <div className="flex items-center gap-2">
                    <Input ref={productFileInputRef} id={`product-image-${message.id}`} type="file" accept="image/*" onChange={handleProductImageSelect} className="hidden" />
                    <Button variant="outline" type="button" onClick={() => productFileInputRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-2" /> {t("选择文件", "Choose file")}
                    </Button>
                    <Button onClick={() => submitProductImage(message.id)} disabled={productUploading || !productImageFile}>
                      {productUploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("上传中...", "Uploading...")}</>) : t("上传并回答", "Upload and answer")}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="https://..." value={productImageUrl} onChange={(e) => setProductImageUrl(e.target.value)} />
                    <Button variant="outline" onClick={() => submitProductImageUrl(message.id)} disabled={!productImageUrl.trim()}>
                      {t("使用URL回答", "Answer with URL")}
                    </Button>
                  </div>
                </div>
              )}

              <span className="text-xs text-muted-foreground">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}

          {loading && (
            <WorkspaceMessageFrame role="assistant" label="AI" icon={<Send className="h-3.5 w-3.5 text-primary" />}>
              <WorkspaceLoadingMessage
                label={
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    {t("正在思考...", "Thinking...")}
                  </span>
                }
              />
            </WorkspaceMessageFrame>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="border-t-2 border-border bg-muted/20 px-3 py-3 lg:px-4 lg:py-4">
        <div className="max-w-5xl mx-auto">
          <WorkspaceComposerPanel
            className="border-2 border-border bg-card p-2.5"
            toolbar={
              <WorkspacePromptChips
                prompts={starterPrompts}
                onSelect={(prompt) => setInput(prompt)}
              />
            }
            bodyClassName="px-0"
            footer={
              <>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  {t(
                    "支持继续回答问题、补充镜头要求或直接调整脚本方向。Enter 发送，Shift + Enter 换行。",
                    "Continue the conversation, add shot requirements, or adjust script direction. Enter to send, Shift+Enter for newline.",
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px]">
                    {conversationStatusLabel[conversationState.status]}
                  </Badge>
                  <Button
                    onClick={handleSend}
                    disabled={loading || !input.trim() || conversationState.status === "generating" || conversationState.status === "completed"}
                    size="sm"
                    className="h-9 rounded-full px-4 text-[11px]"
                  >
                    <Send className="mr-1.5 h-4 w-4" />
                    {t("发送", "Send")}
                  </Button>
                </div>
              </>
            }
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={t("输入您的回答或选择上面的选项...", "Enter your answer or choose an option above...")}
              className="min-h-[72px] resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
              disabled={loading || conversationState.status === "generating" || conversationState.status === "completed"}
            />
          </WorkspaceComposerPanel>
          {conversationState.status === "completed" && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>{t("视频生成完成，您可以在生成历史中查看", "Video generation completed. You can review it in history.")}</span>
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
                <SheetTitle>{t("编辑场景", "Edit scene")} {editingScene.scene.scene_idx}</SheetTitle>
                <SheetDescription>
                  {t('修改场景脚本或上传新图片。修改后点击"确认"保存更改。', 'Edit scene script or upload a new image. Click "Confirm" to save.')}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* 场景预览图片 */}
                <div className="space-y-2">
                  <Label>{t("场景预览", "Scene preview")}</Label>
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
                    {uploadedImageUrl ? (
                      <img
                        src={uploadedImageUrl}
                        alt={isZh ? `场景 ${editingScene.scene.scene_idx}` : `Scene ${editingScene.scene.scene_idx}`}
                        className="w-full h-full object-cover"
                      />
                    ) : editingScene.scene.image_url ? (
                      <img
                        src={editingScene.scene.image_url}
                        alt={isZh ? `场景 ${editingScene.scene.scene_idx}` : `Scene ${editingScene.scene.scene_idx}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <span>{t("暂无图片", "No image yet")}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 场景脚本编辑 */}
                <div className="space-y-2">
                  <Label>{t("场景脚本", "Scene script")}</Label>
                  <Textarea
                    value={editedScript}
                    onChange={(e) => setEditedScript(e.target.value)}
                    placeholder={t("输入场景描述，多个镜头用分号（；）分隔", "Enter scene description. Separate shots with semicolons (;).")}
                    className="min-h-[120px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("提示：每个镜头描述用分号（；）分隔", "Tip: separate each shot description with semicolons (;).")}
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
                          {t("重新生成中...", "Regenerating...")}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          {t("AI 重新生成", "AI regenerate")}
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
                          {t("上传图片", "Upload image")}
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
                    <span className="text-muted-foreground">{t("场景时长", "Scene duration")}</span>
                    <span className="font-medium">
                      {editingScene.scene.begin_s}s - {editingScene.scene.end_s}s
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("镜头数量", "Shot count")}</span>
                    <span className="font-medium">
                      {editingScene.scene.clips?.length || 0} {t("个", "")}
                    </span>
                  </div>
                </div>
              </div>

              <SheetFooter className="mt-6">
                <Button variant="outline" onClick={handleCancelEdit}>
                  {t("取消", "Cancel")}
                </Button>
                <Button onClick={handleSaveScene} disabled={!editedScript.trim()}>
                  {t("确认", "Confirm")}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
