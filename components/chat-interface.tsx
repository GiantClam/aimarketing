"use client"

import React, { useCallback, useMemo, useRef, useState } from "react"
import {
  AtSign,
  Check,
  Copy,
  Database,
  FileText,
  Globe,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Upload,
  User,
} from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  knowledgeSource?: "industry_kb" | "personal_kb"
}

interface KnowledgeSource {
  id: "industry_kb" | "personal_kb"
  name: string
  aliases: string[]
  icon: React.ReactNode
}

export function ChatInterface() {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])
  const nowText = t("刚刚", "Just now")

  const knowledgeSources = useMemo<KnowledgeSource[]>(
    () => [
      {
        id: "industry_kb",
        name: t("行业知识库", "Industry KB"),
        aliases: ["@行业知识库", "@industry kb", "@industry_kb"],
        icon: <Globe className="h-4 w-4" />,
      },
      {
        id: "personal_kb",
        name: t("个人知识库", "Personal KB"),
        aliases: ["@个人知识库", "@personal kb", "@personal_kb"],
        icon: <Database className="h-4 w-4" />,
      },
    ],
    [t],
  )

  const initialMessage = useMemo<Message>(
    () => ({
      id: "1",
      role: "assistant",
      content: t(
        "您好，我是您的 AI 营销助手。我可以帮您生成营销文案、社媒内容和创意素材。您可以使用 @行业知识库 或 @个人知识库 指定参考来源。\n\n请告诉我，您现在需要什么样的营销内容？",
        "Hi, I am your AI marketing assistant. I can help generate marketing copy, social posts, and creative assets. Use @Industry KB or @Personal KB to specify references.\n\nWhat kind of marketing content do you need now?",
      ),
      timestamp: nowText,
    }),
    [nowText, t],
  )

  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedKnowledgeSource, setSelectedKnowledgeSource] = useState<KnowledgeSource | null>(null)
  const [showKnowledgeMenu, setShowKnowledgeMenu] = useState(false)
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  React.useEffect(() => {
    scrollToBottom()
  }, [messages])

  const detectKnowledgeSource = (text: string): KnowledgeSource | undefined => {
    const normalized = text.toLowerCase()
    return knowledgeSources.find((source) => source.aliases.some((alias) => normalized.includes(alias.toLowerCase())))
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    const position = event.target.selectionStart || 0

    setInput(value)
    setCursorPosition(position)

    if (value.charAt(position - 1) === "@") {
      setShowKnowledgeMenu(true)
    } else {
      setShowKnowledgeMenu(false)
    }
  }

  const handleKnowledgeSourceSelect = (source: KnowledgeSource) => {
    setSelectedKnowledgeSource(source)
    setShowKnowledgeMenu(false)

    const beforeCursor = input.substring(0, cursorPosition - 1)
    const afterCursor = input.substring(cursorPosition)
    const newInput = `${beforeCursor}@${source.name} ${afterCursor}`
    setInput(newInput)

    setTimeout(() => {
      if (!inputRef.current) return
      const newPosition = beforeCursor.length + source.name.length + 2
      inputRef.current.focus()
      inputRef.current.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const handleSend = async () => {
    if (!input.trim()) return

    const detectedSource = detectKnowledgeSource(input)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: nowText,
      knowledgeSource: detectedSource?.id,
    }

    setMessages((prev) => [...prev, userMessage])
    const currentInput = input
    setInput("")
    setSelectedKnowledgeSource(null)
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: currentInput,
          knowledgeSource: detectedSource?.id,
          conversationId: "default",
        }),
      })

      if (!response.ok) {
        throw new Error(t("获取 AI 回复失败", "Failed to get AI response"))
      }

      const data = await response.json()

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          data.content ||
          t("抱歉，我暂时无法生成回复，请稍后再试。", "Sorry, I could not generate a response right now. Please try again later."),
        timestamp: nowText,
        knowledgeSource: detectedSource?.id,
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error("Chat error:", error)

      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: t(
          "抱歉，服务暂时不可用。请检查网络连接或稍后再试。",
          "Sorry, the service is temporarily unavailable. Please check your network or try again later.",
        ),
        timestamp: nowText,
        knowledgeSource: detectedSource?.id,
      }

      setMessages((prev) => [...prev, fallbackMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async () => {
    setShowFileUpload(false)

    try {
      const inputElement = document.createElement("input")
      inputElement.type = "file"
      inputElement.accept = ".pdf,.docx,.txt,.doc"

      inputElement.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (!file) return

        const uploadMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content: t(`正在上传文件：${file.name}`, `Uploading file: ${file.name}`),
          timestamp: nowText,
        }
        setMessages((prev) => [...prev, uploadMessage])

        try {
          const urlResponse = await fetch("/api/files/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }),
          })

          if (!urlResponse.ok) throw new Error(t("获取上传地址失败", "Failed to get upload URL"))

          const { uploadUrl, fileId } = await urlResponse.json()

          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          })

          if (!uploadResponse.ok) throw new Error(t("上传文件失败", "Failed to upload file"))

          await fetch("/api/files/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId }),
          })

          const successMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: t(
              `文件“${file.name}”上传成功，正在处理中。处理完成后会自动加入您的个人知识库。`,
              `File "${file.name}" uploaded successfully and is being processed. It will be added to your Personal KB automatically.`,
            ),
            timestamp: nowText,
          }
          setMessages((prev) => [...prev, successMessage])
        } catch (error) {
          console.error("File upload error:", error)
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: t(
              `文件上传失败：${error instanceof Error ? error.message : "未知错误"}`,
              `File upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            ),
            timestamp: nowText,
          }
          setMessages((prev) => [...prev, errorMessage])
        }
      }

      inputElement.click()
    } catch (error) {
      console.error("File upload initialization error:", error)
    }
  }

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey && !showKnowledgeMenu) {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-4 pb-6">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <Avatar className="h-8 w-8 shrink-0">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-primary">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                </Avatar>
              )}

              <div className="max-w-[80%] space-y-2">
                {message.knowledgeSource && (
                  <div className="flex justify-end">
                    <Badge variant="secondary" className="text-xs">
                      {message.knowledgeSource === "industry_kb" ? (
                        <>
                          <Globe className="mr-1 h-3 w-3" />
                          {t("行业知识库", "Industry KB")}
                        </>
                      ) : (
                        <>
                          <Database className="mr-1 h-3 w-3" />
                          {t("个人知识库", "Personal KB")}
                        </>
                      )}
                    </Badge>
                  </div>
                )}

                <Card className={`${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed font-manrope">{message.content}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-manrope opacity-70">{message.timestamp}</span>
                        {message.role === "assistant" && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={t("复制", "Copy")}>
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={t("赞同", "Like")}>
                              <ThumbsUp className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={t("不赞同", "Dislike")}>
                              <ThumbsDown className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {message.role === "user" && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-muted">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start gap-4">
              <Avatar className="h-8 w-8 shrink-0">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-primary">
                  <Sparkles className="h-4 w-4 animate-pulse text-primary-foreground" />
                </div>
              </Avatar>
              <Card className="bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0.1s" }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0.2s" }} />
                    </div>
                    <span className="text-sm text-muted-foreground font-manrope">{t("AI 正在思考...", "AI is thinking...")}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border bg-card/50 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-end gap-3">
            <Popover open={showKnowledgeMenu} onOpenChange={setShowKnowledgeMenu}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 bg-transparent" title={t("知识库", "Knowledge")}>
                  <AtSign className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("选择知识库...", "Choose knowledge source...")} />
                  <CommandList>
                    <CommandEmpty>{t("未找到知识库", "No knowledge source found")}</CommandEmpty>
                    <CommandGroup>
                      {knowledgeSources.map((source) => (
                        <CommandItem key={source.id} onSelect={() => handleKnowledgeSourceSelect(source)} className="cursor-pointer">
                          <div className="flex items-center gap-2">
                            {source.icon}
                            <span className="font-manrope">{source.name}</span>
                          </div>
                          {selectedKnowledgeSource?.id === source.id && <Check className="ml-auto h-4 w-4" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Popover open={showFileUpload} onOpenChange={setShowFileUpload}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 bg-transparent" title={t("上传", "Upload")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="start">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium font-sans">{t("上传文件", "Upload files")}</h4>
                  <div className="space-y-2">
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleFileUpload}>
                      <FileText className="mr-2 h-4 w-4" />
                      <span className="font-manrope">{t("上传文档（PDF、DOCX、TXT）", "Upload documents (PDF, DOCX, TXT)")}</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleFileUpload}>
                      <Upload className="mr-2 h-4 w-4" />
                      <span className="font-manrope">{t("从设备选择文件", "Choose file from device")}</span>
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={t("请输入你的营销需求...", "Enter your marketing request...")}
                className="pr-12 font-manrope"
                disabled={isLoading}
              />
              <Button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isLoading}
                size="sm"
                className="absolute right-1 top-1 h-8 w-8 p-0"
                title={t("发送", "Send")}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-manrope">
              {t("使用 @ 选择知识库，使用 + 上传文件", "Use @ to select knowledge source, and + to upload files")}
            </p>
            {selectedKnowledgeSource && (
              <Badge variant="outline" className="text-xs">
                {t("已选择", "Selected")}: {selectedKnowledgeSource.name}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
