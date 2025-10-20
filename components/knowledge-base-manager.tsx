"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Upload, FileText, Globe, Trash2, CheckCircle, Clock, AlertCircle } from "lucide-react"

// Mock data
const industryKnowledge = [
  {
    id: "1",
    url: "https://example.com/marketing-trends",
    title: "2024营销趋势报告",
    status: "ready",
    date: "2024-01-15",
  },
  {
    id: "2",
    url: "https://example.com/social-media-guide",
    title: "社交媒体营销指南",
    status: "indexing",
    date: "2024-01-14",
  },
  { id: "3", url: "https://example.com/content-strategy", title: "内容营销策略", status: "ready", date: "2024-01-13" },
]

const personalFiles = [
  { id: "1", name: "品牌指南.pdf", type: "PDF", size: "2.3 MB", status: "ready", date: "2024-01-15" },
  { id: "2", name: "产品介绍.docx", type: "DOCX", size: "1.8 MB", status: "indexing", date: "2024-01-14" },
  { id: "3", name: "客户案例.txt", type: "TXT", size: "0.5 MB", status: "failed", date: "2024-01-13" },
]

const getStatusIcon = (status: string) => {
  switch (status) {
    case "ready":
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case "indexing":
      return <Clock className="w-4 h-4 text-yellow-500" />
    case "failed":
      return <AlertCircle className="w-4 h-4 text-red-500" />
    default:
      return <Clock className="w-4 h-4 text-gray-500" />
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case "ready":
      return "已就绪"
    case "indexing":
      return "处理中"
    case "failed":
      return "失败"
    default:
      return "等待中"
  }
}

export function KnowledgeBaseManager() {
  const [newUrl, setNewUrl] = useState("")

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle URL submission
    console.log("Submitting URL:", newUrl)
    setNewUrl("")
  }

  return (
    <div className="h-full p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 font-sans">知识库管理</h1>
          <p className="text-muted-foreground font-manrope">
            管理您的行业知识库和个人文件，为 AI 内容生成提供精准的参考资料
          </p>
        </div>

        <Tabs defaultValue="industry" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="industry" className="font-manrope">
              行业知识库
            </TabsTrigger>
            <TabsTrigger value="personal" className="font-manrope">
              个人知识库
            </TabsTrigger>
          </TabsList>

          <TabsContent value="industry" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-sans">
                  <Globe className="w-5 h-5" />
                  添加行业资源
                </CardTitle>
                <CardDescription className="font-manrope">提交相关的网页链接，系统将自动爬取和分析内容</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUrlSubmit} className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="url" className="sr-only">
                      网页链接
                    </Label>
                    <Input
                      id="url"
                      type="url"
                      placeholder="输入网页链接 (https://...)"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="font-manrope"
                    />
                  </div>
                  <Button type="submit" disabled={!newUrl.trim()} className="font-manrope">
                    添加链接
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-sans">行业知识库内容</CardTitle>
                <CardDescription className="font-manrope">已添加的行业相关资源和处理状态</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {industryKnowledge.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-foreground truncate font-manrope">{item.title}</h4>
                          <Badge variant="outline" className="flex items-center gap-1">
                            {getStatusIcon(item.status)}
                            <span className="text-xs font-manrope">{getStatusText(item.status)}</span>
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate font-manrope">{item.url}</p>
                        <p className="text-xs text-muted-foreground font-manrope">添加时间: {item.date}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="personal" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-sans">
                  <Upload className="w-5 h-5" />
                  上传个人文件
                </CardTitle>
                <CardDescription className="font-manrope">
                  上传您的品牌资料、产品信息等个人文件 (支持 PDF, DOCX, TXT)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium text-foreground mb-2 font-manrope">拖拽文件到此处或点击上传</p>
                  <p className="text-sm text-muted-foreground mb-4 font-manrope">支持 PDF, DOCX, TXT 格式，最大 10MB</p>
                  <Button className="font-manrope">选择文件</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-sans">个人文件库</CardTitle>
                <CardDescription className="font-manrope">已上传的个人文件和处理状态</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {personalFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-foreground truncate font-manrope">{file.name}</h4>
                            <Badge variant="outline" className="flex items-center gap-1">
                              {getStatusIcon(file.status)}
                              <span className="text-xs font-manrope">{getStatusText(file.status)}</span>
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="font-manrope">{file.type}</span>
                            <span className="font-manrope">{file.size}</span>
                            <span className="font-manrope">上传时间: {file.date}</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
