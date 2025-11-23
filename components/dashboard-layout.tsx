"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sparkles, Plus, MessageSquare, Database, Settings, LogOut, Menu, X, FileText, Video } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider" // Fixed import path

interface DashboardLayoutProps {
  children: React.ReactNode
}

// Mock conversation history data
const conversations = [
  { id: "1", title: "Viber文案 - 春季上新", timestamp: "2小时前" },
  { id: "2", title: "小红书种草 - 母亲节", timestamp: "1天前" },
  { id: "3", title: "电商产品描述优化", timestamp: "2天前" },
  { id: "4", title: "B2B营销邮件模板", timestamp: "3天前" },
  { id: "5", title: "社交媒体内容策略", timestamp: "1周前" },
]

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, isDemoMode } = useAuth() // Added demo mode detection and user info display

  return (
    <div className="h-screen bg-background flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`
        fixed lg:static inset-y-0 left-0 z-50 w-80 bg-sidebar border-r border-sidebar-border
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-sidebar-primary-foreground" />
                </div>
                <h1 className="text-lg font-bold text-sidebar-foreground font-sans">AI Marketing</h1>
              </div>
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* New Conversation Button */}
            <Button className="w-full mt-4 font-manrope" size="sm" asChild>
              <Link href="/dashboard">
                <Plus className="w-4 h-4 mr-2" />
                新建对话
              </Link>
            </Button>
          </div>

          {/* Conversation History */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-4 flex-shrink-0">
              <h3 className="text-sm font-medium text-sidebar-foreground mb-3 font-sans">最近对话</h3>
            </div>
            <div className="flex-1 min-h-0 px-2">
              <ScrollArea className="h-full">
                <div className="space-y-1 pb-4">
                  {conversations.map((conversation) => (
                    <Link key={conversation.id} href="/dashboard">
                      <button className="w-full text-left p-3 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors group">
                        <div className="flex items-start gap-3">
                          <MessageSquare className="w-4 h-4 mt-0.5 text-sidebar-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate font-manrope">{conversation.title}</p>
                            <p className="text-xs text-muted-foreground font-manrope">{conversation.timestamp}</p>
                          </div>
                        </div>
                      </button>
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Bottom Navigation */}
          <div className="p-4 border-t border-sidebar-border space-y-2">
            <Link href="/dashboard/templates">
              <Button variant="ghost" className="w-full justify-start font-manrope" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                内容模板
              </Button>
            </Link>
            <Link href="/dashboard/generate">
              <Button variant="ghost" className="w-full justify-start font-manrope" size="sm">
                <Sparkles className="w-4 h-4 mr-2" />
                内容生成
              </Button>
            </Link>
            <Link href="/dashboard/video">
              <Button variant="ghost" className="w-full justify-start font-manrope" size="sm">
                <Video className="w-4 h-4 mr-2" />
                视频生成
              </Button>
            </Link>
            <Link href="/dashboard/knowledge-base">
              <Button variant="ghost" className="w-full justify-start font-manrope" size="sm">
                <Database className="w-4 h-4 mr-2" />
                知识库管理
              </Button>
            </Link>
            <Link href="/dashboard/settings">
              <Button variant="ghost" className="w-full justify-start font-manrope" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                用户设置
              </Button>
            </Link>

            <Separator className="my-2" />

            {/* User Info */}
            <div className="flex items-center gap-3 p-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                  {isDemoMode ? "体验" : "营销"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate font-manrope">
                  {isDemoMode ? "体验用户" : user?.name || "营销专家"}
                </p>
                <p className="text-xs text-muted-foreground truncate font-manrope">
                  {isDemoMode ? "demo@example.com" : user?.email || "expert@example.com"}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden border-b border-border bg-card/50 backdrop-blur-sm p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-bold text-foreground font-sans">AI Marketing</h1>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  )
}
