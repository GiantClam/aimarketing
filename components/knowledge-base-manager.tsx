"use client"

import type React from "react"
import { useCallback, useMemo, useState } from "react"
import { AlertCircle, CheckCircle, Clock, FileText, Globe, Trash2, Upload } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type ItemStatus = "ready" | "indexing" | "failed"

type IndustryItem = {
  id: string
  url: string
  title: string
  status: ItemStatus
  date: string
}

type PersonalFile = {
  id: string
  name: string
  type: "PDF" | "DOCX" | "TXT"
  size: string
  status: ItemStatus
  date: string
}

const getStatusIcon = (status: ItemStatus) => {
  if (status === "ready") return <CheckCircle className="h-4 w-4 text-green-500" />
  if (status === "indexing") return <Clock className="h-4 w-4 text-yellow-500" />
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-red-500" />
  return <Clock className="h-4 w-4 text-gray-500" />
}

export function KnowledgeBaseManager() {
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const t = useCallback((zh: string, en: string) => (isZh ? zh : en), [isZh])
  const [newUrl, setNewUrl] = useState("")

  const industryKnowledge = useMemo<IndustryItem[]>(
    () => [
      {
        id: "1",
        url: "https://example.com/marketing-trends",
        title: t("2024 营销趋势报告", "2024 Marketing Trends Report"),
        status: "ready",
        date: "2024-01-15",
      },
      {
        id: "2",
        url: "https://example.com/social-media-guide",
        title: t("社交媒体营销指南", "Social Media Marketing Guide"),
        status: "indexing",
        date: "2024-01-14",
      },
      {
        id: "3",
        url: "https://example.com/content-strategy",
        title: t("内容营销策略", "Content Marketing Strategy"),
        status: "ready",
        date: "2024-01-13",
      },
    ],
    [t],
  )

  const personalFiles = useMemo<PersonalFile[]>(
    () => [
      { id: "1", name: t("品牌指南.pdf", "Brand Guide.pdf"), type: "PDF", size: "2.3 MB", status: "ready", date: "2024-01-15" },
      { id: "2", name: t("产品介绍.docx", "Product Intro.docx"), type: "DOCX", size: "1.8 MB", status: "indexing", date: "2024-01-14" },
      { id: "3", name: t("客户案例.txt", "Customer Case.txt"), type: "TXT", size: "0.5 MB", status: "failed", date: "2024-01-13" },
    ],
    [t],
  )

  const getStatusText = (status: ItemStatus) => {
    if (status === "ready") return t("已就绪", "Ready")
    if (status === "indexing") return t("处理中", "Indexing")
    if (status === "failed") return t("失败", "Failed")
    return t("等待中", "Waiting")
  }

  const handleUrlSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    console.log("Submitting URL:", newUrl)
    setNewUrl("")
  }

  return (
    <div className="h-full p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-foreground font-sans">{t("知识库管理", "Knowledge Base Manager")}</h1>
          <p className="text-muted-foreground font-manrope">
            {t(
              "管理你的行业知识与个人文件，为 AI 内容生成提供精准参考。",
              "Manage industry knowledge and personal files to provide high-quality references for AI content generation.",
            )}
          </p>
        </div>

        <Tabs defaultValue="industry" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="industry" className="font-manrope">
              {t("行业知识库", "Industry KB")}
            </TabsTrigger>
            <TabsTrigger value="personal" className="font-manrope">
              {t("个人知识库", "Personal KB")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="industry" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-sans">
                  <Globe className="h-5 w-5" />
                  {t("添加行业资源", "Add industry source")}
                </CardTitle>
                <CardDescription className="font-manrope">
                  {t("提交网页链接，系统会自动抓取并分析内容。", "Submit web links and the system will crawl and analyze content automatically.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUrlSubmit} className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="url" className="sr-only">
                      {t("网页链接", "Web link")}
                    </Label>
                    <Input
                      id="url"
                      type="url"
                      placeholder={t("输入网页链接 (https://...)", "Enter web link (https://...)")}
                      value={newUrl}
                      onChange={(event) => setNewUrl(event.target.value)}
                      className="font-manrope"
                    />
                  </div>
                  <Button type="submit" disabled={!newUrl.trim()} className="font-manrope">
                    {t("添加链接", "Add link")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-sans">{t("行业知识内容", "Industry knowledge content")}</CardTitle>
                <CardDescription className="font-manrope">{t("已添加资源与处理状态", "Added resources and processing status")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {industryKnowledge.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h4 className="truncate font-medium text-foreground font-manrope">{item.title}</h4>
                          <Badge variant="outline" className="flex items-center gap-1">
                            {getStatusIcon(item.status)}
                            <span className="text-xs font-manrope">{getStatusText(item.status)}</span>
                          </Badge>
                        </div>
                        <p className="truncate text-sm text-muted-foreground font-manrope">{item.url}</p>
                        <p className="text-xs text-muted-foreground font-manrope">
                          {t("添加时间", "Added at")}: {item.date}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title={t("删除", "Delete")}>
                        <Trash2 className="h-4 w-4" />
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
                  <Upload className="h-5 w-5" />
                  {t("上传个人文件", "Upload personal files")}
                </CardTitle>
                <CardDescription className="font-manrope">
                  {t(
                    "上传品牌资料、产品信息等个人文件（支持 PDF、DOCX、TXT）。",
                    "Upload personal files like brand assets and product information (PDF, DOCX, TXT).",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
                  <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-2 text-lg font-medium text-foreground font-manrope">
                    {t("拖拽文件到此处或点击上传", "Drop files here or click to upload")}
                  </p>
                  <p className="mb-4 text-sm text-muted-foreground font-manrope">
                    {t("支持 PDF、DOCX、TXT，最大 10MB", "Supports PDF, DOCX, TXT, up to 10MB")}
                  </p>
                  <Button className="font-manrope">{t("选择文件", "Choose file")}</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-sans">{t("个人文件库", "Personal file library")}</CardTitle>
                <CardDescription className="font-manrope">{t("已上传文件与处理状态", "Uploaded files and processing status")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {personalFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <h4 className="truncate font-medium text-foreground font-manrope">{file.name}</h4>
                            <Badge variant="outline" className="flex items-center gap-1">
                              {getStatusIcon(file.status)}
                              <span className="text-xs font-manrope">{getStatusText(file.status)}</span>
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="font-manrope">{file.type}</span>
                            <span className="font-manrope">{file.size}</span>
                            <span className="font-manrope">
                              {t("上传时间", "Uploaded at")}: {file.date}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title={t("删除", "Delete")}>
                        <Trash2 className="h-4 w-4" />
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
