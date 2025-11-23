"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Video,
  ImageIcon,
  Wand2,
  Users,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  MessageSquare,
  Settings,
} from "lucide-react"

type EventItem = {
  thread_id: string
  run_id: string
  agent?: string
  type: string
  delta?: string | null
  payload?: any
  progress?: { current: number; total: number }
  ts?: number
}

type AgentStatus = {
  agent: string
  status: "idle" | "thinking" | "working" | "completed" | "error"
  message?: string
  timestamp?: number
}

interface VideoGeneratorProps {
  initialPrompt?: string
}

export function VideoGenerator({ initialPrompt = "" }: VideoGeneratorProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [imageUrl, setImageUrl] = useState("")
  const [runId, setRunId] = useState<string | undefined>(undefined)
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"generate" | "workflow" | "history">("generate")
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([])
  const [canInteract, setCanInteract] = useState(false)
  const [interactionPrompt, setInteractionPrompt] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const apiUrl = "/api/crewai"

  // 智能体列表
  const agents = useMemo(() => [
    { name: "创意策划", icon: "💡", color: "bg-blue-100 text-blue-700" },
    { name: "导演", icon: "🎬", color: "bg-purple-100 text-purple-700" },
    { name: "审核", icon: "✅", color: "bg-green-100 text-green-700" },
    { name: "视觉设计", icon: "🎨", color: "bg-pink-100 text-pink-700" },
    { name: "制片", icon: "📹", color: "bg-orange-100 text-orange-700" },
    { name: "剪辑", icon: "✂️", color: "bg-indigo-100 text-indigo-700" },
  ], [])

  // 从事件中提取智能体状态
  useEffect(() => {
    const statusMap = new Map<string, AgentStatus>()
    
    events.forEach((e) => {
      const agentName = e.agent || "System"
      if (!statusMap.has(agentName)) {
        statusMap.set(agentName, {
          agent: agentName,
          status: "idle",
        })
      }
      
      const status = statusMap.get(agentName)!
      
      if (e.type === "thought" || e.type === "agent_start") {
        status.status = "thinking"
        status.message = e.delta || undefined
        status.timestamp = e.ts
      } else if (e.type === "partial" || e.type === "tool_result") {
        status.status = "working"
        status.message = e.delta || undefined
        status.timestamp = e.ts
      } else if (e.type === "run_finished" || e.type === "agent_end") {
        status.status = "completed"
        status.message = e.delta || "完成"
        status.timestamp = e.ts
      } else if (e.type === "error") {
        status.status = "error"
        status.message = e.delta || "错误"
        status.timestamp = e.ts
      }
    })

    setAgentStatuses(Array.from(statusMap.values()))
    
    // 检查是否可以交互（当有智能体在思考或工作时）
    const hasActiveAgent = Array.from(statusMap.values()).some(
      s => s.status === "thinking" || s.status === "working"
    )
    setCanInteract(hasActiveAgent)
  }, [events])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events])

  const handleStart = useCallback(async () => {
    if (!prompt.trim() || !apiUrl) return

    const thread_id = `t_${Date.now()}`
    const newRunId = runId || `r_${Date.now()}`
    setRunId(newRunId)
    setEvents([])
    setLoading(true)
    setCanInteract(false)

    try {
      const res = await fetch(`${apiUrl}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          goal: prompt.trim(), // 使用 goal 参数触发 CrewAI 工作流
          img: imageUrl || null,
          thread_id,
          run_id: newRunId,
          use_crewai: true, // 明确使用 CrewAI 工作流
          total_duration: 10.0, // 默认 10 秒
          styles: [], // 风格标签
          image_control: false, // 是否启用图控
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
            const evt = JSON.parse(line) as EventItem
            setEvents((prev) => [...prev, evt])

            if (evt.type === "run_finished") {
              setLoading(false)
              setCanInteract(false)
            }
          } catch (e) {
            console.error("解析事件失败:", e)
          }
        }
      }
    } catch (error) {
      console.error("生成失败:", error)
      setLoading(false)
      setCanInteract(false)
    }
  }, [apiUrl, imageUrl, prompt, runId])

  const handleInteract = useCallback(async () => {
    if (!interactionPrompt.trim() || !runId) return

    // 发送交互消息到后端
    try {
      await fetch(`${apiUrl}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "interact",
          run_id: runId,
          message: interactionPrompt.trim(),
        }),
      })

      setInteractionPrompt("")
    } catch (error) {
      console.error("交互失败:", error)
    }
  }, [apiUrl, interactionPrompt, runId])

  const progress = useMemo(() => {
    const last = [...events].reverse().find((e) => e.progress)
    return last?.progress || { current: 0, total: 0 }
  }, [events])

  // 按智能体分组消息
  const groupedMessages = useMemo(() => {
    const groups: { agent: string; messages: EventItem[] }[] = []
    let currentGroup: { agent: string; messages: EventItem[] } | null = null

    events.forEach((e) => {
      const agent = e.agent || "System"
      if (!currentGroup || currentGroup.agent !== agent) {
        currentGroup = { agent, messages: [] }
        groups.push(currentGroup)
      }
      currentGroup.messages.push(e)
    })

    return groups
  }, [events])

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <div className="border-b border-border px-6 py-4">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="generate" className="font-manrope">
              <Wand2 className="w-4 h-4 mr-2" />
              视频生成
            </TabsTrigger>
            <TabsTrigger value="workflow" className="font-manrope">
              <Users className="w-4 h-4 mr-2" />
              智能体协作
            </TabsTrigger>
            <TabsTrigger value="history" className="font-manrope">
              <Video className="w-4 h-4 mr-2" />
              生成历史
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="generate" className="h-full p-6 m-0">
            <div className="max-w-6xl mx-auto h-full flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2 font-sans">
                  多智能体视频生成
                </h2>
                <p className="text-muted-foreground font-manrope">
                  描述您的营销需求，多个 AI 智能体将协作生成专业的营销视频
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                {/* 左侧：输入区域 */}
                <div className="lg:col-span-2 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 font-sans">
                        <MessageSquare className="w-5 h-5" />
                        需求描述
                      </CardTitle>
                      <CardDescription className="font-manrope">
                        详细描述您要生成的营销视频内容
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="例如：为我们的新产品制作一个30秒的营销视频，突出产品的核心功能和优势，风格要现代、专业..."
                        className="min-h-[200px] font-manrope resize-none"
                        disabled={loading}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            <Sparkles className="w-3 h-3 mr-1" />
                            <span className="font-manrope">多智能体协作</span>
                          </Badge>
                        </div>
                        <Button
                          onClick={handleStart}
                          disabled={loading || !prompt.trim()}
                          className="font-manrope"
                        >
                          {loading ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4 mr-2" />
                              开始生成
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 进度显示 */}
                  {progress.total > 0 && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">生成进度</span>
                            <span className="text-muted-foreground">
                              {progress.current}/{progress.total}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 消息流 */}
                  {events.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-sans">智能体对话</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-4">
                            {groupedMessages.map((group, groupIdx) => (
                              <div key={groupIdx} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold">
                                    {group.agent.charAt(0)}
                                  </div>
                                  <span className="text-sm font-medium">{group.agent}</span>
                                </div>
                                <div className="ml-10 space-y-1">
                                  {group.messages.map((e, idx) => (
                                    <div
                                      key={idx}
                                      className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3"
                                    >
                                      {e.delta}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            <div ref={messagesEndRef} />
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* 右侧：智能体状态 */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-sans">智能体状态</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {agents.map((agent, idx) => {
                          const status = agentStatuses.find((s) => s.agent.includes(agent.name)) || {
                            agent: agent.name,
                            status: "idle" as const,
                          }

                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                            >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${agent.color}`}>
                                <span className="text-lg">{agent.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{agent.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {status.message || "等待中..."}
                                </div>
                              </div>
                              <div>
                                {status.status === "completed" && (
                                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                                )}
                                {status.status === "thinking" && (
                                  <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
                                )}
                                {status.status === "working" && (
                                  <RefreshCw className="w-5 h-5 text-orange-600 animate-spin" />
                                )}
                                {status.status === "error" && (
                                  <AlertCircle className="w-5 h-5 text-red-600" />
                                )}
                                {status.status === "idle" && (
                                  <div className="w-5 h-5 rounded-full bg-muted" />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 人机协同交互 */}
                  {canInteract && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader>
                        <CardTitle className="text-sm font-sans flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          人机协同
                        </CardTitle>
                        <CardDescription className="text-xs">
                          智能体正在工作，您可以提供反馈或调整
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Textarea
                          value={interactionPrompt}
                          onChange={(e) => setInteractionPrompt(e.target.value)}
                          placeholder="输入您的反馈或调整建议..."
                          className="min-h-[80px] text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={handleInteract}
                          disabled={!interactionPrompt.trim()}
                          className="w-full"
                        >
                          发送反馈
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workflow" className="h-full p-6 m-0">
            <div className="max-w-6xl mx-auto h-full">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2 font-sans">
                  智能体工作流
                </h2>
                <p className="text-muted-foreground font-manrope">
                  查看多智能体协作的详细过程
                </p>
              </div>

              <div className="space-y-4">
                {agentStatuses.length > 0 ? (
                  agentStatuses.map((status, idx) => (
                    <Card key={idx}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              status.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : status.status === "working" || status.status === "thinking"
                                ? "bg-blue-100 text-blue-700"
                                : status.status === "error"
                                ? "bg-red-100 text-red-700"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status.status === "completed" ? (
                              <CheckCircle2 className="w-6 h-6" />
                            ) : status.status === "working" || status.status === "thinking" ? (
                              <RefreshCw className="w-6 h-6 animate-spin" />
                            ) : status.status === "error" ? (
                              <AlertCircle className="w-6 h-6" />
                            ) : (
                              <Clock className="w-6 h-6" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold">{status.agent}</div>
                            <div className="text-sm text-muted-foreground">
                              {status.message || "等待中..."}
                            </div>
                          </div>
                          <Badge
                            variant={
                              status.status === "completed"
                                ? "default"
                                : status.status === "error"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {status.status === "completed"
                              ? "已完成"
                              : status.status === "working"
                              ? "工作中"
                              : status.status === "thinking"
                              ? "思考中"
                              : status.status === "error"
                              ? "错误"
                              : "等待中"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>等待任务开始...</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="h-full p-6 m-0">
            <div className="max-w-6xl mx-auto h-full">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2 font-sans">生成历史</h2>
                <p className="text-muted-foreground font-manrope">查看之前生成的视频</p>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <Video className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>暂无生成历史</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

