"use client"

import React, { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  Send,
  Plus,
  AtSign,
  Sparkles,
  User,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Database,
  Globe,
  Upload,
  FileText,
  Check,
} from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  knowledgeSource?: "industry_kb" | "personal_kb"
}

interface KnowledgeSource {
  id: string
  name: string
  type: "industry_kb" | "personal_kb"
  icon: React.ReactNode
}

const knowledgeSources: KnowledgeSource[] = [
  {
    id: "industry_kb",
    name: "行业知识库",
    type: "industry_kb",
    icon: <Globe className="w-4 h-4" />,
  },
  {
    id: "personal_kb",
    name: "个人知识库",
    type: "personal_kb",
    icon: <Database className="w-4 h-4" />,
  },
]

const mockMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "您好，我是您的 AI 营销助手。我可以帮您生成营销文案、社媒内容和创意素材。您可以使用 @行业知识库 或 @个人知识库 指定参考来源。\n\n请告诉我，您现在需要什么样的营销内容？",
    timestamp: "刚刚",
  },
]

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(mockMessages)
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const position = e.target.selectionStart || 0

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
      if (inputRef.current) {
        const newPosition = beforeCursor.length + source.name.length + 2
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newPosition, newPosition)
      }
    }, 0)
  }

  const handleSend = async () => {
    if (!input.trim()) return

    let detectedSource: "industry_kb" | "personal_kb" | undefined
    if (input.includes("@行业知识库")) {
      detectedSource = "industry_kb"
    } else if (input.includes("@个人知识库")) {
      detectedSource = "personal_kb"
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: "刚刚",
      knowledgeSource: detectedSource,
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
          knowledgeSource: detectedSource,
          conversationId: "default",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get AI response")
      }

      const data = await response.json()

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.content || "抱歉，我暂时无法生成回复，请稍后再试。",
        timestamp: "刚刚",
        knowledgeSource: detectedSource,
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error("Chat error:", error)

      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "抱歉，服务暂时不可用。请检查网络连接或稍后再试。",
        timestamp: "刚刚",
        knowledgeSource: detectedSource,
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

      inputElement.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        const uploadMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content: `正在上传文件：${file.name}`,
          timestamp: "刚刚",
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

          if (!urlResponse.ok) throw new Error("Failed to get upload URL")

          const { uploadUrl, fileId } = await urlResponse.json()

          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          })

          if (!uploadResponse.ok) throw new Error("Failed to upload file")

          await fetch("/api/files/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId }),
          })

          const successMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `文件“${file.name}”上传成功，正在处理中。处理完成后会自动加入您的个人知识库。`,
            timestamp: "刚刚",
          }
          setMessages((prev) => [...prev, successMessage])
        } catch (error) {
          console.error("File upload error:", error)
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `文件上传失败：${error instanceof Error ? error.message : "未知错误"}`,
            timestamp: "刚刚",
          }
          setMessages((prev) => [...prev, errorMessage])
        }
      }

      inputElement.click()
    } catch (error) {
      console.error("File upload initialization error:", error)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showKnowledgeMenu) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6 p-4 pb-6">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <div className="w-full h-full bg-primary rounded-full flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary-foreground" />
                  </div>
                </Avatar>
              )}

              <div className="max-w-[80%] space-y-2">
                {message.knowledgeSource && (
                  <div className="flex justify-end">
                    <Badge variant="secondary" className="text-xs">
                      {message.knowledgeSource === "industry_kb" ? (
                        <>
                          <Globe className="w-3 h-3 mr-1" />
                          行业知识库
                        </>
                      ) : (
                        <>
                          <Database className="w-3 h-3 mr-1" />
                          个人知识库
                        </>
                      )}
                    </Badge>
                  </div>
                )}

                <Card className={`${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <p className="text-sm whitespace-pre-wrap font-manrope leading-relaxed">{message.content}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs opacity-70 font-manrope">{message.timestamp}</span>
                        {message.role === "assistant" && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <ThumbsUp className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <ThumbsDown className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {message.role === "user" && (
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback className="bg-muted">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4 justify-start">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <div className="w-full h-full bg-primary rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground animate-pulse" />
                </div>
              </Avatar>
              <Card className="bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground font-manrope">AI 正在思考...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="flex-shrink-0 border-t border-border bg-card/50 backdrop-blur-sm p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-3">
            <Popover open={showKnowledgeMenu} onOpenChange={setShowKnowledgeMenu}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-shrink-0 bg-transparent">
                  <AtSign className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="start">
                <Command>
                  <CommandInput placeholder="选择知识库..." />
                  <CommandList>
                    <CommandEmpty>未找到知识库</CommandEmpty>
                    <CommandGroup>
                      {knowledgeSources.map((source) => (
                        <CommandItem
                          key={source.id}
                          onSelect={() => handleKnowledgeSourceSelect(source)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            {source.icon}
                            <span className="font-manrope">{source.name}</span>
                          </div>
                          {selectedKnowledgeSource?.id === source.id && <Check className="w-4 h-4 ml-auto" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Popover open={showFileUpload} onOpenChange={setShowFileUpload}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-shrink-0 bg-transparent">
                  <Plus className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="start">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm font-sans">上传文件</h4>
                  <div className="space-y-2">
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleFileUpload}>
                      <FileText className="w-4 h-4 mr-2" />
                      <span className="font-manrope">上传文档（PDF、DOCX、TXT）</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleFileUpload}>
                      <Upload className="w-4 h-4 mr-2" />
                      <span className="font-manrope">从设备选择文件</span>
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="请输入你的营销需求..."
                className="pr-12 font-manrope"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="sm"
                className="absolute right-1 top-1 h-8 w-8 p-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground font-manrope">使用 @ 选择知识库，使用 + 上传文件</p>
            {selectedKnowledgeSource && (
              <Badge variant="outline" className="text-xs">
                已选择: {selectedKnowledgeSource.name}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
